import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import AsyncStorage from '@react-native-async-storage/async-storage';
const require = createRequire(import.meta.url);
const { createAuth, verifyAuth } = require('../server/auth.js');
const apiAuth = require('../services/apiAuth.ts');
const { API_BASE_URL, resolveApiBaseUrl, normalizeServerAnalysisAccess } = apiAuth;
const { normalizeChartAnalysisError } = require('../services/chartDetection.ts');
const { hasRevenueCatEntitlement } = require('../services/revenuecatEntitlements.ts');
const { normalizePaywallRemoteConfig } = require('../services/paywallConfig.ts');
const { canViewFullAnalysis, getFeatureAccessDecision, isDevelopmentAnalysisPremiumBypassEnabled, isCommunityFeatureRoute, isPremiumFeatureRoute, shouldGuardFeatureRoute } = require('../services/featureAccess.ts');
const { getInstrument, INSTRUMENTS, INSTRUMENT_GROUPS } = require('../services/instruments.ts');

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

test('legacy signed sessions remain valid after removing the free-analysis identity claim', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'legacy-device-123456', freeSub: 'ios-vendor-1234567890', exp: Date.now() + 60_000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'test-secret').update(payload).digest('base64url');
  assert.equal(verifyAuth('test-secret', `${payload}.${signature}`), 'legacy-device-123456');
  assert.equal(verifyAuth('test-secret', createAuth('test-secret', 'legacy-device-123456')), 'legacy-device-123456');
});

test('all app API URL resolution targets the production backend', () => {
  assert.equal(API_BASE_URL, 'https://fxsnap.vercel.app');
  assert.equal(resolveApiBaseUrl(), 'https://fxsnap.vercel.app');
  assert.equal(resolveApiBaseUrl('http://localhost:3000', false), 'https://fxsnap.vercel.app');
  assert.equal(resolveApiBaseUrl('http://localhost:3000', true), 'http://localhost:3000');
});

test('concurrent API header requests share one pending session initialization', async () => {
  const storage = AsyncStorage as unknown as {
    getItem: typeof AsyncStorage.getItem;
    setItem: typeof AsyncStorage.setItem;
    multiSet: typeof AsyncStorage.multiSet;
    removeItem: typeof AsyncStorage.removeItem;
  };
  const originalGetItem = storage.getItem;
  const originalSetItem = storage.setItem;
  const originalMultiSet = storage.multiSet;
  const originalRemoveItem = storage.removeItem;
  const originalFetch = global.fetch;
  const values = new Map<string, string>([
    ['fxsnap:deviceId', 'concurrent-session-device-123'],
    ['fxsnap:sessionApiUrl', API_BASE_URL],
  ]);
  let sessionRequests = 0;
  storage.getItem = async (key) => values.get(key) ?? null;
  storage.setItem = async (key, value) => { values.set(key, value); };
  storage.multiSet = async (entries) => {
    for (const [key, value] of entries) values.set(key, value);
  };
  storage.removeItem = async (key) => { values.delete(key); };
  global.fetch = async (input) => {
    assert.equal(String(input), `${API_BASE_URL}/api/session`);
    sessionRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      ok: true,
      json: async () => ({ token: 'test-session-token-that-is-long-enough' }),
    } as Response;
  };

  try {
    const headers = await Promise.all(Array.from({ length: 12 }, () => apiAuth.getApiHeaders()));
    assert.equal(sessionRequests, 1);
    assert.equal(new Set(headers.map((item: Record<string, string>) => item.authorization)).size, 1);
  } finally {
    storage.getItem = originalGetItem;
    storage.setItem = originalSetItem;
    storage.multiSet = originalMultiSet;
    storage.removeItem = originalRemoveItem;
    global.fetch = originalFetch;
  }
});

test('simultaneous cold-start callers persist and request one identical device ID', async () => {
  const storage = AsyncStorage as unknown as {
    getItem: typeof AsyncStorage.getItem;
    setItem: typeof AsyncStorage.setItem;
    multiSet: typeof AsyncStorage.multiSet;
    removeItem: typeof AsyncStorage.removeItem;
  };
  const originals = {
    getItem: storage.getItem,
    setItem: storage.setItem,
    multiSet: storage.multiSet,
    removeItem: storage.removeItem,
    fetch: global.fetch,
  };
  const values = new Map<string, string>();
  const requestedDeviceIds: string[] = [];
  storage.getItem = async (key) => values.get(key) ?? null;
  storage.setItem = async (key, value) => { values.set(key, value); };
  storage.multiSet = async (entries) => {
    for (const [key, value] of entries) values.set(key, value);
  };
  storage.removeItem = async (key) => { values.delete(key); };
  global.fetch = async (input, init) => {
    assert.equal(String(input), `${API_BASE_URL}/api/session`);
    requestedDeviceIds.push(JSON.parse(String(init?.body)).deviceId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, json: async () => ({ token: 'cold-start-session-token-is-long-enough' }) } as Response;
  };

  try {
    const headers = await Promise.all(Array.from({ length: 16 }, () => apiAuth.getApiHeaders()));
    const storedDeviceId = values.get('fxsnap:deviceId');
    assert.ok(storedDeviceId);
    assert.deepEqual(new Set(requestedDeviceIds), new Set([storedDeviceId]));
    assert.equal(new Set(headers.map((item: Record<string, string>) => item.authorization)).size, 1);
  } finally {
    storage.getItem = originals.getItem;
    storage.setItem = originals.setItem;
    storage.multiSet = originals.multiSet;
    storage.removeItem = originals.removeItem;
    global.fetch = originals.fetch;
  }
});

