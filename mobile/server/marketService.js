// Simple market service: abstraction layer and simulated data for local/demo use.
// This file provides getQuotes, getCandles and an SSE stream for live updates.
const EventEmitter = require('events');

const DEFAULT_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'NZD/USD',
  'XAU/USD',
  'BTC/USD',
];

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

class MarketService extends EventEmitter {
  constructor() {
    super();
    this.symbols = DEFAULT_SYMBOLS.slice();
    this.prices = new Map();
    this._initPrices();
    this._startSimulator();
  }

  _initPrices() {
    // seed sensible starting prices
    const seeds = {
      'EUR/USD': 1.0876,
      'GBP/USD': 1.2675,
      'USD/JPY': 154.32,
      'AUD/USD': 0.6432,
      'USD/CAD': 1.3611,
      'NZD/USD': 0.5867,
      'XAU/USD': 2312.5,
      'BTC/USD': 57300.0,
    };
    for (const s of this.symbols) this.prices.set(s, seeds[s] ?? 1.0);
  }

  _startSimulator() {
    // every second, mutate prices slightly and emit 'tick'
    this._simTimer = setInterval(() => {
      for (const s of this.symbols) {
        const current = this.prices.get(s) || 1.0;
        // gaussian-ish small change
        const change = (Math.random() - 0.5) * (Math.abs(current) * 0.0005 + 0.0001);
        const next = Number((current + change).toFixed(6));
        this.prices.set(s, next);
        this.emit('tick', { symbol: s, price: next, timestamp: Date.now() });
      }
    }, 1000);
  }

  stop() {
    if (this._simTimer) clearInterval(this._simTimer);
    this.removeAllListeners();
  }

  async getQuotes(symbols) {
    const requested = (symbols || DEFAULT_SYMBOLS).map(normalizeSymbol);
    const result = requested.map((s) => {
      const price = this.prices.get(s) ?? null;
      return {
        symbol: s,
        price,
        timestamp: Date.now(),
      };
    });
    return result;
  }

  async getCandles(symbol, interval = '1min', limit = 100) {
    // Provide synthetic candles based on current price history approximation.
    // This is a demo implementation and should be replaced by real provider data.
    const now = Date.now();
    const price = this.prices.get(normalizeSymbol(symbol)) || 1.0;
    const candles = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = now - i * 60 * 1000; // 1min spacing
      const open = Number((price * (1 + (Math.sin(i) * 0.0005))).toFixed(6));
      const close = Number((open * (1 + (Math.random() - 0.5) * 0.001)).toFixed(6));
      const high = Math.max(open, close) * (1 + Math.random() * 0.0005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.0005);
      candles.push({ time: new Date(t).toISOString(), open, high: Number(high.toFixed(6)), low: Number(low.toFixed(6)), close });
    }
    return candles;
  }

  // SSE helper: attach a request/response and stream ticks for requested symbols
  attachSSE(req, res, symbols) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const onTick = (tick) => {
      if (!symbols || symbols.length === 0 || symbols.includes(tick.symbol)) {
        res.write(`data: ${JSON.stringify(tick)}\n\n`);
      }
    };
    this.on('tick', onTick);
    // send a keep-alive comment every 20s
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);
    // cleanup on close
    req.on('close', () => {
      clearInterval(keepAlive);
      this.removeListener('tick', onTick);
      try { res.end(); } catch (e) {}
    });
  }
}

module.exports = new MarketService();
