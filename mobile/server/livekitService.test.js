const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveKitService } = require('./livekitService');

function decodeClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function createService(url = 'wss://fxsnap-test.livekit.cloud') {
  return createLiveKitService({
    LIVEKIT_URL: url,
    LIVEKIT_API_KEY: 'fxsnap-test-key',
    LIVEKIT_API_SECRET: 'fxsnap-test-secret',
  });
}

test('LiveKit listener tokens are short-lived and subscribe-only', async () => {
  const service = createService();
  const result = await service.createParticipantToken({
    roomName: 'fxsnap-event-123',
    accountId: 'opaque-account-id',
    displayName: 'FXSnap member',
    role: 'listener',
  });
  const claims = decodeClaims(result.token);

  assert.equal(result.serverUrl, 'wss://fxsnap-test.livekit.cloud');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.room, 'fxsnap-event-123');
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(claims.video.canPublish, false);
  assert.deepEqual(claims.video.canPublishSources, []);
  assert.equal(claims.exp - claims.nbf, 300);
  assert.notEqual(claims.sub, 'opaque-account-id');
  assert.equal(JSON.stringify(claims).includes('fxsnap-test-secret'), false);
});

test('host and speaker tokens can publish microphone audio only', async () => {
  const service = createService();
  for (const role of ['host', 'speaker']) {
    const result = await service.createParticipantToken({
      roomName: 'fxsnap-event-123',
      accountId: `opaque-${role}`,
      displayName: `FXSnap ${role}`,
      role,
    });
    const claims = decodeClaims(result.token);
    assert.equal(claims.video.canPublish, true);
    assert.deepEqual(claims.video.canPublishSources, ['microphone']);
    assert.equal(claims.video.canPublishData, false);
  }
});

test('LiveKit service refuses missing credentials and insecure URLs', async () => {
  const missing = createLiveKitService({});
  await assert.rejects(
    missing.createParticipantToken({ roomName: 'room', accountId: 'id', role: 'listener' }),
    /not configured/i,
  );

  const insecure = createService('ws://fxsnap-test.livekit.cloud');
  await assert.rejects(
    insecure.createParticipantToken({ roomName: 'room', accountId: 'id', role: 'listener' }),
    /HTTPS or secure WebSockets/i,
  );
});
