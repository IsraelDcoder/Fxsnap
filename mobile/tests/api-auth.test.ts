import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAuth, verifyAuth } = require('../server/auth.js');
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

test('placeholder API URLs fall back to the local backend', () => {
  assert.equal(resolveApiBaseUrl('https://your-vercel-app-name.vercel.app'), 'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('https://your-backend-url.example.com'), 'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('https://real-backend.example.com'), 'https://real-backend.example.com');
});
