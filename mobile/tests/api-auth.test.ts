import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAuth, verifyAuth, verifyFreeAnalysisIdentity } = require('../server/auth.js');
const { API_BASE_URL, resolveApiBaseUrl, normalizeServerAnalysisAccess } = require('../services/apiAuth.ts');
const { normalizeChartAnalysisError } = require('../services/chartDetection.ts');
const { hasRevenueCatEntitlement } = require('../services/revenuecatEntitlements.ts');
const { normalizePaywallRemoteConfig } = require('../services/paywallConfig.ts');
const { canViewFullAnalysis, getFeatureAccessDecision, isFreeAnalysisExhausted, isPremiumFeatureRoute, shouldGuardFeatureRoute } = require('../services/featureAccess.ts');
const { getInstrument, INSTRUMENTS } = require('../services/instruments.ts');

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

test('signed sessions bind a stable free-analysis identity separately from the app user ID', () => {
  const token = createAuth('test-secret', 'app-session-device-123', undefined, 'ios-vendor-device-123');
  assert.equal(verifyAuth('test-secret', token), 'app-session-device-123');
  assert.equal(verifyFreeAnalysisIdentity('test-secret', token), 'ios-vendor-device-123');
  assert.equal(verifyFreeAnalysisIdentity('wrong-secret', token), null);
});

test('legacy signed sessions remain valid when their free-analysis identity claim is ignored', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'legacy-device-123456', freeSub: 'ios-vendor-1234567890', exp: Date.now() + 60_000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'test-secret').update(payload).digest('base64url');
  assert.equal(verifyAuth('test-secret', `${payload}.${signature}`), 'legacy-device-123456');
  assert.equal(verifyAuth('test-secret', createAuth('test-secret', 'legacy-device-123456')), 'legacy-device-123456');
});

test('all app API URL resolution targets the production backend', () => {
  assert.equal(API_BASE_URL, 'https://fxsnap.vercel.app');
  assert.equal(resolveApiBaseUrl(), 'https://fxsnap.vercel.app');
});

test('analysis access accepts legacy quota responses without opening exhausted access', () => {
  assert.deepEqual(normalizeServerAnalysisAccess({
    canAnalyze: true,
    freeAnalysisAvailable: true,
    analysisInProgress: false,
    freeAnalysesUsed: 0,
    freeAnalysisLimit: 1,
  }), {
    canAnalyze: true,
    freeAnalysisAvailable: true,
    analysisInProgress: false,
    freeAnalysesUsed: 0,
    freeAnalysisLimit: 1,
  });
  assert.deepEqual(normalizeServerAnalysisAccess({
    canAnalyze: false,
    freeAnalysisAvailable: false,
  }), {
    canAnalyze: false,
    freeAnalysisAvailable: false,
    analysisInProgress: false,
    freeAnalysesUsed: 1,
    freeAnalysisLimit: 1,
  });
  assert.equal(normalizeServerAnalysisAccess({ canAnalyze: true }), null);
});

test('paywall remote proof only accepts verified rating data and up to two attributed quotes', () => {
  assert.deepEqual(normalizePaywallRemoteConfig({
    traderCount: 3700,
    googlePlayRating: 4.6,
    googlePlayRatingCount: 24,
    testimonials: [
      { quote: 'Clear levels.', attribution: 'Verified reviewer' },
      { quote: 'Easy to read.', attribution: 'Verified reviewer' },
      { quote: 'Ignored third quote.', attribution: 'Verified reviewer' },
    ],
  }), {
    traderCount: 3700,
    googlePlayRating: 4.6,
    googlePlayRatingCount: 24,
    testimonials: [
      { quote: 'Clear levels.', attribution: 'Verified reviewer' },
      { quote: 'Easy to read.', attribution: 'Verified reviewer' },
    ],
  });
  assert.deepEqual(normalizePaywallRemoteConfig({
    googlePlayRating: 4.6,
    googlePlayRatingCount: 0,
    testimonials: [{ quote: 'Unattributed claim.' }],
  }), {
    traderCount: null,
    googlePlayRating: null,
    googlePlayRatingCount: null,
    testimonials: [],
  });
});

