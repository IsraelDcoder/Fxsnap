import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetrics, evaluateTrade } from '../services/backtest';
import type { CandleData } from '../services/marketData';

const candle = (close: number, high = close, low = close): CandleData => ({ timestamp: new Date().toISOString(), open: close, high, low, close });

test('evaluates a BUY target before later candles', () => {
  const trade = evaluateTrade([candle(100), candle(100, 101, 100), candle(104, 105, 103)], 0, 'BUY', { warmupCandles: 1, stopPips: 1, rewardRisk: 2, pipSize: 1 });
  assert.equal(trade.outcome, 'win');
  assert.equal(trade.rMultiple, 2);
});

test('uses conservative stop-first behavior when both levels hit', () => {
  const trade = evaluateTrade([candle(100), candle(100, 103, 97)], 0, 'BUY', { warmupCandles: 1, stopPips: 1, rewardRisk: 2, pipSize: 1 });
  assert.equal(trade.outcome, 'loss');
});

test('reports win rate, expectancy, and drawdown', () => {
  const metrics = calculateMetrics([
    { index: 0, direction: 'BUY', entry: 1, sl: 0, tp: 2, outcome: 'win', rMultiple: 2 },
    { index: 1, direction: 'BUY', entry: 1, sl: 0, tp: 2, outcome: 'loss', rMultiple: -1 },
    { index: 2, direction: 'SELL', entry: 1, sl: 2, tp: 0, outcome: 'open', rMultiple: 0 },
  ], true);
  assert.equal(metrics.sampleSize, 3);
  assert.equal(metrics.winRate, 0.5);
  assert.equal(metrics.expectancyR, 1 / 3);
  assert.equal(metrics.maxDrawdownR, 1);
});