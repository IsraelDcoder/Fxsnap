import { Instrument } from '@/types/instrument';
import { resolveApiBaseUrl } from './apiAuth';

const API_BASE = resolveApiBaseUrl();

const INITIAL_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'USD/CHF',
  'NZD/USD',
  'XAU/USD',
];

function deriveState(change?: number | null) {
  if (change == null) return 'neutral';
  if (change > 0) return 'bullish';
  if (change < 0) return 'bearish';
  return 'neutral';
}

async function fetchQuotes(symbols: string[]) {
  try {
    const q = symbols.map((s) => encodeURIComponent(s)).join(',');
    const resp = await fetch(`${API_BASE}/market/quotes?symbols=${q}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return json && json.quotes ? json.quotes : [];
  } catch (e) {
    // network error — return empty
    return [];
  }
}

export async function getWatchlistInstruments(): Promise<Instrument[]> {
  const symbols = INITIAL_SYMBOLS.slice();
  const quotes = await fetchQuotes(symbols);

  const bySymbol: Record<string, any> = {};
  for (const q of quotes) {
    const sym = String(q.symbol || '').toUpperCase();
    bySymbol[sym] = q;
  }

  return symbols.map((symbol) => {
    const parts = symbol.split('/');
    const assetType = symbol === 'XAU/USD' ? 'Commodity' : 'Forex';
    const q = bySymbol[symbol];
    const price = q && q.price != null ? Number(q.price) : null;

    const raw = q && typeof q.raw === 'object' ? q.raw : {};
    const prevClose = raw.previous_close != null ? Number(raw.previous_close) : null;
    const rawChange = raw.change != null ? Number(raw.change) : null;
    const rawPercent = raw.percent_change != null ? Number(raw.percent_change) : null;
    const change = rawChange != null ? rawChange : (price != null && prevClose != null ? price - prevClose : null);
    const changePercent = rawPercent != null ? rawPercent : (change != null && prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : null);

    return {
      symbol,
      name: parts.join('/'),
      assetType,
      price,
      change,
      changePercent,
      state: deriveState(change),
    } as Instrument;
  });
}

// subscribe to live updates for the provided symbols; returns unsubscribe()
export function subscribeToQuotes(symbols: string[], onTick: (tick: any) => void) {
  const q = symbols.map((s) => encodeURIComponent(s)).join(',');
  const url = `${API_BASE}/market/stream?symbols=${q}`;
  // EventSource is available in React Native via libraries; window.EventSource may not exist in RN.
  // Use native EventSource if available; otherwise fallback to fetch SSE polyfill expected in Expo web.
  // For now, if EventSource not available, return a no-op unsubscribe.
  if (typeof EventSource === 'undefined') {
    // Not available in this runtime — fallback to polling every 5s.
    let stopped = false;
    const interval = 5000;
    const doPoll = async () => {
      if (stopped) return;
      try {
        const resp = await fetch(`${API_BASE}/market/quotes?symbols=${q}`);
        if (!resp.ok) return;
        const json = await resp.json();
        const quotes = json && json.quotes ? json.quotes : [];
        // Notify with the full payload so callers can pick fields they need.
        onTick({ quotes, timestamp: Date.now() });
      } catch (e) {
        // ignore network errors — will retry on next tick
      }
    };
    // Start immediately
    void doPoll();
    const timer = setInterval(doPoll, interval);
    return () => {
      stopped = true;
      clearInterval(timer as any);
    };
  }

  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onTick(data);
    } catch (e) {}
  };
  es.onerror = () => {
    // ignore
  };
  return () => {
    try { es.close(); } catch (e) {}
  };
}
