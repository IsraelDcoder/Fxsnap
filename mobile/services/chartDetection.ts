import { fetchWithApiAuth, getApiHeaders, resolveApiBaseUrl } from '@/services/apiAuth';

const API_URL = resolveApiBaseUrl();

export interface SetupAnalysisJson {
  status: 'ok';
  pair: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2?: number;
  risk_reward: number;
  support: number[];
  resistance: number[];
  trend: string;
  structure: string;
  rightmost_candle: {
    type: string;
    bias: string;
  };
  next_candle_prediction: string;
  confidence: number;
  levels_estimated: boolean;
  reasoning: string[];
  invalidation: string;
}

export type ChartAnalysisResult =
  | SetupAnalysisJson
  | { status: 'not_a_chart' }
  | { status: 'error'; message: string }
  | { status: 'premium_required'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSetupAnalysisJson(value: unknown): value is SetupAnalysisJson {
  if (!isRecord(value)
    || value.status !== 'ok'
    || typeof value.pair !== 'string'
    || typeof value.timeframe !== 'string'
    || (value.direction !== 'BUY' && value.direction !== 'SELL')
    || ![value.entry, value.stop_loss, value.take_profit_1, value.risk_reward, value.confidence].every(isNumber)
    || !Array.isArray(value.support) || !value.support.every(isNumber)
    || !Array.isArray(value.resistance) || !value.resistance.every(isNumber)
    || typeof value.trend !== 'string'
    || typeof value.structure !== 'string'
    || !isRecord(value.rightmost_candle)
    || typeof value.rightmost_candle.type !== 'string'
    || typeof value.rightmost_candle.bias !== 'string'
    || typeof value.next_candle_prediction !== 'string'
    || typeof value.levels_estimated !== 'boolean'
    || !Array.isArray(value.reasoning) || !value.reasoning.every((line) => typeof line === 'string')
    || typeof value.invalidation !== 'string') return false;
  return value.take_profit_2 === undefined || isNumber(value.take_profit_2);
}

export function normalizeChartAnalysisError(payload: unknown): ChartAnalysisResult {
  if (isRecord(payload) && (payload.code === 'PREMIUM_REQUIRED' || payload.error === 'premium_required')) {
    return {
      status: 'premium_required',
      message: typeof payload.message === 'string'
        ? payload.message
        : 'A Premium subscription is required for chart analysis.',
    };
  }
  return {
    status: 'error',
    message: isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : 'Chart analysis is temporarily unavailable. Please try again.',
  };
}

export async function analyzeChartImage(
  imageBase64: string,
  mimeType: string,
  pair: string,
  timeframe: string,
): Promise<ChartAnalysisResult> {
  try {
    const body = {
      imageBase64,
      mimeType,
      pair,
      timeframe,
    };
    const response = await fetchWithApiAuth(`${API_URL}/analyze-chart`, {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return normalizeChartAnalysisError(payload);
    if (isRecord(payload) && payload.status === 'not_a_chart') return { status: 'not_a_chart' };
    if (isRecord(payload) && payload.status === 'error') return normalizeChartAnalysisError(payload);
    if (isSetupAnalysisJson(payload)) return payload;
    return { status: 'error', message: "Couldn't generate a valid setup, try again" };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Chart analysis is temporarily unavailable. Please try again.',
    };
  }
}
