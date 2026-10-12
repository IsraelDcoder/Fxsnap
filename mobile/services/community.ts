import { Platform, Share, type View } from 'react-native';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { API_BASE_URL } from '@/services/apiAuth';
import { getFxsnapAccountApiHeaders } from '@/services/account';
import { getSupabaseClient } from '@/services/supabase';
import { handleCommunityPreviewRequest } from '@/services/communityPreview';

export const COMMUNITY_RULES_VERSION = 'community-rules-v1';
export const COMMUNITY_CATEGORIES = [
  { id: 'trading', label: 'Trading' },
  { id: 'investing', label: 'Investing' },
  { id: 'finance', label: 'Finance' },
  { id: 'market_discussion', label: 'Market Discussion' },
  { id: 'learning', label: 'Learning' },
  { id: 'chart_analysis', label: 'Chart Analysis' },
  { id: 'questions', label: 'Questions' },
  { id: 'events', label: 'Events & Announcements' },
] as const;

export type CommunityCategory = typeof COMMUNITY_CATEGORIES[number]['id'];
export type CommunityFeed = 'global' | 'following';
export type CommunityReaction = 'love' | 'fire' | 'funny' | 'clap' | 'wow';
export const COMMUNITY_REACTIONS: Array<{ id: CommunityReaction; emoji: string; label: string }> = [
  { id: 'love', emoji: '❤️', label: 'Love' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'funny', emoji: '😂', label: 'Funny' },
  { id: 'clap', emoji: '👏', label: 'Clap' },
  { id: 'wow', emoji: '😮', label: 'Wow' },
];
export type CommunitySearchKind = 'posts' | 'people' | 'topics';

export interface CommunityProfile {
  accountId: string;
  username: string;
  pictureUrl?: string | null;
  status: 'active' | 'muted' | 'suspended' | 'banned';
  mutedUntil: string | null;
  joinedAt: string;
  rulesVersion: string;
  isAdmin: boolean;
}

export interface CommunityMessage {
  id: string;
  clientMessageId: string;
  authorAccountId: string;
  authorUsername: string;
  authorPictureUrl: string | null;
  isOfficial: boolean;
  isFollowed: boolean;
  kind: 'text' | 'signal' | 'analysis' | 'announcement';
  category: CommunityCategory | null;
  body: string;
  payload: Record<string, unknown>;
  replyTo: {
    id: string;
    author_username: string;
    body: string;
    kind: string;
    removed_at: string | null;
  } | null;
  pinnedAt: string | null;
  createdAt: string;
  commentCount: number;
  viewCount: number;
  shareCount: number;
  removed: boolean;
  reactions: Array<{ reaction: CommunityReaction | 'like'; count: number; reacted: boolean }>;
}

export interface CommunityPage {
  messages: CommunityMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  followingEmpty?: boolean;
}

