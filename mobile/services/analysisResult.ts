import type { AnalysisResult } from '@/context/AppContext';
import type { ChartAnalysisResult } from '@/services/chartDetection';
import { resolveAnalysisDirection } from '@/services/analysisDirection';

export function getMissingTradeLevelsExplanation(analysis: Pick<AnalysisResult, 'status' | 'tradeSetup' | 'takeProfitLevels'>): string | null {
  if (analysis.status !== 'no_trade') return null;

  const isAvailable = (value: string | number | undefined) => value != null
    && String(value).trim() !== ''
    && !['none', 'not_clear', 'unknown', 'n/a', 'na', '—'].includes(String(value).trim().toLowerCase());
  const hasTakeProfit = (analysis.takeProfitLevels ?? []).some(isAvailable)
    || isAvailable(analysis.tradeSetup?.takeProfit);
  const hasEntryAndStop = isAvailable(analysis.tradeSetup?.entryZone)
    && isAvailable(analysis.tradeSetup?.stopLoss);
  if (hasEntryAndStop && hasTakeProfit) return null;
  return 'Hold for now — the market is still developing. Wait for direction and price levels to confirm before considering an entry. Risk/reward will be calculated when the chart supports entry, stop, and target prices.';
}

export function getMarketDevelopmentPlan(analysis: Pick<AnalysisResult, 'status' | 'marketBias' | 'analysis'>, includeFullContext = false): string {
  if (analysis.status !== 'no_trade') return 'Review the chart evidence and confirm the setup against current market conditions before acting.';

  const bias = analysis.marketBias ?? analysis.analysis?.trend ?? 'neutral';
  const waitCondition = bias === 'bullish'
    ? 'Wait for a confirmed bullish entry or retest.'
    : bias === 'bearish'
      ? 'Wait for a confirmed bearish entry or retest.'
      : 'Wait for a clear break, rejection, or directional confirmation.';
  const structure = analysis.analysis?.structure?.trim();
  const context = includeFullContext ? analysis.analysis?.notes?.trim() : undefined;
  const details = [structure, context]
    .filter((value): value is string => Boolean(value))
    .map(formatDevelopingNote)
    .filter((value, index, values) => values.indexOf(value) === index);
  return `Hold for now — the market is still developing. ${waitCondition}${details.length ? ` Chart context: ${details.join(' ')}` : ''}`;
}

export function formatDevelopingNote(note: string): string {
  return note
    .replace(/\bno[_ -]trade\b/gi, 'hold for now')
    .replace(/\bno[_ -]setup\b/gi, 'setup is still developing')
    .replace(/\bnot a validated trade setup\b/gi, 'a setup still awaiting confirmation')
    .replace(/\b(?:risk\s*\/\s*reward|rr)\s+(?:cannot|can't|could not)\s+be calculated(?:\s+without complete levels)?/gi, 'Risk/reward will be calculated when the price levels are confirmed')
    .replace(/\bcould not be established\b/gi, 'awaiting chart confirmation')
    .replace(/\bnot established\b/gi, 'awaiting confirmation')
    .replace(/\bnot calculable\b/gi, 'calculated when levels are confirmed');
}

export function getTradeReadinessLabel(
  tradeStatus: string | undefined,
  entry: string,
  stopLoss: string,
  takeProfit: string,
  direction?: string,
  riskReward?: number | string,
): string {
  if (tradeStatus === 'actionable') return 'Ready';
  if (tradeStatus?.startsWith('waiting')) return 'Waiting for confirmation';

  const isIdentified = (value: string) => value.trim() !== ''
    && !['—', 'not established', 'not provided', 'none', 'unknown', 'not_clear'].includes(value.trim().toLowerCase());
  if (isIdentified(entry) && isIdentified(stopLoss) && isIdentified(takeProfit)) {
    const side = direction === 'BUY' || direction === 'SELL' ? `${direction} ` : '';
    const ratio = Number(riskReward);
    const reason = Number.isFinite(ratio) && ratio > 0 && ratio < 1.5
      ? `RR ${Number(ratio.toFixed(2))} below 1.5 minimum`
      : 'awaiting validation';
    return `${side}candidate setup · ${reason}`;
  }
  return 'Hold — market still developing';
}

export function formatTradeReadiness(
  readiness: number,
  tradeStatus: string | undefined,
  entry: string,
  stopLoss: string,
  takeProfit: string,
  direction?: string,
  riskReward?: number | string,
): string {
  const label = getTradeReadinessLabel(tradeStatus, entry, stopLoss, takeProfit, direction, riskReward);
  const score = Math.round(Math.max(0, Math.min(100, readiness)));
  return score > 0 ? `${score}% · ${label}` : label;
}

export function buildAnalysisResult(chart: ChartAnalysisResult, pair: string, imageUri?: string): AnalysisResult {
  const direction = resolveAnalysisDirection(
    chart.trade_setup.type,
    chart.marketBias,
    chart.analysis.trend,
    chart.analysis.sentiment,
  );
  const takeProfitLevels = chart.trade_setup.take_profit_levels?.length
    ? chart.trade_setup.take_profit_levels
    : chart.trade_setup.take_profit !== 'none' ? [chart.trade_setup.take_profit] : [];

  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    pair,
    status: chart.status,
    message: chart.message,
    freeAnalysisUsed: chart.freeAnalysisUsed,
    direction,
    timeframe: chart.timeframe || undefined,
    latestVisiblePrice: chart.latestVisiblePrice,
    takeProfitLevels,
    priceSeries: chart.priceSeries,
    reasoning: chart.reasoning,
    supportResistance: chart.supportResistance,
    confidence: typeof chart.marketConfidence === 'number' ? chart.marketConfidence : chart.confidence,
    confidenceType: 'composite_score',
    imageUri,
    createdAt: new Date().toISOString(),
    analysis: {
      trend: chart.analysis.trend,
      structure: chart.analysis.structure,
      volatility: chart.analysis.volatility,
      volume: chart.analysis.volume,
      sentiment: chart.analysis.sentiment,
      indicators: chart.analysis.indicators,
      notes: chart.analysis.notes,
    },
    zones: {
      support: chart.zones.support,
      resistance: chart.zones.resistance,
      liquidity: chart.zones.liquidity,
    },
    tradeSetup: {
      type: chart.trade_setup.type,
      entryZone: chart.trade_setup.entry_zone,
      stopLoss: chart.trade_setup.stop_loss,
      takeProfit: chart.trade_setup.take_profit,
      riskReward: chart.trade_setup.risk_reward,
    },
    marketBias: chart.marketBias,
    marketBiasConfidence: chart.marketBiasConfidence,
    marketConfidence: chart.marketConfidence ?? chart.marketBiasConfidence ?? chart.confidence,
    setupConfidence: chart.setupConfidence ?? chart.confidence,
    entryReadiness: chart.entryReadiness ?? 0,
    breakdown: chart.breakdown || {},
    tradeStatus: chart.tradeStatus,
    setupStatus: chart.setupStatus,
    tradeTrigger: chart.tradeTrigger,
    whyNotNow: chart.whyNotNow,
    dataLimitations: chart.dataLimitations,
    multiTimeframe: chart.multiTimeframe,
  };
}
