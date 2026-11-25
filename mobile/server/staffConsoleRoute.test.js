const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://staff-console-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.FXSNAP_COMMUNITY_ENABLED = 'true';
process.env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS = '00000000-0000-4000-8000-000000000091';

const requestHandler = require('./serve');

async function request(path, method = 'GET', headers = {}) {
  const response = { headers: {} };
  const req = {
    method,
    url: path,
    headers: { host: 'localhost:3000', ...headers },
  };
  const res = {
    writeHead(status, headers = {}) {
      response.status = status;
      response.headers = headers;
    },
    end(body = '') {
      response.body = String(body);
    },
  };
  await requestHandler(req, res);
  return response;
}

test('external staff console is served with restrictive browser security headers', async () => {
  const response = await request('/admin-console');

  assert.equal(response.status, 200);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.body, /FXSnap Staff Console/);
  assert.match(response.body, /src="\/admin-console\.js"/);
});

test('staff console script is served from the same origin', async () => {
  const response = await request('/admin-console.js');

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/javascript/);
  assert.match(response.body, /code_challenge_method: 's256'/);
});

test('public auth configuration exposes only Supabase URL and publishable key', async () => {
  const response = await request('/api/admin/auth-config');
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    supabaseUrl: 'https://staff-console-test.supabase.co',
    publicKey: 'test-publishable-key',
  });
});

test('staff bearer tokens reach protected Community admin APIs without device authentication', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/v1/user') {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          id: '00000000-0000-4000-8000-000000000091',
          email: 'staff@example.com',
        }),
      };
    }
    if (parsed.pathname === '/rest/v1/fxsnap_community_reports') {
      return { status: 200, ok: true, text: async () => '[]' };
    }
    throw new Error(`Unexpected mocked request: ${parsed.pathname}`);
  };
  try {
    const response = await request('/api/admin/community/reports', 'GET', {
      authorization: 'Bearer staff-access-token',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { reports: [] });
  } finally {
    global.fetch = previousFetch;
  }
});

test('staff authentication protects support, event, and announcement admin routes', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/v1/user') {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          id: '00000000-0000-4000-8000-000000000091',
          email: 'staff@example.com',
        }),
      };
    }
    throw new Error(`Unexpected mocked request: ${parsed.pathname}`);
  };
  try {
    for (const path of [
      '/api/admin/support/access',
      '/api/admin/event-spaces/access',
      '/api/admin/system-announcements/access',
    ]) {
      const response = await request(path, 'GET', {
        authorization: 'Bearer staff-access-token',
      });

      assert.equal(response.status, 200, `${path}: ${response.body}`);
      assert.equal(JSON.parse(response.body).allowed, true, path);
    }
  } finally {
    global.fetch = previousFetch;
  }
});
