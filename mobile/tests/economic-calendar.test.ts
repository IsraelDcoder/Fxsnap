import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DefaultNewsProvider } from '../services/news';

const require = createRequire(import.meta.url);
const { FinnhubNewsProvider } = require('../server/newsProvider.js');

test('Finnhub economic calendar events are normalized from provider data', async () => {
  const previousFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({
        economicCalendar: [{
          id: 81,
          event: 'Inflation release',
          time: '2026-10-27 12:30:00',
          impact: 'high',
          country: 'United States',
        }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const provider = new FinnhubNewsProvider('test-key');
    const events = await provider.getEconomicCalendar();
    assert.match(requestedUrl, /calendar\/economic/);
    assert.match(requestedUrl, /token=test-key/);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      id: '81',
      title: 'Inflation release',
      date: '2026-10-27T12:30:00Z',
      impact: 'HIGH',
      country: 'United States',
      currency: 'USD',
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('Finnhub numeric impact levels are normalized for calendar badges', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({
      economicCalendar: [
        { id: 1, event: 'Rate decision', time: '2026-10-25 12:00:00', impact: '3' },
        { id: 2, event: 'Employment report', time: '2026-10-25 13:00:00', impact: '2' },
        { id: 3, event: 'Survey', time: '2026-10-25 14:00:00', impact: '1' },
      ],
    }),
  }) as Response) as typeof fetch;

  try {
    const provider = new FinnhubNewsProvider('test-key');
    const events = await provider.getEconomicCalendar();
    assert.deepEqual(events.map((event: { impact: string }) => event.impact), ['HIGH', 'MEDIUM', 'LOW']);
  } finally {
    global.fetch = previousFetch;
  }
});

test('calendar client returns provider freshness and marks an unconfigured provider offline', async () => {
  const previousFetch = global.fetch;
  const updatedAt = '2026-10-24T07:30:00.000Z';
  let payload: Record<string, unknown> = {
    events: [{ id: 'event-1', title: 'Rate decision', date: updatedAt, impact: 'HIGH' }],
    dataSource: 'provider',
    updatedAt,
  };
  global.fetch = (async () => Response.json(payload)) as typeof fetch;

  try {
    const provider = new DefaultNewsProvider();
    const liveResult = await provider.getEconomicCalendar();
    assert.equal(liveResult.live, true);
    assert.equal(liveResult.updatedAt, updatedAt);
    assert.equal(liveResult.events.length, 1);

    payload = { events: [], dataSource: 'unavailable', updatedAt: null };
    const unavailableResult = await provider.getEconomicCalendar();
    assert.equal(unavailableResult.live, false);
    assert.equal(unavailableResult.updatedAt, null);
    assert.deepEqual(unavailableResult.events, []);
  } finally {
    global.fetch = previousFetch;
  }
});

test('calendar client surfaces server failures instead of returning an empty calendar', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () => Response.json({ error: 'provider timeout' }, { status: 502 })) as typeof fetch;

  try {
    await assert.rejects(new DefaultNewsProvider().getEconomicCalendar(), /502.*provider timeout/i);
  } finally {
    global.fetch = previousFetch;
  }
});