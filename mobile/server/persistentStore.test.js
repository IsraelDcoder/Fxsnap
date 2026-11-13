const assert = require('node:assert/strict');
const test = require('node:test');

delete process.env.REDIS_URL;
delete process.env.REDIS_URI;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_PROJECT_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const persistentStore = require('./persistentStore');

test('concurrent event appends preserve all events and deduplicate retried IDs', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({
    id: `event-${index}`,
    name: `event-${index}`,
    occurredAt: new Date(index * 1000).toISOString(),
  }));
  await Promise.all(entries.map((event) => (
    persistentStore.appendJson('test:events:concurrent', event, 1000, 60)
  )));
  await persistentStore.appendJson('test:events:concurrent', [entries[0], entries[1]], 1000, 60);
  const stored = await persistentStore.getJson('test:events:concurrent');
  assert.equal(stored.length, entries.length);
  assert.deepEqual(new Set(stored.map((event) => event.id)), new Set(entries.map((event) => event.id)));
});

test('events from legacy clients without IDs remain appendable', async () => {
  const first = { name: 'legacy-one', occurredAt: new Date().toISOString() };
  const second = { name: 'legacy-two', occurredAt: new Date().toISOString() };
  await persistentStore.appendJson('test:events:legacy', first, 100, 60);
  await persistentStore.appendJson('test:events:legacy', second, 100, 60);
  assert.deepEqual(await persistentStore.getJson('test:events:legacy'), [first, second]);
});
