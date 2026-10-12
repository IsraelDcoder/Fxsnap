const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const persistentStore = require('./persistentStore');
const { createRequestHandler } = require('./serve');
const {
  createAccountAuth,
  createAuth,
  decodeAccountAuth,
  decodeAuth,
  verifyAuth,
} = require('./auth');

const secret = 'test-auth-secret';
const serverSecret = process.env.FXSNAP_AUTH_SECRET || 'development-only-change-me';

test('account sessions are scoped separately from anonymous API sessions', () => {
  const anonymousToken = createAuth(secret, 'device-identifier-1234');
  const accountToken = createAccountAuth(
    secret,
    'usr_0123456789abcdef0123456789abcdef',
    'device-identifier-1234',
    'session-identifier',
  );

  assert.equal(decodeAuth(secret, anonymousToken).sub, 'device-identifier-1234');
  assert.equal(decodeAccountAuth(secret, anonymousToken), null);
  assert.equal(verifyAuth(secret, accountToken), null);
  assert.deepEqual(decodeAccountAuth(secret, accountToken), {
    sub: 'usr_0123456789abcdef0123456789abcdef',
    deviceSub: 'device-identifier-1234',
    sid: 'session-identifier',
    scope: 'account',
    exp: decodeAccountAuth(secret, accountToken).exp,
  });
});

test('account session tokens reject tampering, wrong secrets, and expired sessions', () => {
  const token = createAccountAuth(secret, 'user-id', 'device-id', 'session-id');
  const expiredToken = createAccountAuth(secret, 'user-id', 'device-id', 'session-id', -1);

  assert.equal(decodeAccountAuth('different-secret', token), null);
  assert.equal(decodeAccountAuth(secret, `${token}tampered`), null);
  assert.equal(decodeAccountAuth(secret, expiredToken), null);
});