test('failed session initialization can be retried by subsequent callers', async () => {
  const storage = AsyncStorage as unknown as {
    getItem: typeof AsyncStorage.getItem;
    setItem: typeof AsyncStorage.setItem;
    multiSet: typeof AsyncStorage.multiSet;
    removeItem: typeof AsyncStorage.removeItem;
  };
  const originals = {
    getItem: storage.getItem,
    setItem: storage.setItem,
    multiSet: storage.multiSet,
    removeItem: storage.removeItem,
    fetch: global.fetch,
  };
  const values = new Map<string, string>();
  let requests = 0;
  storage.getItem = async (key) => values.get(key) ?? null;
  storage.setItem = async (key, value) => { values.set(key, value); };
  storage.multiSet = async (entries) => {
    for (const [key, value] of entries) values.set(key, value);
  };
  storage.removeItem = async (key) => { values.delete(key); };
  global.fetch = async () => {
    requests += 1;
    return requests === 1
      ? { ok: false } as Response
      : { ok: true, json: async () => ({ token: 'retry-session-token-is-long-enough' }) } as Response;
  };

  try {
    await assert.rejects(apiAuth.getApiHeaders(), /Unable to create an API session/);
    const headers = await apiAuth.getApiHeaders();
    assert.match(headers.authorization, /^Bearer /);
    assert.equal(requests, 2);
  } finally {
    storage.getItem = originals.getItem;
    storage.setItem = originals.setItem;
    storage.multiSet = originals.multiSet;
    storage.removeItem = originals.removeItem;
    global.fetch = originals.fetch;
  }
});

test('rejected session tokens are refreshed once and preserve other request headers', async () => {
  const storage = AsyncStorage as unknown as {
    getItem: typeof AsyncStorage.getItem;
    multiSet: typeof AsyncStorage.multiSet;
    removeItem: typeof AsyncStorage.removeItem;
  };
  const originals = {
    getItem: storage.getItem,
    multiSet: storage.multiSet,
    removeItem: storage.removeItem,
    fetch: global.fetch,
  };
  const values = new Map<string, string>([
    ['fxsnap:deviceId', 'expired-session-device-123'],
    ['fxsnap:sessionToken', 'old-session-token'],
    ['fxsnap:sessionTokenVersion', '4'],
    ['fxsnap:sessionApiUrl', API_BASE_URL],
  ]);
  const calls: Array<{ url: string; authorization?: string; accountToken?: string }> = [];
  storage.getItem = async (key) => values.get(key) ?? null;
  storage.multiSet = async (entries) => {
    for (const [key, value] of entries) values.set(key, value);
  };
  storage.removeItem = async (key) => { values.delete(key); };
  global.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const url = String(input);
    calls.push({
      url,
      authorization: headers.get('authorization') || undefined,
      accountToken: headers.get('x-fxsnap-account-token') || undefined,
    });
    if (url.endsWith('/api/session')) {
      return { ok: true, json: async () => ({ token: 'refreshed-session-token-is-long-enough' }) } as Response;
    }
    return { ok: calls.filter((call) => call.url.endsWith('/api/private')).length > 1, status: calls.filter((call) => call.url.endsWith('/api/private')).length > 1 ? 200 : 401 } as Response;
  };

  try {
    const response = await apiAuth.fetchWithApiAuth(`${API_BASE_URL}/api/private`, {
      headers: { ...(await apiAuth.getApiHeaders()), 'x-fxsnap-account-token': 'preserve-me' },
    });
    assert.equal(response.status, 200);
    const privateCalls = calls.filter((call) => call.url.endsWith('/api/private'));
    assert.equal(privateCalls.length, 2);
    assert.equal(privateCalls[0].authorization, 'Bearer old-session-token');
    assert.equal(privateCalls[1].authorization, 'Bearer refreshed-session-token-is-long-enough');
    assert.equal(privateCalls[1].accountToken, 'preserve-me');
  } finally {
    storage.getItem = originals.getItem;
    storage.multiSet = originals.multiSet;
    storage.removeItem = originals.removeItem;
    global.fetch = originals.fetch;
  }
});

