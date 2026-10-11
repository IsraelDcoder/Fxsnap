import type { AnalysisResult } from '@/context/AppContext';
import type { ChartAnalysisResult } from '@/services/chartDetection';
import { resolveAnalysisDirection } from '@/services/analysisDirection';

export function getMissingTradeLevelsExplanation(analysis: Pick<AnalysisResult, 'status' | 'direction' | 'tradeSetup' | 'takeProfitLevels'>): string | null {
  if (analysis.status !== 'no_trade' || !analysis.direction) return null;

  const isAvailable = (value: string | number | undefined) => value != null
    && String(value).trim() !== ''
    && !['none', 'not_clear', 'unknown', 'n/a', 'na', '—'].includes(String(value).trim().toLowerCase());
  const hasTakeProfit = (analysis.takeProfitLevels ?? []).some(isAvailable)
    || isAvailable(analysis.tradeSetup?.takeProfit);
  const missing = [
    !isAvailable(analysis.tradeSetup?.entryZone) ? 'Entry' : null,
    !isAvailable(analysis.tradeSetup?.stopLoss) ? 'Stop Loss' : null,
    !hasTakeProfit ? 'Take Profit 1' : null,
  ].filter((level): level is string => level != null);

  if (missing.length === 0) return null;
  const missingLevels = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `This is a ${analysis.direction} market read, not a validated trade setup. ${missingLevels} could not be established from the chart, so no prices have been inferred. Risk : Reward cannot be calculated without complete levels.`;
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
  if (isIdentified(entry)) return 'Entry identified · setup incomplete';
  return 'Setup not identified';
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
