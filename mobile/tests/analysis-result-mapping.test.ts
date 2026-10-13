import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChartTradeSetup, normalizeLatestVisiblePrice, type ChartAnalysisResult } from '../services/chartDetection';
import { buildAnalysisResult, formatDevelopingNote, formatRiskReward, formatTradeReadiness, getMarketDevelopmentPlan, getMissingTradeLevelsExplanation, getTradeReadinessLabel, hasValidatedTradeSetup, isUnavailableAnalysisValue } from '../services/analysisResult';

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
    latestVisiblePrice: 1.1025,
    entryReadiness: 0,
    tradeStatus: 'no_setup',
    setupStatus: 'NO_SETUP',
    confidence: 64,
    reasoning: ['Higher highs are visible.', 'Price is holding support.'],
    supportResistance: { support: ['1.0950'], resistance: ['1.1100'] },
    ...overrides,
  };
}

test('normalizes a latest screenshot price only when its source and scale are readable', () => {
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: '1.08425',
      current_price_source: 'visible_price_marker',
      price_scale_visible: true,
      latest_candle_timestamp: null,
    },
  }), 1.08425);
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: '67,000.5',
      current_price_source: 'latest_candle_scale_read',
      price_scale_visible: true,
    },
  }), 67000.5);
});

test('does not expose a current price when the screenshot source is unreadable or missing', () => {
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: 1.08425,
      current_price_source: 'unreadable',
      price_scale_visible: true,
    },
  }), undefined);
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: 1.08425,
      current_price_source: 'visible_price_marker',
      price_scale_visible: false,
    },
  }), undefined);
  assert.equal(normalizeLatestVisiblePrice({
    latestVisiblePrice: 1.08425,
  }), undefined);
});

test('rejects invalid numeric values even when the chart claims a readable price source', () => {
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: '1.08.425',
      current_price_source: 'visible_price_marker',
      price_scale_visible: true,
    },
  }), undefined);
  assert.equal(normalizeLatestVisiblePrice({
    chart: {
      latest_visible_price: 0,
      current_price_source: 'visible_price_marker',
      price_scale_visible: true,
    },
  }), undefined);
});

