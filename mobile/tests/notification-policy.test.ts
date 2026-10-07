import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNotificationCampaign,
  isNotificationEligible,
  type NotificationCampaignInput,
} from '../services/notificationPolicy';

const baseInput: NotificationCampaignInput = {
  now: new Date('2026-10-07T09:00:00.000Z'),
  lastSeenAt: new Date('2026-10-03T09:00:00.000Z'),
  chartAnalysesThisWeek: 12,
  isSubscribed: false,
  hasNewDailyBrief: true,
  lastNotificationAt: null,
};

test('daily brief notifications contain useful activity and route to the brief', () => {
  const campaign = buildNotificationCampaign(baseInput);
  assert.equal(campaign?.type, 'daily-brief');
  assert.match(campaign?.body ?? '', /15 new forex insights/);
  assert.equal(campaign?.route, '/daily-brief');
});

test('inactivity notifications use the three-day threshold', () => {
  assert.equal(isNotificationEligible({ ...baseInput, lastSeenAt: new Date('2026-10-03T09:00:00.000Z') }), true);
  assert.equal(isNotificationEligible({ ...baseInput, lastSeenAt: new Date('2026-10-04T09:00:00.000Z') }), false);
});

test('weekly activity notifications are capped to one per week', () => {
  const weekly = buildNotificationCampaign({ ...baseInput, hasNewDailyBrief: false, chartAnalysesThisWeek: 12 });
  assert.equal(weekly?.type, 'weekly-overview');
  assert.match(weekly?.body ?? '', /12 charts this week/);
  assert.equal(isNotificationEligible({ ...baseInput, lastNotificationAt: new Date('2026-10-06T09:00:00.000Z') }), false);
});

test('subscribers get premium-specific content without a generic prompt', () => {
  const campaign = buildNotificationCampaign({ ...baseInput, isSubscribed: true, hasNewDailyBrief: false });
  assert.equal(campaign?.type, 'premium-ready');
  assert.match(campaign?.body ?? '', /Premium analysis/);
  assert.equal(campaign?.route, '/analysis');
});

test('notifications are suppressed outside the weekly cadence window', () => {
  const recentlyNotified = { ...baseInput, lastNotificationAt: new Date('2026-10-07T08:00:00.000Z') };
  assert.equal(isNotificationEligible(recentlyNotified), false);
  assert.equal(buildNotificationCampaign(recentlyNotified), null);
});
