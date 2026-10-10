import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = 'https://fxsnap.vercel.app';

export function resolveApiBaseUrl(): string {
  return API_BASE_URL;
}

const API_URL = API_BASE_URL;
const DEVICE_ID_KEY = 'fxsnap:deviceId';
const SESSION_TOKEN_KEY = 'fxsnap:sessionToken';
const SESSION_TOKEN_VERSION_KEY = 'fxsnap:sessionTokenVersion';
const SESSION_TOKEN_VERSION = '3';
const LEGACY_FREE_ANALYSIS_ID_KEY = 'fxsnap:freeAnalysisId';
let legacyFreeAnalysisIdCleanup: Promise<void> | null = null;

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId() {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) { deviceId = randomId(); await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId); }
  return deviceId;
}

async function getFreeAnalysisId(deviceId: string) {
  try {
    const application = require('expo-application') as typeof import('expo-application');
    const androidId = application.getAndroidId();
    if (androidId) return `android_${androidId}`;
  } catch {}
  try {
    const application = require('expo-application') as typeof import('expo-application');
    const vendorId = await application.getIosIdForVendorAsync();
    if (vendorId) return `ios_${vendorId}`;
  } catch {}
  return `install_${deviceId}`;
}

async function clearLegacyFreeAnalysisId() {
  if (!legacyFreeAnalysisIdCleanup) {
    legacyFreeAnalysisIdCleanup = (async () => {
      await AsyncStorage.removeItem(LEGACY_FREE_ANALYSIS_ID_KEY).catch(() => undefined);
      try {
        const secureStore = require('expo-secure-store') as typeof import('expo-secure-store');
        await secureStore.deleteItemAsync(LEGACY_FREE_ANALYSIS_ID_KEY);
      } catch {}
    })();
  }
  await legacyFreeAnalysisIdCleanup;
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  await clearLegacyFreeAnalysisId();
  const deviceId = await getDeviceId();
  const freeAnalysisId = await getFreeAnalysisId(deviceId);
  const [storedToken, tokenVersion] = await Promise.all([
    AsyncStorage.getItem(SESSION_TOKEN_KEY),
    AsyncStorage.getItem(SESSION_TOKEN_VERSION_KEY),
  ]);
  let token = storedToken;
  if (!token || tokenVersion !== SESSION_TOKEN_VERSION) {
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

export async function getServerPremiumStatus(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_URL}/api/entitlement`, { headers: await getApiHeaders() });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.active === 'boolean' ? payload.active : null;
  } catch { return null; }
}
