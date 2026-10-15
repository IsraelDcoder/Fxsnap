export type CommunityPushEventType = 'post' | 'reply' | 'reaction';

export interface CommunityPushEvent {
  event_type: CommunityPushEventType;
  actor_account_id: string;
  recipient_account_id: string | null;
}

export interface CommunityPushDevice {
  account_id: string;
}

export interface CommunityPushTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type SystemAnnouncementDestination =
  | 'home'
  | 'community'
  | 'analysis'
  | 'events'
  | 'profile'
  | 'notification_center';

export interface SystemAnnouncementPushPreference {
  systemAnnouncements?: unknown;
}

export function systemAnnouncementRoute(destination: string): string | null {
  const routes: Record<string, string> = {
    home: '/',
    community: '/community',
    analysis: '/analysis',
    events: '/events',
    profile: '/profile',
    notification_center: '/community-notifications',
  };
  return routes[destination] || null;
}

export function systemAnnouncementPushEnabled(preferences: SystemAnnouncementPushPreference | null) {
  return preferences?.systemAnnouncements !== false;
}

export function shouldRetrySystemAnnouncementTicket(ticket: CommunityPushTicket) {
  return ticket.details?.error !== 'DeviceNotRegistered';
}

export function selectCommunityPushRecipients<T extends CommunityPushDevice>(
  devices: T[],
  event: CommunityPushEvent,
): T[] {
  return devices.filter((device) => {
    if (device.account_id === event.actor_account_id) return false;
    if (event.event_type === 'post') return true;
    return event.recipient_account_id !== null && device.account_id === event.recipient_account_id;
  });
}

export function pushTicketRetryError(ticket: CommunityPushTicket): string | null {
  if (ticket.status === 'ok' && ticket.id) return null;
  if (ticket.details?.error === 'DeviceNotRegistered') return null;
  const code = ticket.details?.error;
  return `${code ? `${code}: ` : ''}${ticket.message || 'Expo did not accept the push notification.'}`;
}

export function communityPushCopy(eventType: CommunityPushEventType, username = 'Someone') {
  if (eventType === 'reply') {
    return { title: 'New Community reply', body: `${username} replied to your post or reply.` };
  }
  if (eventType === 'reaction') {
    return { title: 'New Community reaction', body: `${username} reacted to your post or reply.` };
  }
  return { title: 'New Community post', body: 'A new post is waiting in the FXSnap Community.' };
}

export function communityPostDestinationParams(postId: string | null) {
  return postId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)
    ? { postId }
    : {};
}
