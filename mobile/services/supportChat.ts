import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { API_BASE_URL } from '@/services/apiAuth';
import { getFxsnapAccountApiHeaders } from '@/services/account';
import { getSupabaseClient } from '@/services/supabase';

export type SupportStatus = 'open' | 'pending' | 'resolved';
export type SupportTopic = 'account' | 'billing' | 'analysis' | 'navigation' | 'other';

export interface SupportChatMessage {
  id: string;
  sender_kind: 'member' | 'admin';
  body: string;
  created_at: string;
}

export interface SupportConversation {
  id: string;
  status: SupportStatus;
  topic: SupportTopic | null;
  created_at: string;
  updated_at: string;
}

export interface SupportAdminConversation extends SupportConversation {
  account_id: string;
  display_name: string | null;
  subscription_status: 'active' | 'free' | 'unavailable';
  app_version: string | null;
  platform: 'ios' | 'android' | 'web' | 'unknown' | null;
  admin_last_read_at: string | null;
  latest_message: string;
  latest_message_at: string;
  unread_count: number;
}

export interface SupportContext {
  appVersion: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
}

function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const part = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${part()}${part()}-${part()}-4${part().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${part().slice(1)}-${part()}${part()}${part()}`;
}

export function getSupportContext(): SupportContext {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'unknown';
  return {
    appVersion: Application.nativeApplicationVersion || Constants.expoConfig?.version || 'unknown',
    platform,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getFxsnapAccountApiHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Support request failed (${response.status}).`;
    throw new Error(error);
  }
  return payload as T;
}

export function getSupportConversation() {
  return request<{ conversation: SupportConversation | null; messages: SupportChatMessage[] }>('/api/support/conversation');
}

export function sendSupportChatMessage(body: string, topic: SupportTopic, context: SupportContext, clientMessageId = newId()) {
  return request<{ message: SupportChatMessage; duplicate: boolean }>('/api/support/conversation/messages', {
    method: 'POST',
    body: JSON.stringify({ body, topic, ...context, clientMessageId }),
  });
}

export function getSupportAdminAccess() {
  return request<{ allowed: boolean }>('/api/admin/support/access');
}

export function getSupportAdminInbox(query = '') {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<{ conversations: SupportAdminConversation[] }>(`/api/admin/support/conversations${suffix}`);
}

export function getSupportAdminConversation(id: string) {
  return request<{
    conversation: Pick<SupportAdminConversation,
      'id' | 'account_id' | 'display_name' | 'subscription_status' | 'app_version'
      | 'platform' | 'topic' | 'status' | 'created_at' | 'updated_at'
    >;
    messages: Array<SupportChatMessage & { sender_account_id: string }>;
  }>(`/api/admin/support/conversations/${encodeURIComponent(id)}`);
}

export function sendSupportAdminReply(id: string, body: string, clientMessageId = newId()) {
  return request<{ message: SupportChatMessage; duplicate: boolean }>(`/api/admin/support/conversations/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ body, clientMessageId }),
  });
}

export function updateSupportConversationStatus(id: string, status: SupportStatus) {
  return request<{ updated: boolean }>(`/api/admin/support/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function subscribeToSupportConversation(id: string, onMessage: () => void) {
  const client = getSupabaseClient();
  const channel = client
    .channel(`fxsnap-support-${id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'fxsnap_support_messages',
      filter: `conversation_id=eq.${id}`,
    }, onMessage)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Support] Realtime subscription failed; polling fallback remains active.', status);
      }
    });
  return () => { void client.removeChannel(channel); };
}
