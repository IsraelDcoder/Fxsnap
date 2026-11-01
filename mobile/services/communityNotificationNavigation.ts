import type { CommunityNotification } from '@/services/community';

export type CommunityNotificationDestination =
  | { pathname: '/system-announcement'; params: { id: string } }
  | { pathname: '/community-support' }
  | { pathname: '/community'; params: { postId: string; commentId?: string } };

function isCommunityMessageId(value: string | null | undefined): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getCommunityNotificationDestination(
  notification: Pick<CommunityNotification, 'id' | 'kind' | 'object_id' | 'post_id'>,
): CommunityNotificationDestination | null {
  if (notification.kind === 'system_announcement') {
    return { pathname: '/system-announcement', params: { id: notification.id } };
  }
  if (notification.kind === 'support_reply') return { pathname: '/community-support' };

  const postId = isCommunityMessageId(notification.post_id)
    ? notification.post_id
    : isCommunityMessageId(notification.object_id) ? notification.object_id : null;
  if (!postId) return null;

  const commentId = notification.object_id !== postId && isCommunityMessageId(notification.object_id)
    ? notification.object_id
    : undefined;
  return { pathname: '/community', params: { postId, ...(commentId ? { commentId } : {}) } };
}
