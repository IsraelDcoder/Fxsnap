import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAnalysisDirection, resolveAnalysisDirection } from '../services/analysisDirection';

test('resolves direction from setup or market bias independently of trade validation', () => {
  assert.equal(resolveAnalysisDirection('sell', 'bullish'), 'SELL');
  assert.equal(resolveAnalysisDirection('none', 'bearish'), 'SELL');
  assert.equal(resolveAnalysisDirection('none', 'neutral', 'bullish'), 'BUY');
  assert.equal(resolveAnalysisDirection('none', 'neutral'), undefined);
});

test('labels an unvalidated directional read as bias without hiding BUY or SELL', () => {
  assert.equal(formatAnalysisDirection('BUY', false), 'BUY BIAS');
  assert.equal(formatAnalysisDirection('SELL', true), 'SELL');
  assert.equal(formatAnalysisDirection(undefined, false, 'NEUTRAL BIAS'), 'NEUTRAL BIAS');
});
