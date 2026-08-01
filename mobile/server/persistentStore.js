const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL;
const client = redisUrl ? createClient({ url: redisUrl }) : null;
let connected = false;

async function connect() {
  if (!client || connected) return Boolean(client);
  client.on('error', (error) => console.error('[Redis]', error.message));
  try { await client.connect(); connected = true; return true; } catch (error) { console.error('[Redis] connection failed:', error.message); return false; }
}

async function increment(key, windowSeconds) {
  if (!(await connect())) return null;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSeconds);
  return count;
}

async function getJson(key) {
  if (!(await connect())) return null;
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

async function setJson(key, value, ttlSeconds) {
  if (!(await connect())) return false;
  await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  return true;
}

async function appendJson(key, value, maxItems, ttlSeconds) {
  if (!(await connect())) return false;
  const list = (await getJson(key)) || [];
  list.push(value);
  while (list.length > maxItems) list.shift();
  return setJson(key, list, ttlSeconds);
}

module.exports = { enabled: Boolean(redisUrl), connect, increment, getJson, setJson, appendJson };
