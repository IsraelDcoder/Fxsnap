const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function getStaffAdminIds(env) {
  return new Set(String(env.FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS || '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID_PATTERN.test(id)));
}

async function getStaffAdminActor(req, res, {
  env = process.env,
  fetchImpl = fetch,
  sendJson,
} = {}) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'A valid staff session is required.' });
    return null;
  }

  const supabaseUrl = String(env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !apiKey) {
    sendJson(res, 503, { error: 'Staff authentication is not configured.' });
    return null;
  }

  const adminUserIds = getStaffAdminIds(env);
  if (!adminUserIds.size) {
    sendJson(res, 503, { error: 'Staff access is not configured.' });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch {
    sendJson(res, controller.signal.aborted ? 504 : 502, {
      error: controller.signal.aborted
        ? 'Staff authentication timed out. Please try again.'
        : 'Staff authentication is temporarily unavailable.',
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    sendJson(res, 401, { error: 'Your staff session is invalid or expired. Request a new sign-in link.' });
    return null;
  }
  if (!response.ok) {
    sendJson(res, 502, { error: 'Staff authentication is temporarily unavailable.' });
    return null;
  }

  let user;
  try {
    user = await response.json();
  } catch {
    sendJson(res, 502, { error: 'Staff authentication returned an invalid response.' });
    return null;
  }
  const userId = typeof user?.id === 'string' ? user.id.toLowerCase() : '';
  if (!UUID_PATTERN.test(userId)) {
    sendJson(res, 401, { error: 'Your staff session is invalid or expired. Request a new sign-in link.' });
    return null;
  }
  if (!adminUserIds.has(userId)) {
    sendJson(res, 403, { error: 'This Supabase account is not authorized for the staff console.' });
    return null;
  }

  const metadata = user.user_metadata || {};
  const displayName = [metadata.full_name, metadata.name, user.email]
    .find((value) => typeof value === 'string' && value.trim()) || 'FXSnap Staff';
  return {
    accountId: `staff_${userId}`,
    deviceId: null,
    supabaseUserId: userId,
    displayName: displayName.trim().slice(0, 120),
    communityUsername: '',
    pictureUrl: null,
    isAdmin: true,
  };
}

module.exports = { getStaffAdminActor, getStaffAdminIds };
