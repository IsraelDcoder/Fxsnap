export type CommunityPushEventType = 'post' | 'reply' | 'reaction';

export interface CommunityPushEvent {
  event_type: CommunityPushEventType;
  actor_account_id: string;
  recipient_account_id: string | null;
}

export interface CommunityPushDevice {
  account_id: string;
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

export function communityPushCopy(eventType: CommunityPushEventType, username = 'Someone') {
  if (eventType === 'reply') {
    return { title: 'New Community reply', body: `${username} replied to your post or reply.` };
  }
  if (eventType === 'reaction') {
    return { title: 'New Community reaction', body: `${username} reacted to your post or reply.` };
  }
  return { title: 'New Community post', body: 'A new post is waiting in the FXSnap Community.' };
}
