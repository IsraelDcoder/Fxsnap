import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, fetchWithApiAuth, getApiHeaders } from '@/services/apiAuth';

const ACCOUNT_PROFILE_CACHE_KEY = 'fxsnap:accountProfile:v1';

export interface FxsnapAccount {
  userId: string;
  provider: 'anonymous';
  displayName: string;
  pictureUrl: string | null;
  communityUsername: string;
  status: 'active';
  createdAt: string;
}

export type CachedFxsnapProfile = Pick<FxsnapAccount, 'displayName' | 'pictureUrl' | 'communityUsername'>;
export type FxsnapAccountData = Record<string, unknown>;

function isCachedFxsnapProfile(value: unknown): value is CachedFxsnapProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<CachedFxsnapProfile>;
  return typeof profile.displayName === 'string'
    && (typeof profile.pictureUrl === 'string' || profile.pictureUrl === null)
    && typeof profile.communityUsername === 'string';
}

async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithApiAuth(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(await getApiHeaders()), ...(init?.headers || {}) },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Account request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getCachedFxsnapProfile(): Promise<CachedFxsnapProfile | null> {
  const stored = await AsyncStorage.getItem(ACCOUNT_PROFILE_CACHE_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isCachedFxsnapProfile(parsed)) return parsed;
    throw new Error('Cached profile has an invalid shape.');
  } catch (error) {
    console.error('[Account] Cached profile could not be loaded.', error);
    await AsyncStorage.removeItem(ACCOUNT_PROFILE_CACHE_KEY);
    return null;
  }
}

export async function cacheFxsnapAccount(account: FxsnapAccount): Promise<void> {
  const profile: CachedFxsnapProfile = {
    displayName: account.displayName,
    pictureUrl: account.pictureUrl,
    communityUsername: account.communityUsername,
  };
  await AsyncStorage.setItem(ACCOUNT_PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export async function getAnonymousAccount(): Promise<FxsnapAccount> {
  const payload = await accountRequest<{ account?: FxsnapAccount }>('/api/account');
  if (!payload.account || payload.account.provider !== 'anonymous' || !payload.account.userId) {
    throw new Error('The server could not initialize this device profile.');
  }
  await cacheFxsnapAccount(payload.account);
  return payload.account;
}

export async function getFxsnapAccountApiHeaders(): Promise<Record<string, string>> {
  return getApiHeaders();
}

export async function getOptionalFxsnapAccountApiHeaders(): Promise<Record<string, string>> {
  return getApiHeaders();
}

export async function getFxsnapAccountData(): Promise<FxsnapAccountData | null> {
  const payload = await accountRequest<{ data?: { data?: FxsnapAccountData } | null }>('/api/account/data');
  return payload.data?.data || null;
}

export async function saveFxsnapAccountData(data: FxsnapAccountData): Promise<void> {
  await accountRequest('/api/account/data', {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}
