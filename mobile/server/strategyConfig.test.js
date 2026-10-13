const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_STRATEGY_CONFIG,
  getMaximumScreenshotAgeMinutes,
} = require('./strategyConfig');

test('strategy defaults do not configure a minimum risk/reward threshold', () => {
  assert.equal(Object.hasOwn(DEFAULT_STRATEGY_CONFIG, 'minimumRiskReward'), false);
  assert.equal(DEFAULT_STRATEGY_CONFIG.version, 'chart-evidence-v1');
});

test('screenshot freshness defaults are timeframe-specific and environment overrides only tighten them', () => {
  assert.equal(getMaximumScreenshotAgeMinutes('M15', {}), 60);
  assert.equal(getMaximumScreenshotAgeMinutes('H1', {}), 240);
  assert.equal(getMaximumScreenshotAgeMinutes('H4', {}), 720);
  assert.equal(getMaximumScreenshotAgeMinutes('D1', {}), 2880);
  assert.equal(getMaximumScreenshotAgeMinutes('unknown', {}), 60);
  assert.equal(getMaximumScreenshotAgeMinutes('H4', { FXSNAP_CHART_MAX_AGE_MINUTES: '300' }), 300);
  assert.equal(getMaximumScreenshotAgeMinutes('H1', { FXSNAP_CHART_MAX_AGE_MINUTES: '1440' }), 240);
});
