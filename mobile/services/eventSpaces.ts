import { Platform } from 'react-native';
import { API_BASE_URL, getApiHeaders } from '@/services/apiAuth';
import { getFxsnapAccountApiHeaders } from '@/services/account';
import { getSupabaseClient } from '@/services/supabase';

const LOCAL_DEMO_STORAGE_KEY = 'fxsnap:localEventSpacesDemo:v1';
const LOCAL_DEMO_HOST_ID = 'local-demo-host';

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

export function isLocalEventsDemoEnabled(value: string | string[] | undefined) {
  return value === '1' && Platform.OS === 'web' && __DEV__;
}

function assertLocalDemo(demo: boolean) {
  if (!demo) return false;
  if (Platform.OS !== 'web' || !__DEV__) {
    throw new Error('The local Events preview is only available in a development web build.');
  }
  return true;
}

function readLocalDemoSpaces(): EventSpace[] {
  if (typeof window === 'undefined') {
    throw new Error('Local Events preview data is unavailable outside the browser.');
  }
  try {
    const stored = window.localStorage.getItem(LOCAL_DEMO_STORAGE_KEY);
    if (!stored) return [];
    const spaces: unknown = JSON.parse(stored);
    if (!Array.isArray(spaces) || spaces.some((space) => !space || typeof space !== 'object' || typeof space.id !== 'string' || typeof space.title !== 'string')) {
      throw new Error('Stored local Events preview data has an invalid format.');
    }
    return spaces as EventSpace[];
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Stored local Events preview data')) throw error;
    throw new Error('Could not read local Events preview data from this browser.');
  }
}

