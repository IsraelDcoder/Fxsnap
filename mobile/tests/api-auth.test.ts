import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAuth, verifyAuth, verifyAuthIdentity } = require('../server/auth.js');
const { API_BASE_URL, resolveApiBaseUrl } = require('../services/apiAuth.ts');
const { normalizeChartAnalysisError } = require('../services/chartDetection.ts');
const { hasRevenueCatEntitlement } = require('../services/revenuecatEntitlements.ts');

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

test('all app API URL resolution targets the production backend', () => {
  assert.equal(API_BASE_URL, 'https://fxsnap.vercel.app');
  assert.equal(resolveApiBaseUrl(), 'https://fxsnap.vercel.app');
});

test('premium-required backend payloads are normalized into a paywall flow instead of a raw error', () => {
  assert.deepEqual(normalizeChartAnalysisError({ code: 'PREMIUM_REQUIRED', reason: 'FREE_ANALYSIS_USED' }), {
    status: 'free_analysis_used',
    message: 'Your free chart analysis has already been used.',
  });
  assert.deepEqual(normalizeChartAnalysisError({ error: 'free_analysis_used' }), {
    status: 'free_analysis_used',
    message: 'Your free chart analysis has already been used.',
  });
});

test('premium entitlement checks accept both backend and app entitlement identifiers', () => {
  assert.equal(hasRevenueCatEntitlement({ premium: { identifier: 'premium' } }), true);
  assert.equal(hasRevenueCatEntitlement({ Pro: { identifier: 'Pro' } }), true);
  assert.equal(hasRevenueCatEntitlement({ starter: { identifier: 'starter' } }), false);
});
