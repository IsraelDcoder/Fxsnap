import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisResult, calculateRiskRewardFromLevels, formatRiskReward, isCompleteSetup } from '../services/analysisResult';
import type { SetupAnalysisJson } from '../services/chartDetection';

const setup: SetupAnalysisJson = {
  status: 'ok',
  pair: 'EUR/USD',
  timeframe: '1H',
  direction: 'BUY',
  entry: 1.1,
  stop_loss: 1.09,
  take_profit_1: 1.12,
  risk_reward: 2,
  support: [1.095],
  resistance: [1.12],
  trend: 'bullish',
  structure: 'Higher highs and higher lows',
  rightmost_candle: { type: 'bullish engulfing', bias: 'bullish' },
  next_candle_prediction: 'Could continue toward 1.12',
  confidence: 72,
  levels_estimated: false,
  reasoning: ['Entry 1.1 is above support 1.095.'],
  invalidation: 'A close below 1.09 invalidates the setup.',
};

describe('single setup result mapping', () => {
  it('accepts a complete, correctly ordered setup with recomputed 1:2 R/R', () => {
    assert.equal(isCompleteSetup(setup), true);
    assert.equal(calculateRiskRewardFromLevels(1.1, 1.09, 1.12, 'BUY'), 2);
  });

  it('rejects invalid ordering, insufficient R/R, or missing support/resistance', () => {
    assert.equal(isCompleteSetup({ ...setup, stop_loss: 1.11 }), false);
    assert.equal(isCompleteSetup({ ...setup, risk_reward: 1 }), false);
    assert.equal(isCompleteSetup({ ...setup, take_profit_1: 1.11499, risk_reward: 1.5 }), false);
    assert.equal(isCompleteSetup({ ...setup, support: [] }), false);
    assert.equal(isCompleteSetup({ ...setup, resistance: [] }), false);
    assert.equal(isCompleteSetup({ ...setup, risk_reward: 2.5 }), false);
  });

  it('accepts a correctly ordered SELL setup', () => {
    assert.equal(isCompleteSetup({
      ...setup,
      direction: 'SELL',
      entry: 1.1,
      stop_loss: 1.12,
      take_profit_1: 1.07,
      risk_reward: 1.5,
    }), true);
  });

  it('formats numeric and ratio-string R/R values for Community cards', () => {
    assert.equal(formatRiskReward(2), '1:2');
    assert.equal(formatRiskReward('1:2'), '1:2');
    assert.equal(formatRiskReward('invalid'), '—');
  });

  it('keeps the validated JSON payload unchanged in app state', () => {
    const result = buildAnalysisResult(setup, 'EUR/USD', 'file:///chart.jpg');
    assert.equal(result.status, 'success');
    assert.equal(result.setup, setup);
    assert.equal(result.direction, setup.direction);
    assert.equal(result.timeframe, setup.timeframe);
    assert.equal(result.confidence, setup.confidence);
  });

  it('maps non-chart and service errors without creating a setup', () => {
    const nonChart = buildAnalysisResult({ status: 'not_a_chart' }, 'EUR/USD');
    assert.equal(nonChart.status, 'not_a_chart');
    assert.equal(nonChart.setup, undefined);

    const error = buildAnalysisResult({ status: 'error', message: 'Could not validate setup.' }, 'EUR/USD');
    assert.equal(error.status, 'ai_unavailable');
    assert.equal(error.message, 'Could not validate setup.');
    assert.equal(error.setup, undefined);
  });
});
