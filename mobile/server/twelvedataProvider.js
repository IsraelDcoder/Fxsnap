// Twelve Data provider skeleton implementation
// Uses the public Twelve Data REST endpoints. This is a lightweight, dependency-free
// implementation that intentionally keeps WebSocket support as an opt-in/advanced
// feature (see subscribeLive stub).

const MarketDataProvider = require('./marketProvider');

const API_BASE = 'https://api.twelvedata.com';

function ensureFetch() {
  if (typeof fetch === 'undefined') {
    // Node 18+ exposes global fetch. If not available, surface a clear error.
    throw new Error('global fetch is not available in this Node runtime. Please run on Node 18+ or polyfill fetch.');
  }
}

class TwelveDataProvider extends MarketDataProvider {
  constructor(apiKey, opts = {}) {
    super();
    if (!apiKey) throw new Error('TwelveDataProvider requires an apiKey');
    this.apiKey = apiKey;
    this.opts = opts || {};
    this._symbolsCache = null;
  }

  async _fetch(path, params = {}) {
    ensureFetch();
    const url = new URL(API_BASE + path);
    const p = { ...params, apikey: this.apiKey };
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || `HTTP ${res.status} ${res.statusText}`;
      const err = new Error(`TwelveData API error: ${msg}`);
      err.response = json;
      throw err;
    }
    if (json && (json.status === 'error' || json.code === 'error')) {
      const err = new Error(json.message || JSON.stringify(json));
      err.response = json;
      throw err;
    }
    return json;
  }

  // quote: returns { symbol, price, timestamp, raw }
  async getQuote(symbol) {
    const s = String(symbol || '').trim();
    if (!s) throw new Error('symbol required');
    const json = await this._fetch('/quote', { symbol: s });
    // Example response: { symbol: 'EUR/USD', price: '1.0876', timestamp: '167...' }
    // Twelve Data may return price-like fields under different keys (price, close, last_trade, etc.)
    const rawPrice = (json && (json.price ?? json.close ?? json.last_trade ?? json.last ?? json.value ?? json.ask ?? json.bid)) ?? null;
    const priceNum = rawPrice != null ? Number(rawPrice) : null;
    const ts = (json && json.timestamp) ? (Number(json.timestamp) * 1000) : (json && json.datetime ? Date.parse(String(json.datetime)) : Date.now());
    return {
      symbol: s,
      price: Number.isFinite(priceNum) ? priceNum : null,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      raw: json,
    };
  }

  async getCandles(symbol, interval = '1min', limit = 100) {
    const s = String(symbol || '').trim();
    if (!s) throw new Error('symbol required');
    const json = await this._fetch('/time_series', { symbol: s, interval, outputsize: limit });
    const values = json && (json.values || json.data || []) ? (json.values || json.data || []) : [];
    return values.map((v) => ({
      time: v.datetime || v.timestamp || null,
      open: v.open ? Number(v.open) : null,
      high: v.high ? Number(v.high) : null,
      low: v.low ? Number(v.low) : null,
      close: v.close ? Number(v.close) : null,
      volume: v.volume !== undefined ? v.volume : null,
      raw: v,
    }));
  }

  async getSupportedSymbols() {
    if (this._symbolsCache) return this._symbolsCache;
    const json = await this._fetch('/symbols');
    // The endpoint returns data in various shapes; prefer json.data or json
    const data = json && (json.data || json) ? (json.data || json) : [];
    this._symbolsCache = data;
    return data;
  }

    // WebSocket live subscription: basic 'ws' client integration.
    subscribeLive(symbols, onTick) {
      if (!Array.isArray(symbols)) symbols = [symbols];
      if (!this.opts.enableWs) {
        throw new Error('WebSocket support not enabled. Create the provider with { enableWs: true } to enable live subscriptions.');
      }
      let WebSocket;
      try {
        WebSocket = require('ws');
      } catch (e) {
        throw new Error('ws package not installed. Install "ws" in your project to use WebSocket live subscriptions.');
      }

      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        const url = `wss://ws.twelvedata.com/v1/quotes?apikey=${encodeURIComponent(this.apiKey)}`;
        this._ws = new WebSocket(url);
        this._pendingSubs = new Set();
        this._ws.on('message', (msg) => {
          try {
            const parsed = JSON.parse(String(msg));
            // Twelve Data websocket payloads vary — try to extract symbol/price
            const symbol = parsed && (parsed.symbol || parsed.s) ? (parsed.symbol || parsed.s) : null;
            const price = parsed && (parsed.price || parsed.p) ? Number(parsed.price || parsed.p) : null;
            const timestamp = parsed && parsed.timestamp ? Number(parsed.timestamp) * 1000 : Date.now();
            if (symbol) onTick({ symbol: String(symbol).toUpperCase(), price, timestamp, raw: parsed });
          } catch (err) {
            // ignore parse errors
          }
        });
        this._ws.on('open', () => {
          // subscribe any pending symbols
          for (const s of this._pendingSubs) this._ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: s } }));
        });
        this._ws.on('error', (err) => {
          // propagate optionally via onTick as error object
          // caller should handle errors gracefully
        });
      }

      // maintain internal subscription set
      const subKey = symbols.join(',');
      this._pendingSubs.add(subKey);
      if (this._ws.readyState === 1) {
        try { this._ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: subKey } })); } catch {}
      }

      // return unsubscribe handle
      return () => {
        try {
          if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ action: 'unsubscribe', params: { symbols: subKey } }));
        } catch (e) {}
        this._pendingSubs.delete(subKey);
      };
    }
}

module.exports = TwelveDataProvider;
