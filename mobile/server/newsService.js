const crypto = require('crypto');

function toUpperCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeImpact(value) {
  const v = String(value || '').trim().toUpperCase();
  if (['HIGH', 'MEDIUM', 'LOW'].includes(v)) return v;
  return 'MEDIUM';
}

function normalizeSentiment(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['positive', 'negative', 'neutral'].includes(v)) return v;
  return 'neutral';
}

function normalizeSource(value) {
  const source = String(value || '').trim();
  return source || 'Unknown';
}

function normalizeCurrencyList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((v) => toUpperCode(v)).filter(Boolean))];
  if (typeof value === 'string') return [...new Set(value.split(/[\s,|/]+/).map((v) => toUpperCode(v)).filter(Boolean))];
  return [];
}

function normalizeNewsArticle(raw = {}) {
  const title = String(raw.title || raw.headline || 'Market update').trim();
  const summary = String(raw.summary || raw.description || raw.text || '').trim();
  const source = normalizeSource(raw.source || raw.publisher || raw.author || 'Unknown');
  const publishedAt = raw.publishedAt || raw.datetime || raw.time || new Date().toISOString();
  const currencies = normalizeCurrencyList(raw.currencies || raw.currency || []);
  const category = String(raw.category || raw.type || 'general').trim().toLowerCase() || 'general';
  const impact = normalizeImpact(raw.impact || raw.level || raw.significance || 'MEDIUM');
  const sentiment = normalizeSentiment(raw.sentiment || raw.direction || 'neutral');

  return {
    id: String(raw.id || `${source}-${title}-${publishedAt}`),
    title,
    summary,
    source,
    publishedAt,
    url: raw.url || raw.link || null,
    currencies,
    category,
    impact,
    sentiment,
  };
}

function normalizeUpcomingEvent(raw = {}) {
  const event = {
    id: String(raw.id || `${raw.title || 'event'}-${raw.date || Date.now()}`),
    title: String(raw.title || raw.name || 'Upcoming event').trim(),
    date: raw.date || raw.datetime || raw.scheduledAt || new Date().toISOString(),
    impact: normalizeImpact(raw.impact || raw.level || raw.significance || 'MEDIUM'),
    country: raw.country || raw.region || null,
    currency: toUpperCode(raw.currency || raw.curr || ''),
    eventType: String(raw.eventType || raw.type || 'macro').trim().toLowerCase() || 'macro',
  };

  if (!event.currency && event.title) {
    const match = event.title.match(/\b(USD|GBP|EUR|JPY|CAD|CHF|AUD|NZD|XAU)\b/i);
    if (match) event.currency = toUpperCode(match[1]);
  }

  return event;
}

