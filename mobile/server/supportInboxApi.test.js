const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SUPABASE_URL = 'https://support-inbox-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'support-inbox-test-service-role';

const persistentStore = require('./persistentStore');
const { createSupportInboxApi } = require('./supportInboxApi');

const MEMBER_ID = 'usr_support_member_1';
const ADMIN_ID = 'usr_support_admin_1';
const OTHER_ID = 'usr_support_member_2';

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createHarness() {
  const conversations = [];
  const messages = [];
  const notifications = { admins: [], members: [] };
  const originalFetch = global.fetch;
  const originalIncrement = persistentStore.increment;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const query = parsed.searchParams;
    const method = options.method || 'GET';
    if (table === 'fxsnap_support_conversations' && method === 'GET') {
      const accountFilter = query.get('account_id');
      const idFilter = query.get('id');
      const idsFilter = query.get('id');
      return makeResponse(200, conversations.filter((item) => (
        (!accountFilter || accountFilter === `eq.${item.account_id}`)
        && (!idFilter || idFilter === `eq.${item.id}`)
        && (!idsFilter || idsFilter === `eq.${item.id}`)
      )));
    }
    if (table === 'fxsnap_support_conversations' && method === 'POST') {
      const body = JSON.parse(options.body);
      if (conversations.some((item) => item.account_id === body.account_id)) return makeResponse(409, { code: '23505' });
      const row = { id: crypto.randomUUID(), status: 'open', created_at: new Date(Date.now() - 1000).toISOString(), ...body };
      conversations.push(row);
      return makeResponse(201, [row]);
    }
    if (table === 'fxsnap_support_conversations' && method === 'PATCH') {
      const id = (query.get('id') || '').replace('eq.', '');
      const row = conversations.find((item) => item.id === id);
      if (row) Object.assign(row, JSON.parse(options.body));
      return makeResponse(204, null);
    }
    if (table === 'fxsnap_support_messages' && method === 'GET') {
      const conversationFilter = query.get('conversation_id');
      const accountFilter = query.get('sender_account_id');
      const idFilter = query.get('client_message_id');
      const rows = messages.filter((item) => {
        const matchesConversation = !conversationFilter
          || conversationFilter === `eq.${item.conversation_id}`
          || conversationFilter === `in.(${messages.map((message) => `"${message.conversation_id}"`).join(',')})`;
        return matchesConversation
          && (!accountFilter || accountFilter === `eq.${item.sender_account_id}`)
          && (!idFilter || idFilter === `eq.${item.client_message_id}`);
      });
      if (query.get('order') === 'created_at.desc') rows.reverse();
      return makeResponse(200, rows);
    }
    if (table === 'fxsnap_support_messages' && method === 'POST') {
      const body = JSON.parse(options.body);
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body };
      messages.push(row);
      return makeResponse(201, [row]);
    }
    return makeResponse(404, { code: 'PGRST205' });
  };
  persistentStore.increment = async () => 1;
  const handle = createSupportInboxApi({
    getActor: async (req, res) => {
      if (!req.actor) {
        res.statusCode = 401;
        res.body = { error: 'A signed-in account is required.' };
        return null;
      }
      return req.actor;
    },
    sendJson: (res, status, body) => {
      res.statusCode = status;
      res.body = body;
      return true;
    },
    readJsonBody: async (req) => req.body || {},
    getPremiumStatus: async () => true,
    notifyAdmins: async (conversationId) => { notifications.admins.push(conversationId); },
    notifyMember: async (accountId) => { notifications.members.push(accountId); },
  });
  const call = async (path, { method = 'GET', actor, body } = {}) => {
    const res = {};
    await handle({ method, actor, body }, res, new URL(path, 'http://localhost'));
    return res;
  };
  return {
    call,
    conversations,
    messages,
    notifications,
    restore() {
      global.fetch = originalFetch;
      persistentStore.increment = originalIncrement;
    },
  };
}

