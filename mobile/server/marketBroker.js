// marketBroker: multiplexed market-data broker
// - Polls the configured provider for the union of requested symbols
// - Falls back to local marketService simulator when provider absent
// - Exposes attachSSE(req,res,symbols) for streaming ticks to clients

const EventEmitter = require('events');
const marketService = require('./marketService');

let provider = null;
try {
  const TwelveDataProvider = require('./twelvedataProvider');
  const key = process.env.TWELVEDATA_API_KEY || null;
  if (key && key !== 'replace_with_twelvedata_api_key') provider = new TwelveDataProvider(key, { enableWs: true });
} catch (e) {
  // ignore — provider optional
}

const POLL_MS = Number(process.env.MARKET_POLL_MS || '1000');
const MAX_REST_CREDITS_PER_MIN = Number(process.env.MARKET_MAX_REST_CREDITS_PER_MIN || '5000');
const MAX_WS_CREDITS = Number(process.env.MARKET_MAX_WS_CREDITS || '2000');
const REDIS_KEY_PREFIX = 'fxsnap:market:instance:';
const REDIS_TTL = 10; // seconds

class MarketBroker extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map(); // symbol -> count
    this._last = new Map();
    this._running = false;
    this._providerUnsub = null;
    this._metrics = { restCredits: 0, wsCredits: 0, lastReset: Date.now() };
    this._instanceId = require('crypto').randomBytes(8).toString('hex');
    this._redis = null;
    this._coordInterval = null;
    this._initRedisIfConfigured();
    this._onServiceTick = (tick) => this._handleServiceTick(tick);
    if (!provider) {
      // listen to simulated market service and forward ticks
      marketService.on('tick', this._onServiceTick);
    }
    this._startPollLoop();
  }

  _handleServiceTick(tick) {
    this._last.set(tick.symbol, tick);
    this.emit('tick', tick);
  }

  _startPollLoop() {
    if (this._running) return;
    this._running = true;
    const loop = async () => {
      try {
        const symbols = Array.from(this.subscribers.keys());
        if (symbols.length > 0) {
          if (provider) {
            // Prefer provider-side WS subscription where available.
            if (typeof provider.subscribeLive === 'function') {
              // ensure provider subscriptions reflect requested symbols
              this._resubscribeProvider();
              // provider will emit ticks via its onTick handler which in turn will call this.emit
            } else {
              // fallback to polling provider REST
              // throttle: prevent runaway REST credit consumption
              if (this._metrics.restCredits + symbols.length > MAX_REST_CREDITS_PER_MIN) {
                // skip this poll and rely on last-known values
              } else {
                const quotes = await provider.getQuotes(symbols);
                // account for rest credits (approx 1 credit per symbol)
                this._addRestCredits(symbols.length);
                for (const q of quotes) {
                  const tick = { symbol: String(q.symbol || '').toUpperCase(), price: q.price ?? null, timestamp: q.timestamp || Date.now() };
                  this._last.set(tick.symbol, tick);
                  this.emit('tick', tick);
                }
              }
            }
          } else {
            // no provider — rely on marketService ticks (already emitted)
          }
        }
      } catch (err) {
        this.emit('error', err);
      } finally {
        setTimeout(loop, POLL_MS);
      }
    };
    setTimeout(loop, POLL_MS);
  }

  _resubscribeProvider() {
    if (!provider || typeof provider.subscribeLive !== 'function') return;
    const allSymbols = Array.from(this.subscribers.keys());
    // unsubscribe previous
    try {
      if (this._providerUnsub) {
        this._providerUnsub();
        this._providerUnsub = null;
      }
    } catch (e) {}

    if (allSymbols.length === 0) return;

    // subscribe with provider; provider.subscribeLive returns unsubscribe function
    try {
      // throttle WS subscriptions
      if (allSymbols.length > MAX_WS_CREDITS) {
        throw new Error(`WS subscription count ${allSymbols.length} exceeds configured limit ${MAX_WS_CREDITS}`);
      }
      this._providerUnsub = provider.subscribeLive(allSymbols, (tick) => {
        const t = { symbol: String(tick.symbol || '').toUpperCase(), price: tick.price ?? null, timestamp: tick.timestamp || Date.now() };
        this._last.set(t.symbol, t);
        this.emit('tick', t);
      });
      // estimate WS credits used
      this._setWsCredits(allSymbols.length);
    } catch (e) {
      // subscription failed — ignore and fallback to polling
      this.emit('error', e);
    }
  }

  _addRestCredits(n) {
    const now = Date.now();
    if (now - this._metrics.lastReset > 60_000) {
      this._metrics.restCredits = 0;
      this._metrics.wsCredits = 0;
      this._metrics.lastReset = now;
    }
    this._metrics.restCredits += n;
  }

  _setWsCredits(n) {
    const now = Date.now();
    if (now - this._metrics.lastReset > 60_000) {
      this._metrics.restCredits = 0;
      this._metrics.wsCredits = 0;
      this._metrics.lastReset = now;
    }
    this._metrics.wsCredits = n;
  }

  getMetrics() {
    return { ...this._metrics };
  }

  async _initRedisIfConfigured() {
    const url = process.env.REDIS_URL || process.env.REDIS_URI || null;
    if (!url) return;
    try {
      const redis = require('redis');
      const client = redis.createClient({ url });
      // v3/v4 compatibility: attempt connect if function exists
      if (typeof client.connect === 'function') await client.connect();
      this._redis = client;
      // start coordination loop
      this._coordInterval = setInterval(() => this._publishSubscriptions(), 5000);
      // subscribe to tick channel
      try {
        const sub = client.duplicate ? client.duplicate() : client;
        if (typeof sub.connect === 'function') await sub.connect();
        if (typeof sub.subscribe === 'function') {
          // modern API: subscribe(channel, handler)
          await sub.subscribe('fxsnap:market:tick', (message) => {
            try {
              const tick = JSON.parse(message);
              this._last.set(tick.symbol, tick);
              this.emit('tick', tick);
            } catch (e) {}
          });
        }
      } catch (e) {
        // ignore subscriber errors
      }
    } catch (e) {
      // redis not configured or failed — ignore
      this._redis = null;
    }
  }

  async _publishSubscriptions() {
    if (!this._redis) return;
    try {
      const key = `${REDIS_KEY_PREFIX}${this._instanceId}`;
      const symbols = JSON.stringify(Array.from(this.subscribers.keys()));
      if (typeof this._redis.set === 'function') {
        await this._redis.set(key, symbols, 'EX', REDIS_TTL);
      } else if (typeof this._redis.setex === 'function') {
        await this._redis.setex(key, REDIS_TTL, symbols);
      }
      // publish last ticks for fan-out to other instances
      for (const [sym, tick] of this._last.entries()) {
        try { await this._redis.publish('fxsnap:market:tick', JSON.stringify(tick)); } catch (e) {}
      }
    } catch (e) {
      // ignore
    }
  }

  async getQuotes(symbols) {
    if (!symbols || symbols.length === 0) return [];
    const src = provider || marketService;
    return Promise.resolve(src.getQuotes(symbols));
  }

  async getCandles(symbol, interval = '1min', limit = 100) {
    const src = provider || marketService;
    return Promise.resolve(src.getCandles(symbol, interval, limit));
  }

  // SSE attach
  attachSSE(req, res, symbols) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const wanted = (symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean);

    const onTick = (tick) => {
      if (!wanted || wanted.length === 0 || wanted.includes(tick.symbol)) {
        res.write(`data: ${JSON.stringify(tick)}\n\n`);
      }
    };

    // register subscriptions counts
    for (const s of wanted) this.subscribers.set(s, (this.subscribers.get(s) || 0) + 1);

    this.on('tick', onTick);

    // send last-known values immediately
    if (!wanted || wanted.length === 0) {
      for (const [sym, tick] of this._last.entries()) res.write(`data: ${JSON.stringify(tick)}\n\n`);
    } else {
      for (const s of wanted) {
        const tick = this._last.get(s);
        if (tick) res.write(`data: ${JSON.stringify(tick)}\n\n`);
      }
    }

    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.removeListener('tick', onTick);
      for (const s of wanted) {
        const c = (this.subscribers.get(s) || 0) - 1;
        if (c <= 0) this.subscribers.delete(s); else this.subscribers.set(s, c);
      }
      try { res.end(); } catch (e) {}
    });
  }
}

module.exports = new MarketBroker();
