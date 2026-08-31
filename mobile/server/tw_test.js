// Quick smoke test for TwelveDataProvider. Will skip if TWELVEDATA_API_KEY is not set.
const TwelveDataProvider = require('./twelvedataProvider');

(async function main() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    console.log('TWELVEDATA_API_KEY not set — skipping Twelve Data smoke test.');
    return;
  }
  const provider = new TwelveDataProvider(key);
  try {
    console.log('Fetching quote for EUR/USD...');
    const q = await provider.getQuote('EUR/USD');
    console.log('Quote:', q);
    console.log('Fetching 10 candles (1min) for EUR/USD...');
    const c = await provider.getCandles('EUR/USD', '1min', 10);
    console.log('Candles length:', Array.isArray(c) ? c.length : 'unexpected');
    if (Array.isArray(c) && c.length) console.log('First candle:', c[0]);
  } catch (err) {
    console.error('Twelve Data smoke test error:', err && err.message ? err.message : err);
    process.exitCode = 2;
  }
})();
