const TABLE = 'fxsnap_push_devices';
const PAYWALL_REMINDERS_TABLE = 'fxsnap_paywall_reminder_sequences';

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

async function register(deviceId, token, platform, preferences, accountId, supabaseUserId) {
  const now = new Date().toISOString();
  await request(`${TABLE}?on_conflict=device_id`, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      device_id: deviceId,
      account_id: accountId,
      supabase_user_id: supabaseUserId,
      expo_token: token,
      platform,
      preferences,
      registered_at: now,
    }),
  });
}

async function remove(deviceId, accountId) {
  const accountFilter = accountId
    ? `&account_id=eq.${encodeURIComponent(accountId)}`
    : '&account_id=is.null';
  await request(`${TABLE}?device_id=eq.${encodeURIComponent(deviceId)}${accountFilter}`, { method: 'DELETE' });
}

async function list() {
  const entries = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const rows = await request(
      `${TABLE}?select=device_id,account_id,supabase_user_id,expo_token,platform,preferences,registered_at,last_notification_at&order=device_id.asc`,
      { headers: { range: `${offset}-${offset + pageSize - 1}` } },
    );
    entries.push(...(rows || []).map((row) => ({
      deviceId: row.device_id,
      accountId: row.account_id,
      supabaseUserId: row.supabase_user_id,
      token: row.expo_token,
      platform: row.platform,
      preferences: row.preferences,
      registeredAt: row.registered_at,
      lastNotificationAt: row.last_notification_at,
    })));
    if (!rows || rows.length < pageSize) return entries;
  }
}

function mapPushDevice(row) {
  return {
    deviceId: row.device_id,
    accountId: row.account_id,
    supabaseUserId: row.supabase_user_id,
    token: row.expo_token,
    platform: row.platform,
    preferences: row.preferences,
    registeredAt: row.registered_at,
    lastNotificationAt: row.last_notification_at,
  };
}

async function getRegisteredDevice(deviceId) {
  const rows = await request(
    `${TABLE}?device_id=eq.${encodeURIComponent(deviceId)}&select=device_id,account_id,supabase_user_id,expo_token,platform,preferences,registered_at,last_notification_at&limit=1`,
  );
  return rows?.[0] ? mapPushDevice(rows[0]) : null;
}

async function listBySupabaseUserIds(userIds) {
  const validIds = [...new Set(userIds)].filter((id) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ));
  if (!validIds.length) return [];
  const expression = validIds.map((id) => `"${id}"`).join(',');
  const rows = await request(
    `${TABLE}?select=device_id,account_id,supabase_user_id,expo_token,platform&supabase_user_id=in.(${expression})&expo_token=not.is.null`,
  );
  return (rows || []).map((row) => ({
    deviceId: row.device_id,
    accountId: row.account_id,
    supabaseUserId: row.supabase_user_id,
    token: row.expo_token,
    platform: row.platform,
  }));
}

async function listByAccountIds(accountIds) {
  const validIds = [...new Set(accountIds)].filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 128);
  if (!validIds.length) return [];
  const expression = validIds.map((id) => `"${id.replace(/["\\]/g, '')}"`).join(',');
  const rows = await request(
    `${TABLE}?select=device_id,account_id,supabase_user_id,expo_token,platform&account_id=in.(${expression})&expo_token=not.is.null`,
  );
  return (rows || []).map((row) => ({
    deviceId: row.device_id,
    accountId: row.account_id,
    supabaseUserId: row.supabase_user_id,
    token: row.expo_token,
    platform: row.platform,
  }));
}

async function markNotified(deviceId, notifiedAt) {
  await request(`${TABLE}?device_id=eq.${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ last_notification_at: notifiedAt }),
  });
}

async function startPaywallReminderSequence(deviceId, startedAt) {
  return request('rpc/fxsnap_start_paywall_reminder_sequence', {
    method: 'POST',
    body: JSON.stringify({ p_device_id: deviceId, p_started_at: startedAt }),
  });
}

async function listActivePaywallReminderDeviceIds() {
  const deviceIds = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const rows = await request(
      `${PAYWALL_REMINDERS_TABLE}?select=device_id&status=eq.active&order=device_id.asc`,
      { headers: { range: `${offset}-${offset + pageSize - 1}` } },
    );
    for (const row of rows || []) deviceIds.add(row.device_id);
    if (!rows || rows.length < pageSize) return deviceIds;
  }
}

async function claimDuePaywallReminderSequences(now, limit = 100) {
  return request('rpc/fxsnap_claim_due_paywall_reminders', {
    method: 'POST',
    body: JSON.stringify({ p_now: now.toISOString(), p_limit: limit }),
  });
}

async function finishPaywallReminderSequence(id, outcome, now) {
  return request('rpc/fxsnap_finish_paywall_reminder', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_outcome: outcome, p_now: now.toISOString() }),
  });
}

async function claimCommunityEvents(limit = 100, objectId = null) {
  return request('rpc/fxsnap_community_claim_push_events', {
    method: 'POST',
    body: JSON.stringify({ p_limit: limit, p_object_id: objectId }),
  });
}

async function finishCommunityEvent(id, error = null) {
  return request('rpc/fxsnap_community_finish_push_event', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_error: error }),
  });
}

module.exports = {
  register,
  remove,
  list,
  getRegisteredDevice,
  listBySupabaseUserIds,
  listByAccountIds,
  markNotified,
  startPaywallReminderSequence,
  listActivePaywallReminderDeviceIds,
  claimDuePaywallReminderSequences,
  finishPaywallReminderSequence,
  claimCommunityEvents,
  finishCommunityEvent,
};
