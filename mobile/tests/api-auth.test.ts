import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAuth, verifyAuth, verifyAuthIdentity } = require('../server/auth.js');
const { resolveApiBaseUrl } = require('../services/apiAuth.ts');

test('signed anonymous tokens round-trip and reject tampering', () => {
  const token = createAuth('test-secret', 'device-1234567890');
  assert.equal(verifyAuth('test-secret', token), 'device-1234567890');
  assert.equal(verifyAuth('wrong-secret', token), null);
  const [payload, signature] = token.split('.');
  assert.equal(verifyAuth('test-secret', `${payload}.${signature.slice(0, -1)}x`), null);
});

test('expired tokens are rejected', () => {
  const token = createAuth('test-secret', 'device-1234567890', -1);
  assert.equal(verifyAuth('test-secret', token), null);
});

test('signed sessions retain a separate stable free-analysis identity', () => {
  const token = createAuth('test-secret', 'legacy-device-123456', undefined, 'ios-vendor-1234567890');
  assert.deepEqual(verifyAuthIdentity('test-secret', token), {
    deviceId: 'legacy-device-123456',
    freeAnalysisId: 'ios-vendor-1234567890',
  });
  assert.equal(verifyAuth('test-secret', token), 'legacy-device-123456');
});

test('placeholder API URLs fall back to the local backend', () => {
  assert.equal(resolveApiBaseUrl('https://your-vercel-app-name.vercel.app'), 'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('https://your-backend-url.example.com'), 'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('https://real-backend.example.com'), 'https://real-backend.example.com');
});

test('explicit local and emulator URLs are preserved instead of being rewritten', () => {
  assert.equal(resolveApiBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(resolveApiBaseUrl('http://10.0.2.2:3000'), 'http://10.0.2.2:3000');
  assert.equal(resolveApiBaseUrl('http://192.168.1.25:3000'), 'http://192.168.1.25:3000');
});
