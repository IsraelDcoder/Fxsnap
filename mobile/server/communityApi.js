const crypto = require('crypto');
const { z } = require('zod');
const persistentStore = require('./persistentStore');

const RULES_VERSION = 'community-rules-v1';
const MEMBER_LIMIT = 40;
const MAX_MESSAGE_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MESSAGE_IMAGES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const COMMUNITY_CATEGORIES = ['market_discussion', 'learning', 'chart_analysis', 'questions', 'events'];
const MESSAGE_REACTIONS = ['like', 'helpful', 'insightful', 'interesting'];
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'fxsnap', 'fxsnap_official', 'moderator', 'support', 'system']);

class CommunityError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function getServerConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    supabaseUrl,
    serviceKey,
    ready: Boolean(supabaseUrl && serviceKey && persistentStore.supabaseEnabled),
    enabled: process.env.FXSNAP_COMMUNITY_ENABLED === 'true',
    adminUserIds: new Set((process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS || '')
      .split(',').map((id) => id.trim()).filter(Boolean)),
  };
}

function isUsernameReserved(username, isAdmin) {
  return RESERVED_USERNAMES.has(username) && !(isAdmin && username === 'fxsnap_official');
}

function profileForClient(row, isAdmin, pictureUrl = null) {
  return {
    accountId: row.account_id,
    username: row.username,
    pictureUrl: row.picture_url || pictureUrl,
    status: row.status,
    mutedUntil: row.muted_until,
    joinedAt: row.joined_at,
    rulesVersion: row.accepted_rules_version,
    isAdmin,
  };
}

function parseRows(value) {
  return Array.isArray(value) ? value : [];
}

