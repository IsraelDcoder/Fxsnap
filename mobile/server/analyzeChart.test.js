const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStructuredObservations,
  evaluateDecisionEngine,
  applyMentorStrategy,
  enforceValidationRules,
} = require('./serve');

test('canonical JSON parsing accepts object, string, and fenced JSON payloads', () => {
  const { canonicalizeRawAnalysis } = require('./serve');
  const objectPayload = { status: 'success', analysis: { trend: 'bullish' }, zones: { support: '1.1000' }, strategy: { daily_trend: 'bullish' }, trade_setup: { type: 'buy', risk_reward: 2.0 } };
  const jsonStringPayload = '{"status":"success","analysis":{"trend":"bearish"},"zones":{"support":"1.1000"},"strategy":{"daily_trend":"bearish"},"trade_setup":{"type":"sell","risk_reward":1.8}}';
  const fencedPayload = '```json\n{"status":"success","analysis":{"trend":"bullish"},"zones":{"support":"1.1000"},"strategy":{"daily_trend":"bullish"},"trade_setup":{"type":"buy","risk_reward":2.2}}\n```';

  const a = canonicalizeRawAnalysis(objectPayload);
  const b = canonicalizeRawAnalysis(jsonStringPayload);
  const c = canonicalizeRawAnalysis(fencedPayload);

  assert.equal(a.status, 'success');
  assert.equal(b.analysis.trend, 'bearish');
  assert.equal(c.trade_setup.type, 'buy');
  assert.equal(c.trade_setup.risk_reward, 2.2);
});

test('invalid image yields invalid_image status and no trade', () => {
  const normalized = {
    status: 'no_trade',
    chart: { is_chart: false },
    analysis: {},
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 0,
    reasons: [],
  };
  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'invalid_image');
  assert.equal(res.trade_setup.type, 'none');
});

test('missing D1 or zones -> no_trade', () => {
  const normalized = {
    status: 'success',
    chart: { is_chart: true, timeframe: 'H1' },
    analysis: { market_structure: 'some consolidation' },
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 90,
    reasons: [],
  };
  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'no_trade');
  assert.ok(res.reasons && res.reasons.length > 0);
});

test('valid evidence with m15 confirmation and numeric levels -> success', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'EURUSD',
    timeframe: 'D1',
    chart: { is_chart: true, timeframe: 'D1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs higher lows', trend: 'bullish' },
    zones: { h1: '1.0950', h4: '1.0900' },
    m15: { inside_zone: true, liquidity: { swept: true }, confirmation: 'engulfing', bos: { detected: true }, rsi: { visible: true, confirms: true } },
    strategy: {},
    trade_setup: { type: 'buy', entry_zone: '1.1000', stop_loss: '1.0900', take_profit: '1.1200', risk_reward: 2.0 },
    confidence: 80,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'success');
  assert.equal(res.trade_setup.type, 'buy');
  assert.ok(res.confidence >= 70);
});