test('analysis access accepts subscription status and rejects incomplete responses', () => {
  assert.deepEqual(normalizeServerAnalysisAccess({ canAnalyze: true }), { canAnalyze: true });
  assert.deepEqual(normalizeServerAnalysisAccess({ canAnalyze: false }), { canAnalyze: false });
  assert.equal(normalizeServerAnalysisAccess({}), null);
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

test('premium routes are centrally recognized and Community remains available to free users', () => {
  assert.equal(isPremiumFeatureRoute('/analysis'), true);
  assert.equal(isPremiumFeatureRoute('/strategy'), true);
  assert.equal(isPremiumFeatureRoute('/community'), false);
  assert.equal(isCommunityFeatureRoute('/community-notifications'), true);
  assert.equal(isCommunityFeatureRoute('/community-member'), true);
  assert.equal(isPremiumFeatureRoute('/risk-management'), false);
  assert.equal(isPremiumFeatureRoute('/lot-size-calculator'), false);
  assert.equal(isPremiumFeatureRoute('/daily-brief'), false);
  assert.equal(shouldGuardFeatureRoute('/analysis', false), true);
  assert.equal(shouldGuardFeatureRoute('/analysis', true), false);
  assert.equal(shouldGuardFeatureRoute('/strategy', false), true);
  assert.equal(shouldGuardFeatureRoute('/strategy', true), false);
  assert.equal(shouldGuardFeatureRoute('/community', false), false);
  assert.equal(shouldGuardFeatureRoute('/community-search', false), false);
  assert.equal(shouldGuardFeatureRoute('/community-notifications', true), false);
  assert.equal(shouldGuardFeatureRoute('/lot-size-calculator', false), false);
  assert.equal(shouldGuardFeatureRoute('/risk-management', false), false);
  assert.equal(shouldGuardFeatureRoute('/daily-brief', false), false);
});

test('the instrument registry retains supported markets while the asset list hides crypto and commodities', () => {
  const requestedPairs = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD', 'US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'USOIL'];
  for (const pair of requestedPairs) {
    const instrument = getInstrument(pair);
    assert.ok(instrument, `${pair} must be available in the instrument registry`);
    assert.ok((INSTRUMENTS as Array<{ id: string }>).some((candidate) => candidate.id === pair), `${pair} must remain in the instrument registry`);
  }

  const visibleCategories = (INSTRUMENT_GROUPS as Array<{ key: string }>).map((group) => group.key);
  assert.equal(visibleCategories.includes('crypto'), false);
  assert.equal(visibleCategories.includes('commodities'), false);
  assert.ok(visibleCategories.includes('forex'));
  assert.ok(visibleCategories.includes('metals'));
  assert.ok(visibleCategories.includes('indices'));
});

test('analysis, trade setup, and strategy generation all require an active subscription', () => {
  assert.deepEqual(getFeatureAccessDecision('AI_ANALYSIS', false), { allowed: false, requiresPaywall: true });
  assert.deepEqual(getFeatureAccessDecision('TRADE_SETUP', false), { allowed: false, requiresPaywall: true });
  assert.deepEqual(getFeatureAccessDecision('STRATEGY_GENERATOR', false), { allowed: false, requiresPaywall: true });
  assert.deepEqual(getFeatureAccessDecision('AI_ANALYSIS', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('TRADE_SETUP', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('STRATEGY_GENERATOR', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('COMMUNITY', false), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('COMMUNITY', true), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('LOT_SIZE', false), { allowed: true, requiresPaywall: false });
  assert.deepEqual(getFeatureAccessDecision('LIVE_CHARTS', false), { allowed: true, requiresPaywall: false });
});

test('analysis premium bypass is opt-in and only active in development builds', () => {
  const previousBypass = process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS;
  try {
    process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS = 'true';
    assert.equal(isDevelopmentAnalysisPremiumBypassEnabled(process.env, false), false);
    const developmentBypass = isDevelopmentAnalysisPremiumBypassEnabled(process.env, true);
    assert.deepEqual(getFeatureAccessDecision('AI_ANALYSIS', false, developmentBypass), { allowed: true, requiresPaywall: false });
    assert.deepEqual(getFeatureAccessDecision('TRADE_SETUP', false, developmentBypass), { allowed: true, requiresPaywall: false });
    assert.deepEqual(getFeatureAccessDecision('STRATEGY_GENERATOR', false, developmentBypass), { allowed: false, requiresPaywall: true });
    assert.deepEqual(getFeatureAccessDecision('COMMUNITY', false, developmentBypass), { allowed: true, requiresPaywall: false });
    assert.equal(canViewFullAnalysis(false, developmentBypass), true);
  } finally {
    if (previousBypass === undefined) delete process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS;
    else process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS = previousBypass;
  }
});

test('full chart analysis details require an active subscription', () => {
  assert.equal(canViewFullAnalysis(false), false);
  assert.equal(canViewFullAnalysis(false, false, true), true);
  assert.equal(canViewFullAnalysis(true), true);
});
