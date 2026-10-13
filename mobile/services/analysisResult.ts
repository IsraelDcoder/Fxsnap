import type { AnalysisResult } from '@/context/AppContext';
import type { ChartAnalysisResult } from '@/services/chartDetection';
import { resolveAnalysisDirection } from '@/services/analysisDirection';

export function isUnavailableAnalysisValue(value: unknown): boolean {
  if (value == null || String(value).trim() === '') return true;
  const normalized = String(value).trim().toLowerCase();
  return ['none', 'not_clear', 'unknown', 'n/a', 'na', '—', 'not provided', 'not established', 'not calculable']
    .includes(normalized)
    || /^(?:(?:entry|stop(?:\s+loss)?|take\s+profit(?:\s+\d+)?|risk\s*:\s*reward|rr|price\s+levels?)\s*)?(?:(?:is|are)\s+)?(?:not|unavailable|unknown|pending|awaiting|cannot\s+be|can't\s+be|could\s+not\s+be)\s+(?:yet\s+)?(?:established|provided|identified|readable|calculable|calculated|available|confirmed|determined)(?:\b.*)?$/i.test(String(value).trim());
}

function isValidPrice(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value !== 'string' || isUnavailableAnalysisValue(value)) return false;
  const price = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
  const match = value.trim().match(new RegExp(`^(${price})(?:\\s*(?:-|–|—|to)\\s*(${price}))?$`, 'i'));
  if (!match) return false;
  return [match[1], match[2]].filter(Boolean).every((part) => Number(part.replace(/,/g, '')) > 0);
}

function getRiskRewardRatio(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || isUnavailableAnalysisValue(value)) return null;
  const ratio = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const risk = Number(ratio[1]);
    const reward = Number(ratio[2]);
    return risk > 0 && reward > 0 ? reward / risk : null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function hasValidatedTradeSetup(analysis: Pick<AnalysisResult, 'tradeSetup' | 'takeProfitLevels'>): boolean {
  const target = (analysis.takeProfitLevels ?? []).find(isValidPrice) ?? analysis.tradeSetup?.takeProfit;
  const riskReward = getRiskRewardRatio(analysis.tradeSetup?.riskReward);
  return isValidPrice(analysis.tradeSetup?.entryZone)
    && isValidPrice(analysis.tradeSetup?.stopLoss)
    && isValidPrice(target)
    && riskReward != null;
}

export function getMissingTradeLevelsExplanation(analysis: Pick<AnalysisResult, 'status' | 'tradeSetup' | 'takeProfitLevels' | 'candidateReview'>): string | null {
  if (analysis.status !== 'no_trade' && analysis.status !== 'success') return null;
  if (hasValidatedTradeSetup(analysis)) return null;
  if (analysis.tradeSetup?.type === 'buy' || analysis.tradeSetup?.type === 'sell') {
    return 'A conditional setup was identified, but one or more price levels are not supported by the chart. No missing level or risk/reward value has been inferred.';
  }
  return 'No technically valid candidate was established from the visible chart evidence. No entry, stop, target, or risk/reward value has been inferred.';
}

