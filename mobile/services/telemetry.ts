import { API_BASE_URL, fetchWithApiAuth } from '@/services/apiAuth';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTelemetryQueue } from './telemetryQueue';

const TELEMETRY_URL = `${API_BASE_URL}/api/events`;
const telemetry = createTelemetryQueue({
  storage: AsyncStorage,
  sendBatch: async (events, signal) => {
    const response = await fetchWithApiAuth(TELEMETRY_URL, {
      method: 'POST',
      body: JSON.stringify({ events }),
      signal,
    });
    return { ok: response.ok, status: response.status };
  },
});

export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (__DEV__) console.log('[Telemetry]', { name, properties });
  telemetry.track(name, properties);
}

export async function flushTelemetryEvents(): Promise<void> {
  return telemetry.flush();
}

AppState.addEventListener('change', (state) => {
  if (state === 'background' || state === 'inactive') telemetry.flushOnBackground();
});

export function trackError(error: Error, context: Record<string, string> = {}) {
  trackEvent('app_error', { message: error.message.slice(0, 200), ...context });
}
