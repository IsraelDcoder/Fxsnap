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

function normalizeEconomicImpact(value) {
  const impact = String(value || '').trim().toLowerCase();
  if (['high', '3', 'major', 'red'].includes(impact)) return 'HIGH';
  if (['medium', 'moderate', '2', 'yellow'].includes(impact)) return 'MEDIUM';
  if (['low', 'minor', '1', 'green'].includes(impact)) return 'LOW';
  return 'MEDIUM';
}

function normalizeEconomicEventDate(value) {
  const date = String(value || '').trim();
  if (!date) return new Date().toISOString();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(date)) return date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00.000Z`;
  return `${date.replace(' ', 'T')}Z`;
}

function currencyForCountry(country) {
  const currencies = {
    australia: 'AUD',
    canada: 'CAD',
    china: 'CNY',
    'euro area': 'EUR',
    france: 'EUR',
    germany: 'EUR',
    japan: 'JPY',
    'new zealand': 'NZD',
    switzerland: 'CHF',
    'united kingdom': 'GBP',
    'united states': 'USD',
  };
  return currencies[String(country || '').trim().toLowerCase()] || null;
}

function normalizeEconomicEvent(item = {}) {
  const country = String(item.country || '').trim() || null;
  const title = String(item.event || item.name || 'Economic event').trim();
  const date = normalizeEconomicEventDate(item.time || item.date || item.datetime);
  return {
    id: String(item.id || `${country || 'global'}-${title}-${date}`),
    title,
    date,
    impact: normalizeEconomicImpact(item.impact || item.importance),
    country,
    currency: String(item.currency || '').trim().toUpperCase() || currencyForCountry(country),
  };
}

function normalizeForexFactoryEvent(item = {}) {
  const title = String(item.title || '').trim();
  const date = String(item.date || '').trim();
  if (!title || !date || !Number.isFinite(Date.parse(date))) return null;
  const currency = String(item.country || '').trim().toUpperCase() || null;
  return {
    id: `${currency || 'ALL'}-${title}-${date}`,
    title,
    date,
    impact: normalizeEconomicImpact(item.impact),
    country: null,
    currency: currency && currency !== 'ALL' ? currency : null,
    actual: typeof item.actual === 'string' ? item.actual : null,
    forecast: typeof item.forecast === 'string' ? item.forecast : null,
    previous: typeof item.previous === 'string' ? item.previous : null,
  };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

class ForexFactoryCalendarProvider {
  constructor() {
    this.calendarSource = 'forex_factory_weekly';
  }

  async getEconomicCalendar() {
    const payload = await fetchJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
    if (!Array.isArray(payload)) throw new Error('The public weekly calendar feed returned an invalid response.');
    return payload
      .map(normalizeForexFactoryEvent)
      .filter((event) => event !== null);
  }
}

class FinnhubNewsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.calendarSource = 'finnhub';
  }

  async getEconomicCalendar() {
    if (!this.apiKey) return [];
    const start = new Date();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const query = new URLSearchParams({
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      token: this.apiKey,
    });
    const payload = await fetchJson(`https://finnhub.io/api/v1/calendar/economic?${query}`);
    if (payload?.error) throw new Error(String(payload.error));
    const events = Array.isArray(payload?.economicCalendar) ? payload.economicCalendar : [];
    return events.map((item) => normalizeEconomicEvent(item));
  }

  async getUpcomingEvents(symbol) {
    const relevant = getRelatedCurrencies(symbol);
    const events = await this.getEconomicCalendar();
    return events
      .filter((event) => {
        if (!relevant.length) return true;
        if (event.currency && relevant.includes(event.currency)) return true;
        const haystack = `${event.title} ${event.country || ''}`.toUpperCase();
        return /(FED|BOE|ECB|CPI|GDP|JOBS|RATE|INFLATION)/i.test(haystack);
      })
      .slice(0, 8);
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
}

class MarketNewsProvider {
  constructor({ finnhubApiKey, twelvedataApiKey } = {}) {
    this.providers = [new ForexFactoryCalendarProvider()];
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

  async getEconomicCalendar() {
    const calendarProviders = this.providers.filter((provider) => typeof provider.getEconomicCalendar === 'function');
    let lastError = null;
    for (const provider of calendarProviders) {
      try {
        const events = await provider.getEconomicCalendar();
        return {
          events,
          source: provider.calendarSource || 'provider',
        };
      } catch (error) {
        lastError = error;
        console.warn(`[news] ${provider.calendarSource || 'Calendar'} feed failed.`, error instanceof Error ? error.message : error);
      }
    }
    if (lastError) throw lastError;
    throw new Error('No economic calendar providers are available.');
  }
}

module.exports = {
  MarketNewsProvider,
  ForexFactoryCalendarProvider,
  FinnhubNewsProvider,
  TwelveDataNewsProvider,
  getRelatedCurrencies,
};
