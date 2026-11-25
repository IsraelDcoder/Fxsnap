const test = require('node:test');
const assert = require('node:assert/strict');
const { getStaffAdminActor } = require('./staffAuth');

const ADMIN_ID = '00000000-0000-4000-8000-000000000091';
const NON_ADMIN_ID = '00000000-0000-4000-8000-000000000092';
const ENV = {
  SUPABASE_URL: 'https://staff-auth-test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS: ADMIN_ID,
};

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function makeHarness(fetchImpl, env = ENV) {
  const result = {};
  const req = { headers: { authorization: 'Bearer staff-access-token' } };
  const actorPromise = getStaffAdminActor(req, result, {
    env,
    fetchImpl,
    sendJson: (res, status, body) => {
      res.statusCode = status;
      res.body = body;
    },
  });
  return { result, actorPromise };
}

test('staff identity is resolved from Supabase and accepted only for an allowlisted UUID', async () => {
  let requestedUrl;
  let requestedHeaders;
  const harness = makeHarness(async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return response(200, {
      id: ADMIN_ID,
      email: 'staff@example.com',
      user_metadata: { full_name: 'FXSnap Staff' },
    });
  });

  const actor = await harness.actorPromise;

  assert.equal(requestedUrl, 'https://staff-auth-test.supabase.co/auth/v1/user');
  assert.equal(requestedHeaders.apikey, 'test-publishable-key');
  assert.equal(requestedHeaders.authorization, 'Bearer staff-access-token');
  assert.equal(actor.accountId, `staff_${ADMIN_ID}`);
  assert.equal(actor.supabaseUserId, ADMIN_ID);
  assert.equal(actor.isAdmin, true);
  assert.equal(actor.displayName, 'FXSnap Staff');
  assert.equal(actor.deviceId, null);
});

test('a valid Supabase account outside the staff allowlist is denied', async () => {
  const harness = makeHarness(async () => response(200, { id: NON_ADMIN_ID }));

  const actor = await harness.actorPromise;

  assert.equal(actor, null);
  assert.equal(harness.result.statusCode, 403);
});

test('invalid and expired Supabase sessions are denied', async () => {
  const harness = makeHarness(async () => response(401, { message: 'Invalid JWT' }));

  const actor = await harness.actorPromise;

  assert.equal(actor, null);
  assert.equal(harness.result.statusCode, 401);
});

test('missing staff allowlist fails closed without contacting Supabase', async () => {
  let called = false;
  const harness = makeHarness(async () => {
    called = true;
    return response(200, { id: ADMIN_ID });
  }, { ...ENV, FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS: '' });

  const actor = await harness.actorPromise;

  assert.equal(actor, null);
  assert.equal(called, false);
  assert.equal(harness.result.statusCode, 503);
});

test('Supabase verification failures do not authenticate the staff request', async () => {
  const harness = makeHarness(async () => {
    throw new Error('network unavailable');
  });

  const actor = await harness.actorPromise;

  assert.equal(actor, null);
  assert.equal(harness.result.statusCode, 502);
});