function createCommunityApi({ getActor, sendJson, readJsonBody, saveCommunityUsername }) {
  async function database(path, options = {}) {
    const config = getServerConfig();
    if (!config.ready) throw new CommunityError('Community storage is not configured. Apply the migration and configure server-side Supabase storage first.', 503);
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.serviceKey,
        authorization: `Bearer ${config.serviceKey}`,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try { payload = JSON.parse(responseText); } catch { payload = null; }
    }
    if (!response.ok) {
      if (response.status === 404 || response.status === 406) {
        throw new CommunityError('Community database migration is not installed or is unavailable.', 503);
      }
      if (response.status === 409) throw new CommunityError('That action conflicts with existing community data.', 409);
      console.error('[Community] Supabase request failed.', { status: response.status, path: path.split('?')[0] });
      throw new CommunityError('Community storage could not complete the request. Please try again.', 502);
    }
    return payload;
  }

  const getRows = (table, query) => database(`${table}?${query}`);
  const insertRows = (table, values, prefer = 'return=representation') => database(table, {
    method: 'POST',
    headers: { prefer },
    body: JSON.stringify(values),
  });
  const patchRows = (table, query, values) => database(`${table}?${query}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(values),
  });
  const deleteRows = (table, query) => database(`${table}?${query}`, {
    method: 'DELETE',
    headers: { prefer: 'return=minimal' },
  });

  async function authorize(req, res, { joined = true, admin = false } = {}) {
    const config = getServerConfig();
    if (!config.enabled) {
      sendJson(res, 503, { error: 'Community is not enabled yet.' });
      return null;
    }
    if (!config.ready) {
      sendJson(res, 503, { error: 'Community storage is not configured. Apply the migration and configure server-side Supabase storage first.' });
      return null;
    }
    const actor = await getActor(req, res);
    if (!actor) return null;
    if (typeof actor.supabaseUserId !== 'string' || !actor.supabaseUserId) {
      sendJson(res, 403, { error: 'Sign in with your linked Google account to join Community.' });
      return null;
    }
    const isAdmin = config.adminUserIds.has(actor.supabaseUserId);
    const result = { ...actor, isAdmin };
    if (!joined) return result;
    const profiles = parseRows(await getRows(
      'fxsnap_community_profiles',
      `account_id=eq.${encodeURIComponent(actor.accountId)}&select=account_id,supabase_user_id,username,picture_url,status,muted_until,accepted_rules_version,joined_at&limit=1`,
    ));
    if (!profiles.length) {
      sendJson(res, 409, { error: 'Complete Community onboarding before continuing.', onboardingRequired: true });
      return null;
    }
    if (profiles[0].supabase_user_id !== actor.supabaseUserId) {
      sendJson(res, 403, { error: 'The signed-in account does not match this Community profile.' });
      return null;
    }
    result.profile = profiles[0];
    if (actor.pictureUrl && actor.pictureUrl !== result.profile.picture_url) {
      await patchRows('fxsnap_community_profiles', `account_id=eq.${encodeURIComponent(actor.accountId)}`, {
        picture_url: actor.pictureUrl,
        updated_at: new Date().toISOString(),
      });
      result.profile.picture_url = actor.pictureUrl;
    }
    if (['suspended', 'banned'].includes(result.profile.status)) {
      sendJson(res, 403, { error: 'This Community account is currently unavailable.' });
      return null;
    }
    if (result.profile.status === 'muted' && result.profile.muted_until
      && new Date(result.profile.muted_until).getTime() <= Date.now()) {
      await patchRows('fxsnap_community_profiles', `account_id=eq.${encodeURIComponent(actor.accountId)}`, {
        status: 'active',
        muted_until: null,
        updated_at: new Date().toISOString(),
      });
      result.profile.status = 'active';
      result.profile.muted_until = null;
    }
    return result;
  }

  async function rateLimit(accountId, purpose, maximum, windowSeconds) {
    const count = await persistentStore.increment(`fxsnap:community:rate:${purpose}:${accountId}`, windowSeconds);
    if (count > maximum) throw new CommunityError('You are sending requests too quickly. Please wait and try again.', 429);
  }

  async function recordModeration(actor, action, targetAccountId, targetMessageId, details = {}) {
    await insertRows('fxsnap_community_moderation_actions', {
      actor_account_id: actor.accountId,
      target_account_id: targetAccountId || null,
      target_message_id: targetMessageId || null,
      action,
      details,
    }, 'return=minimal');
  }

  async function queryReactions(messageIds) {
    if (!messageIds.length) return [];
    const expression = messageIds.map((id) => `"${id}"`).join(',');
    return parseRows(await getRows(
      'fxsnap_community_reactions',
      `message_id=in.(${encodeURIComponent(expression)})&select=message_id,account_id,reaction`,
    ));
  }

  function groupReactions(reactions, accountId) {
    const groups = new Map();
    for (const reaction of reactions) {
      const value = groups.get(reaction.reaction) || { reaction: reaction.reaction, count: 0, reacted: false };
      value.count += 1;
      value.reacted ||= reaction.account_id === accountId;
      groups.set(reaction.reaction, value);
    }
    return [...groups.values()];
  }

  async function serializeMessages(rows, actor) {
      if (!rows.length) return [];
      const ids = rows.map((row) => row.id);
      const accountIds = [...new Set(rows.map((row) => row.account_id))];
      const accountExpression = encodeURIComponent(accountIds.map((id) => `"${id}"`).join(','));
      const [reactionRows, followedRows, profileRows, commentCountRows] = await Promise.all([
        queryReactions(ids),
        getRows(
          'fxsnap_community_follows',
          `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&select=followed_account_id&limit=500`,
        ),
        getRows(
          'fxsnap_community_profiles',
          `account_id=in.(${accountExpression})&select=account_id,picture_url`,
        ),
        database('rpc/fxsnap_community_comment_counts', {
          method: 'POST',
          body: JSON.stringify({ p_message_ids: ids }),
        }),
      ]);
      const reactions = parseRows(reactionRows);
      const followed = parseRows(followedRows);
      const profiles = parseRows(profileRows);
      const commentCounts = parseRows(commentCountRows);
      const followedIds = new Set(followed.map((row) => row.followed_account_id));
      const picturesByAccount = new Map(profiles.map((row) => [row.account_id, row.picture_url]));
      const commentCountByMessage = new Map(commentCounts.map((row) => [row.message_id, Number(row.comment_count)]));
      const replies = rows.map((row) => row.reply_to_id).filter(Boolean);
    const replyRows = replies.length
      ? parseRows(await getRows(
        'fxsnap_community_messages',
        `id=in.(${encodeURIComponent(replies.map((id) => `"${id}"`).join(','))})&select=id,author_username,body,kind,removed_at`,
      ))
      : [];
    const replyMap = new Map(replyRows.map((row) => [row.id, row]));
    return rows.map((row) => ({
      id: row.id,
      clientMessageId: row.client_message_id,
      authorAccountId: row.account_id,
      authorUsername: row.author_username,
      authorPictureUrl: picturesByAccount.get(row.account_id) || null,
      isOfficial: row.is_official === true,
      isFollowed: followedIds.has(row.account_id),
      kind: row.kind,
      category: row.category,
      body: row.removed_at ? '[Message removed by moderation]' : row.body,
      payload: row.removed_at ? {} : row.payload,
      replyTo: row.reply_to_id ? (replyMap.get(row.reply_to_id) || null) : null,
      pinnedAt: row.pinned_at,
      createdAt: row.created_at,
      commentCount: commentCountByMessage.get(row.id) || 0,
      removed: Boolean(row.removed_at),
      reactions: groupReactions(reactions.filter((reaction) => reaction.message_id === row.id), actor.accountId),
    }));
  }

  async function resolveMessage(req, res, id) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
      sendJson(res, 400, { error: 'A valid message id is required.' });
      return null;
    }
    const rows = parseRows(await getRows(
      'fxsnap_community_messages',
      `id=eq.${encodeURIComponent(id)}&select=id,account_id,author_username,is_official,kind,body,payload,reply_to_id,pinned_at,pinned_by,removed_at,created_at,client_message_id&limit=1`,
    ));
    if (!rows.length || rows[0].removed_at) {
      sendJson(res, 404, { error: 'Community message not found.' });
      return null;
    }
    return rows[0];
  }

  async function listMessages(actor, url, res) {
    const rawLimit = Number(url.searchParams.get('limit') || MEMBER_LIMIT);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MEMBER_LIMIT) {
      sendJson(res, 400, { error: `Message page size must be between 1 and ${MEMBER_LIMIT}.` });
      return;
    }

    async function listComments(actor, url, parentId, res) {
      const threadRoot = await resolveMessage({ headers: {} }, res, parentId);
      if (!threadRoot) return;
      const requestedParentId = url.searchParams.get('parentId') || parentId;
      const parent = requestedParentId === threadRoot.id
        ? threadRoot
        : await resolveMessage({ headers: {} }, res, requestedParentId);
      if (!parent) return;
      if (parent.id !== threadRoot.id && parent.reply_to_id !== threadRoot.id) {
        sendJson(res, 400, { error: 'Replies must remain in the selected post discussion.' });
        return;
      }
      const limit = Number(url.searchParams.get('limit') || MEMBER_LIMIT);
      if (!Number.isInteger(limit) || limit < 1 || limit > MEMBER_LIMIT) {
        sendJson(res, 400, { error: `Comment page size must be between 1 and ${MEMBER_LIMIT}.` });
        return;
      }
      const before = url.searchParams.get('before');
      const params = new URLSearchParams({
        select: 'id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id',
        reply_to_id: `eq.${parent.id}`,
        removed_at: 'is.null',
        order: 'created_at.asc,id.asc',
        limit: String(limit + 1),
      });
      if (before) {
        let cursor;
        try { cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8')); } catch {
          return sendJson(res, 400, { error: 'Invalid comment history cursor.' });
        }
        if (typeof cursor.createdAt !== 'string' || Number.isNaN(Date.parse(cursor.createdAt))
          || typeof cursor.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(cursor.id)) {
          return sendJson(res, 400, { error: 'Invalid comment history cursor.' });
        }
        params.set('or', `(created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id}))`);
      }
      const rows = parseRows(await getRows('fxsnap_community_messages', params.toString()));
      const visibleRows = [];
      for (const row of rows) {
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(row.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(row.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (!blocked.length) visibleRows.push(row);
      }
      const hasMore = visibleRows.length > limit;
      const page = visibleRows.slice(0, limit);
      const serialized = await serializeMessages(page, actor);
      const last = page.at(-1);
      return sendJson(res, 200, {
        comments: serialized,
        hasMore,
        nextCursor: hasMore && last
          ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url')
          : null,
      });
    }
    const cursor = url.searchParams.get('before');
    let before = null;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof decoded.createdAt !== 'string' || Number.isNaN(Date.parse(decoded.createdAt))
          || typeof decoded.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(decoded.id)) throw new Error('Invalid cursor');
        before = decoded;
      } catch {
        if (Number.isNaN(Date.parse(cursor))) {
          sendJson(res, 400, { error: 'Invalid message history cursor.' });
          return;
        }
        before = { createdAt: new Date(cursor).toISOString(), id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
      }
    }
    const category = url.searchParams.get('category');
    if (category && !COMMUNITY_CATEGORIES.includes(category)) {
      sendJson(res, 400, { error: 'Choose a valid Community category.' });
      return;
    }
    const feed = url.searchParams.get('feed') || 'global';
    if (!['global', 'following'].includes(feed)) {
      sendJson(res, 400, { error: 'Choose a valid Community feed.' });
      return;
    }
    const following = feed === 'following'
      ? parseRows(await getRows('fxsnap_community_follows',
        `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&select=followed_account_id&limit=500`))
      : null;
    if (following && following.length === 0) {
      return sendJson(res, 200, { messages: [], nextCursor: null, hasMore: false, followingEmpty: true });
    }
    const blocks = parseRows(await getRows(
      'fxsnap_community_blocks',
      `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocked_account_id`,
    ));
    const blockedIds = blocks.map((row) => `"${String(row.blocked_account_id).replace(/"/g, '')}"`);
    const blockedBy = parseRows(await getRows(
      'fxsnap_community_blocks',
      `blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id`,
    ));
    const blockedByIds = blockedBy.map((row) => `"${String(row.blocker_account_id).replace(/"/g, '')}"`);
    const params = new URLSearchParams({
      select: 'id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id',
      removed_at: 'is.null',
      reply_to_id: 'is.null',
      order: 'created_at.desc,id.desc',
      limit: String(rawLimit + 1),
    });
    if (before) {
      params.set('or', `(created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id}))`);
    }
    if (category) params.set('category', `eq.${category}`);
    const accountFilters = [];
    if (following) accountFilters.push(`account_id.in.(${following.map((row) => `"${row.followed_account_id}"`).join(',')})`);
    const exclusions = [...new Set([...blockedIds, ...blockedByIds])];
    if (exclusions.length) accountFilters.push(`account_id.not.in.(${exclusions.join(',')})`);
    if (accountFilters.length) params.set('and', `(${accountFilters.join(',')})`);
    const rows = parseRows(await getRows('fxsnap_community_messages', params.toString()));
    const hasMore = rows.length > rawLimit;
    const page = rows.slice(0, rawLimit);
    const serialized = await serializeMessages(page, actor);
    const next = hasMore && page.length
      ? Buffer.from(JSON.stringify({ createdAt: page[page.length - 1].created_at, id: page[page.length - 1].id })).toString('base64url')
      : null;
    return sendJson(res, 200, {
      messages: serialized,
      nextCursor: next,
      hasMore,
      followingEmpty: Boolean(following && following.length > 0 && page.length === 0),
    });
  }

  async function publishMessage(req, actor, body, res) {
    const base = z.object({
      clientMessageId: z.string().uuid(),
      kind: z.enum(['text', 'signal', 'analysis', 'announcement']),
      category: z.enum(COMMUNITY_CATEGORIES).optional(),
      body: z.string().trim().max(2000).default(''),
      replyToId: z.string().uuid().nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional().default({}),
    }).safeParse(body);
    if (!base.success) return sendJson(res, 400, { error: 'Invalid community message.' });
    const { kind, payload } = base.data;
    if (kind === 'announcement' && !actor.isAdmin) return sendJson(res, 403, { error: 'Only authorized administrators can publish announcements.' });
    if (kind === 'announcement' && base.data.category && base.data.category !== 'events') return sendJson(res, 400, { error: 'Announcements must use the Events & Announcements category.' });
    if (base.data.category === 'events' && !actor.isAdmin) return sendJson(res, 403, { error: 'Only FXSnap and approved hosts can publish Events & Announcements.' });
    if (kind === 'text' && !base.data.body) return sendJson(res, 400, { error: 'Message text cannot be empty.' });
    if (kind !== 'text' && base.data.body.length > 1200) return sendJson(res, 400, { error: 'The optional caption is too long.' });

    let safePayload = {};
    if (kind === 'signal') {
      const signal = z.object({
        instrument: z.string().trim().min(3).max(20),
        direction: z.enum(['BUY', 'SELL']),
        entry: z.string().trim().min(1).max(100),
        stopLoss: z.string().trim().min(1).max(100),
        takeProfits: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
        timeframe: z.string().trim().min(1).max(20),
        reasoning: z.string().trim().max(1200).default(''),
        imageUrl: z.string().url().max(2048).nullable().optional(),
      }).safeParse(payload);
      if (!signal.success) return sendJson(res, 400, { error: 'Complete the signal instrument, direction, entry, stop, target, and timeframe.' });
      safePayload = signal.data;
    } else if (kind === 'analysis') {
      const snapshot = z.object({
        source: z.literal('fxsnap_ai'),
        sourceAnalysisId: z.string().min(1).max(100),
        sourceCreatedAt: z.string().datetime(),
        status: z.string().max(40),
        pair: z.string().min(1).max(20),
        timeframe: z.string().max(20).nullable().optional(),
        direction: z.string().max(20).nullable().optional(),
        entry: z.string().max(100).nullable().optional(),
        stopLoss: z.string().max(100).nullable().optional(),
        takeProfits: z.array(z.string().max(100)).max(5).default([]),
        marketBias: z.string().max(40).nullable().optional(),
        reasoning: z.array(z.string().max(500)).max(8).default([]),
        imageUrl: z.string().url().max(2048).nullable().optional(),
      }).safeParse(payload);
      if (!snapshot.success) return sendJson(res, 400, { error: 'The FXSnap analysis snapshot is incomplete or invalid.' });
      safePayload = snapshot.data;
    } else if (kind === 'text' || kind === 'announcement') {
      const textPayload = z.object({
        imageUrl: z.string().url().max(2048).nullable().optional(),
      }).safeParse(payload);
      if (!textPayload.success) return sendJson(res, 400, { error: 'Invalid chart image attachment.' });
      if (textPayload.data.imageUrl) {
        const config = getServerConfig();
        const prefix = `${config.supabaseUrl}/storage/v1/object/public/fxsnap-community-media/${actor.accountId}/`;
        if (!textPayload.data.imageUrl.startsWith(prefix)) return sendJson(res, 400, { error: 'Upload chart images through FXSnap Community before sharing.' });
      }
      safePayload = textPayload.data;
    }

    if (base.data.replyToId) {
      const parent = await resolveMessage(req, res, base.data.replyToId);
      if (!parent) return;
      const blocked = parseRows(await getRows(
        'fxsnap_community_blocks',
        `blocker_account_id=eq.${encodeURIComponent(parent.account_id)}&blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id&limit=1`,
      ));
      if (blocked.length) return sendJson(res, 403, { error: 'This member does not accept replies from your account.' });
    }
    const existing = parseRows(await getRows(
      'fxsnap_community_messages',
      `account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${base.data.clientMessageId}&select=id,account_id,author_username,is_official,kind,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id&limit=1`,
    ));
    if (existing.length) {
      const [message] = await serializeMessages(existing, actor);
      return sendJson(res, 200, { message, duplicate: true });
    }
    const profile = actor.profile;
    if (profile.status === 'muted' && profile.muted_until
      && new Date(profile.muted_until).getTime() > Date.now()) {
      return sendJson(res, 403, { error: 'Your Community account is muted until the displayed time.' });
    }
    await rateLimit(actor.accountId, 'messages', 12, 60);
    if (kind === 'text' && !base.data.replyToId && base.data.body.length >= 16) {
      const duplicate = parseRows(await getRows(
        'fxsnap_community_messages',
        `account_id=eq.${encodeURIComponent(actor.accountId)}&body=eq.${encodeURIComponent(base.data.body)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 10 * 60_000).toISOString())}&select=id&limit=1`,
      ));
      if (duplicate.length) return sendJson(res, 409, { error: 'You recently shared this same post. Edit it or wait before reposting.' });
    }
    const row = {
      account_id: actor.accountId,
      author_username: profile.username,
      is_official: actor.isAdmin,
      kind,
      category: base.data.replyToId ? null
        : base.data.category || (kind === 'analysis' || kind === 'signal' ? 'chart_analysis' : kind === 'announcement' ? 'events' : 'market_discussion'),
      body: base.data.body,
      payload: safePayload,
      reply_to_id: base.data.replyToId || null,
      client_message_id: base.data.clientMessageId,
    };
    let inserted;
    try {
      inserted = parseRows(await insertRows('fxsnap_community_messages', row));
    } catch (error) {
      if (error.status !== 409) throw error;
      inserted = parseRows(await getRows(
        'fxsnap_community_messages',
        `account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${base.data.clientMessageId}&select=id,account_id,author_username,is_official,kind,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id&limit=1`,
      ));
    }
    if (!inserted.length) throw new CommunityError('Message could not be confirmed after saving. Retry safely with the same message id.', 502);
    const [message] = await serializeMessages(inserted, actor);
    return sendJson(res, 201, { message, duplicate: false });
  }

  async function adminOnly(actor, res) {
    if (!actor.isAdmin) {
      sendJson(res, 403, { error: 'Administrator permissions are required.' });
      return false;
    }
    return true;
  }

  async function memberProfile(actor, username) {
    const normalized = String(username || '').trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalized)) return null;
    return parseRows(await getRows(
      'fxsnap_community_profiles',
      `username=eq.${encodeURIComponent(normalized)}&select=account_id,supabase_user_id,username,status,muted_until&limit=1`,
    ))[0] || null;
  }

  async function handle(req, res, url) {
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/community/') && !pathname.startsWith('/api/admin/community/')) return false;
    try {
      const actor = await authorize(req, res, {
        joined: !['/api/community/me', '/api/community/username', '/api/community/join'].includes(pathname),
      });
      if (!actor) return true;
      const config = getServerConfig();
      const profileQuery = (accountId) => `account_id=eq.${encodeURIComponent(accountId)}`;

      if (pathname === '/api/community/me' && req.method === 'GET') {
        let rows = actor.profile ? [actor.profile] : parseRows(await getRows(
          'fxsnap_community_profiles',
          `${profileQuery(actor.accountId)}&select=account_id,supabase_user_id,username,picture_url,status,muted_until,accepted_rules_version,joined_at&limit=1`,
        ));
        if (rows[0] && actor.pictureUrl && rows[0].picture_url !== actor.pictureUrl) {
          const updated = parseRows(await patchRows('fxsnap_community_profiles', profileQuery(actor.accountId), {
            picture_url: actor.pictureUrl,
            updated_at: new Date().toISOString(),
          }));
          if (updated[0]) rows = updated;
        }
        return sendJson(res, 200, {
          rulesVersion: RULES_VERSION,
          profile: rows[0] ? profileForClient(rows[0], actor.isAdmin, actor.pictureUrl) : null,
        });
      }

      if (pathname === '/api/community/username' && req.method === 'GET') {
        const username = String(url.searchParams.get('value') || '').trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) return sendJson(res, 200, { available: false, reason: 'Use 3–24 lowercase letters, numbers, or underscores.' });
        if (isUsernameReserved(username, actor.isAdmin)) return sendJson(res, 200, { available: false, reason: 'That username is reserved.' });
        const matches = parseRows(await getRows(
          'fxsnap_community_profiles',
          `username=ilike.${encodeURIComponent(username)}&select=account_id&limit=1`,
        ));
        return sendJson(res, 200, {
          available: matches.length === 0 || matches[0].account_id === actor.accountId,
          reason: matches.length && matches[0].account_id !== actor.accountId ? 'That username is already taken.' : null,
        });
      }

      if (pathname === '/api/community/join' && req.method === 'POST') {
        const existingProfiles = parseRows(await getRows(
          'fxsnap_community_profiles',
          `${profileQuery(actor.accountId)}&select=account_id,supabase_user_id,username,picture_url,status,muted_until,accepted_rules_version,joined_at&limit=1`,
        ));
        if (existingProfiles.length) {
          if (existingProfiles[0].supabase_user_id !== actor.supabaseUserId) {
            return sendJson(res, 403, { error: 'The signed-in account does not match this Community profile.' });
          }
          if (saveCommunityUsername) await saveCommunityUsername(actor.accountId, existingProfiles[0].username);
          return sendJson(res, 200, { profile: profileForClient(existingProfiles[0], actor.isAdmin) });
        }
        const input = z.object({
          username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN),
          acceptedRulesVersion: z.literal(RULES_VERSION),
        }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose a valid username and accept the current Community rules.' });
        const username = input.data.username;
        if (isUsernameReserved(username, actor.isAdmin)) return sendJson(res, 400, { error: 'That username is reserved.' });
        try {
          const rows = parseRows(await insertRows('fxsnap_community_profiles', {
            account_id: actor.accountId,
            supabase_user_id: actor.supabaseUserId,
            username,
            picture_url: actor.pictureUrl || null,
            accepted_rules_version: RULES_VERSION,
          }));
          if (!rows.length) throw new CommunityError('The Community profile could not be confirmed.', 502);
          if (saveCommunityUsername) await saveCommunityUsername(actor.accountId, username);
          return sendJson(res, 201, { profile: profileForClient(rows[0], actor.isAdmin) });
        } catch (error) {
          if (error.status === 409) return sendJson(res, 409, { error: 'That username is already taken. Choose another.' });
          throw error;
        }
      }

      if (pathname === '/api/community/profile' && req.method === 'PATCH') {
        const input = z.object({
          username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN),
        }).strict().safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Use 3–24 lowercase letters, numbers, or underscores for your username.' });
        const username = input.data.username;
        if (isUsernameReserved(username, actor.isAdmin)) return sendJson(res, 400, { error: 'That username is reserved.' });
        if (username.toLowerCase() === actor.profile.username.toLowerCase()) {
          return sendJson(res, 200, { profile: profileForClient(actor.profile, actor.isAdmin) });
        }
        try {
          const rows = parseRows(await patchRows('fxsnap_community_profiles', profileQuery(actor.accountId), {
            username,
            updated_at: new Date().toISOString(),
          }));
          if (!rows.length) throw new CommunityError('Your Community profile could not be confirmed after saving.', 502);
          if (saveCommunityUsername) await saveCommunityUsername(actor.accountId, username);
          return sendJson(res, 200, { profile: profileForClient(rows[0], actor.isAdmin) });
        } catch (error) {
          if (error.status === 409) return sendJson(res, 409, { error: 'That username is already taken. Choose another.' });
          throw error;
        }
      }

      if (pathname === '/api/community/messages' && req.method === 'GET') {
        return listMessages(actor, url, res);
      }
      if (pathname === '/api/community/messages' && req.method === 'POST') {
        if (actor.profile.status === 'muted' && actor.profile.muted_until
          && new Date(actor.profile.muted_until).getTime() > Date.now()) {
          return sendJson(res, 403, { error: 'Your Community account is muted until the displayed time.' });
        }
        return publishMessage(req, actor, await readJsonBody(req), res);
      }

      const commentsMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/comments$/i);
      if (commentsMatch && req.method === 'GET') {
        return listComments(actor, url, commentsMatch[1], res);
      }
      if (commentsMatch && req.method === 'POST') {
        const body = await readJsonBody(req);
        const root = await resolveMessage(req, res, commentsMatch[1]);
        if (!root) return true;
        let replyToId = root.id;
        if (body.replyToId !== undefined) {
          if (typeof body.replyToId !== 'string') return sendJson(res, 400, { error: 'A valid comment reply target is required.' });
          const replyTarget = await resolveMessage(req, res, body.replyToId);
          if (!replyTarget) return true;
          if (replyTarget.id !== root.id && replyTarget.reply_to_id !== root.id) {
            return sendJson(res, 400, { error: 'Replies must remain in the selected post discussion.' });
          }
          replyToId = replyTarget.id;
        }
        return publishMessage(req, actor, {
          ...body,
          kind: 'text',
          replyToId,
        }, res);
      }

      const messageMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)$/i);
      if (messageMatch && req.method === 'GET') {
        const message = await resolveMessage(req, res, messageMatch[1]);
        if (!message) return true;
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(message.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(message.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 404, { error: 'Community post not found.' });
        const [serialized] = await serializeMessages([message], actor);
        return sendJson(res, 200, { post: serialized });
      }
      if (messageMatch && req.method === 'PATCH') {
        const message = await resolveMessage(req, res, messageMatch[1]);
        if (!message) return true;
        if (message.account_id !== actor.accountId) {
          return sendJson(res, 403, { error: 'You can only edit your own Community posts.' });
        }
        if (message.kind !== 'text') {
          return sendJson(res, 400, { error: 'Only text posts and comments can be edited.' });
        }
        const input = z.object({
          body: z.string().trim().max(2000),
          category: z.enum(COMMUNITY_CATEGORIES).optional(),
          imageUrl: z.string().url().max(2048).nullable().optional(),
        }).strict().safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Invalid Community post update.' });
        const imageUrl = input.data.imageUrl === undefined
          ? message.payload?.imageUrl || null
          : input.data.imageUrl;
        if (!input.data.body && !imageUrl) {
          return sendJson(res, 400, { error: 'A post must contain text or an image.' });
        }
        if (imageUrl) {
          const config = getServerConfig();
          const prefix = `${config.supabaseUrl}/storage/v1/object/public/fxsnap-community-media/${actor.accountId}/`;
          if (!imageUrl.startsWith(prefix)) {
            return sendJson(res, 400, { error: 'Upload chart images through FXSnap Community before sharing.' });
          }
        }
        const category = message.reply_to_id
          ? null
          : input.data.category || message.category || 'market_discussion';
        if (category === 'events' && !actor.isAdmin) {
          return sendJson(res, 403, { error: 'Only FXSnap and approved hosts can publish Events & Announcements.' });
        }
        await rateLimit(actor.accountId, 'message_updates', 20, 60);
        const rows = parseRows(await patchRows(
          'fxsnap_community_messages',
          `id=eq.${encodeURIComponent(message.id)}&account_id=eq.${encodeURIComponent(actor.accountId)}&removed_at=is.null`,
          {
            body: input.data.body,
            category,
            payload: { ...(message.payload || {}), imageUrl },
          },
        ));
        if (!rows.length) return sendJson(res, 404, { error: 'Community message not found.' });
        const [post] = await serializeMessages(rows, actor);
        return sendJson(res, 200, { message: post });
      }
      if (messageMatch && req.method === 'DELETE') {
        const message = await resolveMessage(req, res, messageMatch[1]);
        if (!message) return true;
        if (message.account_id !== actor.accountId) {
          return sendJson(res, 403, { error: 'You can only delete your own Community posts.' });
        }
        await rateLimit(actor.accountId, 'message_deletions', 20, 60);
        const rows = parseRows(await patchRows(
          'fxsnap_community_messages',
          `id=eq.${encodeURIComponent(message.id)}&account_id=eq.${encodeURIComponent(actor.accountId)}&removed_at=is.null`,
          { removed_at: new Date().toISOString() },
        ));
        if (!rows.length) return sendJson(res, 404, { error: 'Community message not found.' });
        return sendJson(res, 200, { removed: true });
      }

      if (pathname === '/api/community/follows' && req.method === 'GET') {
        const follows = parseRows(await getRows(
          'fxsnap_community_follows',
          `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&select=followed_account_id,created_at&order=created_at.desc&limit=500`,
        ));
        const accounts = follows.map((follow) => `"${follow.followed_account_id}"`);
        const profiles = accounts.length
          ? parseRows(await getRows(
            'fxsnap_community_profiles',
            `account_id=in.(${accounts.join(',')})&select=account_id,username`,
          ))
          : [];
        const names = new Map(profiles.map((profile) => [profile.account_id, profile]));
        return sendJson(res, 200, {
          following: follows.map((follow) => ({
            accountId: follow.followed_account_id,
            username: names.get(follow.followed_account_id)?.username || 'Member',
            createdAt: follow.created_at,
          })),
        });
      }

      if (pathname === '/api/community/follows' && req.method === 'POST') {
        const input = z.object({ username: z.string().trim().min(3).max(24) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'A valid member username is required.' });
        const target = await memberProfile(actor, input.data.username);
        if (!target || target.account_id === actor.accountId || target.status !== 'active') {
          return sendJson(res, 404, { error: 'That active Community member could not be found.' });
        }
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(target.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(target.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 403, { error: 'Following is unavailable for members who have blocked one another.' });
        try {
          await insertRows('fxsnap_community_follows', {
            follower_account_id: actor.accountId,
            followed_account_id: target.account_id,
          }, 'return=minimal');
        } catch (error) {
          if (error.status !== 409) throw error;
        }
        return sendJson(res, 200, { following: true });
      }

      const unfollowMatch = pathname.match(/^\/api\/community\/follows\/([^/]+)$/);
      if (unfollowMatch && req.method === 'DELETE') {
        const target = await memberProfile(actor, decodeURIComponent(unfollowMatch[1]));
        if (!target) return sendJson(res, 404, { error: 'Community member not found.' });
        await deleteRows(
          'fxsnap_community_follows',
          `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&followed_account_id=eq.${encodeURIComponent(target.account_id)}`,
        );
        return sendJson(res, 200, { following: false });
      }

      const reactionMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/reactions$/i);
      if (reactionMatch && req.method === 'POST') {
        const input = z.object({ reaction: z.string().refine((value) => MESSAGE_REACTIONS.includes(value)) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose one of the available reactions.' });
        const message = await resolveMessage(req, res, reactionMatch[1]);
        if (!message) return true;
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `blocker_account_id=eq.${encodeURIComponent(message.account_id)}&blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 403, { error: 'This member does not accept interactions from your account.' });
        const query = `message_id=eq.${encodeURIComponent(message.id)}&account_id=eq.${encodeURIComponent(actor.accountId)}&reaction=eq.${encodeURIComponent(input.data.reaction)}`;
        const current = parseRows(await getRows('fxsnap_community_reactions', `${query}&select=message_id&limit=1`));
        if (current.length) {
          await deleteRows('fxsnap_community_reactions', query);
          return sendJson(res, 200, { reacted: false });
        }
        try {
          await insertRows('fxsnap_community_reactions', {
            message_id: message.id,
            account_id: actor.accountId,
            reaction: input.data.reaction,
          }, 'return=minimal');
        } catch (error) {
          if (error.status !== 409) throw error;
        }
        return sendJson(res, 200, { reacted: true });
      }

      if (pathname === '/api/community/reports' && req.method === 'POST') {
        const input = z.object({
          messageId: z.string().uuid(),
          reason: z.enum(['spam', 'scam', 'harassment', 'impersonation', 'suspicious_signal', 'other']),
          explanation: z.string().trim().max(1000).default(''),
        }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose a report reason and valid message.' });
        const message = await resolveMessage(req, res, input.data.messageId);
        if (!message) return true;
        if (message.account_id === actor.accountId) return sendJson(res, 400, { error: 'You cannot report your own message.' });
        try {
          await insertRows('fxsnap_community_reports', {
            reporter_account_id: actor.accountId,
            target_account_id: message.account_id,
            message_id: message.id,
            reason: input.data.reason,
            explanation: input.data.explanation,
          }, 'return=minimal');
        } catch (error) {
          if (error.status === 409) return sendJson(res, 409, { error: 'You already reported this message.' });
          throw error;
        }
        return sendJson(res, 201, { reported: true });
      }

      if (pathname === '/api/community/blocks' && req.method === 'GET') {
        const rows = parseRows(await getRows(
          'fxsnap_community_blocks',
          `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocked_account_id,created_at&order=created_at.desc`,
        ));
        const profiles = rows.length
          ? parseRows(await getRows(
            'fxsnap_community_profiles',
            `account_id=in.(${rows.map((row) => `"${row.blocked_account_id}"`).join(',')})&select=account_id,username`,
          ))
          : [];
        const profileMap = new Map(profiles.map((row) => [row.account_id, row.username]));
        return sendJson(res, 200, { blocks: rows.map((row) => ({ accountId: row.blocked_account_id, username: profileMap.get(row.blocked_account_id) || 'Member', createdAt: row.created_at })) });
      }

      if (pathname === '/api/community/blocks' && req.method === 'POST') {
        const input = z.object({ username: z.string().trim().min(3).max(24) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'A valid member username is required.' });
        const target = await memberProfile(actor, input.data.username);
        if (!target || target.account_id === actor.accountId) return sendJson(res, 404, { error: 'That member could not be found.' });
        if (config.adminUserIds.has(target.supabase_user_id)) return sendJson(res, 400, { error: 'Official FXSnap accounts cannot be blocked.' });
        try {
          await insertRows('fxsnap_community_blocks', {
            blocker_account_id: actor.accountId,
            blocked_account_id: target.account_id,
          }, 'return=minimal');
        } catch (error) {
          if (error.status !== 409) throw error;
        }
        return sendJson(res, 200, { blocked: true });
      }

      const unblockMatch = pathname.match(/^\/api\/community\/blocks\/([^/]+)$/);
      if (unblockMatch && req.method === 'DELETE') {
        await deleteRows('fxsnap_community_blocks',
          `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&blocked_account_id=eq.${encodeURIComponent(decodeURIComponent(unblockMatch[1]))}`);
        return sendJson(res, 200, { blocked: false });
      }

      if (pathname === '/api/community/upload' && req.method === 'POST') {
        const input = z.object({
          mimeType: z.string().max(40),
          data: z.string().min(4).max(4_200_000),
        }).safeParse(await readJsonBody(req));
        if (!input.success || !ALLOWED_MESSAGE_IMAGES.has(input.data.mimeType)) {
          return sendJson(res, 400, { error: 'Only PNG, JPEG, or WebP images are supported.' });
        }
        const bytes = Buffer.from(input.data.data, 'base64');
        if (bytes.length < 8 || bytes.length > MAX_MESSAGE_IMAGE_BYTES) {
          return sendJson(res, 413, { error: 'Community images must be smaller than 3 MB.' });
        }
        const signatureValid = input.data.mimeType === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : input.data.mimeType === 'image/jpeg'
            ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
            : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
        if (!signatureValid) return sendJson(res, 400, { error: 'The image data does not match its declared file type.' });
        await rateLimit(actor.accountId, 'uploads', 10, 3600);
        const config = getServerConfig();
        const fileName = `${actor.accountId}/${crypto.randomUUID()}.${ALLOWED_MESSAGE_IMAGES.get(input.data.mimeType)}`;
        const uploadResponse = await fetch(`${config.supabaseUrl}/storage/v1/object/fxsnap-community-media/${fileName}`, {
          method: 'POST',
          headers: {
            apikey: config.serviceKey,
            authorization: `Bearer ${config.serviceKey}`,
            'content-type': input.data.mimeType,
            'x-upsert': 'false',
          },
          body: bytes,
        });
        if (!uploadResponse.ok) {
          console.error('[Community] Image upload failed.', { status: uploadResponse.status });
          throw new CommunityError('The image could not be uploaded. Please retry.', 502);
        }
        const imageUrl = `${config.supabaseUrl}/storage/v1/object/public/fxsnap-community-media/${fileName}`;
        return sendJson(res, 201, { imageUrl });
      }

      if (pathname === '/api/community/notifications' && req.method === 'GET') {
        const rows = parseRows(await getRows(
          'fxsnap_community_notifications',
          `recipient_account_id=eq.${encodeURIComponent(actor.accountId)}&select=id,kind,message,object_id,read_at,created_at&order=created_at.desc&limit=50`,
        ));
        return sendJson(res, 200, { notifications: rows });
      }
      const notificationMatch = pathname.match(/^\/api\/community\/notifications\/([0-9a-f-]+)\/read$/i);
      if (notificationMatch && req.method === 'POST') {
        await patchRows(
          'fxsnap_community_notifications',
          `id=eq.${encodeURIComponent(notificationMatch[1])}&recipient_account_id=eq.${encodeURIComponent(actor.accountId)}&read_at=is.null`,
          { read_at: new Date().toISOString() },
        );
        return sendJson(res, 200, { read: true });
      }

      if (pathname === '/api/community/support' && (req.method === 'GET' || req.method === 'POST')) {
        const conversations = parseRows(await getRows(
          'fxsnap_support_conversations',
          `account_id=eq.${encodeURIComponent(actor.accountId)}&select=id,account_id,status,created_at,updated_at&limit=1`,
        ));
        let conversation = conversations[0] || null;
        if (!conversation && req.method === 'POST') {
          const inserted = parseRows(await insertRows('fxsnap_support_conversations', { account_id: actor.accountId }));
          conversation = inserted[0] || null;
          if (!conversation) {
            conversation = parseRows(await getRows(
              'fxsnap_support_conversations',
              `account_id=eq.${encodeURIComponent(actor.accountId)}&select=id,account_id,status,created_at,updated_at&limit=1`,
            ))[0] || null;
          }
        }
        if (req.method === 'GET') {
          if (!conversation) return sendJson(res, 200, { conversation: null, messages: [] });
          const messages = parseRows(await getRows(
            'fxsnap_support_messages',
            `conversation_id=eq.${encodeURIComponent(conversation.id)}&select=id,sender_kind,body,created_at&order=created_at.asc&limit=100`,
          ));
          return sendJson(res, 200, { conversation: { id: conversation.id, status: conversation.status }, messages });
        }
        const input = z.object({ clientMessageId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Support messages must contain 1–2,000 characters.' });
        await rateLimit(actor.accountId, 'support', 8, 3600);
        const existing = parseRows(await getRows(
          'fxsnap_support_messages',
          `sender_account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${input.data.clientMessageId}&select=id,created_at&limit=1`,
        ));
        if (existing.length) return sendJson(res, 200, { message: existing[0], duplicate: true });
        const inserted = parseRows(await insertRows('fxsnap_support_messages', {
          conversation_id: conversation.id,
          sender_account_id: actor.accountId,
          sender_kind: 'member',
          body: input.data.body,
          client_message_id: input.data.clientMessageId,
        }));
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversation.id)}`, {
          status: conversation.status === 'resolved' ? 'open' : conversation.status,
          updated_at: new Date().toISOString(),
        });
        return sendJson(res, 201, { message: inserted[0], duplicate: false });
      }

      if (pathname === '/api/admin/community/reports' && req.method === 'GET') {
        if (!await adminOnly(actor, res)) return true;
        const reports = parseRows(await getRows(
          'fxsnap_community_reports',
          `status=in.(open,reviewing)&select=id,reporter_account_id,target_account_id,message_id,reason,explanation,status,created_at&order=created_at.asc&limit=100`,
        ));
        return sendJson(res, 200, { reports });
      }

      if (pathname === '/api/admin/community/reports' && req.method === 'PATCH') {
        if (!await adminOnly(actor, res)) return true;
        const input = z.object({ reportId: z.string().uuid(), status: z.enum(['reviewing', 'resolved', 'dismissed']) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Invalid report update.' });
        await patchRows('fxsnap_community_reports', `id=eq.${encodeURIComponent(input.data.reportId)}`, {
          status: input.data.status,
          reviewed_at: new Date().toISOString(),
        });
        await recordModeration(actor, 'report_review', null, null, { reportId: input.data.reportId, status: input.data.status });
        return sendJson(res, 200, { updated: true });
      }

      if (pathname === '/api/admin/community/support' && req.method === 'GET') {
        if (!await adminOnly(actor, res)) return true;
        const conversations = parseRows(await getRows(
          'fxsnap_support_conversations',
          `status=neq.resolved&select=id,account_id,status,created_at,updated_at&order=updated_at.desc&limit=100`,
        ));
        const profiles = conversations.length
          ? parseRows(await getRows(
            'fxsnap_community_profiles',
            `account_id=in.(${conversations.map((item) => `"${item.account_id}"`).join(',')})&select=account_id,username`,
          ))
          : [];
        const names = new Map(profiles.map((profile) => [profile.account_id, profile.username]));
        return sendJson(res, 200, {
          conversations: conversations.map((item) => ({ ...item, username: names.get(item.account_id) || 'Deleted member' })),
        });
      }

      const adminConversationMatch = pathname.match(/^\/api\/admin\/community\/support\/([0-9a-f-]+)$/i);
      if (adminConversationMatch && (req.method === 'GET' || req.method === 'POST' || req.method === 'PATCH')) {
        if (!await adminOnly(actor, res)) return true;
        const conversationId = adminConversationMatch[1];
        const conversations = parseRows(await getRows(
          'fxsnap_support_conversations',
          `id=eq.${encodeURIComponent(conversationId)}&select=id,account_id,status,created_at,updated_at&limit=1`,
        ));
        if (!conversations.length) return sendJson(res, 404, { error: 'Support conversation not found.' });
        const conversation = conversations[0];
        if (req.method === 'GET') {
          const messages = parseRows(await getRows(
            'fxsnap_support_messages',
            `conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,sender_account_id,sender_kind,body,created_at&order=created_at.asc&limit=200`,
          ));
          return sendJson(res, 200, { conversation, messages });
        }
        if (req.method === 'PATCH') {
          const input = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }).safeParse(await readJsonBody(req));
          if (!input.success) return sendJson(res, 400, { error: 'Invalid support conversation state.' });
          await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversationId)}`, {
            status: input.data.status,
            updated_at: new Date().toISOString(),
          });
          await recordModeration(actor, 'report_review', conversation.account_id, null, { conversationId, status: input.data.status });
          return sendJson(res, 200, { updated: true });
        }
        const input = z.object({ clientMessageId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Support replies must contain 1–2,000 characters.' });
        const existing = parseRows(await getRows(
          'fxsnap_support_messages',
          `sender_account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${input.data.clientMessageId}&select=id,created_at&limit=1`,
        ));
        if (existing.length) return sendJson(res, 200, { message: existing[0], duplicate: true });
        const inserted = parseRows(await insertRows('fxsnap_support_messages', {
          conversation_id: conversationId,
          sender_account_id: actor.accountId,
          sender_kind: 'admin',
          body: input.data.body,
          client_message_id: input.data.clientMessageId,
        }));
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversationId)}`, {
          status: conversation.status === 'resolved' ? 'open' : conversation.status,
          updated_at: new Date().toISOString(),
        });
        await insertRows('fxsnap_community_notifications', {
          recipient_account_id: conversation.account_id,
          kind: 'support_reply',
          message: 'FXSnap Support replied to your private conversation.',
          object_id: conversation.id,
        }, 'return=minimal');
        return sendJson(res, 201, { message: inserted[0], duplicate: false });
      }

      if (pathname === '/api/admin/community/moderation' && req.method === 'POST') {
        if (!await adminOnly(actor, res)) return true;
        const input = z.object({
          action: z.enum(['warn', 'mute', 'suspend', 'ban', 'unmute', 'unsuspend', 'unban', 'remove_message', 'pin', 'unpin']),
          username: z.string().trim().min(3).max(24).optional(),
          messageId: z.string().uuid().optional(),
          durationHours: z.number().int().min(1).max(8760).optional(),
          explanation: z.string().trim().max(1000).default(''),
        }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Invalid moderation action.' });
        let target = input.data.username ? await memberProfile(actor, input.data.username) : null;
        if (input.data.username && !target) return sendJson(res, 404, { error: 'Community member not found.' });
        if (target && config.adminUserIds.has(target.supabase_user_id)) {
          return sendJson(res, 403, { error: 'Community administrators cannot moderate another official account through this action.' });
        }
        let message = null;
        if (input.data.messageId) {
          message = await resolveMessage(req, res, input.data.messageId);
          if (!message) return true;
          target = target || { account_id: message.account_id };
        }
        const now = new Date().toISOString();
        const details = { explanation: input.data.explanation };
        const profileUpdates = {
          mute: { status: 'muted', muted_until: new Date(Date.now() + (input.data.durationHours || 24) * 3600_000).toISOString() },
          suspend: { status: 'suspended' },
          ban: { status: 'banned' },
          unmute: { status: 'active', muted_until: null },
          unsuspend: { status: 'active', muted_until: null },
          unban: { status: 'active', muted_until: null },
        };
        if (input.data.action in profileUpdates) {
          if (!target) return sendJson(res, 400, { error: 'This action requires a target username.' });
          await patchRows('fxsnap_community_profiles', profileQuery(target.account_id), {
            ...profileUpdates[input.data.action],
            updated_at: now,
          });
        } else if (input.data.action === 'remove_message') {
          if (!message) return sendJson(res, 400, { error: 'Choose the message to remove.' });
          await patchRows('fxsnap_community_messages', `id=eq.${encodeURIComponent(message.id)}`, { removed_at: now });
          details.messageId = message.id;
        } else if (input.data.action === 'pin' || input.data.action === 'unpin') {
          if (!message) return sendJson(res, 400, { error: 'Choose the message to pin or unpin.' });
          await patchRows('fxsnap_community_messages', `id=eq.${encodeURIComponent(message.id)}`, {
            pinned_at: input.data.action === 'pin' ? now : null,
            pinned_by: input.data.action === 'pin' ? actor.accountId : null,
          });
          details.messageId = message.id;
        } else if (input.data.action === 'warn') {
          if (!target) return sendJson(res, 400, { error: 'Choose the member to warn.' });
          await insertRows('fxsnap_community_notifications', {
            recipient_account_id: target.account_id,
            kind: 'moderation',
            message: input.data.explanation || 'You have received a Community moderation warning.',
          }, 'return=minimal');
        }
        await recordModeration(actor, input.data.action, target?.account_id || null, message?.id || null, {
          ...details,
          durationHours: input.data.action === 'mute' ? input.data.durationHours || 24 : undefined,
        });
        return sendJson(res, 200, { accepted: true });
      }

      return sendJson(res, 405, { error: 'Unsupported Community operation.' });
    } catch (error) {
      if (error instanceof CommunityError) return sendJson(res, error.status, { error: error.message });
      console.error('[Community] Request failed.', error instanceof Error ? error.name : 'Unknown error');
      return sendJson(res, 500, { error: 'The Community request failed. Please try again.' });
    }
  }

  return handle;
}

module.exports = {
  createCommunityApi,
  RULES_VERSION,
  USERNAME_PATTERN,
  isUsernameReserved,
};
