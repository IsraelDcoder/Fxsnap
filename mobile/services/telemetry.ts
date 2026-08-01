const TELEMETRY_URL = process.env.EXPO_PUBLIC_API_URL ? `${process.env.EXPO_PUBLIC_API_URL}/api/events` : null;
import { getApiHeaders } from '@/services/apiAuth';

export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  const event = { name, properties, occurredAt: new Date().toISOString() };
  if (__DEV__) console.log('[Telemetry]', event);
  if (!TELEMETRY_URL) return;
  void getApiHeaders().then((headers) => fetch(TELEMETRY_URL, { method: 'POST', headers, body: JSON.stringify(event) })).catch(() => undefined);
}

export function trackError(error: Error, context: Record<string, string> = {}) {
  trackEvent('app_error', { message: error.message.slice(0, 200), ...context });
}
