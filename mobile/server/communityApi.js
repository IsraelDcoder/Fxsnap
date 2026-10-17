const crypto = require('crypto');
const { z } = require('zod');
const persistentStore = require('./persistentStore');

const RULES_VERSION = 'community-rules-v1';
const MEMBER_LIMIT = 40;
const MAX_MESSAGE_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_DIMENSIONS = {
  imageWidth: z.number().int().min(1).max(8000).optional(),
  imageHeight: z.number().int().min(1).max(8000).optional(),
};
const ALLOWED_MESSAGE_IMAGES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const COMMUNITY_CATEGORIES = ['trading', 'investing', 'finance', 'market_discussion', 'learning', 'chart_analysis', 'questions', 'events'];
const MESSAGE_REACTIONS = ['love', 'fire', 'funny', 'clap', 'wow'];
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'fxsnap', 'fxsnap_official', 'moderator', 'support', 'system']);

class CommunityError extends Error {
  constructor(message, status = 500, requestId = null) {
    super(message);
    this.status = status;
    this.requestId = requestId;
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

function communityDatabaseOperation(path, method, body) {
  if (path === 'rpc/fxsnap_community_set_reaction') return 'reaction_update';
  if (path === 'fxsnap_community_messages' && method === 'POST' && body?.reply_to_id) return 'reply_creation';
  return `${method.toLowerCase()}_${path.split('?')[0].replace(/^rpc\//, 'rpc_')}`;
}

function safeDatabaseMessage(value) {
  return String(value || 'No database error message was provided.')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]')
    .replace(/\busr_[A-Za-z0-9_-]+\b/g, '[redacted account]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[redacted id]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

async function dispatchCommunityPush(objectId) {
  try {
    await require('./notificationService').dispatchCommunityPushNotifications(objectId);
  } catch (error) {
    console.error('[Community] Activity push dispatch failed; the queued event will be retried.', {
      objectId,
      error: error instanceof Error ? error.message : 'Unknown notification error.',
    });
  }
}

function createCommunityApi({
  getActor,
  sendJson,
  readJsonBody,
  saveCommunityUsername,
  dispatchCommunityPush: sendCommunityPush = dispatchCommunityPush,
}) {
  function dispatchQueuedNotifications(messageId) {
    void Promise.resolve()
      .then(() => sendCommunityPush(messageId))
      .catch((error) => {
        console.error('[Notifications] Queued push dispatch failed; the event will be retried.', {
          messageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
  }

  async function database(path, options = {}) {
    const config = getServerConfig();
    const isSystemAnnouncementOperation = path.includes('system_announcement');
    if (!config.ready) {
      throw new CommunityError(
        isSystemAnnouncementOperation
          ? 'System announcement storage is not configured. Apply its migration and configure server-side Supabase storage first.'
          : 'Community storage is not configured. Apply the migration and configure server-side Supabase storage first.',
        503,
      );
    }
    const method = options.method || 'GET';
    let requestBody = null;
    if (typeof options.body === 'string') {
      try { requestBody = JSON.parse(options.body); } catch { requestBody = null; }
    }
    const operation = communityDatabaseOperation(path, method, requestBody);
    const requestId = crypto.randomUUID();
    let response;
    try {
      response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: config.serviceKey,
          authorization: `Bearer ${config.serviceKey}`,
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      console.error('[Community] Supabase request failed.', {
        operation,
        requestId,
        httpStatus: null,
        databaseCode: null,
        databaseMessage: safeDatabaseMessage(error instanceof Error ? error.message : null),
        path: path.split('?')[0],
      });
      throw new CommunityError('Community storage is temporarily unavailable. Please try again.', 502, requestId);
    }
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try { payload = JSON.parse(responseText); } catch { payload = null; }
    }
    if (!response.ok) {
      const databaseCode = typeof payload?.code === 'string' ? payload.code : null;
      const databaseMessage = safeDatabaseMessage(payload?.message || payload?.error);
      console.error('[Community] Supabase request failed.', {
        operation,
        requestId,
        httpStatus: response.status,
        databaseCode,
        databaseMessage,
        path: path.split('?')[0],
      });
      if (response.status === 404 || response.status === 406
        || ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(databaseCode)) {
        throw new CommunityError(
          isSystemAnnouncementOperation
            ? 'The system announcement database migration is not installed or is unavailable.'
            : 'Community database migration is not installed or is unavailable.',
          503,
          requestId,
        );
      }
      if (response.status === 409 || databaseCode === '23505') {
        throw new CommunityError('That action conflicts with existing community data.', 409, requestId);
      }
      if (['23502', '23514', '22P02'].includes(databaseCode)) {
        throw new CommunityError('Some community message details are invalid. Check your reply and try again.', 400, requestId);
      }
      if (databaseCode === '23503') {
        throw new CommunityError('The community post could not be found. Refresh the discussion and try again.', 404, requestId);
      }
      if (databaseCode === 'P0001' && /message not found/i.test(databaseMessage)) {
        throw new CommunityError('The community post could not be found. Refresh the discussion and try again.', 404, requestId);
      }
      if (databaseCode === '42501') {
        throw new CommunityError('You are not authorized to update this community post.', 403, requestId);
      }
      throw new CommunityError(
        isSystemAnnouncementOperation
          ? 'System announcement storage could not complete the request. Please try again.'
          : 'Community storage could not complete the request. Please try again.',
        502,
        requestId,
      );
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

  async function authorize(req, res, { joined = true, requireCommunity = true } = {}) {
    const config = getServerConfig();
    if (requireCommunity && !config.enabled) {
      sendJson(res, 503, { error: 'Community is not enabled yet.' });
      return null;
    }
    if (!config.ready) {
      sendJson(res, 503, {
        error: requireCommunity
          ? 'Community storage is not configured. Apply the migration and configure server-side Supabase storage first.'
          : 'FXSnap announcement storage is not configured. Apply the system announcement migration and configure server-side Supabase storage first.',
      });
      return null;
    }
    const actor = await getActor(req, res);
    if (!actor) return null;
    if (typeof actor.supabaseUserId !== 'string' || !actor.supabaseUserId) {
      sendJson(res, 403, { error: requireCommunity
        ? 'Sign in with your linked Google account to join Community.'
        : 'Sign in with your linked Google account to access FXSnap announcements.' });
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

  function groupMessageReactions(reactions, accountId, messageId) {
    const grouped = groupReactions(reactions.filter((reaction) => reaction.message_id === messageId), accountId);
    const love = grouped.find((reaction) => reaction.reaction === 'love');
    // Keep old clients' Like label working while new clients use the Love reaction.
    return love ? [...grouped, { ...love, reaction: 'like' }] : grouped;
  }

  async function serializeMessages(rows, actor) {
      if (!rows.length) return [];
      const ids = rows.map((row) => row.id);
      const accountIds = [...new Set(rows.map((row) => row.account_id))];
      const accountExpression = encodeURIComponent(accountIds.map((id) => `"${id}"`).join(','));
      const pollMessageIds = rows.filter((row) => !row.removed_at && row.payload?.poll).map((row) => row.id);
      const [reactionRows, followedRows, profileRows, commentCountRows, pollVoteRows] = await Promise.all([
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
          body: JSON.stringify({ p_message_ids: ids, p_account_id: actor.accountId }),
        }),
        pollMessageIds.length
          ? getRows(
            'fxsnap_community_poll_votes',
            `message_id=in.(${encodeURIComponent(pollMessageIds.map((id) => `"${id}"`).join(','))})&select=message_id,account_id,option_id`,
          )
          : Promise.resolve([]),
      ]);
      const reactions = parseRows(reactionRows);
      const followed = parseRows(followedRows);
      const profiles = parseRows(profileRows);
      const commentCounts = parseRows(commentCountRows);
      const pollVotes = parseRows(pollVoteRows);
      const followedIds = new Set(followed.map((row) => row.followed_account_id));
      const picturesByAccount = new Map(profiles.map((row) => [row.account_id, row.picture_url]));
      const commentCountByMessage = new Map(commentCounts.map((row) => [row.message_id, Number(row.comment_count)]));
      const repostCountByMessage = new Map(commentCounts.map((row) => [row.message_id, Number(row.repost_count)]));
      const repostedByActor = new Set(commentCounts.filter((row) => row.reposted_by_me === true).map((row) => row.message_id));
      const savedByActor = new Set(commentCounts.filter((row) => row.saved_by_me === true).map((row) => row.message_id));
      const votesByMessage = new Map();
      for (const vote of pollVotes) {
        const existing = votesByMessage.get(vote.message_id) || [];
        existing.push(vote);
        votesByMessage.set(vote.message_id, existing);
      }
      const replies = rows.map((row) => row.reply_to_id).filter(Boolean);
    const replyRows = replies.length
      ? parseRows(await getRows(
        'fxsnap_community_messages',
        `id=in.(${encodeURIComponent(replies.map((id) => `"${id}"`).join(','))})&select=id,author_username,body,kind,removed_at`,
      ))
      : [];
    const replyMap = new Map(replyRows.map((row) => [row.id, row]));
    return rows.map((row) => {
      const payload = row.removed_at ? {} : row.payload || {};
      const poll = payload.poll;
      const votes = votesByMessage.get(row.id) || [];
      if (poll && Array.isArray(poll.options)) {
        const totalVotes = votes.length;
        payload.poll = {
          ...poll,
          totalVotes,
          results: poll.options.map((option) => {
            const count = votes.filter((vote) => vote.option_id === option.id).length;
            return {
              optionId: option.id,
              votes: count,
              percentage: totalVotes ? Math.round((count / totalVotes) * 100) : 0,
            };
          }),
          selectedOptionId: votes.find((vote) => vote.account_id === actor.accountId)?.option_id || null,
        };
      }
      return ({
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
      payload,
      replyTo: row.reply_to_id ? (replyMap.get(row.reply_to_id) || null) : null,
      pinnedAt: row.pinned_at,
      createdAt: row.created_at,
      commentCount: commentCountByMessage.get(row.id) || 0,
      viewCount: Number(row.view_count) || 0,
      shareCount: Number(row.share_count) || 0,
      repostCount: repostCountByMessage.get(row.id) || 0,
      repostedByMe: repostedByActor.has(row.id),
      savedByMe: savedByActor.has(row.id),
      removed: Boolean(row.removed_at),
      reactions: groupMessageReactions(reactions, actor.accountId, row.id),
      });
    });
  }

  async function resolveMessage(req, res, id) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
      sendJson(res, 400, { error: 'A valid message id is required.' });
      return null;
    }
    const rows = parseRows(await getRows(
      'fxsnap_community_messages',
      `id=eq.${encodeURIComponent(id)}&select=id,account_id,author_username,is_official,kind,body,payload,reply_to_id,pinned_at,pinned_by,removed_at,created_at,client_message_id,view_count,share_count&limit=1`,
    ));
    if (!rows.length || rows[0].removed_at) {
      sendJson(res, 404, { error: 'Community message not found.' });
      return null;
    }
    return rows[0];
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
      select: 'id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id,view_count,share_count',
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

  async function listMessages(actor, url, res) {
    const rawLimit = Number(url.searchParams.get('limit') || MEMBER_LIMIT);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MEMBER_LIMIT) {
      throw new CommunityError(`Message page size must be between 1 and ${MEMBER_LIMIT}.`, 400);
    }
    const cursor = url.searchParams.get('before');
    let before = null;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof decoded.createdAt !== 'string' || Number.isNaN(Date.parse(decoded.createdAt))
          || typeof decoded.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(decoded.id)
          || (decoded.score !== undefined && !Number.isFinite(decoded.score))) throw new Error('Invalid cursor');
        before = decoded;
      } catch {
        if (Number.isNaN(Date.parse(cursor))) {
          throw new CommunityError('Invalid message history cursor.', 400);
        }
        before = { createdAt: new Date(cursor).toISOString(), id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
      }
    }
    const category = url.searchParams.get('category');
    if (category && !COMMUNITY_CATEGORIES.includes(category)) {
      throw new CommunityError('Choose a valid Community category.', 400);
    }
    const feed = url.searchParams.get('feed') || 'global';
    if (!['global', 'following', 'trending', 'latest', 'saved'].includes(feed)) {
      throw new CommunityError('Choose a valid Community feed.', 400);
    }
    const following = feed === 'following'
      ? parseRows(await getRows('fxsnap_community_follows',
        `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&select=followed_account_id&limit=500`))
      : null;
    if (following && following.length === 0) {
      const emptyPage = { messages: [], nextCursor: null, hasMore: false, followingEmpty: true };
      return res ? sendJson(res, 200, emptyPage) : emptyPage;
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
    const exclusions = [...new Set([...blockedIds, ...blockedByIds])];
    if (feed === 'saved') {
      const savedRows = parseRows(await getRows(
        'fxsnap_community_saved_posts',
        `account_id=eq.${encodeURIComponent(actor.accountId)}&select=message_id,created_at&order=created_at.desc,message_id.desc&limit=500`,
      )).filter((saved) => !before || saved.created_at < before.createdAt
        || (saved.created_at === before.createdAt && saved.message_id < before.id));
      const pageSaved = savedRows.slice(0, rawLimit + 1);
      if (!pageSaved.length) {
        const emptyPage = { messages: [], nextCursor: null, hasMore: false };
        return res ? sendJson(res, 200, emptyPage) : emptyPage;
      }
      const ids = pageSaved.map((saved) => `"${saved.message_id}"`).join(',');
      const savedMessages = parseRows(await getRows(
        'fxsnap_community_messages',
        `id=in.(${encodeURIComponent(ids)})&removed_at=is.null&reply_to_id=is.null&select=id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id,view_count,share_count`,
      ));
      const messagesById = new Map(savedMessages.map((message) => [message.id, message]));
      const orderedRows = pageSaved.flatMap((saved) => {
        const message = messagesById.get(saved.message_id);
        if (!message || (category && message.category !== category)) return [];
        if (exclusions.some((accountId) => accountId.replaceAll('"', '') === message.account_id)) return [];
        return [{ ...message, saved_at: saved.created_at }];
      });
      const hasMore = orderedRows.length > rawLimit || savedRows.length > pageSaved.length;
      const page = orderedRows.slice(0, rawLimit);
      const serialized = await serializeMessages(page, actor);
      const last = page.at(-1);
      const result = {
        messages: serialized,
        nextCursor: hasMore && last
          ? Buffer.from(JSON.stringify({ createdAt: last.saved_at, id: last.id })).toString('base64url')
          : null,
        hasMore,
      };
      return res ? sendJson(res, 200, result) : result;
    }
    const params = new URLSearchParams({
      select: 'id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id,view_count,share_count',
      removed_at: 'is.null',
      reply_to_id: 'is.null',
      order: 'created_at.desc,id.desc',
      limit: String(feed === 'trending' ? 100 : rawLimit + 1),
    });
    if (before && feed !== 'trending') {
      params.set('or', `(created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id}))`);
    }
    if (feed === 'trending') params.set('created_at', `gte.${new Date(Date.now() - 7 * 86_400_000).toISOString()}`);
    if (category) params.set('category', `eq.${category}`);
    const accountFilters = [];
    if (following) accountFilters.push(`account_id.in.(${following.map((row) => `"${row.followed_account_id}"`).join(',')})`);
    if (exclusions.length) accountFilters.push(`account_id.not.in.(${exclusions.join(',')})`);
    if (accountFilters.length) params.set('and', `(${accountFilters.join(',')})`);
    const rows = parseRows(await getRows('fxsnap_community_messages', params.toString()));
    const serializedRows = await serializeMessages(rows, actor);
    if (feed === 'trending') {
      const score = (message) => {
        const reactions = message.reactions.filter((reaction) => reaction.reaction !== 'like')
          .reduce((total, reaction) => total + reaction.count, 0);
        const ageHours = Math.max(0, (Date.now() - Date.parse(message.createdAt)) / 3_600_000);
        return (reactions + message.commentCount * 2 + message.repostCount * 3 + message.shareCount * 0.5)
          / Math.pow(ageHours + 2, 0.65);
      };
      serializedRows.sort((a, b) => score(b) - score(a)
        || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const ranked = serializedRows.map((message) => ({ ...message, _trendScore: score(message) }))
        .filter((message) => !before || message._trendScore < before.score
          || (message._trendScore === before.score && (message.createdAt < before.createdAt
            || (message.createdAt === before.createdAt && message.id < before.id))));
      const page = ranked.slice(0, rawLimit);
      const hasMore = ranked.length > rawLimit;
      const last = page.at(-1);
      const result = {
        messages: page.map(({ _trendScore, ...message }) => message),
        nextCursor: hasMore && last
          ? Buffer.from(JSON.stringify({ score: last._trendScore, createdAt: last.createdAt, id: last.id })).toString('base64url')
          : null,
        hasMore,
      };
      return res ? sendJson(res, 200, result) : result;
    }
    const hasMore = rows.length > rawLimit;
    const page = serializedRows.slice(0, rawLimit);
    const next = hasMore && page.length
      ? Buffer.from(JSON.stringify({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })).toString('base64url')
      : null;
    const result = {
      messages: page,
      nextCursor: next,
      hasMore,
      followingEmpty: Boolean(following && following.length > 0 && page.length === 0),
    };
    return res ? sendJson(res, 200, result) : result;
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
    if (payload.poll && kind !== 'text') return sendJson(res, 400, { error: 'Polls must be published as Community posts.' });
    if (kind === 'announcement' && !actor.isAdmin) return sendJson(res, 403, { error: 'Only authorized administrators can publish announcements.' });
    if (kind === 'announcement' && base.data.category && base.data.category !== 'events') return sendJson(res, 400, { error: 'Announcements must use the Events & Announcements category.' });
    if (base.data.category === 'events' && !actor.isAdmin) return sendJson(res, 403, { error: 'Only FXSnap and approved hosts can publish Events & Announcements.' });
    if (kind === 'text' && !base.data.body && !payload.poll) return sendJson(res, 400, { error: 'Message text cannot be empty.' });
    if (kind !== 'text' && base.data.body.length > 1200) return sendJson(res, 400, { error: 'The optional caption is too long.' });

    let safePayload = {};
    if (kind === 'signal') {
      const signal = z.object({
        instrument: z.string().trim().min(3).max(20),
        direction: z.enum(['BUY', 'SELL']),
        entry: z.string().trim().regex(/^\d+(?:\.\d+)?$/).optional(),
        stopLoss: z.string().trim().regex(/^\d+(?:\.\d+)?$/).optional(),
        takeProfits: z.array(z.string().trim().regex(/^\d+(?:\.\d+)?$/)).max(5).default([]),
        timeframe: z.string().trim().min(1).max(20),
        reasoning: z.string().trim().max(1200).default(''),
        imageUrl: z.string().url().max(2048).nullable().optional(),
        ...IMAGE_DIMENSIONS,
      }).safeParse(payload);
      if (!signal.success) return sendJson(res, 400, { error: 'Complete the trade idea instrument, direction, and timeframe. Price levels are optional.' });
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
        riskReward: z.union([z.number().finite(), z.string().max(24)]).nullable().optional(),
        marketBias: z.string().max(40).nullable().optional(),
        reasoning: z.array(z.string().max(500)).max(8).default([]),
        imageUrl: z.string().url().max(2048).nullable().optional(),
        ...IMAGE_DIMENSIONS,
      }).safeParse(payload);
      if (!snapshot.success) return sendJson(res, 400, { error: 'The FXSnap analysis snapshot is incomplete or invalid.' });
      safePayload = snapshot.data;
    } else if (kind === 'text' || kind === 'announcement') {
      const textPayload = z.object({
        imageUrl: z.string().url().max(2048).nullable().optional(),
        poll: z.object({
          question: z.string().trim().min(3).max(200),
          options: z.array(z.object({
            id: z.string().regex(/^[a-z0-9_-]{1,24}$/),
            text: z.string().trim().min(1).max(60),
          }).strict()).min(2).max(6),
          endsAt: z.string().datetime().nullable(),
        }).strict().optional(),
        ...IMAGE_DIMENSIONS,
      }).safeParse(payload);
      if (!textPayload.success) return sendJson(res, 400, { error: 'Invalid chart image attachment.' });
      if (textPayload.data.poll) {
        const optionIds = textPayload.data.poll.options.map((option) => option.id);
        const optionNames = textPayload.data.poll.options.map((option) => option.text.toLowerCase());
        if (new Set(optionIds).size !== optionIds.length || new Set(optionNames).size !== optionNames.length) {
          return sendJson(res, 400, { error: 'Poll options must be unique.' });
        }
        if (textPayload.data.poll.endsAt && Date.parse(textPayload.data.poll.endsAt) <= Date.now()) {
          return sendJson(res, 400, { error: 'Choose a future poll end time.' });
        }
      }
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
    if (kind === 'text' && !payload.poll && !base.data.replyToId && base.data.body.length >= 16) {
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
    dispatchQueuedNotifications(message.id);
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
      `username=eq.${encodeURIComponent(normalized)}&select=account_id,supabase_user_id,username,picture_url,status,muted_until,joined_at&limit=1`,
    ))[0] || null;
  }

  async function handle(req, res, url) {
    const pathname = url.pathname;
    const isSystemAnnouncementPath = pathname.startsWith('/api/system-announcements')
      || pathname.startsWith('/api/admin/system-announcements');
    if (!isSystemAnnouncementPath
      && !pathname.startsWith('/api/community/')
      && !pathname.startsWith('/api/admin/community/')) return false;
    try {
      const actor = await authorize(req, res, {
        requireCommunity: !isSystemAnnouncementPath,
        joined: !isSystemAnnouncementPath
          && !['/api/community/me', '/api/community/username', '/api/community/join', '/api/community/bootstrap', '/api/community/notifications'].includes(pathname),
      });
      if (!actor) return true;
      const config = getServerConfig();
      const profileQuery = (accountId) => `account_id=eq.${encodeURIComponent(accountId)}`;

      if (isSystemAnnouncementPath) {
        if (pathname === '/api/system-announcements' && req.method === 'GET') {
          const announcements = parseRows(await database('rpc/fxsnap_system_announcement_inbox', {
            method: 'POST',
            body: JSON.stringify({ p_user_id: actor.supabaseUserId }),
          }));
          return sendJson(res, 200, { announcements });
        }

        const announcementUserMatch = pathname.match(/^\/api\/system-announcements\/([0-9a-f-]+)\/(read|dismiss)$/i);
        if (announcementUserMatch && req.method === 'POST') {
          const [, announcementId, action] = announcementUserMatch;
          const recipients = parseRows(await getRows(
            'fxsnap_system_announcement_recipients',
            `announcement_id=eq.${encodeURIComponent(announcementId)}&recipient_supabase_user_id=eq.${encodeURIComponent(actor.supabaseUserId)}&select=announcement_id&limit=1`,
          ));
          if (!recipients.length) return sendJson(res, 404, { error: 'This announcement is not available to your account.' });
          const field = action.toLowerCase() === 'read' ? 'read_at' : 'banner_dismissed_at';
          await patchRows(
            'fxsnap_system_announcement_recipients',
            `announcement_id=eq.${encodeURIComponent(announcementId)}&recipient_supabase_user_id=eq.${encodeURIComponent(actor.supabaseUserId)}&${field}=is.null`,
            { [field]: new Date().toISOString() },
          );
          return sendJson(res, 200, { updated: true });
        }

        if (pathname === '/api/admin/system-announcements/audience-count' && req.method === 'GET') {
          if (!await adminOnly(actor, res)) return true;
          const audience = url.searchParams.get('audience');
          const daysValue = Number(url.searchParams.get('days') || 30);
          if (!['all', 'recently_active'].includes(audience || '')
            || !Number.isInteger(daysValue) || daysValue < 1 || daysValue > 365) {
            return sendJson(res, 400, { error: 'Choose a valid audience and activity window.' });
          }
          const countResult = await database('rpc/fxsnap_system_announcement_audience_count', {
            method: 'POST',
            body: JSON.stringify({ p_audience: audience, p_audience_days: daysValue }),
          });
          const count = Array.isArray(countResult) ? countResult[0] : countResult;
          return sendJson(res, 200, { count: Number(count) || 0 });
        }

        if (pathname === '/api/admin/system-announcements/access' && req.method === 'GET') {
          return sendJson(res, 200, { allowed: actor.isAdmin });
        }

        if (pathname === '/api/admin/system-announcements' && req.method === 'GET') {
          if (!await adminOnly(actor, res)) return true;
          const announcements = parseRows(await database('rpc/fxsnap_system_announcement_admin_list', { method: 'POST', body: '{}' }));
          return sendJson(res, 200, { announcements });
        }

        const announcementInputSchema = z.object({
          type: z.enum(['product', 'maintenance', 'educational', 'urgent']),
          title: z.string().trim().min(1).max(100),
          message: z.string().trim().min(1).max(2000),
          destination: z.enum(['home', 'community', 'analysis', 'events', 'profile', 'notification_center']),
          destinationParams: z.object({ postId: z.string().uuid().optional() }).strict().default({}),
          audience: z.enum(['all', 'recently_active']),
          audienceDays: z.number().int().min(1).max(365).default(30),
          channels: z.object({
            in_app_banner: z.boolean(),
            notification_center: z.boolean(),
            push: z.boolean(),
          }).strict(),
        }).strict()
          .refine((value) => Object.values(value.channels).some(Boolean))
          .refine((value) => value.destination === 'community' || !value.destinationParams.postId);

        if (pathname === '/api/admin/system-announcements' && req.method === 'POST') {
          if (!await adminOnly(actor, res)) return true;
          const input = announcementInputSchema.safeParse(await readJsonBody(req));
          if (!input.success) return sendJson(res, 400, { error: 'Check the announcement content, destination, audience, and delivery channels.' });
          const idempotencyKey = z.string().uuid().safeParse(req.headers['idempotency-key']);
          if (!idempotencyKey.success) return sendJson(res, 400, { error: 'An Idempotency-Key UUID header is required.' });
          const saved = await database('rpc/fxsnap_system_announcement_save', {
            method: 'POST',
            body: JSON.stringify({
              p_actor_supabase_user_id: actor.supabaseUserId,
              p_idempotency_key: idempotencyKey.data,
              p_input: input.data,
            }),
          });
          return sendJson(res, 201, { announcement: Array.isArray(saved) ? saved[0] : saved });
        }

        const adminAnnouncementMatch = pathname.match(/^\/api\/admin\/system-announcements\/([0-9a-f-]+)$/i);
        if (adminAnnouncementMatch && req.method === 'PATCH') {
          if (!await adminOnly(actor, res)) return true;
          const body = await readJsonBody(req);
          const action = z.enum(['update', 'publish', 'cancel']).safeParse(body?.action);
          if (!action.success) return sendJson(res, 400, { error: 'Choose whether to update, publish, or cancel this announcement.' });
          let announcementInput = null;
          if (action.data === 'update') {
            const input = announcementInputSchema.safeParse(body?.announcement);
            if (!input.success) return sendJson(res, 400, { error: 'Check the announcement content, destination, audience, and delivery channels.' });
            announcementInput = input.data;
          }
          const announcement = await database('rpc/fxsnap_system_announcement_transition', {
            method: 'POST',
            body: JSON.stringify({
              p_announcement_id: adminAnnouncementMatch[1],
              p_actor_supabase_user_id: actor.supabaseUserId,
              p_action: action.data,
              p_input: announcementInput,
            }),
          });
          if (action.data === 'publish' && announcement?.status === 'published') {
            dispatchQueuedNotifications(null);
          }
          return sendJson(res, 200, { announcement });
        }

        return sendJson(res, 405, { error: 'Unsupported system announcement operation.' });
      }

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

      if (pathname === '/api/community/bootstrap' && req.method === 'GET') {
        const profiles = parseRows(await getRows(
          'fxsnap_community_profiles',
          `${profileQuery(actor.accountId)}&select=account_id,supabase_user_id,username,picture_url,status,muted_until,accepted_rules_version,joined_at&limit=1`,
        ));
        let profile = profiles[0];
        if (!profile) return sendJson(res, 200, { profile: null, messages: [], nextCursor: null, hasMore: false });
        if (profile.supabase_user_id !== actor.supabaseUserId) {
          return sendJson(res, 403, { error: 'The signed-in account does not match this Community profile.' });
        }
        if (['suspended', 'banned'].includes(profile.status)) {
          return sendJson(res, 403, { error: 'This Community account is currently unavailable.' });
        }
        if (actor.pictureUrl && actor.pictureUrl !== profile.picture_url) {
          const updatedProfiles = parseRows(await patchRows(
            'fxsnap_community_profiles',
            profileQuery(actor.accountId),
            { picture_url: actor.pictureUrl, updated_at: new Date().toISOString() },
          ));
          if (updatedProfiles[0]) profile = updatedProfiles[0];
        }
        if (profile.status === 'muted' && profile.muted_until
          && new Date(profile.muted_until).getTime() <= Date.now()) {
          const updatedProfiles = parseRows(await patchRows(
            'fxsnap_community_profiles',
            profileQuery(actor.accountId),
            { status: 'active', muted_until: null, updated_at: new Date().toISOString() },
          ));
          if (updatedProfiles[0]) profile = updatedProfiles[0];
        }
        actor.profile = profile;
        const page = await listMessages(actor, url, null);
        return sendJson(res, 200, {
          profile: profileForClient(profile, actor.isAdmin, actor.pictureUrl),
          ...page,
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

      if (pathname === '/api/community/search' && req.method === 'GET') {
        const rawQuery = String(url.searchParams.get('q') || '').trim();
        const query = rawQuery.replace(/[,*%()]/g, '').slice(0, 80);
        const kind = url.searchParams.get('kind');
        if (query.length < 2 || !['posts', 'people', 'topics'].includes(kind)) {
          return sendJson(res, 400, { error: 'Enter at least two characters and choose a valid search category.' });
        }
        const result = { posts: [], people: [], topics: [] };
        if (kind === 'topics') {
          result.topics = COMMUNITY_CATEGORIES
            .map((id) => ({ id, label: ({
              trading: 'Trading',
              investing: 'Investing',
              finance: 'Finance',
              market_discussion: 'Market Discussion',
              learning: 'Learning',
              chart_analysis: 'Chart Analysis',
              questions: 'Questions',
              events: 'Events & Announcements',
            })[id] }))
            .filter((topic) => actor.isAdmin || topic.id !== 'events')
            .filter((topic) => `${topic.id} ${topic.label}`.toLowerCase().includes(query.toLowerCase()));
          return sendJson(res, 200, result);
        }
        if (kind === 'people') {
          const people = parseRows(await getRows(
            'fxsnap_community_profiles',
            `username=ilike.${encodeURIComponent(`*${query}*`)}&status=eq.active&select=account_id,username,picture_url&order=username.asc&limit=30`,
          ));
          const [blocked, blockedBy] = await Promise.all([
            getRows('fxsnap_community_blocks',
              `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocked_account_id`),
            getRows('fxsnap_community_blocks',
              `blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id`),
          ]);
          const hidden = [...parseRows(blocked), ...parseRows(blockedBy)];
          const hiddenIds = new Set(hidden.flatMap((item) => [
            item.blocker_account_id === actor.accountId ? item.blocked_account_id : null,
            item.blocked_account_id === actor.accountId ? item.blocker_account_id : null,
          ]).filter(Boolean));
          result.people = people
            .filter((person) => !hiddenIds.has(person.account_id))
            .map((person) => ({
              accountId: person.account_id,
              username: person.username,
              pictureUrl: person.picture_url || null,
            }));
          return sendJson(res, 200, result);
        }
        const [blocks, blockedBy] = await Promise.all([
          getRows('fxsnap_community_blocks',
            `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocked_account_id`),
          getRows('fxsnap_community_blocks',
            `blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id`),
        ]);
        const excluded = [...new Set([
          ...parseRows(blocks).map((row) => row.blocked_account_id),
          ...parseRows(blockedBy).map((row) => row.blocker_account_id),
        ])];
        const params = new URLSearchParams({
          select: 'id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id,view_count,share_count',
          body: `ilike.*${query}*`,
          removed_at: 'is.null',
          reply_to_id: 'is.null',
          order: 'created_at.desc,id.desc',
          limit: '30',
        });
        if (excluded.length) {
          params.set('account_id', `not.in.(${excluded.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')})`);
        }
        const rows = parseRows(await getRows('fxsnap_community_messages', params.toString()));
        result.posts = await serializeMessages(rows, actor);
        return sendJson(res, 200, result);
      }

      const memberMatch = pathname.match(/^\/api\/community\/members\/([a-z0-9_]{3,24})$/i);
      if (memberMatch && req.method === 'GET') {
        const member = await memberProfile(actor, memberMatch[1]);
        if (!member || member.status !== 'active') return sendJson(res, 404, { error: 'Community member not found.' });
        const [blockedByActor, blockedActor] = await Promise.all([
          getRows('fxsnap_community_blocks',
            `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&blocked_account_id=eq.${encodeURIComponent(member.account_id)}&select=blocker_account_id&limit=1`),
          getRows('fxsnap_community_blocks',
            `blocker_account_id=eq.${encodeURIComponent(member.account_id)}&blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id&limit=1`),
        ]);
        if (parseRows(blockedByActor).length || parseRows(blockedActor).length) {
          return sendJson(res, 404, { error: 'Community member not found.' });
        }
        const own = member.account_id === actor.accountId;
        const [posts, follows, counts] = await Promise.all([
          getRows('fxsnap_community_messages',
            `account_id=eq.${encodeURIComponent(member.account_id)}&reply_to_id=is.null&removed_at=is.null&select=id,account_id,author_username,is_official,kind,category,body,payload,reply_to_id,pinned_at,removed_at,created_at,client_message_id&order=created_at.desc,id.desc&limit=30`),
          own ? Promise.resolve([]) : getRows('fxsnap_community_follows',
            `follower_account_id=eq.${encodeURIComponent(actor.accountId)}&followed_account_id=eq.${encodeURIComponent(member.account_id)}&select=followed_account_id&limit=1`),
          database('rpc/fxsnap_community_member_counts', {
            method: 'POST',
            body: JSON.stringify({ p_account_id: member.account_id }),
          }),
        ]);
        const memberPosts = await serializeMessages(parseRows(posts), actor);
        const totals = parseRows(counts)[0] || { follower_count: 0, following_count: 0 };
        return sendJson(res, 200, {
          member: {
            accountId: member.account_id,
            username: member.username,
            pictureUrl: member.picture_url || null,
            joinedAt: member.joined_at,
            followerCount: Number(totals.follower_count) || 0,
            followingCount: Number(totals.following_count) || 0,
            isFollowing: parseRows(follows).length > 0,
            isCurrentUser: own,
            posts: memberPosts,
          },
        });
      }

      if (pathname === '/api/community/messages' && req.method === 'GET') {
        return listMessages(actor, url, res);
      }
      if (pathname === '/api/community/messages' && req.method === 'POST') {
        if (actor.profile.status === 'muted' && actor.profile.muted_until
          && new Date(actor.profile.muted_until).getTime() > Date.now()) {
          return sendJson(res, 403, { error: 'Your Community account is muted until the displayed time.' });
        }
        return await publishMessage(req, actor, await readJsonBody(req), res);
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
        return await publishMessage(req, actor, {
          ...body,
          kind: 'text',
          replyToId,
        }, res);
      }

      if (pathname === '/api/community/views' && req.method === 'POST') {
        const input = z.object({
          messageIds: z.array(z.string().uuid()).min(1).max(30),
        }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose up to 30 valid posts to record.' });
        await rateLimit(actor.accountId, 'views', 60, 60);
        const idExpression = encodeURIComponent([...new Set(input.data.messageIds)].map((id) => `"${id}"`).join(','));
        const [visibleRows, blockedByActor, blockedActor] = await Promise.all([
          getRows(
            'fxsnap_community_messages',
            `id=in.(${idExpression})&reply_to_id=is.null&removed_at=is.null&select=id,account_id`,
          ),
          getRows(
            'fxsnap_community_blocks',
            `blocker_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocked_account_id`,
          ),
          getRows(
            'fxsnap_community_blocks',
            `blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id`,
          ),
        ]);
        const excludedAccounts = new Set([
          ...parseRows(blockedByActor).map((row) => row.blocked_account_id),
          ...parseRows(blockedActor).map((row) => row.blocker_account_id),
        ]);
        const eligibleIds = parseRows(visibleRows)
          .filter((row) => row.account_id !== actor.accountId && !excludedAccounts.has(row.account_id))
          .map((row) => row.id);
        if (!eligibleIds.length) return sendJson(res, 200, { views: [] });
        const counts = parseRows(await database('rpc/fxsnap_community_record_views', {
          method: 'POST',
          body: JSON.stringify({ p_message_ids: eligibleIds, p_account_id: actor.accountId }),
        }));
        return sendJson(res, 200, {
          views: counts.map((row) => ({ messageId: row.message_id, viewCount: Number(row.view_count) || 0 })),
        });
      }

      const repostMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/reposts$/i);
      if (repostMatch && req.method === 'POST') {
        await rateLimit(actor.accountId, 'reposts', 30, 60);
        const message = await resolveMessage(req, res, repostMatch[1]);
        if (!message) return true;
        if (message.reply_to_id) return sendJson(res, 400, { error: 'Only original posts can be reposted.' });
        if (message.account_id === actor.accountId) return sendJson(res, 400, { error: 'You cannot repost your own post.' });
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(message.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(message.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 403, { error: 'Reposting is unavailable for members who have blocked one another.' });
        const result = parseRows(await database('rpc/fxsnap_community_toggle_repost', {
          method: 'POST',
          body: JSON.stringify({ p_message_id: message.id, p_account_id: actor.accountId }),
        }))[0];
        if (!result) throw new CommunityError('The repost could not be updated. Please try again.', 502);
        return sendJson(res, 200, {
          reposted: result.reposted === true,
          repostCount: Number(result.repost_count) || 0,
        });
      }

      const savedMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/saved$/i);
      if (savedMatch && req.method === 'POST') {
        await rateLimit(actor.accountId, 'saved_posts', 60, 60);
        const message = await resolveMessage(req, res, savedMatch[1]);
        if (!message) return true;
        if (message.reply_to_id) return sendJson(res, 400, { error: 'Only original posts can be saved.' });
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(message.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(message.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 404, { error: 'Community post not found.' });
        const result = parseRows(await database('rpc/fxsnap_community_toggle_saved_post', {
          method: 'POST',
          body: JSON.stringify({ p_message_id: message.id, p_account_id: actor.accountId }),
        }))[0];
        if (!result) throw new CommunityError('The saved post could not be updated. Please try again.', 502);
        return sendJson(res, 200, { saved: result.saved === true });
      }

      const pollVoteMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/poll-votes$/i);
      if (pollVoteMatch && req.method === 'POST') {
        const input = z.object({ optionId: z.string().regex(/^[a-z0-9_-]{1,24}$/) }).strict()
          .safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose a valid poll option.' });
        await rateLimit(actor.accountId, 'poll_votes', 30, 60);
        const message = await resolveMessage(req, res, pollVoteMatch[1]);
        if (!message) return true;
        if (message.reply_to_id || !message.payload?.poll) return sendJson(res, 400, { error: 'This post does not contain a poll.' });
        const pollData = message.payload.poll;
        if (!Array.isArray(pollData.options) || !pollData.options.some((option) => option.id === input.data.optionId)) {
          return sendJson(res, 400, { error: 'Choose a valid poll option.' });
        }
        if (pollData.endsAt && Date.parse(pollData.endsAt) <= Date.now()) {
          return sendJson(res, 400, { error: 'This poll has ended.' });
        }
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(message.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(message.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 404, { error: 'Community post not found.' });
        const votes = parseRows(await database('rpc/fxsnap_community_vote_poll', {
          method: 'POST',
          body: JSON.stringify({
            p_message_id: message.id,
            p_account_id: actor.accountId,
            p_option_id: input.data.optionId,
          }),
        }));
        const totalVotes = Number(votes[0]?.total_votes) || 0;
        const poll = {
          ...message.payload.poll,
          totalVotes,
          selectedOptionId: input.data.optionId,
          results: votes.map((vote) => ({
            optionId: vote.option_id,
            votes: Number(vote.votes) || 0,
            percentage: totalVotes ? Math.round((Number(vote.votes) / totalVotes) * 100) : 0,
          })),
        };
        return sendJson(res, 200, { poll });
      }

      const shareMatch = pathname.match(/^\/api\/community\/messages\/([0-9a-f-]+)\/shares$/i);
      if (shareMatch && req.method === 'POST') {
        await rateLimit(actor.accountId, 'shares', 20, 60);
        const message = await resolveMessage(req, res, shareMatch[1]);
        if (!message) return true;
        if (message.reply_to_id) return sendJson(res, 400, { error: 'Only Community posts can be shared.' });
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `or=(and(blocker_account_id.eq.${encodeURIComponent(actor.accountId)},blocked_account_id.eq.${encodeURIComponent(message.account_id)}),and(blocker_account_id.eq.${encodeURIComponent(message.account_id)},blocked_account_id.eq.${encodeURIComponent(actor.accountId)}))&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 404, { error: 'Community post not found.' });
        const counts = parseRows(await database('rpc/fxsnap_community_record_share', {
          method: 'POST',
          body: JSON.stringify({ p_message_id: message.id, p_account_id: actor.accountId }),
        }));
        if (!counts.length) return sendJson(res, 404, { error: 'Community post not found.' });
        return sendJson(res, 200, { shareCount: Number(counts[0].share_count) || 0 });
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
          ...IMAGE_DIMENSIONS,
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
            payload: {
              ...(message.payload || {}),
              imageUrl,
              ...(input.data.imageWidth === undefined ? {} : { imageWidth: input.data.imageWidth }),
              ...(input.data.imageHeight === undefined ? {} : { imageHeight: input.data.imageHeight }),
            },
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
        const input = z.object({
          reaction: z.string().refine((value) => value === 'like' || MESSAGE_REACTIONS.includes(value)),
        }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose one of the available reactions.' });
        const requestedReaction = input.data.reaction === 'like' ? 'love' : input.data.reaction;
        await rateLimit(actor.accountId, 'reactions', 60, 60);
        const message = await resolveMessage(req, res, reactionMatch[1]);
        if (!message) return true;
        const blocked = parseRows(await getRows(
          'fxsnap_community_blocks',
          `blocker_account_id=eq.${encodeURIComponent(message.account_id)}&blocked_account_id=eq.${encodeURIComponent(actor.accountId)}&select=blocker_account_id&limit=1`,
        ));
        if (blocked.length) return sendJson(res, 403, { error: 'This member does not accept interactions from your account.' });
        const selection = parseRows(await database('rpc/fxsnap_community_set_reaction', {
          method: 'POST',
          body: JSON.stringify({
            p_message_id: message.id,
            p_account_id: actor.accountId,
            p_reaction: requestedReaction,
          }),
        }))[0];
        const reactions = groupReactions(await queryReactions([message.id]), actor.accountId);
        const selectedReaction = selection?.selected_reaction || null;
        if (selectedReaction) dispatchQueuedNotifications(message.id);
        return sendJson(res, 200, {
          reacted: selectedReaction !== null,
          selectedReaction,
          reactions,
        });
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
        const messageIds = [...new Set(rows
          .filter((row) => row.kind !== 'support_reply' && /^[0-9a-f-]{36}$/i.test(String(row.object_id || '')))
          .map((row) => row.object_id))];
        const messageRows = messageIds.length
          ? parseRows(await getRows(
            'fxsnap_community_messages',
            `id=in.(${encodeURIComponent(messageIds.map((id) => `"${id}"`).join(','))})&select=id,reply_to_id`,
          ))
          : [];
        const messageById = new Map(messageRows.map((row) => [row.id, row]));
        for (let depth = 0; depth < 4; depth += 1) {
          const parentIds = [...new Set([...messageById.values()]
            .map((row) => row.reply_to_id)
            .filter((id) => id && !messageById.has(id)))];
          if (!parentIds.length) break;
          const parents = parseRows(await getRows(
            'fxsnap_community_messages',
            `id=in.(${encodeURIComponent(parentIds.map((id) => `"${id}"`).join(','))})&select=id,reply_to_id`,
          ));
          for (const parent of parents) messageById.set(parent.id, parent);
        }
        const rootIdFor = (id) => {
          let current = messageById.get(id);
          let depth = 0;
          while (current?.reply_to_id && messageById.has(current.reply_to_id) && depth < 3) {
            current = messageById.get(current.reply_to_id);
            depth += 1;
          }
          return current ? current.id : null;
        };
        return sendJson(res, 200, {
          notifications: rows.map((row) => ({
            ...row,
            post_id: row.kind === 'support_reply' || !row.object_id ? null : rootIdFor(row.object_id),
          })),
        });
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
      if (error instanceof CommunityError) {
        return sendJson(res, error.status, {
          error: error.message,
          ...(error.requestId ? { requestId: error.requestId } : {}),
        });
      }
      const requestId = crypto.randomUUID();
      console.error(isSystemAnnouncementPath ? '[Notifications] System announcement request failed.' : '[Community] Request failed.', {
        requestId,
        operation: communityDatabaseOperation(pathname, req.method || 'GET', null),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return sendJson(res, 500, {
        error: 'The Community request failed. Please try again.',
        requestId,
      });
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
