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
  const preferences = payload.preferences;
  if (!preferences || preferences.enabled !== true) throw new Error('Push notifications are not enabled.');
  const normalizedPreferences = {
    dailyBrief: preferences.dailyBrief !== false,
    inactivity: preferences.inactivity !== false,
    weekly: preferences.weekly !== false,
    community: preferences.community !== false,
  };
  await supabasePushStore.register(deviceId, payload.token, payload.platform, normalizedPreferences);
  return true;
}

async function unregisterPushToken(deviceId) {
  await supabasePushStore.remove(deviceId);
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
  if (!process.env.EXPO_ACCESS_TOKEN) throw new Error('EXPO_ACCESS_TOKEN is not configured.');
  const events = await supabasePushStore.claimCommunityEvents(limit, objectId);
  if (!events?.length) return { processed: 0, sent: 0, failed: 0 };

  const entries = (await getRegisteredTokens())
    .filter((entry) => entry.preferences?.community !== false);
  const { expo } = await getExpoClient();
  let sent = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const activity = event.event_type === 'reply'
        ? { title: 'New Community reply', body: 'There is a new reply in the FXSnap Community.' }
        : event.event_type === 'reaction'
          ? { title: 'New Community reaction', body: 'There is new reaction activity in the FXSnap Community.' }
          : { title: 'New Community post', body: 'A new post is waiting in the FXSnap Community.' };
      const messages = entries.map((entry) => ({
        to: entry.token,
        ...activity,
        data: { type: 'community_activity', route: '/community', eventType: event.event_type },
        channelId: 'fxsnap-community',
        sound: 'default',
        priority: 'default',
      }));
      for (const chunk of expo.chunkPushNotifications(messages)) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      await supabasePushStore.finishCommunityEvent(event.id);
      sent += entries.length;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown push delivery error.';
      await supabasePushStore.finishCommunityEvent(event.id, detail);
      console.error('[Notifications] Community activity push delivery failed.', {
        eventId: event.id,
        error: detail,
      });
      failed += 1;
    }
  }
  return { processed: events.length, sent, failed };
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
