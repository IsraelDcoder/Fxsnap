import assert from 'node:assert/strict';
import test from 'node:test';
import {
  communityPushCopy,
  communityPostDestinationParams,
  pushTicketRetryError,
  selectCommunityPushRecipients,
  shouldRetrySystemAnnouncementTicket,
  systemAnnouncementPushEnabled,
  systemAnnouncementRoute,
  type CommunityPushDevice,
} from '../../supabase/functions/community-push/policy';

const devices: Array<CommunityPushDevice & { device_id: string }> = [
  { account_id: 'author', device_id: 'author-phone' },
  { account_id: 'author', device_id: 'author-tablet' },
  { account_id: 'replier', device_id: 'replier-phone' },
  { account_id: 'other', device_id: 'other-phone' },
];

test('reply pushes go only to the replied-to author and exclude the replier', () => {
  const recipients = selectCommunityPushRecipients(devices, {
    event_type: 'reply',
    actor_account_id: 'replier',
    recipient_account_id: 'author',
  });

  assert.deepEqual(recipients.map((device) => device.device_id), ['author-phone', 'author-tablet']);
  assert.deepEqual(communityPushCopy('reply', 'market_maya'), {
    title: 'New Community reply',
    body: 'market_maya replied to your post or reply.',
  });
});

test('reaction pushes go only to the reacted-to author', () => {
  const recipients = selectCommunityPushRecipients(devices, {
    event_type: 'reaction',
    actor_account_id: 'replier',
    recipient_account_id: 'author',
  });

  assert.deepEqual(recipients.map((device) => device.device_id), ['author-phone', 'author-tablet']);
  assert.deepEqual(communityPushCopy('reaction', 'market_maya'), {
    title: 'New Community reaction',
    body: 'market_maya reacted to your post or reply.',
  });
});

test('new-post pushes retain community fan-out without notifying the author', () => {
  const recipients = selectCommunityPushRecipients(devices, {
    event_type: 'post',
    actor_account_id: 'author',
    recipient_account_id: null,
  });
  assert.deepEqual(recipients.map((device) => device.device_id), ['replier-phone', 'other-phone']);
});

test('community push destinations include only a valid root post ID', () => {
  const postId = '00000000-0000-4000-8000-000000000101';
  assert.deepEqual(communityPostDestinationParams(postId), { postId });
  assert.deepEqual(communityPostDestinationParams(null), {});
  assert.deepEqual(communityPostDestinationParams('not-a-post-id'), {});
});

test('interaction events without a recipient do not become community-wide pushes', () => {
  const recipients = selectCommunityPushRecipients(devices, {
    event_type: 'reply',
    actor_account_id: 'replier',
    recipient_account_id: null,
  });

  assert.deepEqual(recipients, []);
});

test('Expo ticket failures retry the event instead of marking it delivered', () => {
  assert.equal(pushTicketRetryError({
    status: 'error',
    message: 'Service unavailable',
    details: { error: 'ExpoServerError' },
  }), 'ExpoServerError: Service unavailable');
  assert.equal(pushTicketRetryError({ status: 'ok', id: 'ticket-1' }), null);
});

test('unregistered devices are removed without retrying already delivered recipients', () => {
  assert.equal(pushTicketRetryError({
    status: 'error',
    message: 'The recipient device is no longer registered.',
    details: { error: 'DeviceNotRegistered' },
  }), null);
});

test('system announcement push preferences and destinations are explicitly allowlisted', () => {
  assert.equal(systemAnnouncementPushEnabled({ systemAnnouncements: false }), false);
  assert.equal(systemAnnouncementPushEnabled({}), true);
  assert.equal(systemAnnouncementRoute('analysis'), '/analysis');
  assert.equal(systemAnnouncementRoute('/untrusted-route'), null);
});

test('system announcement Expo failures retry except for permanently unregistered devices', () => {
  assert.equal(shouldRetrySystemAnnouncementTicket({
    status: 'error',
    message: 'Service unavailable.',
    details: { error: 'ExpoServerError' },
  }), true);
  assert.equal(shouldRetrySystemAnnouncementTicket({
    status: 'error',
    message: 'Device is not registered.',
    details: { error: 'DeviceNotRegistered' },
  }), false);
});
