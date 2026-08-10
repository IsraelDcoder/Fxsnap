const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStructuredObservations,
  evaluateDecisionEngine,
  applyMentorStrategy,
  enforceValidationRules,
} = require('./serve');

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
  assert.equal(res.status, 'no_trade');
  assert.equal(res.trade_setup.type, 'none');
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
