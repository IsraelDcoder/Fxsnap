const DEFAULT_STRATEGY_CONFIG = Object.freeze({
  version: 'chart-evidence-v1',
  maximumScreenshotAgeMinutes: Object.freeze({
    m15: 60,
    h1: 240,
    h4: 720,
    d1: 2880,
    unknown: 60,
  }),
});

function getMaximumScreenshotAgeMinutes(timeframe, environment = process.env) {
  const normalized = String(timeframe || '').toUpperCase().replace(/\s+/g, '');
  const limits = DEFAULT_STRATEGY_CONFIG.maximumScreenshotAgeMinutes;
  let timeframeLimit = limits.unknown;
  if (/(?:M15|15M)/.test(normalized)) timeframeLimit = limits.m15;
  else if (/(?:H1|1H)/.test(normalized)) timeframeLimit = limits.h1;
  else if (/(?:H4|4H)/.test(normalized)) timeframeLimit = limits.h4;
  else if (/(?:D1|1D|DAILY)/.test(normalized)) timeframeLimit = limits.d1;

  const configuredMaximum = environment.FXSNAP_CHART_MAX_AGE_MINUTES;
  if (configuredMaximum == null || String(configuredMaximum).trim() === '') return timeframeLimit;

  const maximum = Number(configuredMaximum);
  if (!Number.isFinite(maximum) || maximum <= 0) {
    throw new Error('FXSNAP_CHART_MAX_AGE_MINUTES must be a positive number.');
  }
  return Math.min(timeframeLimit, maximum);
}

module.exports = {
  DEFAULT_STRATEGY_CONFIG,
  getMaximumScreenshotAgeMinutes,
};