test('maps no-trade analysis content and every available level into the result model', () => {
  const result = buildAnalysisResult(chartResult(), 'EUR/USD', 'file:///chart.jpg');

  assert.equal(result.status, 'no_trade');
  assert.equal(result.pair, 'EUR/USD');
  assert.equal(result.direction, 'BUY');
  assert.equal(result.marketBias, 'bullish');
  assert.equal(result.confidence, 64);
  assert.equal(result.latestVisiblePrice, 1.1025);
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

test('keeps candidate levels visible in the result model when trade direction is not established', () => {
  const result = buildAnalysisResult(chartResult({
    analysis: {
      trend: 'neutral',
      structure: 'The chart is consolidating without a clear direction.',
      volatility: 'moderate',
      volume: 'not_visible',
      sentiment: 'neutral',
      indicators: 'none',
      notes: 'No directional bias is established.',
    },
    trade_setup: {
      type: 'none',
      entry_zone: '1.0850',
      stop_loss: '1.0880',
      take_profit: '1.0800',
      take_profit_levels: ['1.0800', '1.0760'],
      risk_reward: 1.67,
    },
    marketBias: 'neutral',
  }), 'EUR/USD');

  assert.equal(result.status, 'no_trade');
  assert.equal(result.direction, undefined);
  assert.deepEqual(result.tradeSetup, {
    type: 'none',
    entryZone: '1.0850',
    stopLoss: '1.0880',
    takeProfit: '1.0800',
    riskReward: 1.67,
  });
  assert.deepEqual(result.takeProfitLevels, ['1.0800', '1.0760']);
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

test('renders a directional market read when analysis has no established trade levels', () => {
  const apiPayload = {
    status: 'no_trade' as const,
    analysis: {
      trend: 'bearish' as const,
      structure: 'Lower highs and lower lows are visible.',
      volatility: 'moderate' as const,
      volume: 'not_visible' as const,
      sentiment: 'bearish' as const,
      indicators: 'none',
      notes: 'Exact entry and invalidation prices are not readable.',
    },
    zones: { support: 'not_clear', resistance: 'not_clear', liquidity: 'not_clear' },
    reasoning: ['Visible swing structure is bearish.', 'Exact entry and stop prices are not established.'],
    confidence: 71,
  };
  const tradeSetup = normalizeChartTradeSetup(apiPayload);
  const result = buildAnalysisResult(chartResult({
    ...apiPayload,
    trade_setup: tradeSetup,
    marketBias: 'bearish',
    marketConfidence: apiPayload.confidence,
    confidence: apiPayload.confidence,
  }), 'GBP/USD');

  assert.equal(result.status, 'no_trade');
  assert.equal(result.marketBias, 'bearish');
  assert.equal(result.direction, 'SELL');
  assert.equal(result.tradeSetup?.entryZone, 'none');
  assert.equal(result.tradeSetup?.stopLoss, 'none');
  assert.equal(result.tradeSetup?.takeProfit, 'none');
  assert.equal(result.confidence, 71);
  assert.deepEqual(result.reasoning, apiPayload.reasoning);
});

test('explains missing no-trade levels as a hold while the market develops', () => {
  const result = buildAnalysisResult(chartResult({
    status: 'no_trade',
    trade_setup: {
      type: 'none',
      entry_zone: 'none',
      stop_loss: 'none',
      take_profit: 'none',
      take_profit_levels: [],
      risk_reward: 'none',
    },
  }), 'BTCUSD');

  assert.equal(
    getMissingTradeLevelsExplanation(result),
    'No technically valid candidate was established from the visible chart evidence. No entry, stop, target, or risk/reward value has been inferred.',
  );
  assert.match(
    getMissingTradeLevelsExplanation({ ...result, status: 'success' }) ?? '',
    /No technically valid candidate was established/,
  );
  assert.equal(getMissingTradeLevelsExplanation({
    ...result,
    tradeSetup: { ...result.tradeSetup!, entryZone: '1.1000', stopLoss: '1.0950', riskReward: 2 },
    takeProfitLevels: ['1.1100'],
  }), null);
});

test('neutral chart results always include a clear market-development plan', () => {
  assert.match(
    getMarketDevelopmentPlan({
      status: 'no_trade',
      marketBias: 'neutral',
      analysis: {
        trend: 'neutral',
        structure: 'Price is consolidating around 4170.976.',
        volatility: 'moderate',
        volume: 'not_visible',
        sentiment: 'neutral',
        indicators: 'none',
        notes: 'Wait for a confirmed break of the range.',
      },
    }, true),
    /Hold for now — the market is still developing/,
  );
  assert.match(getMarketDevelopmentPlan({
    status: 'no_trade',
    marketBias: 'bearish',
    tradeStatus: 'no_setup',
    tradeTrigger: 'No actionable setup is available at this time.',
  }), /Wait for a confirmed bearish entry or retest/);
  assert.match(getMarketDevelopmentPlan({ status: 'no_trade', marketBias: 'neutral' }), /Hold for now — the market is still developing/i);
});

test('developing analysis notes replace blocked-trade language with confirmation guidance', () => {
  const note = formatDevelopingNote('No trade: the stop was not established and RR is not calculable.');
  assert.equal(note, 'hold for now: the stop was awaiting confirmation and RR is calculated when levels are confirmed.');
  assert.equal(formatDevelopingNote('Setup not identified.'), 'setup is still developing.');
});

test('recognizes model-generated unavailable phrases instead of displaying them as prices', () => {
  assert.equal(isUnavailableAnalysisValue('Not established from the chart'), true);
  assert.equal(isUnavailableAnalysisValue('Entry not established'), true);
  assert.equal(isUnavailableAnalysisValue('1.0850'), false);
  assert.equal(formatRiskReward('Not established'), '—');
  assert.equal(formatRiskReward('RR not calculable'), '—');
  assert.equal(formatRiskReward('1:2'), '1:2');
  assert.equal(formatRiskReward(0.9393939393939916), '1:0.94');
  assert.equal(formatRiskReward('1:0.9393939393939916'), '1:0.94');
  assert.equal(formatRiskReward(0.004), '1:<0.01');
});

test('incomplete successful responses are presented as developing, not as established trades', () => {
  const partial = buildAnalysisResult(chartResult({
    status: 'success',
    trade_setup: {
      type: 'buy',
      entry_zone: 'Entry not established',
      stop_loss: 'not established from chart',
      take_profit: 'not established',
      take_profit_levels: [],
      risk_reward: 'not established',
    },
  }), 'EUR/USD');

  assert.equal(hasValidatedTradeSetup(partial), false);
  assert.match(getMissingTradeLevelsExplanation(partial) ?? '', /one or more price levels are not supported/i);
  assert.match(getMarketDevelopmentPlan(partial), /BUY incomplete candidate/i);
  assert.match(getMarketDevelopmentPlan(partial), /not identified/);
});

test('conditional candidate levels and calculated R remain visible without claiming entry confirmation', () => {
  const result = buildAnalysisResult(chartResult({
    status: 'no_trade',
    marketBias: 'neutral',
    tradeStatus: 'waiting_for_confirmation',
    trade_setup: {
      type: 'buy',
      entry_zone: '1.10000',
      stop_loss: '1.09900',
      take_profit: '1.10200',
      take_profit_levels: ['1.10200', '1.10300'],
      risk_reward: 2,
    },
    entryStatus: 'waiting_for_trigger',
    setupType: 'limit_zone',
    candidateReview: {
      status: 'selected',
      direction: 'buy',
      evidenceScore: 5,
      reason: 'A support retest is the conditional entry.',
    },
  }), 'EUR/USD');

  assert.equal(result.marketBias, 'neutral');
  assert.equal(result.tradeSetup?.type, 'buy');
  assert.match(getMarketDevelopmentPlan(result), /BUY limit zone candidate/);
  assert.match(getMarketDevelopmentPlan(result), /Entry 1\.10000, SL 1\.09900, TP1 1\.10200, R:R 1:2/);
  assert.match(getMarketDevelopmentPlan(result), /wait for the specified entry trigger/i);
  assert.equal(getMissingTradeLevelsExplanation(result), null);
});

test('partial conditional candidates report supplied levels without inventing missing ones', () => {
  const result = buildAnalysisResult(chartResult({
    status: 'no_trade',
    trade_setup: {
      type: 'sell',
      entry_zone: '1.10000',
      stop_loss: '1.10100',
      take_profit: 'none',
      take_profit_levels: [],
      risk_reward: 'none',
    },
    candidateReview: {
      status: 'selected',
      direction: 'sell',
      evidenceScore: 4,
      reason: 'A resistance rejection may offer a conditional entry; TP1 is not supported.',
    },
  }), 'EUR/USD');

  const plan = getMarketDevelopmentPlan(result);
  assert.match(plan, /SELL incomplete candidate/);
  assert.match(plan, /Entry 1\.10000, SL 1\.10100, TP1 not identified/);
  assert.match(plan, /R:R not calculable from available levels/);
  assert.doesNotMatch(plan, /1\.09\d+/);
});

test('a complete candidate with a low calculated R:R remains valid and reports the actual ratio', () => {
  const result = buildAnalysisResult(chartResult({
    status: 'no_trade',
    tradeStatus: 'waiting_for_confirmation',
    trade_setup: {
      type: 'buy',
      entry_zone: '1.10000',
      stop_loss: '1.09900',
      take_profit: '1.10080',
      take_profit_levels: ['1.10080'],
      risk_reward: 0.8,
    },
  }), 'EUR/USD');
  assert.equal(hasValidatedTradeSetup(result), true);
  assert.equal(getMissingTradeLevelsExplanation(result), null);
  assert.match(getMarketDevelopmentPlan(result), /R:R 1:0\.8/);

  const floatingPointNoise = buildAnalysisResult(chartResult({
    status: 'no_trade',
    tradeStatus: 'waiting_for_confirmation',
    trade_setup: {
      type: 'buy',
      entry_zone: '1.10000',
      stop_loss: '1.09900',
      take_profit: '1.10080',
      take_profit_levels: ['1.10080'],
      risk_reward: 0.9393939393939916,
    },
  }), 'EUR/USD');
  assert.match(getMarketDevelopmentPlan(floatingPointNoise), /R:R 1:0\.94/);
});

test('waiting setups remain on hold and explain the confirmation trigger', () => {
  const waiting = buildAnalysisResult(chartResult({
    status: 'success',
    tradeStatus: 'waiting_for_confirmation',
    tradeTrigger: 'Wait for a bullish break and retest before entering.',
  }), 'EUR/USD');

  assert.equal(hasValidatedTradeSetup(waiting), true);
  assert.match(getMarketDevelopmentPlan(waiting), /BUY candidate/);
  assert.match(getMarketDevelopmentPlan(waiting), /Wait for a bullish break and retest before entering/);
  assert.equal(getTradeReadinessLabel(
    waiting.tradeStatus,
    '1.1000',
    '1.0950',
    '1.1100',
    'BUY',
    2,
  ), 'WAIT FOR CONFIRMATION');
});

test('trade signal is limited to buy, sell, or wait for confirmation', () => {
  assert.equal(
    getTradeReadinessLabel('no_setup', '158.23000', '158.15500', '158.29000', 'BUY', 0.8),
    'WAIT FOR CONFIRMATION',
  );
  assert.equal(
    getTradeReadinessLabel(undefined, '1.10000', 'Not established', 'Not established'),
    'WAIT FOR CONFIRMATION',
  );
  assert.equal(
    getTradeReadinessLabel(undefined, 'Not established', 'Not established', 'Not established'),
    'WAIT FOR CONFIRMATION',
  );
  assert.equal(getTradeReadinessLabel('actionable', '1.10', '1.09', '1.12', 'BUY', 2), 'BUY');
  assert.equal(getTradeReadinessLabel('actionable', '1.10', '1.09', '1.12', 'SELL', 2), 'SELL');
  assert.equal(getTradeReadinessLabel('actionable', '1.10', '1.09', '1.12'), 'WAIT FOR CONFIRMATION');
  assert.equal(getTradeReadinessLabel('waiting_for_confirmation', '1.10', '1.09', '1.12', 'BUY', 2), 'WAIT FOR CONFIRMATION');
});

test('trade signal is not obscured by readiness percentages', () => {
  assert.equal(
    formatTradeReadiness(0, 'no_setup', '158.23000', '158.15500', '158.29000', 'BUY', 0.8),
    'WAIT FOR CONFIRMATION',
  );
  assert.equal(
    formatTradeReadiness(64, 'waiting_for_confirmation', '1.10', '1.09', '1.12', 'BUY', 2),
    'WAIT FOR CONFIRMATION',
  );
  assert.equal(
    formatTradeReadiness(100, 'actionable', '1.10', '1.09', '1.12', 'SELL', 2),
    'SELL',
  );
});
