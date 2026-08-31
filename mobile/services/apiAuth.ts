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

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId() {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) { deviceId = randomId(); await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId); }
  return deviceId;
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  let token = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    const response = await fetch(`${API_URL}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId }) });
    if (!response.ok) throw new Error('Unable to create an API session.');
    const payload = await response.json();
    if (typeof payload.token !== 'string' || payload.token.length < 20) throw new Error('API returned an invalid session token.');
    const sessionToken = payload.token;
    token = sessionToken;
    await AsyncStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
}

export async function getServerPremiumStatus(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_URL}/api/entitlement`, { headers: await getApiHeaders() });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.active === 'boolean' ? payload.active : null;
  } catch { return null; }
}
