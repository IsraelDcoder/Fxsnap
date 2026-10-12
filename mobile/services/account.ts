import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getApiHeaders, resolveApiBaseUrl } from '@/services/apiAuth';
import { getSupabaseClient, hasSupabaseConfiguration } from '@/services/supabase';
import { createCommunityPreviewAccount } from '@/services/communityPreview';

const ACCOUNT_TOKEN_KEY = 'fxsnapaccountSessionv1';
const API_URL = resolveApiBaseUrl();
let pendingGoogleCallback: { code: string; promise: Promise<FxsnapAccount> } | null = null;

export interface FxsnapAccount {
  provider: 'google';
  email: string;
  emailVerified: boolean;
  displayName: string;
  pictureUrl: string | null;
  communityUsername: string;
  status: 'active';
  createdAt: string;
  lastSignInAt: string;
}

export type FxsnapAccountData = Record<string, unknown>;

function ensureNativeSecureStorage() {
  if (Platform.OS === 'web') {
    throw new Error('Google account sign-in is available in the FXSnap mobile app.');
  }
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return `Account request failed (${response.status}). Please try again.`;
}

function accountTokenHeaders(token: string, apiHeaders: Record<string, string>) {
  return { ...apiHeaders, 'x-fxsnap-account-token': token };
}

export async function getFxsnapAccountApiHeaders() {
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (!token) throw new Error('Sign in with Google to use FXSnap Community.');
  return accountTokenHeaders(token, await getApiHeaders());
}

async function getCurrentSupabaseAccessToken() {
  const auth = getSupabaseClient().auth;
  let { data, error } = await auth.getSession();
  if (error) throw error;
  if (data.session?.expires_at && data.session.expires_at * 1000 <= Date.now() + 60_000) {
    const refreshed = await auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    data = refreshed.data;
  }
  return data.session?.access_token || null;
}

export async function getAuthenticatedAccount(): Promise<FxsnapAccount | null> {
  if (Platform.OS === 'web' && __DEV__) return createCommunityPreviewAccount();
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (!token) {
    if (!hasSupabaseConfiguration()) return null;
    const accessToken = await getCurrentSupabaseAccessToken();
    return accessToken ? provisionFxsnapAccount(accessToken) : null;
  }

  const response = await fetch(`${API_URL}/api/account`, {
    method: 'GET',
    headers: accountTokenHeaders(token, await getApiHeaders()),
  });
  if (response.status === 401) {
    await SecureStore.deleteItemAsync(ACCOUNT_TOKEN_KEY);
    if (!hasSupabaseConfiguration()) return null;
    const accessToken = await getCurrentSupabaseAccessToken();
    return accessToken ? provisionFxsnapAccount(accessToken) : null;
  }
  if (!response.ok) throw new Error(await readError(response));

  const payload = await response.json() as { account?: FxsnapAccount };
  if (!payload.account || payload.account.provider !== 'google' || !payload.account.email) {
    throw new Error('The server returned an invalid account profile.');
  }
  return payload.account;
}

async function provisionFxsnapAccount(supabaseAccessToken: string): Promise<FxsnapAccount> {
  ensureNativeSecureStorage();
  if (!supabaseAccessToken || supabaseAccessToken.length > 20_000) {
    throw new Error('Supabase did not return a valid account session.');
  }

  const response = await fetch(`${API_URL}/api/account/supabase`, {
    method: 'POST',
    headers: await getApiHeaders(),
    body: JSON.stringify({ accessToken: supabaseAccessToken }),
  });
  if (!response.ok) throw new Error(await readError(response));

  const payload = await response.json() as { account?: FxsnapAccount; accountToken?: string };
  if (!payload.account || !payload.accountToken || payload.account.provider !== 'google') {
    throw new Error('The server returned an invalid account session.');
  }
  try {
    await SecureStore.setItemAsync(ACCOUNT_TOKEN_KEY, payload.accountToken);
  } catch (error) {
    await SecureStore.deleteItemAsync(ACCOUNT_TOKEN_KEY).catch(() => undefined);
    throw new Error('Sign-in succeeded, but this device could not securely save the account session. Please try again.');
  }
  return payload.account;
}

export async function signInWithGoogle(): Promise<FxsnapAccount | null> {
  ensureNativeSecureStorage();
  const supabase = getSupabaseClient();
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return a Google sign-in URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success' || !result.url) {
    const accessToken = await getCurrentSupabaseAccessToken();
    if (accessToken) return provisionFxsnapAccount(accessToken);
    throw new Error('Google sign-in did not return to FXSnap. Please try again.');
  }

  const callback = new URL(result.url);
  const callbackParams = new URLSearchParams(callback.hash.slice(1));
  const callbackError = callback.searchParams.get('error_description')
    || callback.searchParams.get('error')
    || callbackParams.get('error_description')
    || callbackParams.get('error');
  const code = callback.searchParams.get('code') || callbackParams.get('code');
  return completeGoogleSignInCallback(code, callbackError);
}

export async function completeGoogleSignInCallback(
  code: string | null | undefined,
  callbackError?: string | null,
): Promise<FxsnapAccount> {
  if (callbackError) throw new Error(callbackError);
  if (!code) throw new Error('The Supabase sign-in callback did not contain an authorization code.');
  if (pendingGoogleCallback?.code === code) return pendingGoogleCallback.promise;

  const promise = (async () => {
    const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) throw new Error('Supabase did not create a signed-in session.');
    return provisionFxsnapAccount(data.session.access_token);
  })();
  pendingGoogleCallback = { code, promise };
  try {
    return await promise;
  } catch (error) {
    if (pendingGoogleCallback?.code === code) pendingGoogleCallback = null;
    throw error;
  }
}

export async function getFxsnapAccountData(): Promise<FxsnapAccountData | null> {
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (!token) throw new Error('Sign in to sync your FXSnap data.');

  const response = await fetch(`${API_URL}/api/account/data`, {
    method: 'GET',
    headers: accountTokenHeaders(token, await getApiHeaders()),
  });
  if (!response.ok) throw new Error(await readError(response));

  const payload = await response.json() as { data?: { data?: FxsnapAccountData } | null };
  return payload.data?.data || null;
}

export async function saveFxsnapAccountData(data: FxsnapAccountData): Promise<void> {
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (!token) throw new Error('Sign in to sync your FXSnap data.');

  const response = await fetch(`${API_URL}/api/account/data`, {
    method: 'POST',
    headers: accountTokenHeaders(token, await getApiHeaders()),
    body: JSON.stringify({ data }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function signOutOfFxsnapAccount(): Promise<void> {
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (token) {
    const response = await fetch(`${API_URL}/api/account/session`, {
      method: 'DELETE',
      headers: accountTokenHeaders(token, await getApiHeaders()),
    });
    if (!response.ok && response.status !== 401) throw new Error(await readError(response));
    await SecureStore.deleteItemAsync(ACCOUNT_TOKEN_KEY);
  }
  if (hasSupabaseConfiguration()) {
    const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
}

export async function deleteFxsnapAccount(): Promise<void> {
  ensureNativeSecureStorage();
  const token = await SecureStore.getItemAsync(ACCOUNT_TOKEN_KEY);
  if (!token) throw new Error('Sign in again before deleting your FXSnap account.');

  const response = await fetch(`${API_URL}/api/account`, {
    method: 'DELETE',
    headers: accountTokenHeaders(token, await getApiHeaders()),
  });
  if (!response.ok) throw new Error(await readError(response));
  await SecureStore.deleteItemAsync(ACCOUNT_TOKEN_KEY);
  if (hasSupabaseConfiguration()) {
    const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
}
