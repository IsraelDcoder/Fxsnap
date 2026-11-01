import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommunityNotificationDestination } from '../services/communityNotificationNavigation';

const postId = '00000000-0000-4000-8000-000000000101';
const commentId = '00000000-0000-4000-8000-000000000102';

test('reply notifications open their root discussion and target the notified reply', () => {
  assert.deepEqual(getCommunityNotificationDestination({
    id: '00000000-0000-4000-8000-000000000201',
    kind: 'reply',
    object_id: commentId,
    post_id: postId,
  }), {
    pathname: '/community',
    params: { postId, commentId },
  });
});

test('post notifications open the discussion without a comment target', () => {
  assert.deepEqual(getCommunityNotificationDestination({
    id: '00000000-0000-4000-8000-000000000202',
    kind: 'reaction',
    object_id: postId,
    post_id: postId,
  }), {
    pathname: '/community',
    params: { postId },
  });
});

test('a reply without a resolved root still opens its referenced message', () => {
  assert.deepEqual(getCommunityNotificationDestination({
    id: '00000000-0000-4000-8000-000000000203',
    kind: 'reply',
    object_id: commentId,
    post_id: null,
  }), {
    pathname: '/community',
    params: { postId: commentId },
  });
});

test('system and support notifications open their respective screens', () => {
  assert.deepEqual(getCommunityNotificationDestination({
    id: 'announcement-1',
    kind: 'system_announcement',
    object_id: 'announcement-1',
    post_id: null,
  }), {
    pathname: '/system-announcement',
    params: { id: 'announcement-1' },
  });
  assert.deepEqual(getCommunityNotificationDestination({
    id: 'support-1',
    kind: 'support_reply',
    object_id: null,
    post_id: null,
  }), { pathname: '/community-support' });
});

test('malformed notification message IDs are rejected safely', () => {
  assert.equal(getCommunityNotificationDestination({
    id: 'notification-1',
    kind: 'reply',
    object_id: 'not-a-uuid',
    post_id: null,
  }), null);
});
