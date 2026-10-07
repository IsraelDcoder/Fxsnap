const { Expo } = require('expo-server-sdk');
const persistentStore = require('./persistentStore');
const supabasePushStore = require('./supabasePushStore');

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
const CAMPAIGN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTES = new Set(['/daily-brief', '/analysis', '/saved']);

function getStartOfWeek(date) {
  const start = new Date(date);
  const distance = start.getUTCDay() === 0 ? -6 : 1 - start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + distance);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function registerPushToken(deviceId, payload) {
  if (!Expo.isExpoPushToken(payload.token)) throw new Error('Invalid Expo push token.');
  if (!['ios', 'android'].includes(payload.platform)) throw new Error('Unsupported push platform.');
  const preferences = payload.preferences;
  if (!preferences || preferences.enabled !== true) throw new Error('Push notifications are not enabled.');
  const normalizedPreferences = {
    dailyBrief: preferences.dailyBrief !== false,
    inactivity: preferences.inactivity !== false,
    weekly: preferences.weekly !== false,
  };
  await supabasePushStore.register(deviceId, payload.token, payload.platform, normalizedPreferences);
  return true;
}

async function unregisterPushToken(deviceId) {
  await supabasePushStore.remove(deviceId);
  return true;
}

async function getRegisteredTokens() {
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

module.exports = { registerPushToken, unregisterPushToken, getRegisteredTokens, buildCampaign, sendCampaign, sendScheduledCampaigns };
