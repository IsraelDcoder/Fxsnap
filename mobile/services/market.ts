// Lightweight client for market endpoints
import { resolveApiBaseUrl } from './apiAuth';

const API_BASE = resolveApiBaseUrl();

export interface MarketQuote {
  symbol: string;
  price: number | null;
  timestamp?: number;
  raw?: Record<string, unknown>;
}

export async function fetchMarketQuotes(symbols: string[]): Promise<{ quotes: MarketQuote[]; live: boolean }> {
  try {
    const params = encodeURIComponent(symbols.join(','));
    const response = await fetch(`${API_BASE}/market/quotes?symbols=${params}`);
    if (!response.ok) return { quotes: [], live: false };
    const payload = await response.json();
    return {
      quotes: Array.isArray(payload.quotes) ? payload.quotes : [],
      live: payload.dataSource === 'provider',
    };
  } catch {
    return { quotes: [], live: false };
  }
}

export async function fetchMarketCandles(symbol: string, interval = '1h', limit = 36) {
  try {
    const url = `${API_BASE}/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return { candles: [], live: false };
    const payload = await response.json();
    return {
      candles: Array.isArray(payload.candles) ? payload.candles : [],
      live: payload.dataSource === 'provider',
    };
  } catch {
    return { candles: [], live: false };
  }
}

export async function fetchQuote(symbol: string) {
  try {
    const q = encodeURIComponent(symbol);
    const url = `${API_BASE}/market/quotes?symbols=${q}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const quotes = json && json.quotes ? json.quotes : [];
    return quotes && quotes.length ? quotes[0] : null;
  } catch (e) {
    return null;
  }
}

export async function fetchCandles(symbol: string, interval: string, limit = 100) {
  try {
    const url = `${API_BASE}/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return json && json.candles ? json.candles : [];
  } catch (e) {
    return [];
  }
}

export async function analyzeMarket(symbol: string, interval: string, candles: any[] = []) {
  const url = `${API_BASE}/market/analyze`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, interval, candles }),
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload?.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export const INTERVAL_MAP: Record<string, string> = {
  '15m': '15min',
  '1H': '1h',
  '4H': '4h',
  '1D': '1day',
};

export default { fetchQuote, fetchCandles, INTERVAL_MAP };
