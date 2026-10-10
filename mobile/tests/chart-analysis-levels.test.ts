import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChartTradeSetup } from '../services/chartDetection';

test('maps backend BUY setup values into the result model without changing prices', () => {
  const setup = normalizeChartTradeSetup({
    trade_setup: {
      type: 'buy',
      entry_zone: '1.0950-1.0960',
      stop_loss: '1.0900',
      take_profit: '1.1050',
      take_profit_levels: ['1.1050', '1.1100'],
      risk_reward: 2,
    },
  });

  assert.deepEqual(setup, {
    type: 'buy',
    entry_zone: '1.0950-1.0960',
    stop_loss: '1.0900',
    take_profit: '1.1050',
    take_profit_levels: ['1.1050', '1.1100'],
    risk_reward: 2,
  });
});

test('maps legacy SELL level aliases from the API response', () => {
  const setup = normalizeChartTradeSetup({
    direction: 'SELL',
    entry: '65000',
    sl: '66000',
    targets: ['63000', '62000'],
    rr: '2.0',
  });

  assert.deepEqual(setup, {
    type: 'sell',
    entry_zone: '65000',
    stop_loss: '66000',
    take_profit: '63000',
    take_profit_levels: ['63000', '62000'],
    risk_reward: '2.0',
  });
});

test('keeps comma-grouped prices intact instead of splitting them into target values', () => {
  const setup = normalizeChartTradeSetup({
    trade_setup: {
      type: 'sell',
      entry_zone: '68,000',
      stop_loss: '69,000',
      take_profit: '65,500',
      take_profit_levels: ['65,500', '64,000'],
      risk_reward: 2.5,
    },
  });

  assert.equal(setup.entry_zone, '68,000');
  assert.equal(setup.stop_loss, '69,000');
  assert.equal(setup.take_profit, '65,500');
  assert.deepEqual(setup.take_profit_levels, ['65,500', '64,000']);
});

test('keeps a single comma-grouped take-profit price as one target', () => {
  const setup = normalizeChartTradeSetup({
    trade_setup: {
      type: 'buy',
      entry_zone: '67,000',
      stop_loss: '66,000',
      take_profit: '68,500',
    },
  });

  assert.deepEqual(setup.take_profit_levels, ['68,500']);
});

test('does not create levels for a valid no-trade response without them', () => {
  const setup = normalizeChartTradeSetup({
    status: 'no_trade',
    marketBias: 'bullish',
    trade_setup: { type: 'none' },
  });

  assert.equal(setup.type, 'none');
  assert.equal(setup.entry_zone, 'none');
  assert.equal(setup.stop_loss, 'none');
  assert.equal(setup.take_profit, 'none');
  assert.deepEqual(setup.take_profit_levels, []);
  assert.equal(setup.risk_reward, 'none');
});
