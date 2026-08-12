const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRiskReward, parsePriceOrRange, computeRRFromLevels } = require('./rr');

test('parseRiskReward handles plain numbers and RR= prefixes', () => {
  assert.equal(parseRiskReward('1.8'), 1.8);
  assert.equal(parseRiskReward('RR=1.8'), 1.8);
});

test('parseRiskReward handles colon and slash forms', () => {
  assert.equal(parseRiskReward('1:2'), 2);
  assert.equal(parseRiskReward('1.8:1'), 1.8);
  assert.equal(parseRiskReward('3/1'), 3);
});

test('parsePriceOrRange parses ranges and prices', () => {
  const r = parsePriceOrRange('1.0950-1.0960');
  assert.equal(r.type, 'range');
  assert.equal(r.low, 1.0950);
  assert.equal(r.high, 1.0960);
  const p = parsePriceOrRange('1.12345');
  assert.equal(p.type, 'price');
  assert.equal(p.value, 1.12345);
});

test('computeRRFromLevels for BUY and SELL', () => {
  const buy = computeRRFromLevels({ entry: '1.1000', sl: '1.0900', tp: '1.1200', direction: 'buy' });
  assert.ok(buy.rr && buy.rr > 1);
  const sell = computeRRFromLevels({ entry: '150.00', sl: '151.00', tp: '148.50', direction: 'sell' });
  assert.ok(sell.rr && sell.rr > 0);
});