export function getMarketDevelopmentPlan(
  analysis: Pick<AnalysisResult, 'status' | 'marketBias' | 'analysis' | 'tradeSetup' | 'takeProfitLevels' | 'tradeStatus' | 'tradeTrigger' | 'direction' | 'entryStatus' | 'setupType' | 'candidateReview'>,
  includeFullContext = false,
): string {
  const isConditionalCandidate = analysis.tradeSetup?.type === 'buy' || analysis.tradeSetup?.type === 'sell';
  if (isConditionalCandidate) {
    const direction = analysis.tradeSetup!.type.toUpperCase();
    const target = (analysis.takeProfitLevels ?? []).find(isValidPrice) ?? analysis.tradeSetup!.takeProfit;
    const ratio = getRiskRewardRatio(analysis.tradeSetup!.riskReward);
    const hasCompleteCandidate = isValidPrice(analysis.tradeSetup!.entryZone)
      && isValidPrice(analysis.tradeSetup!.stopLoss)
      && isValidPrice(target)
      && ratio != null;
    const entryStatus = analysis.entryStatus === 'trigger_observed'
      ? 'Entry trigger observed in the screenshot; freshness and live execution are not implied.'
      : analysis.entryStatus === 'missed'
        ? 'Planned entry is marked missed.'
        : analysis.entryStatus === 'unverified'
          ? 'Entry status is unverified from this screenshot.'
          : analysis.tradeStatus?.startsWith('waiting') && analysis.tradeTrigger
            ? analysis.tradeTrigger
            : 'Conditional setup; wait for the specified entry trigger.';
    const setupType = analysis.setupType && analysis.setupType !== 'unspecified'
      ? ` ${analysis.setupType.replace('_', ' ')}`
      : '';
    const candidateReason = analysis.candidateReview?.reason;
    const notes = [entryStatus, candidateReason].filter(Boolean).join(' ');
    const entryText = isValidPrice(analysis.tradeSetup!.entryZone) ? analysis.tradeSetup!.entryZone : 'not identified';
    const stopText = isValidPrice(analysis.tradeSetup!.stopLoss) ? analysis.tradeSetup!.stopLoss : 'not identified';
    const targetText = isValidPrice(target) ? target : 'not identified';
    const ratioText = ratio == null ? 'not calculable from available levels' : formatRiskReward(ratio);
    const candidateState = hasCompleteCandidate ? 'candidate' : 'incomplete candidate';
    return `${direction}${setupType} ${candidateState} — Entry ${entryText}, SL ${stopText}, TP1 ${targetText}, R:R ${ratioText}. ${formatDevelopingNote(notes)}`;
  }

  const isWaitingForConfirmation = analysis.tradeStatus?.startsWith('waiting') ?? false;
  const isHold = analysis.status === 'no_trade'
    || (analysis.status === 'success' && (!hasValidatedTradeSetup(analysis) || analysis.tradeStatus !== 'actionable'));
  if (!isHold && !isWaitingForConfirmation) {
    return 'Review the chart evidence and confirm the setup against current market conditions before acting.';
  }

  const bias = analysis.marketBias ?? analysis.analysis?.trend ?? 'neutral';
  const confirmationTrigger = analysis.tradeStatus?.startsWith('waiting') ? analysis.tradeTrigger?.trim() : undefined;
  const waitCondition = confirmationTrigger || (bias === 'bullish'
    ? 'Wait for a confirmed bullish entry or retest.'
    : bias === 'bearish'
      ? 'Wait for a confirmed bearish entry or retest.'
      : 'Wait for a clear break, rejection, or directional confirmation.');
  const structure = analysis.analysis?.structure?.trim();
  const context = includeFullContext ? analysis.analysis?.notes?.trim() : undefined;
  const details = [structure, context]
    .filter((value): value is string => Boolean(value))
    .map(formatDevelopingNote)
    .filter((value, index, values) => values.indexOf(value) === index);
  return `Hold for now — the market is still developing. ${formatDevelopingNote(waitCondition)}${details.length ? ` Chart context: ${details.join(' ')}` : ''}`;
}

export function formatDevelopingNote(note: string): string {
  return note
    .replace(/\bno[_ -]trade\b/gi, 'hold for now')
    .replace(/\bno[_ -]setup\b/gi, 'setup is still developing')
    .replace(/\bsetup (?:is )?not identified\b/gi, 'setup is still developing')
    .replace(/\bnot a validated trade setup\b/gi, 'a setup still awaiting confirmation')
    .replace(/\b(?:risk\s*\/\s*reward|rr)\s+(?:cannot|can't|could not)\s+be calculated(?:\s+without complete levels)?/gi, 'Risk/reward will be calculated when the price levels are confirmed')
    .replace(/\bcould not be established\b/gi, 'awaiting chart confirmation')
    .replace(/\bnot established\b/gi, 'awaiting confirmation')
    .replace(/\bnot calculable\b/gi, 'calculated when levels are confirmed');
}

export function formatRiskReward(value: unknown): string {
  if (isUnavailableAnalysisValue(value)) return '—';
  const formatPart = (part: string) => {
    const number = Number(part);
    return Number.isFinite(number) && number > 0
      ? String(Math.round(number * 100) / 100 || '<0.01')
      : null;
  };
  if (typeof value === 'string' && value.includes(':')) {
    const ratio = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!ratio) return value;
    const risk = formatPart(ratio[1]);
    const reward = formatPart(ratio[2]);
    return risk && reward ? `${risk}:${reward}` : value;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? `1:${formatPart(String(number))}`
    : String(value);
}

export function getTradeReadinessLabel(
  tradeStatus: string | undefined,
  entry: string,
  stopLoss: string,
  takeProfit: string,
  direction?: string,
  riskReward?: number | string,
): string {
  const normalizedDirection = direction?.trim().toUpperCase();
  const hasCompleteSetup = isValidPrice(entry)
    && isValidPrice(stopLoss)
    && isValidPrice(takeProfit)
    && getRiskRewardRatio(riskReward) != null;
  if (tradeStatus === 'actionable' && hasCompleteSetup && (normalizedDirection === 'BUY' || normalizedDirection === 'SELL')) {
    return normalizedDirection;
  }
  return 'WAIT FOR CONFIRMATION';
}

export function formatTradeReadiness(
  _readiness: number,
  tradeStatus: string | undefined,
  entry: string,
  stopLoss: string,
  takeProfit: string,
  direction?: string,
  riskReward?: number | string,
): string {
  return getTradeReadinessLabel(tradeStatus, entry, stopLoss, takeProfit, direction, riskReward);
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
    entryStatus: chart.entryStatus,
    setupType: chart.setupType,
    candidateReview: chart.candidateReview,
    multiTimeframe: chart.multiTimeframe,
  };
}
