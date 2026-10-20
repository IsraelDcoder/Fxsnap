import { API_BASE_URL, getApiHeaders } from '@/services/apiAuth';
import { getFxsnapAccountApiHeaders } from '@/services/account';
import { getSupabaseClient } from '@/services/supabase';

export type EventSpaceStatus =
  | 'draft'
  | 'scheduled'
  | 'waiting_room_open'
  | 'live'
  | 'ended'
  | 'cancelled'
  | 'archived';

export interface EventSpace {
  id: string;
  title: string;
  description: string;
  topic: string;
  visibility: 'public' | 'private';
  status: EventSpaceStatus;
  host_account_id: string;
  host_name: string;
  host_picture_url: string | null;
  scheduled_at: string | null;
  timezone: string;
  waiting_room_opens_at: string | null;
  duration_minutes: number | null;
  allow_speaking_requests: boolean;
  comments_enabled: boolean;
  featured: boolean;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSpaceDraft {
  title: string;
  description: string;
  topic: string;
  visibility: 'public' | 'private';
  hostAccountId?: string;
  scheduledAt: string | null;
  timezone: string;
  waitingRoomOpensAt: string | null;
  durationMinutes: number | null;
  allowSpeakingRequests: boolean;
  commentsEnabled: boolean;
  featured: boolean;
  status: 'draft' | 'scheduled';
}

export interface EventHost {
  accountId: string;
  username: string;
  pictureUrl: string | null;
}

export interface EventParticipant {
  accountId?: string;
  displayName: string;
  status: 'waiting' | 'listener' | 'speaker_requested' | 'speaker' | 'removed';
  online: boolean;
}

export interface EventRoomAccess {
  status: 'waiting' | 'live';
  role?: 'host' | 'listener' | 'speaker';
  token?: string;
  serverUrl?: string;
}

async function request<T>(path: string, init?: RequestInit, account = false): Promise<T> {
  const headers = account ? await getFxsnapAccountApiHeaders() : await getApiHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('The Events service could not be reached. Check your connection and try again.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Events request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return payload as T;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export async function getEventSpaces() {
  return request<{ spaces: EventSpace[] }>('/api/events/spaces');
}

export async function getEventSpace(id: string) {
  return request<{ space: EventSpace }>(
    `/api/events/spaces/${encodeURIComponent(id)}`,
    undefined,
    true,
  );
}

export async function getAdminEventSpaceAccess() {
  return request<{ allowed: boolean; accountId: string; hostName: string }>(
    '/api/admin/event-spaces/access',
    undefined,
    true,
  );
}

export async function getAdminEventSpaces() {
  return request<{ spaces: EventSpace[] }>('/api/admin/event-spaces', undefined, true);
}

export async function getEventHosts() {
  return request<{ hosts: EventHost[] }>('/api/admin/event-spaces/hosts', undefined, true);
}

export async function createEventSpace(space: EventSpaceDraft) {
  return request<{ space: EventSpace }>('/api/admin/event-spaces', json(space), true);
}

export async function updateEventSpace(id: string, changes: Partial<EventSpaceDraft>) {
  return request<{ space: EventSpace }>(`/api/admin/event-spaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }, true);
}

export async function transitionEventSpace(id: string, action: 'publish' | 'open_waiting_room' | 'cancel' | 'archive', reason?: string) {
  return request<{ space: EventSpace }>(`/api/admin/event-spaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, reason }),
  }, true);
}

export async function joinEventSpace(id: string) {
  return request<EventRoomAccess>(`/api/events/spaces/${encodeURIComponent(id)}/join`, {
    method: 'POST',
  }, true);
}

export async function leaveEventSpace(id: string) {
  return request<{ left: boolean }>(`/api/events/spaces/${encodeURIComponent(id)}/leave`, {
    method: 'POST',
  }, true);
}

export async function getEventParticipants(id: string) {
  return request<{
    isHost: boolean;
    ownStatus: EventParticipant['status'] | null;
    allowSpeakingRequests: boolean;
    roster: EventParticipant[];
  }>(`/api/events/spaces/${encodeURIComponent(id)}/participants`, undefined, true);
}

export async function requestToSpeak(id: string) {
  return request<{ requested: boolean; status: EventParticipant['status'] }>(
    `/api/events/spaces/${encodeURIComponent(id)}/speak`,
    { method: 'POST' },
    true,
  );
}

export async function moderateEventParticipant(
  id: string,
  accountId: string,
  action: 'admit' | 'approve_speaker' | 'decline_speaker' | 'remove_speaker' | 'remove',
) {
  return request<{ participant?: EventParticipant; removed?: boolean }>(
    `/api/admin/event-spaces/${encodeURIComponent(id)}/participants/${encodeURIComponent(accountId)}`,
    { method: 'POST', body: JSON.stringify({ action }) },
    true,
  );
}

export async function manageEventLifecycle(id: string, action: 'start_live' | 'end_live') {
  return request<{ space: EventSpace }>(
    `/api/events/spaces/${encodeURIComponent(id)}/lifecycle`,
    { method: 'POST', body: JSON.stringify({ action }) },
    true,
  );
}

export function subscribeToEventSpaceChanges(onChange: () => void) {
  const client = getSupabaseClient();
  const channel = client
    .channel(`fxsnap-event-spaces-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'fxsnap_event_spaces',
    }, onChange)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Events] Realtime space updates failed.', status);
      }
    });
  return () => { void client.removeChannel(channel); };
}
