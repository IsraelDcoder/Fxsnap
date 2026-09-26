import AsyncStorage from '@react-native-async-storage/async-storage';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function getExpoHostIp(): string | null {
  try {
    // Expo exposes the dev-server host in runtime; on a real device that is the
    // local LAN IP of the machine running the backend, which is exactly what we want.
    const constants = require('expo-constants');
    const hostUri = constants?.expoConfig?.hostUri || constants?.manifest2?.extra?.expoGo?.hostUri || constants?.manifest?.debuggerHost || constants?.expoGo?.hostUri;
    if (!hostUri || typeof hostUri !== 'string') return null;
    const host = hostUri.split(':')[0];
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return host;
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(value?: string | null): string {
  const explicit = (value || process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (explicit) {
    const placeholderPattern = /your-vercel-app-name\.vercel\.app|your-backend-url\.example\.com|replace_with\//i;
    if (placeholderPattern.test(explicit)) {
      return 'http://localhost:3000';
    }
    return normalizeBaseUrl(explicit);
  }

  const expoHostIp = getExpoHostIp();
  if (expoHostIp) return `http://${expoHostIp}:3000`;

  return 'http://localhost:3000';
}

const API_URL = resolveApiBaseUrl();
const DEVICE_ID_KEY = 'fxsnap:deviceId';
const SESSION_TOKEN_KEY = 'fxsnap:sessionToken';
const SESSION_TOKEN_VERSION_KEY = 'fxsnap:sessionTokenVersion';
const FREE_ANALYSIS_ID_KEY = 'fxsnap:freeAnalysisId';
const SESSION_TOKEN_VERSION = '2';

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId() {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) { deviceId = randomId(); await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId); }
  return deviceId;
}

export async function getFreeAnalysisId() {
  const platform = require('react-native').Platform as { OS: string };
  const application = require('expo-application') as typeof import('expo-application');
  let platformId: string | null = null;
  try {
    if (platform.OS === 'ios') {
      const secureStore = require('expo-secure-store') as typeof import('expo-secure-store');
      let keychainId = await secureStore.getItemAsync(FREE_ANALYSIS_ID_KEY);
      if (!keychainId) {
        keychainId = `ios-${randomId()}`;
        await secureStore.setItemAsync(FREE_ANALYSIS_ID_KEY, keychainId);
      }
      return keychainId;
    }
    if (platform.OS === 'android') platformId = application.getAndroidId();
  } catch {}
  if (platformId) return `${platform.OS}-${platformId}`;

  let freeAnalysisId = await AsyncStorage.getItem(FREE_ANALYSIS_ID_KEY);
  if (!freeAnalysisId) {
    freeAnalysisId = `install-${randomId()}`;
    await AsyncStorage.setItem(FREE_ANALYSIS_ID_KEY, freeAnalysisId);
  }
  return freeAnalysisId;
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  const [storedToken, tokenVersion] = await Promise.all([
    AsyncStorage.getItem(SESSION_TOKEN_KEY),
    AsyncStorage.getItem(SESSION_TOKEN_VERSION_KEY),
  ]);
  let token = storedToken;
  if (!token || tokenVersion !== SESSION_TOKEN_VERSION) {
    const freeAnalysisId = await getFreeAnalysisId();
    const response = await fetch(`${API_URL}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId, freeAnalysisId }) });
    if (!response.ok) throw new Error('Unable to create an API session.');
    const payload = await response.json();
    if (typeof payload.token !== 'string' || payload.token.length < 20) throw new Error('API returned an invalid session token.');
    const sessionToken = payload.token;
    token = sessionToken;
    await AsyncStorage.multiSet([
      [SESSION_TOKEN_KEY, sessionToken],
      [SESSION_TOKEN_VERSION_KEY, SESSION_TOKEN_VERSION],
    ]);
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
}

export async function hasUsedFreeAnalysis(): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/analysis-access`, { headers: await getApiHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.used !== 'boolean') {
    throw new Error(payload.error || 'Unable to verify free analysis access.');
  }
  return payload.used;
}

export async function getServerPremiumStatus(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_URL}/api/entitlement`, { headers: await getApiHeaders() });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.active === 'boolean' ? payload.active : null;
  } catch { return null; }
}
