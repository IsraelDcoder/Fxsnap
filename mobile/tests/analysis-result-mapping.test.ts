import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChartTradeSetup, type ChartAnalysisResult } from '../services/chartDetection';
import { buildAnalysisResult } from '../services/analysisResult';

function chartResult(overrides: Partial<ChartAnalysisResult> = {}): ChartAnalysisResult {
  return {
    status: 'no_trade',
    analysis: {
      trend: 'bullish',
      structure: 'Higher highs and higher lows.',
      volatility: 'moderate',
      volume: 'not_visible',
      sentiment: 'bullish',
      indicators: 'none',
      notes: 'Wait for price to retest support.',
    },
    zones: { support: '1.0950', resistance: '1.1100', liquidity: 'not_clear' },
    trade_setup: {
      type: 'buy',
      entry_zone: '1.1000-1.1010',
      stop_loss: '1.0950',
      take_profit: '1.1100',
      take_profit_levels: ['1.1100', '1.1200'],
      risk_reward: 2,
    },
    marketBias: 'bullish',
    marketBiasConfidence: 64,
    marketConfidence: 64,
    entryReadiness: 0,
    tradeStatus: 'no_setup',
    setupStatus: 'NO_SETUP',
    confidence: 64,
    reasoning: ['Higher highs are visible.', 'Price is holding support.'],
    supportResistance: { support: ['1.0950'], resistance: ['1.1100'] },
    ...overrides,
  };
}

test('maps no-trade analysis content and every available level into the result model', () => {
  const result = buildAnalysisResult(chartResult(), 'EUR/USD', 'file:///chart.jpg');

  assert.equal(result.status, 'no_trade');
  assert.equal(result.pair, 'EUR/USD');
  assert.equal(result.direction, 'BUY');
  assert.equal(result.marketBias, 'bullish');
  assert.equal(result.confidence, 64);
  assert.equal(result.entryReadiness, 0);
  assert.deepEqual(result.takeProfitLevels, ['1.1100', '1.1200']);
  assert.deepEqual(result.tradeSetup, {
    type: 'buy',
    entryZone: '1.1000-1.1010',
    stopLoss: '1.0950',
    takeProfit: '1.1100',
    riskReward: 2,
  });
  assert.deepEqual(result.reasoning, ['Higher highs are visible.', 'Price is holding support.']);
  assert.equal(result.analysis?.notes, 'Wait for price to retest support.');
  assert.deepEqual(result.supportResistance, { support: ['1.0950'], resistance: ['1.1100'] });
});

test('maps a backend API payload through client normalization into visible result fields', () => {
  const apiPayload = {
    status: 'no_trade' as const,
    marketBias: 'bearish' as const,
    marketConfidence: 71,
    entryReadiness: 0,
    tradeStatus: 'no_setup',
    setupStatus: 'NO_SETUP',
    confidence: 71,
    reasoning: ['Lower highs remain visible.', 'The entry trigger is not confirmed.'],
    analysis: {
      trend: 'bearish' as const,
      structure: 'Lower highs and lower lows.',
      volatility: 'moderate' as const,
      volume: 'not_visible' as const,
      sentiment: 'bearish' as const,
      indicators: 'none',
      notes: 'Wait for price to retest resistance.',
    },
    trade_setup: {
      type: 'sell',
      entry_zone: '68,000',
      stop_loss: '69,000',
      take_profit: '66,000',
      take_profit_levels: ['66,000', '65,000'],
      risk_reward: 2,
    },
  };
  const tradeSetup = normalizeChartTradeSetup(apiPayload);
  const result = buildAnalysisResult(chartResult({
    status: apiPayload.status,
    marketBias: apiPayload.marketBias,
    marketConfidence: apiPayload.marketConfidence,
    entryReadiness: apiPayload.entryReadiness,
    tradeStatus: apiPayload.tradeStatus,
    setupStatus: apiPayload.setupStatus,
    confidence: apiPayload.confidence,
    reasoning: apiPayload.reasoning,
    analysis: apiPayload.analysis,
    trade_setup: tradeSetup,
  }), 'BTC/USD');

  assert.equal(result.status, 'no_trade');
  assert.equal(result.direction, 'SELL');
  assert.equal(result.marketBias, 'bearish');
  assert.equal(result.confidence, 71);
  assert.equal(result.entryReadiness, 0);
  assert.equal(result.tradeSetup?.entryZone, '68,000');
  assert.equal(result.tradeSetup?.stopLoss, '69,000');
  assert.equal(result.tradeSetup?.takeProfit, '66,000');
  assert.equal(result.tradeSetup?.riskReward, 2);
  assert.deepEqual(result.takeProfitLevels, ['66,000', '65,000']);
  assert.deepEqual(result.reasoning, apiPayload.reasoning);
  assert.equal(result.analysis?.notes, 'Wait for price to retest resistance.');
});

test('maps technical analysis failures as failures without manufacturing analysis', () => {
  const result = buildAnalysisResult(chartResult({
    status: 'ai_invalid_response',
    message: 'The provider response is missing required analysis fields.',
    analysis: {
      trend: 'neutral',
      structure: '',
      volatility: 'low',
      volume: 'not_visible',
      sentiment: 'neutral',
      indicators: 'none',
      notes: 'The provider response is missing required analysis fields.',
    },
    trade_setup: {
      type: 'none',
      entry_zone: 'none',
      stop_loss: 'none',
      take_profit: 'none',
      take_profit_levels: [],
      risk_reward: 'none',
    },
    marketBias: 'neutral',
    marketConfidence: 0,
    confidence: 0,
    reasoning: [],
  }), 'EUR/USD');

  assert.equal(result.status, 'ai_invalid_response');
  assert.equal(result.message, 'The provider response is missing required analysis fields.');
  assert.equal(result.tradeSetup?.entryZone, 'none');
  assert.equal(result.marketBias, 'neutral');
  assert.deepEqual(result.reasoning, []);
});
