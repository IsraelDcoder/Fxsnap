const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequestHandler } = require('./serve');

test('retired AI support endpoint does not forward message content to a model provider', async () => {
  const previousFetch = global.fetch;
  const requests = [];
  global.fetch = async (...args) => {
    requests.push(args);
    throw new Error('Unexpected outbound request.');
  };
  const server = http.createServer(createRequestHandler());

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: '/api/support-chat',
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
      }, (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : {} }));
      });
      request.on('error', reject);
      request.end(JSON.stringify({ messages: [{ role: 'user', content: 'I need help with billing.' }] }));
    });
    assert.equal(result.status, 410);
    assert.match(result.body.error, /private in-app support conversation/);
    assert.equal(requests.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    global.fetch = previousFetch;
  }
});
