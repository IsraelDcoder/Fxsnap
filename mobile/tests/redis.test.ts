import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = require('../server/persistentStore.js');

test('memory persistence adapter reports its configuration state', () => {
  assert.equal(typeof store.enabled, 'boolean');
  assert.equal(typeof store.increment, 'function');
  assert.equal(typeof store.getJson, 'function');
  assert.equal(typeof store.setJson, 'function');
});

test('memory fallback stores and retrieves values', async () => {
  assert.equal(await store.increment('test-key', 1), 1);
  assert.equal(await store.increment('test-key', 1), 2);
  assert.deepEqual(await store.getJson('test-key'), null);
  assert.equal(await store.setJson('test-key', { ok: true }, 1), true);
  assert.deepEqual(await store.getJson('test-key'), { ok: true });
});

test('free-analysis reservations are atomic and releasable in memory mode', async () => {
  const key = `free-analysis-test-${Date.now()}`;
  assert.equal(await store.setJsonIfAbsent(key, 'first', 60), true);
  assert.equal(await store.setJsonIfAbsent(key, 'second', 60), false);
  assert.equal(await store.deleteJsonIfValue(key, 'second'), false);
  assert.equal(await store.deleteJsonIfValue(key, 'first'), true);
  assert.equal(await store.setJsonIfAbsent(key, 'second', 60), true);
});