test('premium-required backend payloads are normalized into a paywall flow', () => {
  assert.deepEqual(normalizeChartAnalysisError({ code: 'PREMIUM_REQUIRED' }), {
    status: 'premium_required',
    message: 'A Premium subscription is required for chart analysis.',
  });
  assert.deepEqual(normalizeChartAnalysisError({ error: 'premium_required' }), {
    status: 'premium_required',
    message: 'A Premium subscription is required for chart analysis.',
  });
});

test('the working premium entitlement remains valid while Pro aliases stay supported', () => {
  assert.equal(hasRevenueCatEntitlement({ premium: { identifier: 'premium' } }), true);
  assert.equal(hasRevenueCatEntitlement({ Premium: { identifier: 'Premium' } }), true);
  assert.equal(hasRevenueCatEntitlement({ Pro: { identifier: 'Pro' } }), true);
  assert.equal(hasRevenueCatEntitlement({ pro: { identifier: 'pro', periodType: 'TRIAL' } }), true);
  assert.equal(hasRevenueCatEntitlement({ starter: { identifier: 'starter' } }), false);
});

test('exhausted API quota is shown as a temporary analysis outage instead of a raw provider error', () => {
  assert.deepEqual(normalizeChartAnalysisError({ error: 'insufficient_quota' }), {
    status: 'ai_unavailable',
    message: 'Analysis is not available at the moment. Please try again later.',
  });
  assert.deepEqual(normalizeChartAnalysisError({ error: { message: 'You exceeded your current quota, please check your plan and billing details.' } }), {
    status: 'ai_unavailable',
    message: 'Analysis is not available at the moment. Please try again later.',
  });
});

test('premium routes are centrally recognized and must gate before navigation', () => {
  assert.equal(isPremiumFeatureRoute('/analysis'), false);
  assert.equal(isPremiumFeatureRoute('/strategy'), true);
  assert.equal(isPremiumFeatureRoute('/risk-management'), false);
  assert.equal(isPremiumFeatureRoute('/lot-size-calculator'), false);
  assert.equal(isPremiumFeatureRoute('/daily-brief'), false);
  assert.equal(shouldGuardFeatureRoute('/analysis', false), false);
  assert.equal(shouldGuardFeatureRoute('/analysis', true), false);
  assert.equal(shouldGuardFeatureRoute('/strategy', false), true);
  assert.equal(shouldGuardFeatureRoute('/strategy', true), false);
  assert.equal(shouldGuardFeatureRoute('/lot-size-calculator', false), false);
  assert.equal(shouldGuardFeatureRoute('/risk-management', false), false);
  assert.equal(shouldGuardFeatureRoute('/daily-brief', false), false);
});

test('the multi-timeframe selector includes every requested market', () => {
  const requestedPairs = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD', 'US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'USOIL'];
  for (const pair of requestedPairs) {
    const instrument = getInstrument(pair);
    assert.ok(instrument, `${pair} must be available in the instrument registry`);
    assert.ok((INSTRUMENTS as Array<{ id: string }>).some((candidate) => candidate.id === pair), `${pair} must be selectable`);
  }
});

test('AI analysis is available to start and the server gates only after the free run is used', () => {
  assert.deepEqual(getFeatureAccessDecision('AI_ANALYSIS', false), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('TRADE_SETUP', false), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('STRATEGY_GENERATOR', false), { allowed: false, requiresPaywall: true });
  assert.deepEqual(getFeatureAccessDecision('AI_ANALYSIS', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('TRADE_SETUP', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('STRATEGY_GENERATOR', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('LOT_SIZE', false), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('LIVE_CHARTS', false), { allowed: true, requiresPaywall: false });
});

test('only a completed free analysis triggers the early paywall', () => {
  assert.equal(isFreeAnalysisExhausted(0, 1, false), false);
  assert.equal(isFreeAnalysisExhausted(1, 1, false), true);
  assert.equal(isFreeAnalysisExhausted(1, 1, true), false);
});

test('the completed first free analysis displays all result details', () => {
  assert.equal(canViewFullAnalysis(false, true), true);
  assert.equal(canViewFullAnalysis(true, false), true);
  assert.equal(canViewFullAnalysis(false, false), false);
});
