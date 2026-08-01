import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
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
