// Minimal MarketDataProvider base class (JS skeleton)
// Implementations should extend this class and provide provider-specific logic.
class MarketDataProvider {
  constructor() {}

  // Return a single symbol quote: { symbol, price, timestamp, raw }
  async getQuote(symbol) {
    throw new Error('getQuote not implemented');
  }

  // Return an array of quotes for the requested symbols
  async getQuotes(symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  // Return candle/time-series data: array of { time, open, high, low, close, volume }
  async getCandles(symbol, interval = '1min', opts = {}) {
    throw new Error('getCandles not implemented');
  }

  // Return supported symbols / metadata
  async getSupportedSymbols() {
    throw new Error('getSupportedSymbols not implemented');
  }

  // Subscribe to live updates for a set of symbols and call onTick for each update.
  // Implementations may return an unsubscribe() function or object.
  subscribeLive(symbols, onTick) {
    throw new Error('subscribeLive not implemented');
  }
}

module.exports = MarketDataProvider;
