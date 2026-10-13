import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildCampaign,
  dispatchCommunityPushNotifications,
  getRegisteredTokens,
  registerPushToken,
  unregisterPushToken,
} = require('../server/notificationService.js') as {
  buildCampaign: (
    entry: Record<string, unknown>,
    events: Array<Record<string, unknown>>,
    now: Date,
    isSubscribed: boolean,
  ) => { type: string; route: string } | null;
  getRegisteredTokens: () => Promise<Array<Record<string, unknown>>>;
  dispatchCommunityPushNotifications: (objectId?: string | null, limit?: number) => Promise<Record<string, unknown>>;
  registerPushToken: (deviceId: string, payload: Record<string, unknown>) => Promise<boolean>;
  unregisterPushToken: (deviceId: string, accountId: string) => Promise<boolean>;
};

const now = new Date('2026-10-14T09:00:00.000Z');
const baseEntry = {
  deviceId: 'device-1234567890',
  token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  registeredAt: '2026-10-01T09:00:00.000Z',
  lastNotificationAt: null,
  preferences: { dailyBrief: true, inactivity: true, weekly: true, community: true },
};

test('dormant subscribers receive premium-specific return content', () => {
  const campaign = buildCampaign(baseEntry, [], now, true);
  assert.equal(campaign?.type, 'premium-ready');
  assert.equal(campaign?.route, '/analysis');
});

test('engaged users with four weekly analyses receive the weekly overview on Monday', () => {
  const monday = new Date('2026-10-12T09:00:00.000Z');
  const entry = { ...baseEntry, registeredAt: '2026-10-01T09:00:00.000Z' };
  const events = [
    '2026-10-06T09:00:00.000Z',
    '2026-10-07T09:00:00.000Z',
    '2026-10-08T09:00:00.000Z',
    '2026-10-09T09:00:00.000Z',
  ].map((occurredAt) => ({ deviceId: entry.deviceId, name: 'analysis_succeeded', occurredAt }));
  const campaign = buildCampaign(entry, events, monday, false);
  assert.equal(campaign?.type, 'weekly-overview');
  assert.equal(campaign?.route, '/saved');
});

test('recently notified devices are suppressed for seven days', () => {
  const entry = { ...baseEntry, lastNotificationAt: '2026-10-10T09:00:00.000Z' };
  assert.equal(buildCampaign(entry, [], now, false), null);
});

test('campaigns respect disabled categories', () => {
  const entry = {
    ...baseEntry,
    registeredAt: now.toISOString(),
    preferences: { dailyBrief: false, inactivity: false, weekly: false, community: true },
  };
  assert.equal(buildCampaign(entry, [], now, false), null);
});

test('push tokens are bound to the authenticated device and can be removed', async () => {
  const deviceId = 'device-push-test-123456';
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rows: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    calls.push(`${method} ${url}`);
    if (method === 'POST') {
      const row = JSON.parse(String(init?.body));
      const existingIndex = rows.findIndex((existing) => existing.device_id === row.device_id);
      if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...row };
      else rows.push(row);
      return new Response(null, { status: 201 });
    }
    if (method === 'DELETE') {
      const target = new URL(url).searchParams.get('device_id')?.replace(/^eq\./, '');
      const accountId = new URL(url).searchParams.get('account_id')?.replace(/^eq\./, '');
      for (let index = rows.length - 1; index >= 0; index--) {
        if (rows[index].device_id === target && rows[index].account_id === accountId) rows.splice(index, 1);
      }
      return new Response(null, { status: 204 });
    }
    return Response.json(rows.map((row) => ({
      device_id: row.device_id,
      account_id: row.account_id,
      supabase_user_id: row.supabase_user_id,
      expo_token: row.expo_token,
      platform: row.platform,
      preferences: row.preferences,
      registered_at: row.registered_at,
      last_notification_at: row.last_notification_at ?? null,
    })));
  }) as typeof fetch;

  try {
    await registerPushToken(deviceId, {
      token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      platform: 'android',
      accountId: 'usr_push-test-member',
      supabaseUserId: '00000000-0000-4000-8000-000000000010',
      preferences: { enabled: true, dailyBrief: true, inactivity: false, weekly: true, community: false },
    });
    const registration = (await getRegisteredTokens()).find((entry) => entry.deviceId === deviceId);
    assert.equal(registration?.platform, 'android');
    assert.equal(registration?.accountId, 'usr_push-test-member');
    assert.equal(registration?.supabaseUserId, '00000000-0000-4000-8000-000000000010');
    assert.deepEqual(registration?.preferences, { dailyBrief: true, inactivity: false, weekly: true, community: false });
    await registerPushToken('device-push-test-234567', {
      token: 'ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]',
      platform: 'android',
      accountId: 'usr_push-test-member',
      supabaseUserId: '00000000-0000-4000-8000-000000000010',
      preferences: { enabled: true, dailyBrief: true, inactivity: false, weekly: true, community: false },
    });
    assert.equal((await getRegisteredTokens()).filter((entry) => entry.accountId === 'usr_push-test-member').length, 2);
    await unregisterPushToken(deviceId, 'usr_push-test-member');
    assert.equal((await getRegisteredTokens()).some((entry) => entry.deviceId === deviceId), false);
    assert.equal((await getRegisteredTokens()).some((entry) => entry.deviceId === 'device-push-test-234567'), true);
    assert.ok(calls.some((call) => call.includes('fxsnap_push_devices')));
    assert.ok(calls.every((call) => call.includes('unit-test.supabase.co')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('push-token registration rejects unapproved or malformed registrations', async () => {
  await assert.rejects(registerPushToken('device-push-test-123456', {
    token: 'not-an-expo-token',
    platform: 'web',
    accountId: 'usr_push-test-member',
    supabaseUserId: '00000000-0000-4000-8000-000000000010',
    preferences: { enabled: false },
  }));
  await assert.rejects(registerPushToken('device-push-test-123456', {
    token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'android',
    preferences: { enabled: true },
  }), /signed-in account/i);
});

test('Community dispatch invokes the Supabase Edge Function with the queued object selector', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let requestUrl = '';
  let requestBody: Record<string, unknown> | null = null;
  process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ processed: 1, sent: 2, failed: 0, receiptsProcessed: 0 });
  }) as typeof fetch;

  try {
    const result = await dispatchCommunityPushNotifications('community-post-id', 5);
    assert.equal(requestUrl, 'https://unit-test.supabase.co/functions/v1/community-push');
    assert.deepEqual(requestBody, { objectId: 'community-post-id', limit: 5 });
    assert.equal(result.sent, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
