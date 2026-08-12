const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBiasConfidence, computeSetupConfidence } = require('./scoring');

test('buildBiasConfidence returns value between 0 and 100 for neutral input', () => {
  const norm = { analysis: { sentiment: 'neutral', indicators: 'none' } };
  const derived = { marketBias: 'neutral', marketStructure: 'range', shortTermMomentum: 'neutral', dataLimitations: [] };
  const v = buildBiasConfidence(norm, derived);
  assert.ok(typeof v === 'number');
  assert.ok(v >= 0 && v <= 100);
});

test('buildBiasConfidence penalizes data limitations', () => {
  const norm = { analysis: { sentiment: 'neutral', indicators: 'rsi' } };
  const derived = { marketBias: 'bullish', marketStructure: 'uptrend', shortTermMomentum: 'strong_up', dataLimitations: ['single timeframe'] };
  const v = buildBiasConfidence(norm, derived);
  assert.ok(v < 100);
});

test('computeSetupConfidence returns 0 for no trade setup', () => {
  const norm = {};
  const derived = { confirmationStatus: 'DEVELOPING', priceLocation: 'near_support', dataLimitations: [] };
  const evalRes = { trade_setup: { type: 'none' } };
  const v = computeSetupConfidence(norm, derived, evalRes);
  assert.equal(v, 0);
});

test('computeSetupConfidence increases with better RR and confirmed status', () => {
  const norm = { strategy: { liquidity_sweep: 'confirmed' }, m15: { liquidity: { swept: true } } };
  const derived = { confirmationStatus: 'CONFIRMED', priceLocation: 'at_support', dataLimitations: [] };
  const evalRes = { trade_setup: { type: 'buy', risk_reward: 2.0, entry_zone: '1.1000' } };
  const v = computeSetupConfidence(norm, derived, evalRes);
  assert.ok(v > 40, `expected >40 got ${v}`);
});
