import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelemetryQueue, type TelemetryEvent } from '../services/telemetryQueue';

function createStorage(values = new Map<string, string>()) {
  return {
    values,
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('failed telemetry delivery retains queued events and successful retry acknowledges them', async () => {
  const storage = createStorage();
  let attempts = 0;
  let markSendStarted: () => void = () => undefined;
  let releaseSuccessfulSend: () => void = () => undefined;
  const sendStarted = new Promise<void>((resolve) => { markSendStarted = resolve; });
  const successfulSendGate = new Promise<void>((resolve) => { releaseSuccessfulSend = resolve; });
  let successfulBatchIds: string[] = [];
  const queue = createTelemetryQueue({
    storage,
    flushDelayMs: 60_000,
    retryBaseMs: 60_000,
    sendBatch: async (events) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503 };
      successfulBatchIds = events.map((event) => event.id);
      markSendStarted();
      await successfulSendGate;
      return { ok: true, status: 204 };
    },
    onError: () => undefined,
  });

  const eventId = queue.track('delivery-check', { screen: 'home' });
  await assert.rejects(queue.flush(), /status 503/);
  const secondEventId = queue.track('delivery-check-second');
  assert.deepEqual((await queue.getPendingEvents()).map((event) => event.id), [eventId, secondEventId]);
  assert.deepEqual(JSON.parse(storage.values.get('fxsnap:telemetry:outbox') || '[]').map((event: TelemetryEvent) => event.id), [eventId, secondEventId]);

  const retry = queue.flush();
  await sendStarted;
  const laterEventId = queue.track('arrived-during-request');
  releaseSuccessfulSend();
  await retry;
  assert.deepEqual(successfulBatchIds, [eventId, secondEventId]);
  assert.deepEqual((await queue.getPendingEvents()).map((event) => event.id), [laterEventId]);
  await queue.flush();
  assert.deepEqual(await queue.getPendingEvents(), []);
  assert.equal(attempts, 3);
});

test('a recreated telemetry queue restores persisted events before delivery', async () => {
  const storage = createStorage();
  const options = {
    storage,
    flushDelayMs: 60_000,
    retryBaseMs: 60_000,
    sendBatch: async () => ({ ok: true, status: 204 }),
    onError: () => undefined,
  };
  const firstQueue = createTelemetryQueue(options);
  const eventId = firstQueue.track('restart-check');
  await firstQueue.getPendingEvents();

  const restartedQueue = createTelemetryQueue(options);
  assert.equal((await restartedQueue.getPendingEvents())[0]?.id, eventId);

  await firstQueue.flush();
  await restartedQueue.flush();
  assert.deepEqual(await restartedQueue.getPendingEvents(), []);
});

test('a timed-out telemetry request does not block a later flush', async () => {
  const storage = createStorage();
  let attempts = 0;
  const queue = createTelemetryQueue({
    storage,
    flushDelayMs: 60_000,
    retryBaseMs: 60_000,
    requestTimeoutMs: 5,
    sendBatch: async (_events: TelemetryEvent[], signal: AbortSignal) => {
      attempts += 1;
      if (attempts === 1) {
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ ok: false, status: 0 }), { once: true });
        });
      }
      return { ok: true, status: 204 };
    },
    onError: () => undefined,
  });
  queue.track('timeout-check');

  await assert.rejects(queue.flush(), /timed out/);
  await queue.flush();
  assert.equal(attempts, 2);
  assert.deepEqual(await queue.getPendingEvents(), []);
});

test('the outbox cap rejects new events without evicting unacknowledged ones', async () => {
  const storage = createStorage();
  const errors: string[] = [];
  let attempts = 0;
  const queue = createTelemetryQueue({
    storage,
    maxQueuedEvents: 1,
    flushDelayMs: 60_000,
    sendBatch: async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 503 } : { ok: true, status: 204 };
    },
    onError: (message) => errors.push(message),
  });
  const firstEventId = queue.track('first');
  assert.equal(queue.track('rejected'), null);
  while (attempts === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual((await queue.getPendingEvents()).map((event) => event.id), [firstEventId]);
  assert.match(errors[0], /outbox is full/);
  await queue.flush();
});
