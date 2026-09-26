const memoryStore = new Map();
const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI || null;
const redisClient = redisUrl ? require('redis').createClient({ url: redisUrl }) : null;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/$/, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseTable = process.env.SUPABASE_KV_TABLE || 'fxsnap_kv';
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceKey);
let redisConnecting = null;
if (redisClient) redisClient.on('error', (error) => console.error('[Redis] Connection error:', error.message));

function supabaseHeaders(prefer) {
  return {
    apikey: supabaseServiceKey,
    authorization: `Bearer ${supabaseServiceKey}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

async function supabaseRpc(name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase RPC ${name} failed with ${response.status}.`);
  return response.json();
}

async function supabaseGet(key) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?key=eq.${encodeURIComponent(key)}&select=value,expires_at`, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Supabase read failed with ${response.status}.`);
  const rows = await response.json();
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: supabaseHeaders() });
    return null;
  }
  return row.value;
}

async function supabaseSet(key, value, ttlSeconds) {
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?on_conflict=key`, {
    method: 'POST',
    headers: supabaseHeaders('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({ key, value, expires_at: expiresAt }),
  });
  if (!response.ok) throw new Error(`Supabase write failed with ${response.status}.`);
  return true;
}

function getTtlKey(key, ttlSeconds) {
  return `${key}:${ttlSeconds}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAt && value.expiresAt <= now) memoryStore.delete(key);
  }
}

async function connect() {
  if (!redisClient) return false;
  if (redisClient.isReady) return true;
  if (!redisConnecting) {
    redisConnecting = redisClient.connect().finally(() => { redisConnecting = null; });
  }
  await redisConnecting;
  return true;
}

async function increment(key, windowSeconds) {
  if (await connect()) {
    const value = await redisClient.incr(key);
    await redisClient.expire(key, windowSeconds);
    return value;
  }
  if (supabaseEnabled) return Number(await supabaseRpc('fxsnap_kv_increment', { p_key: key, p_ttl_seconds: windowSeconds }));
  pruneExpired();
  const normalizedKey = getTtlKey(key, windowSeconds);
  const current = memoryStore.get(normalizedKey) || { value: 0, expiresAt: Date.now() + windowSeconds * 1000 };
  current.value += 1;
  current.expiresAt = Date.now() + windowSeconds * 1000;
  memoryStore.set(normalizedKey, current);
  return current.value;
}

async function getJson(key) {
  if (await connect()) {
    const value = await redisClient.get(key);
    return value === null ? null : JSON.parse(value);
  }
  if (supabaseEnabled) return supabaseGet(key);
  pruneExpired();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  return entry.value;
}

async function setJson(key, value, ttlSeconds) {
  if (await connect()) {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) await redisClient.set(key, serialized, { EX: ttlSeconds });
    else await redisClient.set(key, serialized);
    return true;
  }
  if (supabaseEnabled) return supabaseSet(key, value, ttlSeconds);
  pruneExpired();
  memoryStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  return true;
}

async function appendJson(key, value, maxItems, ttlSeconds) {
  const current = (await getJson(key)) || [];
  const list = [...current, value];
  while (list.length > maxItems) list.shift();
  return setJson(key, list, ttlSeconds);
}

async function setJsonIfAbsent(key, value, ttlSeconds) {
  if (await connect()) {
    const options = { NX: true };
    if (ttlSeconds) options.EX = ttlSeconds;
    return (await redisClient.set(key, JSON.stringify(value), options)) === 'OK';
  }
  if (supabaseEnabled) return Boolean(await supabaseRpc('fxsnap_kv_set_if_absent', { p_key: key, p_value: value, p_ttl_seconds: ttlSeconds || null }));
  pruneExpired();
  if (memoryStore.has(key)) return false;
  memoryStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  return true;
}

async function deleteJsonIfValue(key, value) {
  if (await connect()) {
    const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    return (await redisClient.eval(script, { keys: [key], arguments: [JSON.stringify(value)] })) === 1;
  }
  if (supabaseEnabled) return Boolean(await supabaseRpc('fxsnap_kv_delete_if_value', { p_key: key, p_value: value }));
  pruneExpired();
  const entry = memoryStore.get(key);
  if (!entry || JSON.stringify(entry.value) !== JSON.stringify(value)) return false;
  memoryStore.delete(key);
  return true;
}

module.exports = {
  enabled: Boolean(redisUrl || supabaseEnabled),
  connect,
  increment,
  getJson,
  setJson,
  setJsonIfAbsent,
  deleteJsonIfValue,
  appendJson,
};