test('insufficient RR should block trade', () => {
  const normalized = {
    status: 'success',
    timeframe: 'D1',
    chart: { is_chart: true, timeframe: 'D1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs higher lows', trend: 'bullish' },
    zones: { h1: '1.0950' },
    m15: { inside_zone: true, liquidity: { swept: true }, confirmation: 'pin bar', bos: { detected: true }, rsi: { visible: true, confirms: true } },
    strategy: {},
    trade_setup: { type: 'buy', entry_zone: '1.1000', stop_loss: '1.0955', take_profit: '1.1020', risk_reward: 0.25 },
    confidence: 90,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  // With strict RR enforcement the final status should be no_trade, but a fallback candidate may be preserved for DEVELOPING workflows
  assert.equal(res.status, 'no_trade');
  assert.equal(res.trade_setup.type, 'buy');
  assert.ok(res.reasons.some((r) => /risk-reward/i.test(r) || /Numeric trade levels/i || /RR/i) || res.failed_conditions);
});

// Small sanity test for the observation builder
test('buildStructuredObservations returns expected shape for explicit timeframes_detected', () => {
  const norm = {
    timeframes_detected: [
      { timeframe: 'D1', observations: { trend: 'bullish' } },
      { timeframe: 'M15', observations: { confirmation: 'engulfing' } },
    ],
    chart: { is_chart: true },
  };
  const obs = buildStructuredObservations(norm);
  assert.equal(obs.chart_layout, 'multi_timeframe');
  assert.equal(obs.timeframes_detected.length, 2);
  assert.equal(obs.timeframes_detected[0].timeframe, 'D1');
});

test('applyMentorStrategy attaches explainable metrics and decision fields', () => {
  const normalized = {
    status: 'no_trade',
    detectedPair: 'XAUUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs', trend: 'bullish' },
    zones: { demand: ['4320-4325'], supply: ['4373-4380'] },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 10,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.ok(typeof res.setupConfidence === 'number');
  assert.ok(['BUY', 'SELL', 'WAIT', 'NO_TRADE'].includes(res.decision));
  assert.ok(Array.isArray(res.whyNotNow));
  assert.ok(Array.isArray(res.dataLimitations));
});

test('fallback candidate created from range strings when full validations missing', () => {
  const normalized = {
    status: 'no_trade',
    detectedPair: 'USDJPY',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'sharp bearish impulse breaking support', trend: 'bearish', volatility: 'high', sentiment: 'bearish' },
    zones: { support: '148.20-148.30', resistance: '149.00-149.20' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'sell', entry_zone: '148.95-149.05', stop_loss: '149.30', take_profit: '148.20-148.30', risk_reward: '1.8' },
    confidence: 40,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  // Candidate should be preserved even if status is no_trade
  assert.equal(res.trade_setup.type, 'sell');
  assert.ok(res.trade_setup.entry_zone && res.trade_setup.entry_zone !== 'none');
  assert.ok(typeof res.setupQuality === 'number');
  // The decision should be WAIT or NO_TRADE depending on score; ensure not silently empty
  assert.ok(['BUY', 'SELL', 'WAIT', 'NO_TRADE'].includes(res.decision));
});

test('strong bearish directional bias keeps a conditional setup and treats unavailable evidence as N/A', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'XAUUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'bearish',
      market_structure: 'lower highs and lower lows with bearish continuation',
      structure: 'lower highs lower lows',
      volatility: 'high',
      sentiment: 'bearish',
      volume: 'not_visible',
      indicators: 'none',
      notes: 'Strong bearish continuation on the current chart.'
    },
    zones: { support: '2348-2352', resistance: '2368-2375' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: 'bearish continuation', bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: { zone_status: 'near_zone', liquidity_sweep: 'unavailable', bos: 'unavailable', rsi_confirmation: 'unavailable' },
    trade_setup: {
      type: 'sell',
      entry_zone: '2358-2362',
      stop_loss: '2368',
      take_profit: '2342-2348',
      risk_reward: '1.8',
    },
    confidence: 64,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.marketBias, 'bearish');
  assert.ok(res.marketConfidence > 0);
  assert.ok(res.trade_setup.type === 'sell');
  assert.ok(['SELL', 'WAIT'].includes(res.decision));
  assert.ok(typeof res.breakdown?.trend === 'number' && res.breakdown.trend > 0);
  assert.ok(res.breakdown?.liquidity === null || res.breakdown?.liquidity === undefined);
  assert.ok(res.breakdown?.rsi === null || res.breakdown?.rsi === undefined);
  assert.ok(Array.isArray(res.dataLimitations));
  assert.ok(res.dataLimitations.some((item) => /rsi|volume|liquidity|timeframe/i.test(String(item))));
});

test('neutral market remains no_setup while preserving explainable reasons', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'EURUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'neutral',
      market_structure: 'range bound with no clear breakout',
      structure: 'sideways price action',
      volatility: 'moderate',
      sentiment: 'neutral',
      volume: 'not_visible',
      indicators: 'none',
      notes: 'Price remains range-bound.'
    },
    zones: { support: '1.0880-1.0900', resistance: '1.0940-1.0960' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 35,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.marketBias, 'neutral');
  assert.equal(res.trade_setup.type, 'none');
  assert.ok(['NO_TRADE', 'WAIT'].includes(res.decision));
  assert.ok(Array.isArray(res.whyNotNow));
});