function dedupeById(items) {
  const seen = new Map();
  for (const item of items) {
    const key = String(item.id || JSON.stringify({ title: item.title, date: item.date || item.publishedAt, source: item.source }));
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

function buildInstrumentNewsResponse(symbol, payload = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const articles = (Array.isArray(payload.articles) ? payload.articles : []).map(normalizeNewsArticle);
  const events = (Array.isArray(payload.events) ? payload.events : []).map(normalizeUpcomingEvent);

  const filteredArticles = dedupeById(articles.filter((article) => {
    if (!article.currencies.length) return true;
    return article.currencies.includes(normalizedSymbol.split('/')[0]) || article.currencies.includes(normalizedSymbol.split('/')[1]) || article.currencies.includes('USD');
  }));

  const filteredEvents = dedupeById(events.filter((event) => {
    if (!event.currency) return true;
    return event.currency === normalizedSymbol.split('/')[0] || event.currency === normalizedSymbol.split('/')[1];
  }));

  return {
    symbol: normalizedSymbol,
    articles: filteredArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
    events: filteredEvents.sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

function matchesInstrument(item, symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return true;
  const [base, quote] = normalized.split('/');
  const currencies = Array.isArray(item?.currencies) ? item.currencies.map((value) => toUpperCode(value)) : [];
  const itemCurrency = toUpperCode(item?.currency || '');
  return !currencies.length && !itemCurrency
    ? true
    : currencies.includes(base) || currencies.includes(quote) || itemCurrency === base || itemCurrency === quote;
}

function makeBriefCard({ instrument, category, headline, subheading, explanation, timestamp, impact, source, id }) {
  return {
    id: String(id || `${instrument}-${headline}-${timestamp || Date.now()}`),
    instrument: String(instrument || '').trim().toUpperCase(),
    category: String(category || 'macro').trim().toLowerCase() || 'macro',
    headline: String(headline || 'Market update').trim(),
    subheading: String(subheading || source || 'FXSnap market brief').trim(),
    explanation: String(explanation || 'Market conditions remain fluid.').trim(),
    timestamp: timestamp || new Date().toISOString(),
    impact: normalizeImpact(impact || 'MEDIUM'),
  };
}

function buildSavedBriefRecord({ user_id, brief_id, card_id, instrument, headline, summary, created_at }) {
  return {
    user_id: String(user_id || 'device-user'),
    brief_id: String(brief_id || 'daily-brief'),
    card_id: String(card_id || `${brief_id || 'daily-brief'}-${instrument || 'pair'}`),
    instrument: String(instrument || '').trim().toUpperCase(),
    headline: String(headline || 'Market update').trim(),
    summary: String(summary || '').trim(),
    created_at: String(created_at || new Date().toISOString()),
  };
}

function buildDailyBriefCards(symbols, payload = {}) {
  const watchlist = Array.isArray(symbols) ? symbols.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean) : [];
  const articles = (Array.isArray(payload.articles) ? payload.articles : []).map(normalizeNewsArticle);
  const events = (Array.isArray(payload.events) ? payload.events : []).map(normalizeUpcomingEvent);

  const cards = [];

  for (const symbol of watchlist) {
    const relatedArticles = articles.filter((article) => matchesInstrument(article, symbol));
    const relatedEvents = events.filter((event) => matchesInstrument(event, symbol));

    const topArticle = relatedArticles[0];
    if (topArticle) {
      cards.push(makeBriefCard({
        instrument: symbol,
        category: topArticle.category || 'macro',
        headline: topArticle.title,
        subheading: `${topArticle.source} • ${symbol}`,
        explanation: topArticle.summary || 'Market conditions continue to evolve around this pair.',
        timestamp: topArticle.publishedAt,
        impact: topArticle.impact,
        source: topArticle.source,
        id: `article-${symbol}-${topArticle.id}`,
      }));
    }

    const topEvent = relatedEvents[0];
    if (topEvent) {
      cards.push(makeBriefCard({
        instrument: symbol,
        category: topEvent.eventType || 'event',
        headline: topEvent.title,
        subheading: `${topEvent.country || 'Macro event'} • ${topEvent.date}`,
        explanation: `${topEvent.currency ? `${topEvent.currency} data release` : 'Upcoming macro event'} is likely to influence the market tone for ${symbol}.`,
        timestamp: topEvent.date,
        impact: topEvent.impact,
        source: topEvent.country || 'Calendar',
        id: `event-${symbol}-${topEvent.id}`,
      }));
    }
  }

  const remainingArticles = articles.filter((article) => !cards.some((card) => card.headline === article.title));
  for (const article of remainingArticles) {
    const instrument = article.currencies.length ? article.currencies[0] : 'USD';
    cards.push(makeBriefCard({
      instrument: watchlist.includes(`${instrument}/${article.currencies[1] || 'USD'}`) ? `${instrument}/${article.currencies[1] || 'USD'}` : (watchlist.includes(`USD/${instrument}`) ? `USD/${instrument}` : instrument),
      category: article.category || 'macro',
      headline: article.title,
      subheading: `${article.source} • ${instrument}`,
      explanation: article.summary || 'Market remains sensitive to the latest macro developments.',
      timestamp: article.publishedAt,
      impact: article.impact,
      source: article.source,
      id: `article-fallback-${article.id}`,
    }));
  }

  const remainingEvents = events.filter((event) => !cards.some((card) => card.headline === event.title));
  for (const event of remainingEvents) {
    cards.push(makeBriefCard({
      instrument: event.currency || 'USD',
      category: event.eventType || 'event',
      headline: event.title,
      subheading: `${event.country || 'Macro event'} • ${event.date}`,
      explanation: `${event.currency || 'Major'} macro data is coming into focus and may alter the immediate directional bias.`,
      timestamp: event.date,
      impact: event.impact,
      source: event.country || 'Calendar',
      id: `event-fallback-${event.id}`,
    }));
  }

  const deduped = new Map();
  for (const card of cards) {
    const key = `${card.instrument}|${card.headline}|${card.timestamp}`;
    if (!deduped.has(key)) deduped.set(key, card);
  }

  return Array.from(deduped.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 18)
    .map((card) => ({
      ...card,
      impact: normalizeImpact(card.impact),
    }));
}

module.exports = {
  normalizeNewsArticle,
  normalizeUpcomingEvent,
  buildInstrumentNewsResponse,
  buildDailyBriefCards,
  buildSavedBriefRecord,
};
