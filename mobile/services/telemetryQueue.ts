export type TelemetryEvent = {
  id: string;
  name: string;
  properties: Record<string, string | number | boolean>;
  occurredAt: string;
};

type TelemetryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type TelemetryQueueOptions = {
  storage: TelemetryStorage;
  sendBatch(events: TelemetryEvent[], signal: AbortSignal): Promise<{ ok: boolean; status?: number }>;
  storageKey?: string;
  maxBatchSize?: number;
  maxQueuedEvents?: number;
  flushDelayMs?: number;
  requestTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  onError?(message: string, error: unknown): void;
};

const createEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createTelemetryQueue({
  storage,
  sendBatch,
  storageKey = 'fxsnap:telemetry:outbox',
  maxBatchSize = 50,
  maxQueuedEvents = 200,
  flushDelayMs = 1000,
  requestTimeoutMs = 12000,
  retryBaseMs = 1000,
  retryMaxMs = 60000,
  onError = (message, error) => console.warn(`[Telemetry] ${message}`, error),
}: TelemetryQueueOptions) {
  let pending: TelemetryEvent[] = [];
  let loaded = false;
  let loadPromise: Promise<void> | null = null;
  let persistence = Promise.resolve();
  let flushPromise: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;

  const ensureLoaded = async () => {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = storage.getItem(storageKey).then((stored) => {
        const parsed: unknown = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(parsed)) throw new Error('Telemetry outbox has an invalid format.');
        const restored = parsed.filter((event): event is TelemetryEvent => (
          event && typeof event.id === 'string' && typeof event.name === 'string'
          && typeof event.occurredAt === 'string' && typeof event.properties === 'object'
          && event.properties !== null && !Array.isArray(event.properties)
        ));
        const restoredIds = new Set(restored.map((event) => event.id));
        pending = [...restored, ...pending.filter((event) => !restoredIds.has(event.id))];
        loaded = true;
      }).catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
  };

  const persistQueue = () => {
    const write = persistence.catch(() => undefined).then(async () => {
      await ensureLoaded();
      await storage.setItem(storageKey, JSON.stringify(pending));
    });
    persistence = write;
    return write;
  };

  const scheduleFlush = (delayMs: number, retry: boolean) => {
    if (retry) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flush().catch(() => undefined);
      }, delayMs);
      return;
    }
    if (flushTimer || retryTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush().catch(() => undefined);
    }, delayMs);
  };

  const flush = async (): Promise<void> => {
    if (flushPromise) return flushPromise;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const task = (async () => {
      try {
        await persistQueue();
        const batch = pending.slice(0, maxBatchSize);
        if (!batch.length) return;

        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const timedOut = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Telemetry request timed out.'));
          }, requestTimeoutMs);
        });
        let result: { ok: boolean; status?: number };
        try {
          result = await Promise.race([sendBatch(batch, controller.signal), timedOut]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        if (!result.ok) throw new Error(`Telemetry batch was rejected with status ${result.status ?? 'unknown'}.`);

        const acknowledged = new Set(batch.map((event) => event.id));
        pending = pending.filter((event) => !acknowledged.has(event.id));
        failureCount = 0;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        await persistQueue();
        if (pending.length) scheduleFlush(flushDelayMs, false);
      } catch (error) {
        failureCount += 1;
        const delay = Math.min(retryBaseMs * (2 ** (failureCount - 1)), retryMaxMs);
        onError('Event batch was not acknowledged; it remains in the outbox.', error);
        scheduleFlush(delay, true);
        throw error;
      }
    })();

    flushPromise = task.finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  };

  const track = (name: string, properties: Record<string, string | number | boolean> = {}) => {
    const event: TelemetryEvent = {
      id: createEventId(),
      name,
      properties,
      occurredAt: new Date().toISOString(),
    };
    if (pending.length >= maxQueuedEvents) {
      onError('Telemetry outbox is full; the new event was not queued.', new Error(`Queue limit: ${maxQueuedEvents}.`));
      void flush().catch(() => undefined);
      return null;
    }
    pending = [...pending, event];
    void persistQueue().catch((error) => onError('Could not persist the telemetry outbox.', error));
    if (pending.length >= maxBatchSize) void flush().catch(() => undefined);
    else scheduleFlush(flushDelayMs, false);
    return event.id;
  };

  const flushOnBackground = () => {
    void flush().catch(() => undefined);
  };

  return {
    track,
    flush,
    flushOnBackground,
    async getPendingEvents() {
      await persistQueue();
      return [...pending];
    },
  };
}
