import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTION_API_BASE_URL = 'https://fxsnap.vercel.app';

export function resolveApiBaseUrl(
  configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL,
  isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__,
): string {
  return isDevelopmentBuild && configuredApiBaseUrl?.trim()
    ? configuredApiBaseUrl.trim()
    : PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
const API_URL = API_BASE_URL;
const DEVICE_ID_KEY = 'fxsnap:deviceId';
const SESSION_TOKEN_KEY = 'fxsnap:sessionToken';
const SESSION_TOKEN_VERSION_KEY = 'fxsnap:sessionTokenVersion';
const SESSION_TOKEN_VERSION = '4';
const SESSION_API_URL_KEY = 'fxsnap:sessionApiUrl';
const LEGACY_FREE_ANALYSIS_ID_KEY = 'fxsnap:freeAnalysisId';
let legacyFreeAnalysisIdCleanup: Promise<void> | null = null;
let sessionTokenRequest: Promise<string> | null = null;
let deviceIdRequest: Promise<string> | null = null;

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId() {
  if (!deviceIdRequest) {
    const request = (async () => {
      let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = randomId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    })();
    deviceIdRequest = request;
    try {
      return await request;
    } finally {
      if (deviceIdRequest === request) deviceIdRequest = null;
    }
  }
  return deviceIdRequest;
}

async function requestSessionToken(deviceId: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  if (!response.ok) throw new Error('Unable to create an API session.');
  const payload = await response.json();
  if (typeof payload.token !== 'string' || payload.token.length < 20) {
    throw new Error('API returned an invalid session token.');
  }
  const sessionToken = payload.token;
  await AsyncStorage.multiSet([
    [SESSION_TOKEN_KEY, sessionToken],
    [SESSION_TOKEN_VERSION_KEY, SESSION_TOKEN_VERSION],
    [SESSION_API_URL_KEY, API_URL],
  ]);
  return sessionToken;
}

async function getSessionToken(deviceId: string): Promise<string> {
  if (!sessionTokenRequest) {
    const request = requestSessionToken(deviceId);
    sessionTokenRequest = request;
    try {
      return await request;
    } finally {
      if (sessionTokenRequest === request) sessionTokenRequest = null;
    }
  }
  return sessionTokenRequest;
}

async function clearSessionTokenIfUnchanged(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, '');
  const storedToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  if (storedToken === token) await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function fetchWithApiAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const authorization = headers.get('authorization');
  const response = await fetch(input, init);
  if (response.status !== 401 || !authorization?.startsWith('Bearer ')) return response;

  await clearSessionTokenIfUnchanged(authorization);
  const refreshedHeaders = new Headers(init.headers);
  refreshedHeaders.set('authorization', (await getApiHeaders()).authorization);
  return fetch(input, { ...init, headers: refreshedHeaders });
}

async function clearLegacyFreeAnalysisId() {
  if (!legacyFreeAnalysisIdCleanup) {
    legacyFreeAnalysisIdCleanup = (async () => {
      await AsyncStorage.removeItem(LEGACY_FREE_ANALYSIS_ID_KEY).catch(() => undefined);
    })();
  }
  await legacyFreeAnalysisIdCleanup;
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  await clearLegacyFreeAnalysisId();
  const deviceId = await getDeviceId();
  const [storedToken, tokenVersion, storedApiUrl] = await Promise.all([
    AsyncStorage.getItem(SESSION_TOKEN_KEY),
    AsyncStorage.getItem(SESSION_TOKEN_VERSION_KEY),
    AsyncStorage.getItem(SESSION_API_URL_KEY),
  ]);
  let token = storedToken;
  if (!token || tokenVersion !== SESSION_TOKEN_VERSION || storedApiUrl !== API_URL) {
    token = await getSessionToken(deviceId);
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
}

export async function getServerPremiumStatus(): Promise<boolean | null> {
  try {
    const response = await fetchWithApiAuth(`${API_URL}/api/entitlement`, { headers: await getApiHeaders() });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.active === 'boolean' ? payload.active : null;
  } catch { return null; }
}

export interface ServerAnalysisAccess {
  canAnalyze: boolean;
}

export function normalizeServerAnalysisAccess(payload: unknown): ServerAnalysisAccess | null {
  if (
    typeof payload !== 'object'
    || payload === null
    || !('canAnalyze' in payload)
    || typeof payload.canAnalyze !== 'boolean'
  ) return null;
  return { canAnalyze: payload.canAnalyze };
}

export async function getServerAnalysisAccess(): Promise<ServerAnalysisAccess | null> {
  const response = await fetchWithApiAuth(`${API_URL}/api/analysis-access`, { headers: await getApiHeaders() });
  if (!response.ok) return null;
  return normalizeServerAnalysisAccess(await response.json());
}