function writeLocalDemoSpaces(spaces: EventSpace[]) {
  if (typeof window === 'undefined') {
    throw new Error('Local Events preview data is unavailable outside the browser.');
  }
  try {
    window.localStorage.setItem(LOCAL_DEMO_STORAGE_KEY, JSON.stringify(spaces));
  } catch {
    throw new Error('Could not save local Events preview data in this browser.');
  }
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

export async function getEventSpaces(demo = false) {
  if (assertLocalDemo(demo)) {
    return {
      spaces: readLocalDemoSpaces().filter((space) =>
        space.visibility === 'public' && ['scheduled', 'waiting_room_open', 'live'].includes(space.status)),
    };
  }
  return request<{ spaces: EventSpace[] }>('/api/events/spaces');
}

export async function getEventSpace(id: string, demo = false) {
  if (assertLocalDemo(demo)) {
    const space = readLocalDemoSpaces().find((item) => item.id === id);
    if (!space) throw new Error('This local preview event could not be found.');
    return { space };
  }
  return request<{ space: EventSpace }>(
    `/api/events/spaces/${encodeURIComponent(id)}`,
    undefined,
    true,
  );
}

export async function getAdminEventSpaceAccess(demo = false) {
  if (assertLocalDemo(demo)) {
    return { allowed: true, accountId: LOCAL_DEMO_HOST_ID, hostName: 'Demo Host' };
  }
  return request<{ allowed: boolean; accountId: string; hostName: string }>(
    '/api/admin/event-spaces/access',
    undefined,
    true,
  );
}

export async function getAdminEventSpaces(demo = false) {
  if (assertLocalDemo(demo)) return { spaces: readLocalDemoSpaces() };
  return request<{ spaces: EventSpace[] }>('/api/admin/event-spaces', undefined, true);
}

export async function getEventHosts(demo = false) {
  if (assertLocalDemo(demo)) {
    return {
      hosts: [{ accountId: LOCAL_DEMO_HOST_ID, username: 'demo_host', pictureUrl: null }],
    };
  }
  return request<{ hosts: EventHost[] }>('/api/admin/event-spaces/hosts', undefined, true);
}

export async function createEventSpace(space: EventSpaceDraft, demo = false) {
  if (assertLocalDemo(demo)) {
    const now = new Date().toISOString();
    const created: EventSpace = {
      id: `local-demo-${Date.now()}`,
      title: space.title,
      description: space.description,
      topic: space.topic,
      visibility: space.visibility,
      status: space.status,
      host_account_id: space.hostAccountId || LOCAL_DEMO_HOST_ID,
      host_name: 'Demo Host',
      host_picture_url: null,
      scheduled_at: space.scheduledAt,
      timezone: space.timezone,
      waiting_room_opens_at: space.waitingRoomOpensAt,
      duration_minutes: space.durationMinutes,
      allow_speaking_requests: space.allowSpeakingRequests,
      comments_enabled: space.commentsEnabled,
      featured: space.featured,
      cancellation_reason: null,
      created_at: now,
      updated_at: now,
    };
    writeLocalDemoSpaces([created, ...readLocalDemoSpaces()]);
    return { space: created };
  }
  return request<{ space: EventSpace }>('/api/admin/event-spaces', json(space), true);
}

export async function goLiveEventSpace(space: EventSpaceDraft, demo = false) {
  if (assertLocalDemo(demo)) {
    const { space: created } = await createEventSpace({
      ...space,
      scheduledAt: null,
      waitingRoomOpensAt: null,
      status: 'draft',
    }, true);
    const updated = { ...created, status: 'live' as const, updated_at: new Date().toISOString() };
    writeLocalDemoSpaces(readLocalDemoSpaces().map((item) => item.id === created.id ? updated : item));
    return { space: updated };
  }
  return request<{ space: EventSpace }>('/api/admin/event-spaces/go-live', json({
    ...space,
    scheduledAt: null,
    waitingRoomOpensAt: null,
    status: 'draft',
  }), true);
}

export async function updateEventSpace(id: string, changes: Partial<EventSpaceDraft>, demo = false) {
  if (assertLocalDemo(demo)) {
    const spaces = readLocalDemoSpaces();
    const index = spaces.findIndex((space) => space.id === id);
    if (index < 0) throw new Error('This local preview event could not be found.');
    const current = spaces[index];
    const {
      hostAccountId,
      scheduledAt,
      waitingRoomOpensAt,
      durationMinutes,
      allowSpeakingRequests,
      commentsEnabled,
      featured,
      ...spaceChanges
    } = changes;
    const updated: EventSpace = {
      ...current,
      ...spaceChanges,
      host_account_id: hostAccountId || current.host_account_id,
      scheduled_at: scheduledAt === undefined ? current.scheduled_at : scheduledAt,
      waiting_room_opens_at: waitingRoomOpensAt === undefined ? current.waiting_room_opens_at : waitingRoomOpensAt,
      duration_minutes: durationMinutes === undefined ? current.duration_minutes : durationMinutes,
      allow_speaking_requests: allowSpeakingRequests === undefined ? current.allow_speaking_requests : allowSpeakingRequests,
      comments_enabled: commentsEnabled === undefined ? current.comments_enabled : commentsEnabled,
      featured: featured === undefined ? current.featured : featured,
      updated_at: new Date().toISOString(),
    };
    spaces[index] = updated;
    writeLocalDemoSpaces(spaces);
    return { space: updated };
  }
  return request<{ space: EventSpace }>(`/api/admin/event-spaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }, true);
}

export async function transitionEventSpace(id: string, action: 'publish' | 'open_waiting_room' | 'cancel' | 'archive', reason?: string, demo = false) {
  if (assertLocalDemo(demo)) {
    if (action === 'open_waiting_room') {
      throw new Error('LiveKit room controls are not available in the local preview.');
    }
    const spaces = readLocalDemoSpaces();
    const index = spaces.findIndex((space) => space.id === id);
    if (index < 0) throw new Error('This local preview event could not be found.');
    const status: EventSpaceStatus = action === 'publish'
      ? 'scheduled'
      : action === 'cancel' ? 'cancelled' : 'archived';
    spaces[index] = {
      ...spaces[index],
      status,
      cancellation_reason: action === 'cancel' ? reason || null : spaces[index].cancellation_reason,
      updated_at: new Date().toISOString(),
    };
    writeLocalDemoSpaces(spaces);
    return { space: spaces[index] };
  }
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

export async function manageEventLifecycle(id: string, action: 'start_live' | 'end_live', demo = false) {
  if (assertLocalDemo(demo)) {
    throw new Error('LiveKit audio controls are not available in the local Events preview.');
  }
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