test('Google account routes validate credentials, bind and revoke sessions, and delete account data', async () => {
  const previous = {
    fetch: global.fetch,
    enabled: persistentStore.enabled,
    getJson: persistentStore.getJson,
    setJson: persistentStore.setJson,
    deleteKey: persistentStore.deleteKey,
    googleClientIds: process.env.FXSNAP_GOOGLE_OAUTH_CLIENT_IDS,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const records = new Map();
  let googleClaims = {
    iss: 'https://accounts.google.com',
    aud: 'untrusted-client',
    exp: String(Math.ceil(Date.now() / 1000) + 3600),
    sub: 'google-subject-123',
    email: 'user@example.com',
    email_verified: 'true',
    name: 'FXSnap User',
  };
  let supabaseUser = {
    id: 'supabase-user-id',
    email: 'user@example.com',
    email_confirmed_at: new Date().toISOString(),
    identities: [{
      id: 'google-subject-123',
      provider: 'google',
      identity_data: {
        sub: 'google-subject-123',
        email_verified: true,
        name: 'FXSnap User',
        picture: 'https://example.com/profile.png',
      },
    }],
  };
  const accountServer = http.createServer(createRequestHandler());

  persistentStore.enabled = true;
  persistentStore.getJson = async (key) => records.get(key) || null;
  persistentStore.setJson = async (key, value) => records.set(key, JSON.parse(JSON.stringify(value)));
  persistentStore.deleteKey = async (key) => records.delete(key);
  process.env.FXSNAP_GOOGLE_OAUTH_CLIENT_IDS = 'google-test-client';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl === 'https://oauth2.googleapis.com/tokeninfo') {
      return { ok: true, status: 200, json: async () => googleClaims };
    }
    if (requestUrl === 'https://supabase.test/auth/v1/user') {
      assert.equal(options.headers.apikey, 'test-service-role-key');
      if (options.headers.authorization === 'Bearer unverified-supabase-access-token') {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      assert.equal(options.headers.authorization, 'Bearer verified-supabase-access-token');
      return { ok: true, status: 200, json: async () => supabaseUser };
    }
    if (requestUrl === 'https://supabase.test/auth/v1/admin/users/supabase-user-id') {
      assert.equal(options.method, 'DELETE');
      assert.equal(options.headers.authorization, 'Bearer test-service-role-key');
      return { ok: true, status: 200, json: async () => ({}) };
    }
    assert.fail(`Unexpected mocked fetch URL: ${requestUrl}`);
  };

  try {
    await new Promise((resolve, reject) => {
      accountServer.once('error', reject);
      accountServer.listen(0, '127.0.0.1', resolve);
    });
    const address = accountServer.address();
    assert.ok(address && typeof address === 'object');
    const deviceId = 'test-device-identifier-1234';
    const request = (method, pathname, device = deviceId, accountToken, body) => new Promise((resolve, reject) => {
      const serializedBody = body === undefined ? '' : JSON.stringify(body);
      const headers = {
        authorization: `Bearer ${createAuth(serverSecret, device)}`,
        connection: 'close',
        ...(serializedBody ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(serializedBody) } : {}),
        ...(accountToken ? { 'x-fxsnap-account-token': accountToken } : {}),
      };
      const req = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: pathname,
        method,
        headers,
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} }));
      });
      req.on('error', reject);
      if (serializedBody) req.write(serializedBody);
      req.end();
    });

    const invalidAudience = await request('POST', '/api/account/google', deviceId, undefined, { idToken: 'fake-google-id-token-123456' });
    assert.equal(invalidAudience.status, 401);
    assert.equal(records.size, 0);

    googleClaims = { ...googleClaims, aud: 'google-test-client' };
    const signedIn = await request('POST', '/api/account/google', deviceId, undefined, { idToken: 'fake-google-id-token-123456' });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.account.email, 'user@example.com');
    assert.equal(signedIn.body.account.displayName, 'FXSnap User');
    assert.equal('userId' in signedIn.body.account, false);
    assert.equal('providerSubject' in signedIn.body.account, false);
    assert.equal('role' in signedIn.body.account, false);

    const profile = await request('GET', '/api/account', deviceId, signedIn.body.accountToken);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.account.email, 'user@example.com');

    const emptyAccountData = await request('GET', '/api/account/data', deviceId, signedIn.body.accountToken);
    assert.equal(emptyAccountData.status, 200);
    assert.equal(emptyAccountData.body.data, null);

    const backup = {
      backupVersion: 1,
      appDataVersion: 3,
      onboardingComplete: true,
      settings: { displayName: 'FXSnap User', themeMode: 'dark' },
      savedAnalyses: [{ id: 'analysis-1', pair: 'EUR/USD' }],
      savedStrategies: [],
      savedBriefs: [],
    };
    const savedAccountData = await request('POST', '/api/account/data', deviceId, signedIn.body.accountToken, { data: backup });
    assert.equal(savedAccountData.status, 200);
    const loadedAccountData = await request('GET', '/api/account/data', deviceId, signedIn.body.accountToken);
    assert.deepEqual(loadedAccountData.body.data.data, backup);

    const rejectedSupabaseSession = await request('POST', '/api/account/supabase', deviceId, undefined, {
      accessToken: 'unverified-supabase-access-token',
    });
    assert.equal(rejectedSupabaseSession.status, 401);
    supabaseUser = { ...supabaseUser, identities: [] };
    const unlinkedSupabaseAccount = await request('POST', '/api/account/supabase', deviceId, undefined, {
      accessToken: 'verified-supabase-access-token',
    });
    assert.equal(unlinkedSupabaseAccount.status, 401);
    supabaseUser = {
      ...supabaseUser,
      identities: [{
        id: 'google-subject-123',
        provider: 'google',
        identity_data: {
          sub: 'google-subject-123',
          email_verified: true,
          name: 'FXSnap User',
          picture: 'https://example.com/profile.png',
        },
      }],
    };

    const linkedSupabaseAccount = await request('POST', '/api/account/supabase', deviceId, undefined, {
      accessToken: 'verified-supabase-access-token',
    });
    assert.equal(linkedSupabaseAccount.status, 200);
    assert.equal(linkedSupabaseAccount.body.account.email, 'user@example.com');
    assert.equal(linkedSupabaseAccount.body.account.pictureUrl, 'https://example.com/profile.png');
    const linkedRecord = records.get(`fxsnap:account:user:usr_${crypto.createHash('sha256')
      .update('google-subject-123').digest('hex').slice(0, 32)}`);
    assert.equal(linkedRecord.supabaseUserId, 'supabase-user-id');
    const retainedAccountData = await request('GET', '/api/account/data', deviceId, linkedSupabaseAccount.body.accountToken);
    assert.deepEqual(retainedAccountData.body.data.data, backup);

    const invalidAccountData = await request('POST', '/api/account/data', deviceId, signedIn.body.accountToken, { data: [] });
    assert.equal(invalidAccountData.status, 400);

    const wrongDevice = await request('GET', '/api/account', 'different-device-identifier', signedIn.body.accountToken);
    assert.equal(wrongDevice.status, 401);

    const signedOut = await request('DELETE', '/api/account/session', deviceId, signedIn.body.accountToken);
    assert.equal(signedOut.status, 200);
    const revokedProfile = await request('GET', '/api/account', deviceId, signedIn.body.accountToken);
    assert.equal(revokedProfile.status, 401);

    const reauthenticated = await request('POST', '/api/account/google', deviceId, undefined, { idToken: 'fake-google-id-token-123456' });
    assert.equal(reauthenticated.status, 200);
    const deleted = await request('DELETE', '/api/account', deviceId, reauthenticated.body.accountToken);
    assert.equal(deleted.status, 200);
    const deletedProfile = await request('GET', '/api/account', deviceId, reauthenticated.body.accountToken);
    assert.equal(deletedProfile.status, 401);
    const deletedData = await request('GET', '/api/account/data', deviceId, reauthenticated.body.accountToken);
    assert.equal(deletedData.status, 401);
    assert.equal(records.size, 0);
  } finally {
    if (accountServer.listening) {
      accountServer.closeAllConnections();
      await new Promise((resolve) => accountServer.close(resolve));
    }
    global.fetch = previous.fetch;
    persistentStore.enabled = previous.enabled;
    persistentStore.getJson = previous.getJson;
    persistentStore.setJson = previous.setJson;
    persistentStore.deleteKey = previous.deleteKey;
    if (previous.googleClientIds === undefined) delete process.env.FXSNAP_GOOGLE_OAUTH_CLIENT_IDS;
    else process.env.FXSNAP_GOOGLE_OAUTH_CLIENT_IDS = previous.googleClientIds;
    if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.supabaseUrl;
    if (previous.supabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.supabaseServiceRoleKey;
  }
});
