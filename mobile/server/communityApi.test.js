const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://community-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'community-test-service-role-key';
process.env.FXSNAP_COMMUNITY_ENABLED = 'true';
process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS = '00000000-0000-4000-8000-000000000010';
process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = '';

const { createCommunityApi } = require('./communityApi');

const MEMBER_ID = '00000000-0000-4000-8000-000000000010';
const ACCOUNT_ID = 'usr_community-test-member';
const RULES_VERSION = 'community-rules-v1';

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function makeHarness({
  actor = { accountId: ACCOUNT_ID, supabaseUserId: MEMBER_ID },
  initialProfiles = [],
  initialConversations = [],
  initialSupportMessages = [],
} = {}) {
  const profiles = [...initialProfiles];
  const conversations = [...initialConversations];
  const supportMessages = [...initialSupportMessages];
  const savedNames = [];
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const method = options.method || 'GET';
    requests.push({ table, method, query: parsed.searchParams, body: options.body ? JSON.parse(options.body) : null });

    if (table === 'fxsnap_community_profiles' && method === 'GET') {
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const username = parsed.searchParams.get('username')?.replace(/^eq\./, '');
      const usernamePattern = parsed.searchParams.get('username')?.replace(/^ilike\./, '');
      return makeResponse(200, profiles.filter((profile) => (
        (!accountId || profile.account_id === accountId)
        && (!username || profile.username === username)
        && (!usernamePattern || profile.username.toLowerCase() === usernamePattern.toLowerCase())
      )));
    }
    if (table === 'fxsnap_community_profiles' && method === 'POST') {
      const candidate = JSON.parse(options.body);
      if (profiles.some((profile) => profile.username === candidate.username || profile.account_id === candidate.account_id)) {
        return makeResponse(409, { code: '23505' });
      }
      const profile = {
        ...candidate,
        status: 'active',
        muted_until: null,
        joined_at: new Date().toISOString(),
      };
      profiles.push(profile);
      return makeResponse(201, [profile]);
    }
    if (table === 'fxsnap_community_profiles' && method === 'PATCH') {
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      const candidate = JSON.parse(options.body);
      if (profiles.some((profile) => profile.account_id !== accountId
        && profile.username.toLowerCase() === candidate.username.toLowerCase())) {
        return makeResponse(409, { code: '23505' });
      }
      const profile = profiles.find((item) => item.account_id === accountId);
      if (!profile) return makeResponse(200, []);
      Object.assign(profile, candidate);
      return makeResponse(200, [profile]);
    }
    if (table === 'fxsnap_support_conversations' && method === 'GET') {
      const accountId = parsed.searchParams.get('account_id')?.replace(/^eq\./, '');
      return makeResponse(200, conversations.filter((conversation) => !accountId || conversation.account_id === accountId));
    }
    if (table === 'fxsnap_support_conversations' && method === 'POST') {
      const conversation = { id: '00000000-0000-4000-8000-000000000031', account_id: JSON.parse(options.body).account_id, status: 'open' };
      conversations.push(conversation);
      return makeResponse(201, [conversation]);
    }
    if (table === 'fxsnap_support_messages' && method === 'GET') {
      const conversationId = parsed.searchParams.get('conversation_id')?.replace(/^eq\./, '');
      return makeResponse(200, supportMessages.filter((message) => message.conversation_id === conversationId));
    }
    if (table === 'fxsnap_support_messages' && method === 'POST') {
      const message = { ...JSON.parse(options.body), id: `00000000-0000-4000-8000-${String(supportMessages.length + 40).padStart(12, '0')}`, created_at: new Date().toISOString() };
      supportMessages.push(message);
      return makeResponse(201, [message]);
    }
    return makeResponse(200, []);
  };

  const api = createCommunityApi({
    getActor: async () => actor,
    sendJson: (response, status, body) => {
      response.statusCode = status;
      response.body = body;
      return true;
    },
    readJsonBody: async (request) => request.body || {},
    saveCommunityUsername: async (_accountId, username) => { savedNames.push(username); },
  });

  return {
    api,
    profiles,
    conversations,
    supportMessages,
    requests,
    savedNames,
    async call(path, { method = 'GET', body } = {}) {
      const response = {};
      await api({ method, body }, response, new URL(path, 'https://fxsnap.test'));
      return response;
    },
  };
}

test('Community rollout gate rejects requests before identity lookup', async () => {
  const previous = process.env.FXSNAP_COMMUNITY_ENABLED;
  process.env.FXSNAP_COMMUNITY_ENABLED = 'false';
  const harness = makeHarness();
  try {
    const response = await harness.call('/api/community/me');
    assert.equal(response.statusCode, 503);
    assert.equal(harness.requests.length, 0);
  } finally {
    process.env.FXSNAP_COMMUNITY_ENABLED = previous;
  }
});

test('reserved official username cannot be claimed by a member', async () => {
  const harness = makeHarness();
  const response = await harness.call('/api/community/username?value=fxsnap_official');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.available, false);
  assert.match(response.body.reason, /reserved/i);
  assert.equal(harness.requests.length, 0);
});

test('username join validates acceptance and stores the name on the account', async () => {
  const harness = makeHarness();
  const rejected = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: 'outdated' },
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(harness.profiles.length, 0);

  const joined = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(joined.statusCode, 201);
  assert.equal(joined.body.profile.username, 'chartpro');
  assert.deepEqual(harness.savedNames, ['chartpro']);

  const repeated = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'differentname', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.profile.username, 'chartpro');
  assert.deepEqual(harness.savedNames, ['chartpro', 'chartpro']);
});

