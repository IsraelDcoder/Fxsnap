import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = require('../server/persistentStore.js');

test('Redis persistence adapter reports its configuration state', () => {
  assert.equal(typeof store.enabled, 'boolean');
  assert.equal(typeof store.increment, 'function');
  assert.equal(typeof store.getJson, 'function');
  assert.equal(typeof store.setJson, 'function');
});

test('without Redis configured, development fallback is explicit', async () => {
  if (store.enabled) return;
  assert.equal(await store.increment('test-key', 1), null);
  assert.equal(await store.getJson('test-key'), null);
  assert.equal(await store.setJson('test-key', { ok: true }, 1), false);
});
