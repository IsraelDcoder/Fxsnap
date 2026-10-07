export type NotificationCampaignType =
  | 'daily-brief'
  | 'inactivity'
  | 'weekly-overview'
  | 'premium-ready';

export type NotificationCampaign = {
  type: NotificationCampaignType;
  title: string;
  body: string;
  route: '/daily-brief' | '/analysis' | '/saved';
  channelId: string;
};

export type NotificationCampaignInput = {
  now: Date;
  lastSeenAt: Date;
  chartAnalysesThisWeek: number;
  isSubscribed: boolean;
  hasNewDailyBrief: boolean;
  lastNotificationAt: Date | null;
};

const INACTIVITY_DAYS = 3;
const WEEKLY_MINIMUM_CHARTS = 4;
const WEEKLY_NOTIFICATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + distance);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function isNotificationEligible(input: NotificationCampaignInput): boolean {
  if (!isOutsideNotificationCooldown(input)) return false;

  const inactivityDays = Math.floor((input.now.getTime() - input.lastSeenAt.getTime()) / (24 * 60 * 60 * 1000));
  if (inactivityDays <= INACTIVITY_DAYS) return false;
  return input.chartAnalysesThisWeek >= 0;
}

export function buildNotificationCampaign(input: NotificationCampaignInput): NotificationCampaign | null {
  if (!isOutsideNotificationCooldown(input)) return null;

  if (input.isSubscribed) {
    return {
      type: 'premium-ready',
      title: 'Your Premium analysis is ready',
      body: 'Your Premium analysis is ready. Upload your next chart and get the AI breakdown.',
      route: '/analysis',
      channelId: 'fxsnap-premium',
    };
  }

  if (input.hasNewDailyBrief) {
    return {
      type: 'daily-brief',
      title: 'FXSnap Daily Brief 📊',
      body: '15 new forex insights are waiting for you.',
      route: '/daily-brief',
      channelId: 'fxsnap-daily-brief',
    };
  }

  if (input.chartAnalysesThisWeek >= WEEKLY_MINIMUM_CHARTS) {
    return {
      type: 'weekly-overview',
      title: 'Your FXSnap Week 📈',
      body: `You analyzed ${input.chartAnalysesThisWeek} charts this week. See your trading activity.`,
      route: '/saved',
      channelId: 'fxsnap-weekly',
    };
  }

  if (isNotificationEligible(input)) {
    return {
      type: 'inactivity',
      title: 'Your charts are waiting 👀',
      body: 'You haven’t analyzed a chart in 3 days. Ready for your next setup?',
      route: '/analysis',
      channelId: 'fxsnap-inactivity',
    };
  }

  return null;
}

export function getNotificationWeekKey(date: Date) {
  return startOfWeek(date).toISOString();
}

function isOutsideNotificationCooldown(input: NotificationCampaignInput) {
  return !input.lastNotificationAt || input.now.getTime() - input.lastNotificationAt.getTime() >= WEEKLY_NOTIFICATION_COOLDOWN_MS;
}
