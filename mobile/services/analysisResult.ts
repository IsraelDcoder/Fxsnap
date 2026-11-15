import type { AnalysisResult } from '@/context/AppContext';
import type { ChartAnalysisResult, SetupAnalysisJson } from '@/services/chartDetection';

export function calculateRiskRewardFromLevels(
  entry: number,
  stopLoss: number,
  takeProfit: number,
  direction: 'BUY' | 'SELL',
): number | null {
  const risk = direction === 'BUY' ? entry - stopLoss : stopLoss - entry;
  const reward = direction === 'BUY' ? takeProfit - entry : entry - takeProfit;
  if (![risk, reward].every((value) => Number.isFinite(value) && value > 0)) return null;
  return Math.round((reward / risk) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isCompleteSetup(value: unknown): value is SetupAnalysisJson {
  if (!isRecord(value)) return false;
  const setup = value;
  const candle = setup.rightmost_candle;
  const { entry, stop_loss, take_profit_1, take_profit_2, risk_reward, direction } = setup;
  if (setup.status !== 'ok'
    || typeof setup.pair !== 'string' || !setup.pair.trim()
    || typeof setup.timeframe !== 'string' || !setup.timeframe.trim()
    || (direction !== 'BUY' && direction !== 'SELL')
    || !isPositiveFinite(entry)
    || !isPositiveFinite(stop_loss)
    || !isPositiveFinite(take_profit_1)
    || !isPositiveFinite(risk_reward)
    || (take_profit_2 !== undefined && !isPositiveFinite(take_profit_2))
    || !Array.isArray(setup.support) || setup.support.length === 0
    || !setup.support.every(isPositiveFinite)
    || !Array.isArray(setup.resistance) || setup.resistance.length === 0
    || !setup.resistance.every(isPositiveFinite)
    || typeof setup.trend !== 'string' || !setup.trend.trim()
    || typeof setup.structure !== 'string' || !setup.structure.trim()
    || !isRecord(candle)
    || typeof candle.type !== 'string' || !candle.type.trim()
    || typeof candle.bias !== 'string' || !candle.bias.trim()
    || typeof setup.next_candle_prediction !== 'string' || !setup.next_candle_prediction.trim()
    || typeof setup.confidence !== 'number' || !Number.isFinite(setup.confidence)
    || setup.confidence < 0 || setup.confidence > 100
    || typeof setup.levels_estimated !== 'boolean'
    || !Array.isArray(setup.reasoning) || setup.reasoning.length > 4
    || !setup.reasoning.every((line) => typeof line === 'string' && line.trim())
    || typeof setup.invalidation !== 'string' || !setup.invalidation.trim()) return false;

  const ratio = calculateRiskRewardFromLevels(
    entry,
    stop_loss,
    take_profit_1,
    direction,
  );
  const risk = direction === 'BUY' ? entry - stop_loss : stop_loss - entry;
  const reward = direction === 'BUY' ? take_profit_1 - entry : entry - take_profit_1;
  const exactRatio = reward / risk;
  return ratio !== null
    && exactRatio >= 1.5
    && Math.abs(ratio - risk_reward) <= 0.02;
}

export function formatRiskReward(value: unknown): string {
  const formatPart = (part: number) => Number(part.toFixed(2)) || '<0.01';
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `1:${formatPart(value)}`;
  }
  if (typeof value === 'string') {
    const ratio = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (ratio) {
      const risk = Number(ratio[1]);
      const reward = Number(ratio[2]);
      return risk > 0 && reward > 0 ? `${formatPart(risk)}:${formatPart(reward)}` : '—';
    }
    const numericRatio = Number(value);
    if (Number.isFinite(numericRatio) && numericRatio > 0) return `1:${formatPart(numericRatio)}`;
  }
  return '—';
}

export function buildAnalysisResult(chart: ChartAnalysisResult, pair: string, imageUri?: string): AnalysisResult {
  const base = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    pair,
    imageUri,
    createdAt: new Date().toISOString(),
  };

  if (chart.status === 'ok') {
    return {
      ...base,
      pair: chart.pair,
      status: 'success',
      direction: chart.direction,
      timeframe: chart.timeframe,
      confidence: chart.confidence,
      setup: chart,
    };
  }

  if (chart.status === 'not_a_chart') {
    return { ...base, status: 'not_a_chart', confidence: 0, message: 'Please upload a price chart.' };
  }

  return {
    ...base,
    status: chart.status === 'premium_required' ? 'premium_required' : 'ai_unavailable',
    confidence: 0,
    message: chart.message,
  };
}
