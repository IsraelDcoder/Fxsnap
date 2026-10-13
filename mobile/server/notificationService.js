const persistentStore = require('./persistentStore');
const supabasePushStore = require('./supabasePushStore');

let expoClientPromise;
async function getExpoClient() {
  if (!expoClientPromise) {
    expoClientPromise = import('expo-server-sdk').then(({ Expo }) => {
      const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
      return { Expo, expo };
    });
  }
  return expoClientPromise;
}

const CAMPAIGN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTES = new Set(['/daily-brief', '/analysis', '/saved', '/community']);

function getStartOfWeek(date) {
  const start = new Date(date);
  const distance = start.getUTCDay() === 0 ? -6 : 1 - start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + distance);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function registerPushToken(deviceId, payload) {
  const { Expo } = await getExpoClient();
  if (!Expo.isExpoPushToken(payload.token)) throw new Error('Invalid Expo push token.');
  if (!['ios', 'android'].includes(payload.platform)) throw new Error('Unsupported push platform.');
  if (typeof payload.accountId !== 'string' || !payload.accountId
    || typeof payload.supabaseUserId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.supabaseUserId)) {
    throw new Error('A valid signed-in account is required to register a push token.');
  }
  const preferences = payload.preferences;
  if (!preferences || preferences.enabled !== true) throw new Error('Push notifications are not enabled.');
  const normalizedPreferences = {
    dailyBrief: preferences.dailyBrief !== false,
    inactivity: preferences.inactivity !== false,
    weekly: preferences.weekly !== false,
    community: preferences.community !== false,
  };
  await supabasePushStore.register(
    deviceId,
    payload.token,
    payload.platform,
    normalizedPreferences,
    payload.accountId,
    payload.supabaseUserId,
  );
  return true;
}

async function unregisterPushToken(deviceId, accountId) {
  await supabasePushStore.remove(deviceId, accountId);
  return true;
}

async function getRegisteredTokens() {
  const { Expo } = await getExpoClient();
  const entries = await supabasePushStore.list();
  return entries.filter((entry) => entry && entry.deviceId && Expo.isExpoPushToken(entry.token));
}

function buildCampaign(entry, events, now, isSubscribed) {
  const deviceEvents = events.filter((event) => event.deviceId === entry.deviceId);
  const lastSeenAt = deviceEvents.reduce((latest, event) => {
    const occurredAt = Date.parse(event.occurredAt);
    return Number.isFinite(occurredAt) && occurredAt > latest ? occurredAt : latest;
  }, Date.parse(entry.registeredAt) || 0);
  const weekStart = getStartOfWeek(now).getTime();
  const activityStart = now.getUTCDay() === 1 ? weekStart - 7 * 24 * 60 * 60 * 1000 : weekStart;
  const recentEvents = deviceEvents.filter((event) => Date.parse(event.occurredAt) >= activityStart && Date.parse(event.occurredAt) < weekStart);
  const chartAnalyses = recentEvents.filter((event) => event.name === 'analysis_succeeded').length;
  const lastSent = entry.lastNotificationAt ? Date.parse(entry.lastNotificationAt) : 0;
  if (now.getTime() - lastSent < CAMPAIGN_COOLDOWN_MS) return null;

  const inactiveDays = Math.floor((now.getTime() - lastSeenAt) / (24 * 60 * 60 * 1000));
  if (inactiveDays > 3 && entry.preferences.inactivity) {
    if (isSubscribed) {
      return { type: 'premium-ready', title: 'Your Premium analysis is ready', body: 'Your Premium analysis is ready. Upload your next chart and get the AI breakdown.', route: '/analysis' };
    }
    return { type: 'inactivity', title: 'Your charts are waiting', body: 'You haven’t analyzed a chart in 3 days. Ready for your next setup?', route: '/analysis' };
  }
  if (entry.preferences.weekly && now.getUTCDay() === 1 && chartAnalyses >= 4) {
    return { type: 'weekly-overview', title: 'Your FXSnap Week', body: `You analyzed ${chartAnalyses} charts this week. See your trading activity.`, route: '/saved' };
  }
  if (entry.preferences.dailyBrief) {
    return { type: 'daily-brief', title: 'FXSnap Daily Brief', body: '15 new forex insights are waiting for you.', route: '/daily-brief' };
  }
  return null;
}

async function sendCampaign({ type, title, body, route, token, deviceId }) {
  if (!ROUTES.has(route)) throw new Error('Unsupported notification route.');
  const { Expo, expo } = await getExpoClient();
  if (!Expo.isExpoPushToken(token)) return { sent: false, reason: 'Invalid Expo push token.' };
  const [ticket] = await expo.sendPushNotificationsAsync([{
    to: token,
    title,
    body,
    data: { type, route, campaignId: `${type}:${deviceId}` },
    channelId: 'fxsnap-retention',
    sound: 'default',
    priority: 'default',
  }]);
  return { sent: ticket.status === 'ok', ticket };
}

async function sendScheduledCampaigns(now = new Date(), isPremium = async () => false) {
  if (!process.env.EXPO_ACCESS_TOKEN) return { sent: 0, skipped: 'EXPO_ACCESS_TOKEN is not configured.' };
  const entries = await getRegisteredTokens();
  const events = await persistentStore.getJson('fxsnap:events') || [];
  const results = [];
  for (const entry of entries) {
    const campaign = buildCampaign(entry, events, now, await isPremium(entry.deviceId));
    if (!campaign) continue;
    const result = await sendCampaign({ ...campaign, token: entry.token, deviceId: entry.deviceId });
    if (result.sent) {
      await supabasePushStore.markNotified(entry.deviceId, now.toISOString());
      results.push({ deviceId: entry.deviceId, sent: true, type: campaign.type });
    } else {
      results.push({ deviceId: entry.deviceId, sent: false, error: result.ticket?.message || result.reason });
    }
  }
  return { sent: results.filter((result) => result.sent).length, results };
}

async function dispatchCommunityPushNotifications(objectId = null, limit = 100) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase Community push storage is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/community-push`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `******`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ objectId, limit }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('[Notifications] Community Edge Function request failed.', { status: response.status });
    throw new Error(`Community push delivery failed (${response.status}).`);
  }
  return result;
}

module.exports = {
  registerPushToken,
  unregisterPushToken,
  getRegisteredTokens,
  buildCampaign,
  sendCampaign,
  sendScheduledCampaigns,
  dispatchCommunityPushNotifications,
};
