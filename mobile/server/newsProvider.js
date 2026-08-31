const { buildInstrumentNewsResponse } = require('./newsService');

function parseSymbol(symbol) {
  const cleaned = String(symbol || '').trim().toUpperCase();
  if (!cleaned) return { base: '', quote: '' };
  const parts = cleaned.split('/');
  if (parts.length === 2) return { base: parts[0].trim(), quote: parts[1].trim() };
  return { base: cleaned, quote: '' };
}

function getRelatedCurrencies(symbol) {
  const { base, quote } = parseSymbol(symbol);
  const set = new Set();
  if (base) set.add(base);
  if (quote) set.add(quote);
  if (quote === 'USD' || base === 'USD') set.add('USD');
  if (base === 'XAU' || quote === 'XAU') set.add('XAU');
  return Array.from(set);
}

function getImpactFromText(text = '') {
  const t = String(text || '').toLowerCase();
  if (/cpi|inflation|jobs|nfp|nonfarm|gdp|fed|boe|ecb|boj|rba|rbnz|rate decision|interest rate/i.test(t)) return 'HIGH';
  if (/growth|wage|employment|policy|yield|gold|commod/i.test(t)) return 'MEDIUM';
  return 'LOW';
}

function inferArticleImpact(raw = {}) {
  return String(raw.impact || raw.level || raw.significance || getImpactFromText(`${raw.title || ''} ${raw.summary || ''}`)).toUpperCase();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

class FinnhubNewsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async getNewsForInstrument(symbol) {
    if (!this.apiKey) return [];
    try {
      const payload = await fetchJson(`https://finnhub.io/api/v1/news?category=forex&token=${encodeURIComponent(this.apiKey)}`);
      const relevant = getRelatedCurrencies(symbol);
      const articles = Array.isArray(payload) ? payload : [];
      return articles
        .filter((item) => {
          const haystack = `${item.headline || ''} ${item.summary || ''} ${item.category || ''}`.toLowerCase();
          if (!relevant.length) return true;
          const matchesCurrency = relevant.some((currency) => haystack.includes(currency.toLowerCase()));
          const matchesMacro = /(fed|boe|ecb|bank of england|federal reserve|inflation|jobs|gdp|rates|gold)/i.test(haystack);
          return matchesCurrency || matchesMacro;
        })
        .slice(0, 6)
        .map((item) => ({
          id: String(item.id || `${item.headline || 'finnhub'}-${item.datetime || Date.now()}`),
          title: String(item.headline || item.title || 'Market news').trim(),
          summary: String(item.summary || item.text || 'No summary available.').trim(),
          source: String(item.source || 'Finnhub').trim(),
          publishedAt: item.datetime ? new Date(Number(item.datetime) * 1000).toISOString() : new Date().toISOString(),
          url: item.url || null,
          currencies: relevant,
          impact: inferArticleImpact(item),
          category: String(item.category || 'macro').trim().toLowerCase(),
          sentiment: 'neutral',
        }));
    } catch (error) {
      return [];
    }
  }
}

class TwelveDataNewsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async getUpcomingEvents(symbol) {
    if (!this.apiKey) return [];
    try {
      const start = new Date();
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const payload = await fetchJson(`https://api.twelvedata.com/economic_calendar?apikey=${encodeURIComponent(this.apiKey)}&start_date=${encodeURIComponent(start.toISOString().slice(0, 10))}&end_date=${encodeURIComponent(end.toISOString().slice(0, 10))}`);
      const events = Array.isArray(payload?.events) ? payload.events : [];
      const relevant = getRelatedCurrencies(symbol);
      return events
        .filter((item) => {
          const title = `${item.event || ''} ${item.country || ''} ${item.currency || ''}`;
          const targetCurrencies = new Set(relevant);
          if (item.currency) targetCurrencies.add(String(item.currency).toUpperCase());
          const matches = Array.from(targetCurrencies).some((currency) => title.toUpperCase().includes(currency));
          return matches || /(FED|BOE|ECB|CPI|GDP|JOBS|RATE|INFLATION)/i.test(title);
        })
        .slice(0, 8)
        .map((item) => ({
          id: String(item.id || `${item.event || 'event'}-${item.date || Date.now()}`),
          title: String(item.event || item.name || 'Economic event').trim(),
          date: item.date || item.datetime || new Date().toISOString(),
          impact: String(item.impact || item.importance || 'MEDIUM').toUpperCase(),
          country: item.country || null,
          currency: String(item.currency || '').trim().toUpperCase() || null,
          eventType: String(item.type || 'macro').trim().toLowerCase(),
        }));
    } catch (error) {
      return [];
    }
  }
}

class MarketNewsProvider {
  constructor({ finnhubApiKey, twelvedataApiKey } = {}) {
    this.providers = [];
    if (finnhubApiKey) this.providers.push(new FinnhubNewsProvider(finnhubApiKey));
    if (twelvedataApiKey) this.providers.push(new TwelveDataNewsProvider(twelvedataApiKey));
  }

  async getNewsForInstrument(symbol) {
    if (this.providers.length === 0) return [];
    const articleCollections = await Promise.all(this.providers.map(async (provider) => {
      try {
        return await provider.getNewsForInstrument(symbol);
      } catch (error) {
        return [];
      }
    }));

    const articles = articleCollections.flat();
    const normalized = articles.map((article) => ({
      ...article,
      currencies: Array.isArray(article.currencies) ? article.currencies : getRelatedCurrencies(symbol),
      impact: String(article.impact || 'MEDIUM').toUpperCase(),
    }));

    const deduped = new Map();
    for (const article of normalized) {
      const key = `${article.source}|${article.title}|${article.publishedAt}`;
      if (!deduped.has(key)) deduped.set(key, article);
    }

    return buildInstrumentNewsResponse(symbol, { articles: Array.from(deduped.values()) }).articles;
  }

  async getUpcomingEvents(symbol) {
    if (this.providers.length === 0) return [];
    const eventCollections = await Promise.all(this.providers.map(async (provider) => {
      try {
        if (typeof provider.getUpcomingEvents === 'function') return await provider.getUpcomingEvents(symbol);
        return [];
      } catch (error) {
        return [];
      }
    }));

    const events = eventCollections.flat();
    const deduped = new Map();
    for (const event of events) {
      const key = `${event.title}|${event.date}|${event.currency || 'unknown'}`;
      if (!deduped.has(key)) deduped.set(key, event);
    }

    return buildInstrumentNewsResponse(symbol, { articles: [], events: Array.from(deduped.values()) }).events;
  }
}

module.exports = {
  MarketNewsProvider,
  FinnhubNewsProvider,
  TwelveDataNewsProvider,
  getRelatedCurrencies,
};
