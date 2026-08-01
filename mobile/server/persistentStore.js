const memoryStore = new Map();

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
  return true;
}

async function increment(key, windowSeconds) {
  await connect();
  pruneExpired();
  const normalizedKey = getTtlKey(key, windowSeconds);
  const current = memoryStore.get(normalizedKey) || { value: 0, expiresAt: Date.now() + windowSeconds * 1000 };
  current.value += 1;
  current.expiresAt = Date.now() + windowSeconds * 1000;
  memoryStore.set(normalizedKey, current);
  return current.value;
}

async function getJson(key) {
  await connect();
  pruneExpired();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  return entry.value;
}

async function setJson(key, value, ttlSeconds) {
  await connect();
  pruneExpired();
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

async function appendJson(key, value, maxItems, ttlSeconds) {
  await connect();
  pruneExpired();
  const current = (await getJson(key)) || [];
  const list = [...current, value];
  while (list.length > maxItems) list.shift();
  memoryStore.set(key, { value: list, expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

module.exports = { enabled: false, connect, increment, getJson, setJson, appendJson };
