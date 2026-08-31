const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeNewsArticle, normalizeUpcomingEvent, buildInstrumentNewsResponse, buildDailyBriefCards, buildSavedBriefRecord } = require('./newsService');

test('normalizeNewsArticle assigns a valid impact and currency match', () => {
  const normalized = normalizeNewsArticle({
    id: 'id-1',
    title: 'Bank of England holds rates as inflation cools',
    summary: 'The BoE kept rates unchanged amid softer inflation and a steady jobs market.',
    source: 'Reuters',
    publishedAt: '2026-08-29T08:00:00Z',
    url: 'https://example.com/boe',
    currencies: ['GBP', 'USD'],
    category: 'central-bank',
  });

  assert.equal(normalized.impact, 'MEDIUM');
  assert.deepEqual(normalized.currencies, ['GBP', 'USD']);
  assert.equal(normalized.category, 'central-bank');
});

test('buildInstrumentNewsResponse deduplicates and maps by symbol', () => {
  const response = buildInstrumentNewsResponse('GBP/USD', {
    articles: [
      { id: 'a1', title: 'BoE rates decision', summary: 'BoE holds', source: 'Reuters', publishedAt: '2026-08-29T08:00:00Z', currencies: ['GBP'], category: 'central-bank', impact: 'MEDIUM' },
      { id: 'a1', title: 'BoE rates decision', summary: 'BoE holds', source: 'Reuters', publishedAt: '2026-08-29T08:00:00Z', currencies: ['GBP'], category: 'central-bank', impact: 'MEDIUM' },
      { id: 'a2', title: 'Fed speaks on inflation', summary: 'Fed comments as inflation remains sticky', source: 'Bloomberg', publishedAt: '2026-08-28T19:40:00Z', currencies: ['USD'], category: 'inflation', impact: 'HIGH' },
    ],
    events: [
      { id: 'e1', title: 'UK CPI', date: '2026-08-30T09:00:00Z', impact: 'HIGH', currency: 'GBP', country: 'United Kingdom' },
      { id: 'e1', title: 'UK CPI', date: '2026-08-30T09:00:00Z', impact: 'HIGH', currency: 'GBP', country: 'United Kingdom' },
    ],
  });

  assert.equal(response.symbol, 'GBP/USD');
  assert.equal(response.articles.length, 2);
  assert.equal(response.events.length, 1);
  assert.equal(response.articles[0].impact, 'MEDIUM');
});

test('buildDailyBriefCards produces a brief sequence for the watchlist', () => {
  const cards = buildDailyBriefCards(['EUR/USD', 'GBP/USD', 'USD/JPY'], {
    articles: [
      { id: 'a1', title: 'BoE inflation surprise', summary: 'UK inflation beat expectations and pressured sterling.', source: 'Reuters', publishedAt: '2026-08-29T08:00:00Z', currencies: ['GBP'], category: 'inflation', impact: 'HIGH' },
      { id: 'a2', title: 'Fed outlook still supports dollar strength', summary: 'Rate guidance is keeping USD demand elevated.', source: 'Bloomberg', publishedAt: '2026-08-29T07:15:00Z', currencies: ['USD'], category: 'rates', impact: 'MEDIUM' },
      { id: 'a3', title: 'Eurozone data firmed slightly', summary: 'Eurozone activity data improved, helping the single currency.', source: 'FT', publishedAt: '2026-08-29T06:00:00Z', currencies: ['EUR'], category: 'growth', impact: 'LOW' },
    ],
    events: [
      { id: 'e1', title: 'UK CPI release', date: '2026-08-30T09:00:00Z', impact: 'HIGH', currency: 'GBP', country: 'United Kingdom' },
      { id: 'e2', title: 'FOMC rate decision', date: '2026-08-29T18:00:00Z', impact: 'HIGH', currency: 'USD', country: 'United States' },
    ],
  });

  assert.ok(cards.length >= 4);
  assert.ok(cards.some((card) => card.instrument === 'GBP/USD'));
  assert.ok(cards.some((card) => card.instrument === 'USD/JPY'));
  assert.ok(cards.every((card) => ['LOW', 'MEDIUM', 'HIGH'].includes(card.impact)));
  assert.ok(cards.every((card) => card.headline && card.explanation));
});

test('buildSavedBriefRecord contains the required persistence fields', () => {
  const record = buildSavedBriefRecord({
    user_id: 'device-123',
    brief_id: 'daily-brief-2026-08-29',
    card_id: 'brief-card-1',
    instrument: 'GBP/USD',
    headline: 'UK inflation surprises markets',
    summary: 'UK inflation data came in hotter than markets expected and kept the pound supported.',
    created_at: '2026-08-29T09:00:00Z',
  });

  assert.deepEqual(Object.keys(record), ['user_id', 'brief_id', 'card_id', 'instrument', 'headline', 'summary', 'created_at']);
  assert.equal(record.instrument, 'GBP/USD');
  assert.equal(record.headline, 'UK inflation surprises markets');
});
