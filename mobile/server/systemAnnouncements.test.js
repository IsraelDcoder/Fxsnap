const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://announcements-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'announcements-test-service-role-key';
process.env.FXSNAP_COMMUNITY_ENABLED = 'false';
process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = '00000000-0000-4000-8000-000000000091';

const { createCommunityApi } = require('./communityApi');
const ADMIN_ID = '00000000-0000-4000-8000-000000000091';
const USER_ID = '00000000-0000-4000-8000-000000000092';
const ANNOUNCEMENT_ID = '00000000-0000-4000-8000-000000000093';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000094';

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function makeHarness({ userId = USER_ID, dispatch = async () => {} } = {}) {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname.replace('/rest/v1/', '');
    const request = {
      path,
      method: options.method || 'GET',
      query: parsed.search,
      body: options.body ? JSON.parse(options.body) : null,
    };
    requests.push(request);
    if (path === 'rpc/fxsnap_system_announcement_inbox') {
      return makeResponse(200, [{
        id: ANNOUNCEMENT_ID,
        title: 'Service update',
        status: 'published',
      }]);
    }
    if (path === 'rpc/fxsnap_system_announcement_save') {
      return makeResponse(200, {
        id: ANNOUNCEMENT_ID,
        status: 'draft',
        title: request.body.p_input.title,
      });
    }
    if (path === 'rpc/fxsnap_system_announcement_transition') {
      return makeResponse(200, {
        id: ANNOUNCEMENT_ID,
        status: request.body.p_action === 'publish' ? 'published' : 'draft',
      });
    }
    if (path === 'rpc/fxsnap_system_announcement_audience_count') return makeResponse(200, 17);
    if (path === 'rpc/fxsnap_system_announcement_admin_list') return makeResponse(200, []);
    if (path === 'fxsnap_system_announcement_recipients' && request.method === 'GET') {
      return makeResponse(200, [{ announcement_id: ANNOUNCEMENT_ID }]);
    }
    if (path === 'fxsnap_system_announcement_recipients' && request.method === 'PATCH') {
      return makeResponse(200, []);
    }
    return makeResponse(200, []);
  };

  const api = createCommunityApi({
    getActor: async (_request, response) => {
      if (!userId) {
        response.statusCode = 401;
        response.body = { error: 'Sign in required.' };
        return null;
      }
      return { accountId: 'usr_system-announcements-test', supabaseUserId: userId };
    },
    sendJson: (response, status, body) => {
      response.statusCode = status;
      response.body = body;
      return true;
    },
    readJsonBody: async (request) => request.body || {},
    saveCommunityUsername: async () => {},
    dispatchCommunityPush: dispatch,
  });

  return {
    requests,
    async call(path, { method = 'GET', body, headers = {} } = {}) {
      const response = {};
      await api({ method, body, headers }, response, new URL(path, 'https://fxsnap.test'));
      return response;
    },
  };
}

const validInput = {
  type: 'maintenance',
  title: 'Planned service window',
  message: 'Some features will be briefly unavailable.',
  destination: 'events',
  audience: 'recently_active',
  audienceDays: 30,
  channels: { in_app_banner: true, notification_center: true, push: false },
};

test('system announcements authenticate without Community membership or Community enablement', async () => {
  const harness = makeHarness();
  const response = await harness.call('/api/system-announcements');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.announcements[0].id, ANNOUNCEMENT_ID);
  assert.equal(harness.requests[0].path, 'rpc/fxsnap_system_announcement_inbox');
});

test('regular users cannot access admin announcement endpoints', async () => {
  const harness = makeHarness();
  const response = await harness.call('/api/admin/system-announcements');

  assert.equal(response.statusCode, 403);
  assert.equal(harness.requests.length, 0);
});

test('admin capability and audience estimates use the server-side allowlist', async () => {
  const member = makeHarness();
  const deniedAccess = await member.call('/api/admin/system-announcements/access');
  assert.deepEqual(deniedAccess.body, { allowed: false });
  const deniedCount = await member.call('/api/admin/system-announcements/audience-count?audience=all');
  assert.equal(deniedCount.statusCode, 403);

  const admin = makeHarness({ userId: ADMIN_ID });
  const allowedAccess = await admin.call('/api/admin/system-announcements/access');
  const count = await admin.call('/api/admin/system-announcements/audience-count?audience=recently_active&days=30');
  assert.deepEqual(allowedAccess.body, { allowed: true });
  assert.deepEqual(count.body, { count: 17 });
});

test('draft creation requires valid content and a caller-stable idempotency key', async () => {
  const harness = makeHarness({ userId: ADMIN_ID });
  const invalid = await harness.call('/api/admin/system-announcements', {
    method: 'POST',
    headers: { 'idempotency-key': IDEMPOTENCY_KEY },
    body: { ...validInput, destination: '/arbitrary-url' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(harness.requests.length, 0);
  const invalidParams = await harness.call('/api/admin/system-announcements', {
    method: 'POST',
    headers: { 'idempotency-key': IDEMPOTENCY_KEY },
    body: {
      ...validInput,
      destination: 'analysis',
      destinationParams: { postId: ANNOUNCEMENT_ID },
    },
  });
  assert.equal(invalidParams.statusCode, 400);
  assert.equal(harness.requests.length, 0);

  const saved = await harness.call('/api/admin/system-announcements', {
    method: 'POST',
    headers: { 'idempotency-key': IDEMPOTENCY_KEY },
    body: validInput,
  });
  assert.equal(saved.statusCode, 201);
  assert.equal(saved.body.announcement.status, 'draft');
  assert.equal(harness.requests[0].body.p_idempotency_key, IDEMPOTENCY_KEY);
});

test('publishing a draft triggers queued push delivery without waiting for the worker', async () => {
  const dispatched = [];
  const harness = makeHarness({
    userId: ADMIN_ID,
    dispatch: async (objectId) => dispatched.push(objectId),
  });
  const response = await harness.call(`/api/admin/system-announcements/${ANNOUNCEMENT_ID}`, {
    method: 'PATCH',
    body: { action: 'publish' },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.announcement.status, 'published');
  assert.deepEqual(dispatched, [null]);
});

test('recipient banner dismissal only updates the authenticated user record', async () => {
  const harness = makeHarness();
  const response = await harness.call(`/api/system-announcements/${ANNOUNCEMENT_ID}/dismiss`, { method: 'POST' });

  assert.equal(response.statusCode, 200);
  const patch = harness.requests.find((request) => request.method === 'PATCH');
  assert.match(patch.query, new RegExp(USER_ID));
  assert.equal(typeof patch.body.banner_dismissed_at, 'string');
});
