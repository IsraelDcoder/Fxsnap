// Scoring helpers extracted from serve.js to centralize confidence computation

function buildBiasConfidence(norm, derived) {
  const evidence = [];
  evidence.push(derived.marketBias === 'bullish' || derived.marketBias === 'bearish' ? 20 : 10);
  evidence.push(derived.marketStructure === 'uptrend' || derived.marketStructure === 'downtrend' ? 22 : derived.marketStructure === 'breakout' ? 16 : derived.marketStructure === 'range' ? 12 : 8);
  evidence.push(derived.shortTermMomentum && derived.shortTermMomentum.startsWith('strong_') ? 18 : /bullish|bearish/.test(String(derived.shortTermMomentum || '')) ? 12 : 6);
  evidence.push((norm.analysis && derived.marketBias && norm.analysis.sentiment === derived.marketBias && derived.marketBias !== 'neutral') ? 12 : 6);
  evidence.push(/none/i.test(String((norm.analysis && norm.analysis.indicators) || '')) ? 0 : 10);
  evidence.push(derived.dataLimitations && derived.dataLimitations.length ? -8 : 8);
  const raw = evidence.reduce((sum, value) => sum + value, 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function parseRiskReward(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]);
}

function computeSetupConfidence(norm, derived, evalRes) {
  if (!evalRes.trade_setup || evalRes.trade_setup.type === 'none') return 0;
  const rr = typeof evalRes.trade_setup.risk_reward === 'number' ? evalRes.trade_setup.risk_reward : parseRiskReward(evalRes.trade_setup.risk_reward);
  const rrScore = rr != null && rr > 0 ? Math.min(24, Math.round(Math.min(rr, 3) / 3 * 24)) : 0;
  const confirmationScore = derived.confirmationStatus === 'CONFIRMED' ? 24 : derived.confirmationStatus === 'DEVELOPING' ? 12 : 0;
  const locationScore = derived.priceLocation === 'at_support' || derived.priceLocation === 'at_resistance' ? 12 : derived.priceLocation === 'near_support' || derived.priceLocation === 'near_resistance' ? 16 : derived.priceLocation === 'middle_of_range' ? 6 : 10;
  const liquidityScore = (norm.strategy && (norm.strategy.liquidity_sweep === 'confirmed' || (norm.m15 && norm.m15.liquidity && norm.m15.liquidity.swept))) ? 16 : 8;
  const entryScore = evalRes.trade_setup.entry_zone && evalRes.trade_setup.entry_zone !== 'none' ? 12 : 0;
  const dataPenalty = derived.dataLimitations && derived.dataLimitations.length ? -10 : 0;
  const raw = 10 + rrScore + confirmationScore + locationScore + liquidityScore + entryScore + dataPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

module.exports = {
  buildBiasConfidence,
  computeSetupConfidence,
};
