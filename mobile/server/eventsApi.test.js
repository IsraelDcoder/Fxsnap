const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.FXSNAP_AUTH_SECRET = 'events-api-test-secret';
const persistentStore = require('./persistentStore');
const { createAuth } = require('./auth');
const { createRequestHandler } = require('./serve');

test('the events endpoint continues accepting legacy individual-event requests', async () => {
  const originalAppendJson = persistentStore.appendJson;
  const originalIncrement = persistentStore.increment;
  const writes = [];
  persistentStore.appendJson = async (...args) => {
    writes.push(args);
    return true;
  };
  persistentStore.increment = async () => 1;
  const server = http.createServer(createRequestHandler());

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const deviceId = 'legacy-events-device-123';
    const post = (body) => new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: '/api/events',
        method: 'POST',
        headers: {
          authorization: `Bearer ${createAuth(process.env.FXSNAP_AUTH_SECRET, deviceId)}`,
          'content-type': 'application/json',
        },
      }, (result) => {
        result.resume();
        result.on('end', () => resolve(result.statusCode));
      });
      request.once('error', reject);
      request.end(JSON.stringify(body));
    });

    const response = await post({ name: 'legacy-event', properties: { source: 'old-client' } });
    assert.equal(response, 204);
    assert.equal(writes.length, 1);
    assert.match(writes[0][0], /^fxsnap:events:\d{4}-\d{2}-\d{2}$/);
    assert.equal(writes[0][1][0].deviceId, deviceId);
    assert.equal(writes[0][1][0].name, 'legacy-event');
    assert.deepEqual(writes[0][1][0].properties, { source: 'old-client' });
    assert.equal(writes[0][1][0].id, undefined);

    persistentStore.appendJson = async () => { throw new Error('test storage failure'); };
    assert.equal(await post({ name: 'legacy-event-retry', properties: {} }), 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    persistentStore.appendJson = originalAppendJson;
    persistentStore.increment = originalIncrement;
  }
});
