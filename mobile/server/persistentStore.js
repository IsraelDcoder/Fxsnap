const memoryStore = new Map();
const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI || null;
const redisClient = redisUrl ? require('redis').createClient({ url: redisUrl }) : null;
let redisConnecting = null;
if (redisClient) redisClient.on('error', (error) => console.error('[Redis] Connection error:', error.message));

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
  pruneExpired();
  const entry = memoryStore.get(key);
  if (!entry || JSON.stringify(entry.value) !== JSON.stringify(value)) return false;
  memoryStore.delete(key);
  return true;
}

module.exports = {
  enabled: Boolean(redisUrl),
  connect,
  increment,
  getJson,
  setJson,
  setJsonIfAbsent,
  deleteJsonIfValue,
  appendJson,
};
