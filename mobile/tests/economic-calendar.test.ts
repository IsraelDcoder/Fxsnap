import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TwelveDataNewsProvider } = require('../server/newsProvider.js');

test('Twelve Data calendar events are normalized from provider data', async () => {
  const previousFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({
        events: [{
          id: 81,
          event: 'Inflation release',
          date: '2026-09-27 12:30:00',
          impact: 'HIGH',
          country: 'United States',
          currency: 'USD',
        }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const provider = new TwelveDataNewsProvider('test-key');
    const events = await provider.getEconomicCalendar();
    assert.match(requestedUrl, /economic_calendar/);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      id: '81',
      title: 'Inflation release',
      date: '2026-09-27 12:30:00',
      impact: 'HIGH',
      country: 'United States',
      currency: 'USD',
    });
  } finally {
    global.fetch = previousFetch;
  }
});