test('private support persists member messages and gates admin workflow', async () => {
  const harness = createHarness();
  const originalAdminIds = process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS;
  try {
    const member = {
      accountId: MEMBER_ID,
      deviceId: 'support-member-device',
      displayName: 'Member One',
      supabaseUserId: '00000000-0000-4000-8000-000000000011',
      isAdmin: false,
    };
    const admin = {
      accountId: ADMIN_ID,
      deviceId: 'support-admin-device',
      supabaseUserId: '00000000-0000-4000-8000-000000000012',
      isAdmin: true,
    };
    const created = await harness.call('/api/support/conversation/messages', {
      method: 'POST',
      actor: member,
      body: {
        body: 'I need help with my subscription.',
        topic: 'billing',
        clientMessageId: '00000000-0000-4000-8000-000000000101',
        appVersion: '2.4.0',
        platform: 'android',
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(harness.conversations[0].account_id, MEMBER_ID);
    assert.equal(harness.conversations[0].subscription_status, 'active');
    assert.equal(harness.conversations[0].app_version, '2.4.0');
    assert.equal(harness.conversations[0].platform, 'android');
    assert.equal(harness.conversations[0].topic, 'billing');
    assert.deepEqual(harness.notifications.admins, [harness.conversations[0].id]);

    const deniedInbox = await harness.call('/api/admin/support/conversations', { actor: member });
    assert.equal(deniedInbox.statusCode, 403);
    const memberView = await harness.call('/api/support/conversation', { actor: member });
    assert.equal(memberView.body.messages.length, 1);
    assert.equal(memberView.body.messages[0].body, 'I need help with my subscription.');

    const otherMemberView = await harness.call('/api/support/conversation', {
      actor: { ...member, accountId: OTHER_ID },
    });
    assert.deepEqual(otherMemberView.body, { conversation: null, messages: [] });

    const inbox = await harness.call('/api/admin/support/conversations?q=subscription', { actor: admin });
    assert.equal(inbox.statusCode, 200);
    assert.equal(inbox.body.conversations.length, 1);
    assert.equal(inbox.body.conversations[0].unread_count, 1);

    const opened = await harness.call(`/api/admin/support/conversations/${harness.conversations[0].id}`, { actor: admin });
    assert.equal(opened.statusCode, 200);
    assert.equal(opened.body.messages.length, 1);
    assert.ok(harness.conversations[0].admin_last_read_at);

    const pending = await harness.call(`/api/admin/support/conversations/${harness.conversations[0].id}`, {
      method: 'PATCH',
      actor: admin,
      body: { status: 'pending' },
    });
    assert.deepEqual(pending.body, { updated: true });

    const reply = await harness.call(`/api/admin/support/conversations/${harness.conversations[0].id}`, {
      method: 'POST',
      actor: admin,
      body: {
        body: 'Our team can help review your subscription status.',
        clientMessageId: '00000000-0000-4000-8000-000000000102',
      },
    });
    assert.equal(reply.statusCode, 201);
    assert.equal(reply.body.message.sender_kind, 'admin');
    assert.equal(harness.messages.length, 2);
    assert.deepEqual(harness.notifications.members, [MEMBER_ID]);
  } finally {
    harness.restore();
    if (originalAdminIds === undefined) delete process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS;
    else process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = originalAdminIds;
  }
});

test('support rejects malformed messages and admin access is not inferred from request data', async () => {
  const harness = createHarness();
  try {
    const member = {
      accountId: MEMBER_ID,
      supabaseUserId: '00000000-0000-4000-8000-000000000013',
      isAdmin: false,
    };
    const invalid = await harness.call('/api/support/conversation/messages', {
      method: 'POST',
      actor: member,
      body: { body: '   ', clientMessageId: 'not-a-uuid', appVersion: '2', platform: 'android' },
    });
    assert.equal(invalid.statusCode, 400);

    const forged = await harness.call('/api/admin/support/access', {
      actor: { accountId: MEMBER_ID, isAdmin: false, admin: true },
    });
    assert.equal(forged.statusCode, 403);

    const unauthorized = await harness.call('/api/support/conversation', { actor: null });
    assert.equal(unauthorized.statusCode, 401);
  } finally {
    harness.restore();
  }
});