test('username uniqueness conflict is returned without replacing the existing profile', async () => {
  const harness = makeHarness();
  harness.profiles.push({
    account_id: 'usr_another-member',
    supabase_user_id: '00000000-0000-4000-8000-000000000011',
    username: 'chartpro',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  });
  const response = await harness.call('/api/community/join', {
    method: 'POST',
    body: { username: 'chartpro', acceptedRulesVersion: RULES_VERSION },
  });
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /already taken/i);
  assert.equal(harness.profiles.length, 1);
});

test('community username updates are validated, unique, and synchronized to the account', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }, {
      account_id: 'usr_another-member',
      supabase_user_id: '00000000-0000-4000-8000-000000000011',
      username: 'marketmentor',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });

  const invalid = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'not valid!' },
  });
  assert.equal(invalid.statusCode, 400);

  const duplicate = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'marketmentor' },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(harness.profiles[0].username, 'chartpro');

  const updated = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'new_trader' },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.profile.username, 'new_trader');
  assert.deepEqual(harness.savedNames, ['new_trader']);

  const unknownFields = await harness.call('/api/community/profile', {
    method: 'PATCH',
    body: { username: 'anothername', isAdmin: true },
  });
  assert.equal(unknownFields.statusCode, 400);
  assert.equal(harness.profiles[0].username, 'new_trader');
});

test('a non-admin beta member cannot access admin reports', async () => {
  const harness = makeHarness();
  harness.profiles.push({
    account_id: ACCOUNT_ID,
    supabase_user_id: MEMBER_ID,
    username: 'chartpro',
    accepted_rules_version: RULES_VERSION,
    status: 'active',
    muted_until: null,
    joined_at: new Date().toISOString(),
  });
  const response = await harness.call('/api/admin/community/reports');
  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /administrator/i);
  assert.equal(harness.requests.filter((request) => request.table === 'fxsnap_community_reports').length, 0);
  const supportInbox = await harness.call('/api/admin/community/support');
  assert.equal(supportInbox.statusCode, 403);
});

test('a member can load only their own private support history', async () => {
  const conversationId = '00000000-0000-4000-8000-000000000033';
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
    initialConversations: [{ id: conversationId, account_id: ACCOUNT_ID, status: 'open' }],
    initialSupportMessages: [{
      id: '00000000-0000-4000-8000-000000000034',
      conversation_id: conversationId,
      sender_account_id: ACCOUNT_ID,
      sender_kind: 'member',
      body: 'Private test message.',
      created_at: new Date().toISOString(),
    }],
  });
  const result = await harness.call('/api/community/support');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.conversation.id, conversationId);
  assert.equal(result.body.messages.length, 1);
  assert.equal(result.body.messages[0].body, 'Private test message.');
});

test('a signed-in beta member cannot access another member’s private support thread', async () => {
  const otherAccountId = 'usr_another-member';
  const otherUserId = '00000000-0000-4000-8000-000000000011';
  const previous = process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS;
  process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS = `${previous},${otherUserId}`;
  try {
    const harness = makeHarness({
      actor: { accountId: otherAccountId, supabaseUserId: otherUserId },
      initialProfiles: [{
        account_id: otherAccountId,
        supabase_user_id: otherUserId,
        username: 'anothermember',
        accepted_rules_version: RULES_VERSION,
        status: 'active',
        muted_until: null,
        joined_at: new Date().toISOString(),
      }],
      initialConversations: [{
        id: '00000000-0000-4000-8000-000000000032',
        account_id: ACCOUNT_ID,
        status: 'open',
      }],
    });
    const result = await harness.call('/api/community/support');
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.conversation, null);
    assert.deepEqual(result.body.messages, []);
    assert.equal(harness.requests.some((request) => request.table === 'fxsnap_support_messages'), false);
  } finally {
    process.env.FXSNAP_COMMUNITY_BETA_SUPABASE_USER_IDS = previous;
  }
});

test('admin may claim the reserved official username when no account owns it', async () => {
  const adminId = '00000000-0000-4000-8000-000000000012';
  const previous = process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS;
  process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = adminId;
  try {
    const harness = makeHarness({ actor: { accountId: 'usr_official-admin', supabaseUserId: adminId } });
    const available = await harness.call('/api/community/username?value=fxsnap_official');
    assert.equal(available.body.available, true);
    const joined = await harness.call('/api/community/join', {
      method: 'POST',
      body: { username: 'fxsnap_official', acceptedRulesVersion: RULES_VERSION },
    });
    assert.equal(joined.statusCode, 201);
    assert.equal(joined.body.profile.username, 'fxsnap_official');
    assert.equal(joined.body.profile.isAdmin, true);
  } finally {
    process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = previous;
  }
});

test('invalid structured signal is rejected before persistence', async () => {
  const harness = makeHarness({
    initialProfiles: [{
      account_id: ACCOUNT_ID,
      supabase_user_id: MEMBER_ID,
      username: 'chartpro',
      accepted_rules_version: RULES_VERSION,
      status: 'active',
      muted_until: null,
      joined_at: new Date().toISOString(),
    }],
  });
  const response = await harness.call('/api/community/messages', {
    method: 'POST',
    body: {
      clientMessageId: '00000000-0000-4000-8000-000000000041',
      kind: 'signal',
      payload: { instrument: 'EURUSD', direction: 'BUY' },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(harness.requests.some((request) => request.table === 'fxsnap_community_messages' && request.method === 'POST'), false);
});
