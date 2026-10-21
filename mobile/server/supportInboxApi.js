const { z } = require('zod');
const crypto = require('node:crypto');
const persistentStore = require('./persistentStore');

const MESSAGE_BODY = z.string().trim().max(2000);
const MESSAGE_ID = z.string().uuid();
const SUPPORT_TOPIC = z.enum(['account', 'billing', 'analysis', 'navigation', 'other']);
const SUPPORT_MEDIA_BUCKET = 'fxsnap-support-media';
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;
const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extension: 'png', matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
};

class SupportInboxError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { supabaseUrl, serviceKey, ready: Boolean(supabaseUrl && serviceKey && persistentStore.supabaseEnabled) };
}

function parseRows(value) {
  return Array.isArray(value) ? value : [];
}

function createSupportInboxApi({ getActor, sendJson, readJsonBody, getPremiumStatus, notifyAdmins, notifyMember }) {
  async function database(path, options = {}) {
    const config = getConfig();
    if (!config.ready) throw new SupportInboxError('Private support storage is not configured. Apply the support inbox migration and configure server-side Supabase storage.', 503);
    let response;
    try {
      response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: config.serviceKey,
          authorization: 'Bearer ' + config.serviceKey,
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new SupportInboxError('Private support storage is temporarily unavailable. Please try again.', 502);
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      const missingSchema = response.status === 404 || response.status === 406
        || ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(payload?.code);
      throw new SupportInboxError(
        missingSchema
          ? 'The private support inbox migration is not installed or is unavailable.'
          : 'Private support storage could not complete this request.',
        missingSchema ? 503 : 502,
      );
    }
    return payload;
  }

  async function storage(path, options = {}) {
    const config = getConfig();
    if (!config.ready) throw new SupportInboxError('Private support storage is not configured.', 503);
    let response;
    try {
      response = await fetch(`${config.supabaseUrl}/storage/v1/${path}`, {
        ...options,
        headers: {
          apikey: config.serviceKey,
          authorization: 'Bearer ' + config.serviceKey,
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new SupportInboxError('Private support media storage is temporarily unavailable. Please try again.', 502);
    }
    if (!response.ok) throw new SupportInboxError('Private support media could not be stored or loaded.', 502);
    return response;
  }

  function storageObjectPath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  async function uploadAttachment(conversationId, base64, contentType) {
    const imageType = IMAGE_TYPES[contentType];
    if (!imageType || typeof base64 !== 'string' || base64.length > MAX_ATTACHMENT_BASE64_LENGTH
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      throw new SupportInboxError('Choose a JPEG, PNG, or WebP image smaller than 3 MB.', 400);
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES || !imageType.matches(bytes)) {
      throw new SupportInboxError('This image is invalid or larger than 3 MB.', 400);
    }
    const path = `${conversationId}/${crypto.randomUUID()}.${imageType.extension}`;
    await storage(`object/${SUPPORT_MEDIA_BUCKET}/${storageObjectPath(path)}`, {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      body: bytes,
    });
    return path;
  }

  async function deleteAttachment(path) {
    try {
      await storage(`object/${SUPPORT_MEDIA_BUCKET}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
    } catch (error) {
      console.error('[Support Inbox] Orphaned attachment cleanup failed.', {
        error: error instanceof Error ? error.message : 'Unknown storage error.',
      });
    }
  }

  async function withAttachmentUrl(message) {
    if (!message.attachment_path) {
      const { attachment_path: _, ...result } = message;
      return result;
    }
    const response = await storage(
      `object/sign/${SUPPORT_MEDIA_BUCKET}/${storageObjectPath(message.attachment_path)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: 3600 }),
      },
    );
    const signed = await response.json();
    const signedUrl = typeof signed.signedURL === 'string'
      ? signed.signedURL.startsWith('http')
        ? signed.signedURL
        : `${getConfig().supabaseUrl}/storage/v1${signed.signedURL}`
      : null;
    if (!signedUrl) throw new SupportInboxError('Private support image could not be loaded.', 502);
    const { attachment_path: _, ...result } = message;
    const contentType = IMAGE_TYPES[message.attachment_content_type]
      ? message.attachment_content_type
      : 'image/jpeg';
    return { ...result, attachment: { url: signedUrl, contentType } };
  }

  const withAttachmentUrls = (messages) => Promise.all(messages.map(withAttachmentUrl));

  const getRows = (table, query) => database(`${table}?${query}`);
  const insertRows = (table, body) => database(table, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const patchRows = (table, query, body) => database(`${table}?${query}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });

  async function premiumStatus(actor) {
    if (typeof getPremiumStatus !== 'function' || !actor.deviceId) return 'unavailable';
    const active = await getPremiumStatus(actor.deviceId);
    return active === true ? 'active' : active === false ? 'free' : 'unavailable';
  }

  async function actorFor(req, res, admin = false) {
    const actor = await getActor(req, res);
    if (!actor) return null;
    if (typeof actor.supabaseUserId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor.supabaseUserId)) {
      sendJson(res, 403, { error: 'Sign in with your linked Google account to use private FXSnap Support.' });
      return null;
    }
    if (admin && !actor.isAdmin) {
      sendJson(res, 403, { error: 'Administrator permissions are required.' });
      return null;
    }
    return actor;
  }

  function notifySupportAdmins(conversationId) {
    if (typeof notifyAdmins !== 'function') return;
    void Promise.resolve(notifyAdmins(conversationId)).catch((error) => {
      console.error('[Support Inbox] Administrator notification delivery failed.', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown notification error.',
      });
    });
  }

  function notifySupportMember(accountId) {
    if (typeof notifyMember !== 'function') return;
    void Promise.resolve(notifyMember(accountId)).catch((error) => {
      console.error('[Support Inbox] Member notification delivery failed.', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown notification error.',
      });
    });
  }

  async function findConversation(accountId) {
    return parseRows(await getRows(
      'fxsnap_support_conversations',
      `account_id=eq.${encodeURIComponent(accountId)}&select=*&limit=1`,
    ))[0] || null;
  }

  async function ensureConversation(actor, metadata) {
    let conversation = await findConversation(actor.accountId);
    const premium = await premiumStatus(actor);
    const values = {
      account_id: actor.accountId,
      supabase_user_id: actor.supabaseUserId,
      display_name: String(actor.displayName || '').trim().slice(0, 120) || null,
      subscription_status: premium,
      app_version: metadata.appVersion || null,
      platform: metadata.platform || null,
      topic: metadata.topic || null,
      updated_at: new Date().toISOString(),
    };
    if (!conversation) {
      try {
        conversation = parseRows(await insertRows('fxsnap_support_conversations', values))[0] || null;
      } catch (error) {
        if (!(error instanceof SupportInboxError) || error.status !== 502) throw error;
      }
      if (!conversation) conversation = await findConversation(actor.accountId);
    } else {
      await patchRows(
        'fxsnap_support_conversations',
        `id=eq.${encodeURIComponent(conversation.id)}`,
        values,
      );
      conversation = { ...conversation, ...values };
    }
    if (!conversation) throw new SupportInboxError('Could not open your private support conversation. Please try again.', 502);
    return conversation;
  }

  async function handle(req, res, url) {
    const pathname = url.pathname;
    const memberPath = pathname === '/api/support/conversation'
      || pathname === '/api/support/conversation/messages';
    const adminCollection = pathname === '/api/admin/support/conversations';
    const adminAccess = pathname === '/api/admin/support/access';
    const adminMatch = pathname.match(/^\/api\/admin\/support\/conversations\/([0-9a-f-]+)$/i);
    if (!memberPath && !adminCollection && !adminAccess && !adminMatch) return false;

    try {
      const adminRoute = adminCollection || adminAccess || Boolean(adminMatch);
      const actor = await actorFor(req, res, adminRoute);
      if (!actor) return true;

      if (adminAccess && req.method === 'GET') return sendJson(res, 200, { allowed: true });

      if (pathname === '/api/support/conversation' && req.method === 'GET') {
        const conversation = await findConversation(actor.accountId);
        if (!conversation) return sendJson(res, 200, { conversation: null, messages: [] });
        const now = new Date().toISOString();
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversation.id)}`, {
          member_last_read_at: now,
          supabase_user_id: actor.supabaseUserId,
        });
        const messages = parseRows(await getRows(
          'fxsnap_support_messages',
          `conversation_id=eq.${encodeURIComponent(conversation.id)}&select=id,sender_kind,body,created_at,attachment_path,attachment_content_type&order=created_at.asc&limit=500`,
        ));
        return sendJson(res, 200, {
          conversation: {
            id: conversation.id,
            status: conversation.status,
            topic: conversation.topic || null,
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
          },
          messages: await withAttachmentUrls(messages),
        });
      }

      if (pathname === '/api/support/conversation/messages' && req.method === 'POST') {
        const input = z.object({
          body: MESSAGE_BODY.optional(),
          clientMessageId: MESSAGE_ID,
          topic: SUPPORT_TOPIC.optional(),
          appVersion: z.string().trim().min(1).max(32),
          platform: z.enum(['ios', 'android', 'web', 'unknown']),
          attachmentBase64: z.string().max(MAX_ATTACHMENT_BASE64_LENGTH).optional(),
          attachmentContentType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
        }).safeParse(await readJsonBody(req));
        if (!input.success || (!input.data.body?.trim() && !input.data.attachmentBase64)
          || Boolean(input.data.attachmentBase64) !== Boolean(input.data.attachmentContentType)) {
          return sendJson(res, 400, { error: 'Enter a message or attach a JPEG, PNG, or WebP image, and provide valid app context.' });
        }
        const count = await persistentStore.increment(`fxsnap:support:rate:${actor.accountId}`, 3600);
        if (count > 20) return sendJson(res, 429, { error: 'You have sent several messages recently. Please wait before sending another.' });
        const existing = parseRows(await getRows(
          'fxsnap_support_messages',
          `sender_account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${encodeURIComponent(input.data.clientMessageId)}&select=id,conversation_id,sender_kind,body,created_at,attachment_path,attachment_content_type&limit=1`,
        ));
        if (existing.length) return sendJson(res, 200, { message: await withAttachmentUrl(existing[0]), duplicate: true });
        const conversation = await ensureConversation(actor, input.data);
        let attachmentPath = null;
        let messagePersisted = false;
        try {
          if (input.data.attachmentBase64 && input.data.attachmentContentType) {
            attachmentPath = await uploadAttachment(
              conversation.id,
              input.data.attachmentBase64,
              input.data.attachmentContentType,
            );
          }
          const inserted = parseRows(await insertRows('fxsnap_support_messages', {
            conversation_id: conversation.id,
            sender_account_id: actor.accountId,
            sender_kind: 'member',
            body: input.data.body || '',
            client_message_id: input.data.clientMessageId,
            attachment_path: attachmentPath,
            attachment_content_type: attachmentPath ? input.data.attachmentContentType : null,
          }));
          if (!inserted.length) throw new SupportInboxError('Your message could not be confirmed. Retry safely.', 502);
          messagePersisted = true;
          await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversation.id)}`, {
            status: conversation.status === 'resolved' ? 'open' : conversation.status,
            updated_at: inserted[0].created_at || new Date().toISOString(),
          });
          notifySupportAdmins(conversation.id);
          return sendJson(res, 201, { message: await withAttachmentUrl(inserted[0]), duplicate: false });
        } catch (error) {
          if (attachmentPath && !messagePersisted) await deleteAttachment(attachmentPath);
          throw error;
        }
      }

      if (adminCollection && req.method === 'GET') {
        const query = String(url.searchParams.get('q') || '').trim().slice(0, 80).toLowerCase();
        const conversations = parseRows(await getRows(
          'fxsnap_support_conversations',
          'select=id,account_id,display_name,subscription_status,app_version,platform,topic,status,created_at,updated_at,admin_last_read_at&order=updated_at.desc&limit=200',
        ));
        const ids = conversations.map((item) => item.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        const messages = ids.length ? parseRows(await getRows(
          'fxsnap_support_messages',
          `conversation_id=in.(${ids.map((id) => `"${id}"`).join(',')})&select=id,conversation_id,sender_kind,body,created_at,attachment_path&order=created_at.desc&limit=5000`,
        )) : [];
        const grouped = new Map();
        for (const message of messages) {
          const items = grouped.get(message.conversation_id) || [];
          items.push(message);
          grouped.set(message.conversation_id, items);
        }
        const results = conversations.map((conversation) => {
          const conversationMessages = grouped.get(conversation.id) || [];
          const newest = conversationMessages[0] || null;
          const unreadCount = conversationMessages.filter((message) => (
            message.sender_kind === 'member'
            && Date.parse(message.created_at) > Date.parse(conversation.admin_last_read_at || conversation.created_at)
          )).length;
          return {
            ...conversation,
            latest_message: newest?.attachment_path && !newest?.body ? 'Photo attachment' : newest?.body || '',
            latest_message_at: newest?.created_at || conversation.updated_at,
            unread_count: unreadCount,
            matches_message_search: Boolean(query) && conversationMessages.some((message) => message.body.toLowerCase().includes(query)),
          };
        }).filter((conversation) => !query || [
          conversation.account_id,
          conversation.display_name || '',
          conversation.topic || '',
          conversation.latest_message,
        ].some((value) => value.toLowerCase().includes(query)) || conversation.matches_message_search);
        for (const conversation of results) delete conversation.matches_message_search;
        return sendJson(res, 200, { conversations: results });
      }

      if (adminMatch && req.method === 'GET') {
        const conversation = parseRows(await getRows(
          'fxsnap_support_conversations',
          `id=eq.${encodeURIComponent(adminMatch[1])}&select=id,account_id,display_name,subscription_status,app_version,platform,topic,status,created_at,updated_at&limit=1`,
        ))[0];
        if (!conversation) return sendJson(res, 404, { error: 'Support conversation not found.' });
        const now = new Date().toISOString();
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversation.id)}`, { admin_last_read_at: now });
        const messages = parseRows(await getRows(
          'fxsnap_support_messages',
          `conversation_id=eq.${encodeURIComponent(conversation.id)}&select=id,sender_account_id,sender_kind,body,created_at,attachment_path,attachment_content_type&order=created_at.asc&limit=500`,
        ));
        return sendJson(res, 200, { conversation, messages: await withAttachmentUrls(messages) });
      }

      if (adminMatch && req.method === 'PATCH') {
        const input = z.object({ status: z.enum(['open', 'pending', 'resolved']) }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Choose open, pending, or resolved.' });
        const existing = parseRows(await getRows(
          'fxsnap_support_conversations',
          `id=eq.${encodeURIComponent(adminMatch[1])}&select=id&limit=1`,
        ))[0];
        if (!existing) return sendJson(res, 404, { error: 'Support conversation not found.' });
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(adminMatch[1])}`, {
          status: input.data.status,
          updated_at: new Date().toISOString(),
        });
        return sendJson(res, 200, { updated: true });
      }

      if (adminMatch && req.method === 'POST') {
        const input = z.object({ body: MESSAGE_BODY, clientMessageId: MESSAGE_ID }).safeParse(await readJsonBody(req));
        if (!input.success) return sendJson(res, 400, { error: 'Replies must contain 1–2,000 characters.' });
        const conversation = parseRows(await getRows(
          'fxsnap_support_conversations',
          `id=eq.${encodeURIComponent(adminMatch[1])}&select=id,account_id,status&limit=1`,
        ))[0];
        if (!conversation) return sendJson(res, 404, { error: 'Support conversation not found.' });
        const existing = parseRows(await getRows(
          'fxsnap_support_messages',
          `sender_account_id=eq.${encodeURIComponent(actor.accountId)}&client_message_id=eq.${encodeURIComponent(input.data.clientMessageId)}&select=id,conversation_id,sender_kind,body,created_at&limit=1`,
        ));
        if (existing.length) return sendJson(res, 200, { message: existing[0], duplicate: true });
        const inserted = parseRows(await insertRows('fxsnap_support_messages', {
          conversation_id: conversation.id,
          sender_account_id: actor.accountId,
          sender_kind: 'admin',
          body: input.data.body,
          client_message_id: input.data.clientMessageId,
        }));
        if (!inserted.length) throw new SupportInboxError('Your reply could not be confirmed. Retry safely.', 502);
        await patchRows('fxsnap_support_conversations', `id=eq.${encodeURIComponent(conversation.id)}`, {
          status: conversation.status === 'resolved' ? 'open' : conversation.status,
          updated_at: inserted[0].created_at || new Date().toISOString(),
        });
        notifySupportMember(conversation.account_id);
        return sendJson(res, 201, { message: inserted[0], duplicate: false });
      }

      if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
        return sendJson(res, 405, { error: 'Unsupported private support operation.' });
      }
      return sendJson(res, 404, { error: 'Support endpoint not found.' });
    } catch (error) {
      if (error instanceof SupportInboxError) return sendJson(res, error.status, { error: error.message });
      console.error('[Support Inbox] Request failed.', error instanceof Error ? error.message : 'Unknown error');
      return sendJson(res, 500, { error: 'Private support could not complete this request.' });
    }
  }

  return handle;
}

module.exports = { createSupportInboxApi };
