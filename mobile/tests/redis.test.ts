import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = require('../server/persistentStore.js');

test('memory persistence adapter reports its configuration state', () => {
  assert.equal(typeof store.enabled, 'boolean');
  assert.equal(typeof store.increment, 'function');
  assert.equal(typeof store.getCounter, 'function');
  assert.equal(typeof store.getJson, 'function');
  assert.equal(typeof store.setJson, 'function');
  assert.equal(typeof store.deleteKey, 'function');
});

test('memory fallback stores and retrieves values', async () => {
  assert.equal(await store.increment('test-key', 1), 1);
  assert.equal(await store.increment('test-key', 1), 2);
  assert.deepEqual(await store.getJson('test-key'), null);
  assert.equal(await store.setJson('test-key', { ok: true }, 1), true);
  assert.deepEqual(await store.getJson('test-key'), { ok: true });
});

test('TTL increments atomically claim a key until it is deleted', async () => {
  const key = `test-claim-${Date.now()}`;
  assert.equal(await store.increment(key, 60), 1);
  assert.equal(await store.getCounter(key, 60), 1);
  assert.equal(await store.increment(key, 60), 2);
  assert.equal(await store.getCounter(key, 60), 2);
  assert.equal(await store.deleteKey(key, 60), true);
  assert.equal(await store.getCounter(key, 60), 0);
  assert.equal(await store.increment(key, 60), 1);
  await store.deleteKey(key, 60);
});

