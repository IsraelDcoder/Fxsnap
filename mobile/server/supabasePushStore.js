const TABLE = 'fxsnap_push_devices';

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Supabase push storage is not configured.');
  return { url, serviceKey };
}

function supabaseHeaders(serviceKey, prefer) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

async function request(path, options = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(serviceKey), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase push storage failed with ${response.status}${detail ? `: ${detail}` : ''}.`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function register(deviceId, token, platform, preferences) {
  const now = new Date().toISOString();
  await request(`${TABLE}?on_conflict=device_id`, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      device_id: deviceId,
      expo_token: token,
      platform,
      preferences,
      registered_at: now,
    }),
  });
}

async function remove(deviceId) {
  await request(`${TABLE}?device_id=eq.${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

async function list() {
  const rows = await request(`${TABLE}?select=device_id,expo_token,platform,preferences,registered_at,last_notification_at`);
  return (rows || []).map((row) => ({
    deviceId: row.device_id,
    token: row.expo_token,
    platform: row.platform,
    preferences: row.preferences,
    registeredAt: row.registered_at,
    lastNotificationAt: row.last_notification_at,
  }));
}

async function markNotified(deviceId, notifiedAt) {
  await request(`${TABLE}?device_id=eq.${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ last_notification_at: notifiedAt }),
  });
}

module.exports = { register, remove, list, markNotified };
