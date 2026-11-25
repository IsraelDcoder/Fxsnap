const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const persistentStore = require('./persistentStore');
const { createRequestHandler } = require('./serve');
const { createAuth, decodeAuth, verifyAuth } = require('./auth');

const secret = 'test-auth-secret';
const serverSecret = process.env.FXSNAP_AUTH_SECRET || 'development-only-change-me';

test('anonymous API tokens reject tampering, wrong secrets, and expired sessions', () => {
  const token = createAuth(secret, 'device-identifier-1234');
  const expiredToken = createAuth(secret, 'device-identifier-1234', -1);

  assert.equal(decodeAuth(secret, token).sub, 'device-identifier-1234');
  assert.equal(decodeAuth('different-secret', token), null);
  assert.equal(decodeAuth(secret, `${token}tampered`), null);
  assert.equal(decodeAuth(secret, expiredToken), null);
  assert.equal(verifyAuth(secret, token), 'device-identifier-1234');
});

test('device profile and cloud data use an anonymous device identity without login routes', async () => {
  const previous = {
    fetch: global.fetch,
    enabled: persistentStore.enabled,
    getJson: persistentStore.getJson,
    setJson: persistentStore.setJson,
    supabaseEnabled: persistentStore.supabaseEnabled,
    touchAnonymousDevice: persistentStore.touchAnonymousDevice,
  };
  const records = new Map();
  const touchedDevices = [];
  const accountServer = http.createServer(createRequestHandler());

  persistentStore.enabled = true;
  persistentStore.getJson = async (key) => records.get(key) || null;
  persistentStore.setJson = async (key, value) => records.set(key, JSON.parse(JSON.stringify(value)));
  persistentStore.supabaseEnabled = true;
  persistentStore.touchAnonymousDevice = async (deviceId, accountId) => touchedDevices.push({ deviceId, accountId });
  global.fetch = async (url) => {
    assert.fail(`Unexpected external request: ${String(url)}`);
  };

  try {
    await new Promise((resolve, reject) => {
      accountServer.once('error', reject);
      accountServer.listen(0, '127.0.0.1', resolve);
    });
    const address = accountServer.address();
    assert.ok(address && typeof address === 'object');
    const deviceId = 'test-device-identifier-1234';
    const request = (method, pathname, body) => new Promise((resolve, reject) => {
      const serializedBody = body === undefined ? '' : JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: pathname,
        method,
        headers: {
          authorization: `Bearer ${createAuth(serverSecret, deviceId)}`,
          connection: 'close',
          ...(serializedBody ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(serializedBody) } : {}),
        },
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, body });
        });
      });
      req.on('error', reject);
      if (serializedBody) req.write(serializedBody);
      req.end();
    });

    const profile = await request('GET', '/api/account');
    assert.equal(profile.status, 200);
    assert.equal(profile.body.account.provider, 'anonymous');
    assert.match(profile.body.account.userId, /^device_[a-f0-9]{32}$/);
    assert.equal(profile.body.account.email, undefined);
    assert.deepEqual(touchedDevices, [{ deviceId, accountId: profile.body.account.userId }]);
    assert.deepEqual((await request('GET', '/api/account')).body.account, profile.body.account);

    const rejectedGoogleLogin = await request('POST', '/api/account/google', { idToken: 'unused-google-token' });
    assert.notEqual(rejectedGoogleLogin.status, 200);

    const backup = {
      backupVersion: 1,
      appDataVersion: 3,
      onboardingComplete: true,
      settings: { displayName: 'FXSnap Trader', themeMode: 'dark' },
      savedAnalyses: [{ id: 'analysis-1', pair: 'EUR/USD' }],
      savedStrategies: [],
      savedBriefs: [],
    };
    assert.equal((await request('POST', '/api/account/data', { data: backup })).status, 200);
    const loadedData = await request('GET', '/api/account/data');
    assert.equal(loadedData.status, 200);
    assert.deepEqual(loadedData.body.data.data, backup);

    const accountId = `device_${crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 32)}`;
    assert.ok(records.has(`fxsnap:account:user:${accountId}`));
    assert.ok(records.has(`fxsnap:account:data:${accountId}`));
  } finally {
    if (accountServer.listening) {
      accountServer.closeAllConnections();
      await new Promise((resolve) => accountServer.close(resolve));
    }
    global.fetch = previous.fetch;
    persistentStore.enabled = previous.enabled;
    persistentStore.getJson = previous.getJson;
    persistentStore.setJson = previous.setJson;
    persistentStore.supabaseEnabled = previous.supabaseEnabled;
    persistentStore.touchAnonymousDevice = previous.touchAnonymousDevice;
  }
});