export interface CommunityCommentPage {
  comments: CommunityMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunityMember {
  accountId: string;
  username: string;
  pictureUrl: string | null;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isCurrentUser: boolean;
  posts: CommunityMessage[];
}

export interface CommunitySearchResults {
  posts: CommunityMessage[];
  people: Array<Pick<CommunityMember, 'accountId' | 'username' | 'pictureUrl'>>;
  topics: Array<{ id: CommunityCategory; label: string }>;
}

export interface CommunityNotification {
  id: string;
  kind: string;
  message: string;
  object_id: string | null;
  post_id?: string | null;
  read_at: string | null;
  created_at: string;
}

export interface CommunityAnalysisSnapshot {
  source: 'fxsnap_ai';
  sourceAnalysisId: string;
  sourceCreatedAt: string;
  status: string;
  pair: string;
  timeframe: string | null;
  direction: string | null;
  entry: string | null;
  stopLoss: string | null;
  takeProfits: string[];
  riskReward?: number | string | null;
  marketBias: string | null;
  reasoning: string[];
  imageUrl?: string | null;
}

function newId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const part = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${part()}${part()}-${part()}-4${part().slice(1)}-${((8 + Math.floor(Math.random() * 4)).toString(16))}${part().slice(1)}-${part()}${part()}${part()}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (Platform.OS === 'web') {
    if (__DEV__) {
      const previewResponse = await handleCommunityPreviewRequest(path, init);
      const previewPayload: unknown = await previewResponse.json();
      if (!previewResponse.ok) {
        const message = previewPayload && typeof previewPayload === 'object' && 'error' in previewPayload
          && typeof previewPayload.error === 'string'
          ? previewPayload.error
          : `Community preview request failed (${previewResponse.status}).`;
        throw new Error(message);
      }
      return previewPayload as T;
    }
    throw new Error('FXSnap Community is currently available in the mobile app.');
  }
  const headers = await getFxsnapAccountApiHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Community request failed (${response.status}).`;
    const error = new Error(message) as Error & { status?: number; onboardingRequired?: boolean };
    error.status = response.status;
    error.onboardingRequired = Boolean(payload && typeof payload === 'object' && 'onboardingRequired' in payload && payload.onboardingRequired === true);
    throw error;
  }
  return payload as T;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export async function getCommunityMe() {
  return request<{ rulesVersion: string; profile: CommunityProfile | null }>('/api/community/me');
}

export async function checkCommunityUsername(username: string) {
  const query = new URLSearchParams({ value: username.trim().toLowerCase() });
  return request<{ available: boolean; reason: string | null }>(`/api/community/username?${query}`);
}

export async function joinCommunity(username: string) {
  return request<{ profile: CommunityProfile }>('/api/community/join', json({
    username: username.trim().toLowerCase(),
    acceptedRulesVersion: COMMUNITY_RULES_VERSION,
  }));
}

export async function updateCommunityUsername(username: string) {
  return request<{ profile: CommunityProfile }>('/api/community/profile', {
    method: 'PATCH',
    body: JSON.stringify({ username: username.trim().toLowerCase() }),
  });
}

export async function getCommunityMessages(options: {
  feed: CommunityFeed;
  category: CommunityCategory | null;
  before?: string | null;
  limit?: number;
}) {
  const query = new URLSearchParams({ feed: options.feed, limit: String(options.limit || 30) });
  if (options.category) query.set('category', options.category);
  if (options.before) query.set('before', options.before);
  return request<CommunityPage>(`/api/community/messages?${query}`);
}

export async function searchCommunity(query: string, kind: CommunitySearchKind) {
  const params = new URLSearchParams({ q: query.trim(), kind });
  return request<CommunitySearchResults>(`/api/community/search?${params}`);
}

export async function getCommunityMember(username: string) {
  return request<{ member: CommunityMember }>(
    `/api/community/members/${encodeURIComponent(username)}`,
  );
}

export async function getCommunityPost(postId: string) {
  return request<{ post: CommunityMessage }>(`/api/community/messages/${encodeURIComponent(postId)}`);
}

export async function publishCommunityMessage(input: {
  kind: 'text' | 'signal' | 'analysis' | 'announcement';
  category: CommunityCategory;
  body: string;
  payload?: Record<string, unknown>;
  replyToId?: string | null;
  clientMessageId?: string;
}) {
  return request<{ message: CommunityMessage; duplicate: boolean }>('/api/community/messages', json({
    ...input,
    clientMessageId: input.clientMessageId || newId(),
  }));
}

export async function updateCommunityMessage(
  messageId: string,
  input: {
    body: string;
    category: CommunityCategory;
    imageUrl?: string | null;
    imageWidth?: number;
    imageHeight?: number;
  },
) {
  return request<{ message: CommunityMessage }>(
    `/api/community/messages/${encodeURIComponent(messageId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export async function deleteCommunityMessage(messageId: string) {
  return request<{ removed: boolean }>(
    `/api/community/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );
}

export async function getCommunityComments(postId: string, before?: string | null) {
  const query = new URLSearchParams({ limit: '30' });
  if (before) query.set('before', before);
  return request<CommunityCommentPage>(`/api/community/messages/${encodeURIComponent(postId)}/comments?${query}`);
}

export async function getCommunityReplies(postId: string, parentId: string) {
  const query = new URLSearchParams({ limit: '30', parentId });
  return request<CommunityCommentPage>(`/api/community/messages/${encodeURIComponent(postId)}/comments?${query}`);
}

export async function publishCommunityComment(
  postId: string,
  body: string,
  clientMessageId = newId(),
  replyToId?: string,
) {
  return request<{ message: CommunityMessage; duplicate: boolean }>(
    `/api/community/messages/${encodeURIComponent(postId)}/comments`,
    json({ body, clientMessageId, ...(replyToId ? { replyToId } : {}) }),
  );
}

export async function toggleCommunityReaction(messageId: string, reaction: CommunityReaction) {
  return request<{
    reacted: boolean;
    selectedReaction: CommunityReaction | null;
    reactions: CommunityMessage['reactions'];
  }>(
    `/api/community/messages/${encodeURIComponent(messageId)}/reactions`,
    json({ reaction }),
  );
}

export async function recordCommunityViews(messageIds: string[]) {
  return request<{ views: Array<{ messageId: string; viewCount: number }> }>(
    '/api/community/views',
    json({ messageIds }),
  );
}

export async function recordCommunityShare(messageId: string) {
  return request<{ shareCount: number }>(
    `/api/community/messages/${encodeURIComponent(messageId)}/shares`,
    json({}),
  );
}

export async function getCommunityFollows() {
  return request<{ following: Array<{ accountId: string; username: string; createdAt: string }> }>('/api/community/follows');
}

export async function followCommunityMember(username: string) {
  return request<{ following: boolean }>('/api/community/follows', json({ username }));
}

export async function unfollowCommunityMember(username: string) {
  return request<{ following: boolean }>(`/api/community/follows/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export async function uploadCommunityImage(asset: ImagePicker.ImagePickerAsset) {
  const base64 = asset.base64;
  const mimeType = asset.mimeType || 'image/jpeg';
  if (!base64 || base64.length > 4_200_000) throw new Error('Choose an image under 3 MB and try again.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('Choose a JPEG, PNG, or WebP chart image.');
  }
  return request<{ imageUrl: string }>('/api/community/upload', json({ mimeType, data: base64 }));
}

export async function reportCommunityMessage(messageId: string, reason: string, explanation = '') {
  return request<{ reported: boolean }>('/api/community/reports', json({ messageId, reason, explanation }));
}

export async function blockCommunityMember(username: string) {
  return request<{ blocked: boolean }>('/api/community/blocks', json({ username }));
}

export async function getCommunityBlocks() {
  return request<{ blocks: Array<{ accountId: string; username: string; createdAt: string }> }>('/api/community/blocks');
}

export async function unblockCommunityMember(accountId: string) {
  return request<{ blocked: boolean }>(`/api/community/blocks/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

export async function getCommunityNotifications() {
  return request<{ notifications: CommunityNotification[] }>('/api/community/notifications');
}

export async function markCommunityNotificationRead(id: string) {
  return request<{ read: boolean }>(`/api/community/notifications/${encodeURIComponent(id)}/read`, json({}));
}

export interface CommunitySupportMessage {
  id: string;
  sender_kind: 'member' | 'admin';
  body: string;
  created_at: string;
}

export interface CommunityAdminReport {
  id: string;
  reporter_account_id: string;
  target_account_id: string;
  message_id: string;
  reason: string;
  explanation: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface CommunityAdminConversation {
  id: string;
  account_id: string;
  username: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  updated_at: string;
}

export async function getCommunitySupport() {
  return request<{
    conversation: { id: string; status: string } | null;
    messages: CommunitySupportMessage[];
  }>('/api/community/support');
}

export async function sendCommunitySupportMessage(body: string, clientMessageId = newId()) {
  return request<{ message: CommunitySupportMessage; duplicate: boolean }>(
    '/api/community/support',
    json({ body, clientMessageId }),
  );
}

export async function getCommunityAdminReports() {
  return request<{ reports: CommunityAdminReport[] }>('/api/admin/community/reports');
}

export async function getCommunityAdminSupportInbox() {
  return request<{ conversations: CommunityAdminConversation[] }>('/api/admin/community/support');
}

export async function getCommunityAdminConversation(id: string) {
  return request<{
    conversation: { id: string; account_id: string; status: 'open' | 'in_progress' | 'resolved' };
    messages: Array<CommunitySupportMessage & { sender_account_id: string }>;
  }>(`/api/admin/community/support/${encodeURIComponent(id)}`);
}

export async function sendCommunityAdminReply(id: string, body: string, clientMessageId = newId()) {
  return request<{ message: CommunitySupportMessage; duplicate: boolean }>(
    `/api/admin/community/support/${encodeURIComponent(id)}`,
    json({ body, clientMessageId }),
  );
}

export async function setCommunitySupportStatus(id: string, status: 'open' | 'in_progress' | 'resolved') {
  return request<{ updated: boolean }>(`/api/admin/community/support/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateCommunityAdminReport(id: string, status: 'reviewing' | 'resolved' | 'dismissed') {
  return request<{ updated: boolean }>('/api/admin/community/reports', {
    method: 'PATCH',
    body: JSON.stringify({ reportId: id, status }),
  });
}

export async function getCommunityAdminReportQueue() {
  return getCommunityAdminReports();
}

export async function moderateCommunity(input: {
  action: 'warn' | 'mute' | 'suspend' | 'ban' | 'unmute' | 'unsuspend' | 'unban' | 'remove_message' | 'pin' | 'unpin';
  username?: string;
  messageId?: string;
  durationHours?: number;
  explanation?: string;
}) {
  return request<{ accepted: boolean }>('/api/admin/community/moderation', json(input));
}

export async function shareCommunityPost(message: CommunityMessage, cardView: View | null) {
  if (Platform.OS === 'web') throw new Error('Post sharing is available in the FXSnap mobile app.');
  if (!cardView) {
    const text = `@${message.authorUsername} in FXSnap Community\n\n${message.body}\n\n${message.kind === 'analysis' ? 'FXSnap AI analysis — shared as originally generated; not financial advice.' : 'Trading discussion for education, not a guaranteed outcome.'}`;
    const url = Linking.createURL(`/community?postId=${encodeURIComponent(message.id)}`);
    const result = await Share.share({ message: `${text}\n\n${url}`, url });
    if (result.action !== Share.sharedAction) return null;
    try {
      const recorded = await recordCommunityShare(message.id);
      return recorded.shareCount;
    } catch (error) {
      console.warn('The post was shared, but its Community share count could not be updated.', error instanceof Error ? error.message : error);
      return null;
    }
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Image sharing is not available on this device.');
  const imageUri = await captureRef(cardView, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(imageUri, {
    dialogTitle: `Share @${message.authorUsername}'s Community post`,
    mimeType: 'image/png',
    UTI: 'public.png',
  });
  return null;
}

export function subscribeToCommunityChanges(onChange: (eventType: string | null) => void) {
  const channel = getSupabaseClient()
    .channel(`fxsnap-community-${newId()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'fxsnap_community_events',
    }, (payload) => {
      const eventType = payload.new && typeof payload.new.event_type === 'string'
        ? payload.new.event_type
        : null;
      onChange(eventType);
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Community] Realtime feed subscription failed.', status);
      }
    });
  return () => { void getSupabaseClient().removeChannel(channel); };
}

export function createCommunityClientId() {
  return newId();
}
