import { API_BASE_URL, getApiHeaders } from '@/services/apiAuth';

const TELEMETRY_URL = `${API_BASE_URL}/api/events`;

export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  const event = { name, properties, occurredAt: new Date().toISOString() };
  if (__DEV__) console.log('[Telemetry]', event);
  void getApiHeaders().then((headers) => fetch(TELEMETRY_URL, { method: 'POST', headers, body: JSON.stringify(event) })).catch(() => undefined);
}

export function trackError(error: Error, context: Record<string, string> = {}) {
  trackEvent('app_error', { message: error.message.slice(0, 200), ...context });
}
