import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLotSize,
  calculateTradeRisk,
  createDailyRiskActivity,
  getRiskRuleChecks,
  normalizeDailyRiskActivity,
} from '../services/risk';

const profile = {
  accountBalance: 1000,
  riskPercent: 1,
  maxDailyLossPercent: 3,
  maxOpenRiskPercent: 3,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 3,
};

test('EURUSD risk check calculates 50 pip stop, 0.02 lots, and 1:2 reward-risk', () => {
  const result = calculateTradeRisk(profile, {
    pair: 'EURUSD',
    direction: 'BUY',
    entry: 1.085,
    stopLoss: 1.08,
    takeProfit: 1.095,
  });
  assert.equal(result.valid, true);
  assert.equal(result.stopLossPips, 50);
  assert.equal(result.takeProfitPips, 100);
  assert.equal(result.riskAmount, 10);
  assert.equal(result.lotSize, 0.02);
  assert.equal(result.potentialProfit, 20);
  assert.equal(result.rewardRisk, 2);
});

test('lot calculator and risk check use the same lot-size formula', () => {
  const calculator = calculateLotSize(1000, 1, 50);
  const riskCheck = calculateTradeRisk(profile, { pair: 'EURUSD', direction: 'BUY', entry: 1.085, stopLoss: 1.08, takeProfit: 1.095 });
  assert.equal(calculator.riskAmount, riskCheck.riskAmount);
  assert.equal(calculator.lotSize, riskCheck.lotSize);
});

test('JPY pip distance uses two decimal pip scaling and rejects inverted stops', () => {
  const jpyResult = calculateTradeRisk(profile, { pair: 'USDJPY', direction: 'SELL', entry: 150, stopLoss: 150.5, takeProfit: 149 });
  assert.equal(jpyResult.stopLossPips, 50);
  assert.equal(jpyResult.rewardRisk, 2);
  const invalid = calculateTradeRisk(profile, { pair: 'EURUSD', direction: 'BUY', entry: 1.085, stopLoss: 1.09, takeProfit: 1.095 });
  assert.equal(invalid.valid, false);
  assert.match(invalid.error || '', /stop loss must be below entry/i);
});

test('rule checks compare projected trade with daily, open-risk, trade-count and streak limits', () => {
  const trade = calculateTradeRisk(profile, { pair: 'EURUSD', direction: 'BUY', entry: 1.085, stopLoss: 1.08, takeProfit: 1.095 });
  const activity = {
    ...createDailyRiskActivity('2026-09-26'),
    dailyNetPnl: -21,
    tradesToday: 2,
    consecutiveLosses: 3,
    openPositions: [{ id: 'existing', pair: 'GBPUSD', direction: 'BUY' as const, entry: 1.3, stopLoss: 1.29, takeProfit: 1.32, riskAmount: 21, lotSize: 0.02, createdAt: '2026-09-26T10:00:00.000Z' }],
  };
  const checks = getRiskRuleChecks(profile, activity, trade);
  assert.equal(checks.find((check) => check.id === 'trade')?.passed, true);
  assert.equal(checks.find((check) => check.id === 'daily')?.passed, false);
  assert.equal(checks.find((check) => check.id === 'open')?.passed, false);
  assert.equal(checks.find((check) => check.id === 'trades')?.passed, true);
  assert.equal(checks.find((check) => check.id === 'streak')?.passed, false);
});

test('a 3% planned trade is flagged against a 1% configured per-trade limit', () => {
  const proposedTrade = calculateTradeRisk({ ...profile, riskPercent: 3 }, {
    pair: 'EURUSD',
    direction: 'BUY',
    entry: 1.085,
    stopLoss: 1.08,
    takeProfit: 1.095,
  });
  const checks = getRiskRuleChecks(profile, createDailyRiskActivity('2026-09-26'), proposedTrade);
  assert.equal(proposedTrade.riskAmount, 30);
  assert.equal(checks.find((check) => check.id === 'trade')?.passed, false);
});

test('daily rollover resets daily P&L and trade count but preserves open trades and loss streak', () => {
  const old = {
    ...createDailyRiskActivity('2026-09-25'),
    dailyNetPnl: -20,
    tradesToday: 3,
    consecutiveLosses: 2,
    openPositions: [{ id: 'open', pair: 'EURUSD', direction: 'SELL' as const, entry: 1.1, stopLoss: 1.11, takeProfit: 1.08, riskAmount: 10, lotSize: 0.01, createdAt: '2026-09-25T12:00:00.000Z' }],
  };
  const nextDay = normalizeDailyRiskActivity(old, '2026-09-26');
  assert.equal(nextDay.dailyNetPnl, 0);
  assert.equal(nextDay.tradesToday, 0);
  assert.equal(nextDay.consecutiveLosses, 2);
  assert.equal(nextDay.openPositions.length, 1);
});