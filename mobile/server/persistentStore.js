const memoryStore = new Map();
const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI || null;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/$/, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseTable = process.env.SUPABASE_KV_TABLE || 'fxsnap_kv';
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceKey);
const redisClient = redisUrl && !supabaseEnabled ? require('redis').createClient({ url: redisUrl }) : null;
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
  if (supabaseEnabled) return Number(await supabaseRpc('fxsnap_kv_increment', { p_key: key, p_ttl_seconds: windowSeconds }));
  if (await connect()) {
    const value = await redisClient.incr(key);
    await redisClient.expire(key, windowSeconds);
    return value;
  }
  pruneExpired();
  const normalizedKey = getTtlKey(key, windowSeconds);
  const current = memoryStore.get(normalizedKey) || { value: 0, expiresAt: Date.now() + windowSeconds * 1000 };
  current.value += 1;
  current.expiresAt = Date.now() + windowSeconds * 1000;
  memoryStore.set(normalizedKey, current);
  return current.value;
}

async function getCounter(key, ttlSeconds) {
  if (supabaseEnabled) return Number(await supabaseGet(key) || 0);
  if (await connect()) return Number(await redisClient.get(key) || 0);
  pruneExpired();
  return memoryStore.get(getTtlKey(key, ttlSeconds))?.value || 0;
}

async function getJson(key) {
  if (supabaseEnabled) return supabaseGet(key);
  if (await connect()) {
    const value = await redisClient.get(key);
    return value === null ? null : JSON.parse(value);
  }
  pruneExpired();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  return entry.value;
}

async function setJson(key, value, ttlSeconds) {
  if (supabaseEnabled) return supabaseSet(key, value, ttlSeconds);
  if (await connect()) {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) await redisClient.set(key, serialized, { EX: ttlSeconds });
    else await redisClient.set(key, serialized);
    return true;
  }
  pruneExpired();
  memoryStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  return true;
}

async function deleteKey(key, ttlSeconds) {
  if (supabaseEnabled) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?key=eq.${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: supabaseHeaders(),
    });
    if (!response.ok) throw new Error(`Supabase delete failed with ${response.status}.`);
    return true;
  }
  if (await connect()) {
    await redisClient.del(key);
    return true;
  }
  return memoryStore.delete(ttlSeconds ? getTtlKey(key, ttlSeconds) : key);
}

async function appendJson(key, value, maxItems, ttlSeconds) {
  const additions = Array.isArray(value) ? value : [value];
  if (!Number.isInteger(maxItems) || maxItems < 1) throw new Error('appendJson requires a positive maxItems value.');

  if (supabaseEnabled) {
    return supabaseRpc('fxsnap_kv_append_json', {
      p_key: key,
      p_values: additions,
      p_max_items: maxItems,
      p_ttl_seconds: ttlSeconds || 0,
    });
  }
  if (await connect()) {
    const script = `
      local stored = redis.call('GET', KEYS[1])
      local current = {}
      if stored then
        local ok, decoded = pcall(cjson.decode, stored)
        if ok and type(decoded) == 'table' then current = decoded end
      end
      local additions = cjson.decode(ARGV[1])
      local seen = {}
      for _, item in ipairs(current) do
        local id = type(item) == 'table' and (item.dedupeId or item.id) or nil
        if type(id) == 'string' then seen[id] = true end
      end
      for _, item in ipairs(additions) do
        local id = type(item) == 'table' and (item.dedupeId or item.id) or nil
        if type(id) ~= 'string' or not seen[id] then
          table.insert(current, item)
          if type(id) == 'string' then seen[id] = true end
        end
      end
      while #current > tonumber(ARGV[2]) do table.remove(current, 1) end
      if tonumber(ARGV[3]) > 0 then
        redis.call('SET', KEYS[1], cjson.encode(current), 'EX', tonumber(ARGV[3]))
      else
        redis.call('SET', KEYS[1], cjson.encode(current))
      end
      return 1
    `;
    return redisClient.eval(script, {
      keys: [key],
      arguments: [JSON.stringify(additions), String(maxItems), String(ttlSeconds || 0)],
    });
  }

  pruneExpired();
  const current = memoryStore.get(key)?.value;
  const list = Array.isArray(current) ? [...current] : [];
  const seen = new Set(list.map((item) => item?.dedupeId || item?.id).filter((id) => typeof id === 'string'));
  for (const item of additions) {
    const id = item?.dedupeId || item?.id;
    if (typeof id !== 'string' || !seen.has(id)) {
      list.push(item);
      if (typeof id === 'string') seen.add(id);
    }
  }
  memoryStore.set(key, {
    value: list.slice(-maxItems),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
  return true;
}

module.exports = {
  enabled: Boolean(redisUrl || supabaseEnabled),
  supabaseEnabled,
  connect,
  increment,
  getCounter,
  getJson,
  setJson,
  deleteKey,
  appendJson,
};
