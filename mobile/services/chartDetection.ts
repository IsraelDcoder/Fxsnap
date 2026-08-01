import { getApiHeaders, resolveApiBaseUrl } from '@/services/apiAuth';

const API_URL = resolveApiBaseUrl();

export interface ChartValidationResult {
  isChart: boolean;
  confidence: number;
  reason: string;
  availability?: 'ai' | 'fallback' | 'rejected' | 'neutral';
  detectedPair?: string | null;
  timeframe?: string | null;
  trend?: string | null;
  indicators?: string[];
  support?: string[];
  resistance?: string[];
  chartNotes?: string[];
}

function buildFallbackChartResult(pair?: string, reason = 'Chart AI unavailable; using a permissive fallback so analysis can continue.') {
  return {
    isChart: false,
    confidence: 0,
    reason,
    availability: 'fallback',
    detectedPair: pair || null,
    timeframe: 'Unknown',
    trend: 'Neutral',
    indicators: ['Fallback review'],
    support: ['The chart AI service was unavailable, so FXSnap used a safe fallback to keep analysis moving.'],
    resistance: [],
    chartNotes: ['Review the chart manually if you need a stricter read.'],
  } satisfies ChartValidationResult;
}

export function buildNeutralChartResult(pair?: string, reason = 'Manual mode: analysis based on live market data.') {
  return {
    isChart: true,
    confidence: 55,
    reason,
    availability: 'neutral',
    detectedPair: pair || null,
    timeframe: 'Unknown',
    trend: 'Neutral',
    indicators: ['Manual review'],
    support: [],
    resistance: [],
    chartNotes: ['Chart AI was unavailable, so FXSnap used manual mode with live market data.'],
  } satisfies ChartValidationResult;
}


export async function validateChartImage(imageBase64: string, mimeType = 'image/jpeg', pair?: string): Promise<ChartValidationResult> {
  try {
    const response = await fetch(`${API_URL}/analyze-chart`, { method: 'POST', headers: await getApiHeaders(), body: JSON.stringify({ imageBase64, mimeType, pair }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Chart AI is unavailable.');

    if (payload.fallback) {
      return buildFallbackChartResult(pair, payload.message || 'Image analysis unavailable. Switch to manual mode.');
    }

    if (payload.error) {
      // The server explicitly rejected the image (e.g. "not a chart" or
      // unclear). Keep this a strict rejection so users know to retry.
      return {
        isChart: false,
        confidence: 0,
        reason: typeof payload.error === 'string' ? payload.error : 'Chart AI could not validate the image.',
        availability: 'rejected',
        detectedPair: pair || null,
        timeframe: payload.timeframe || null,
        trend: 'Neutral',
        indicators: [],
        support: [],
        resistance: [],
        chartNotes: [],
      } satisfies ChartValidationResult;
    }


    return {
      isChart: payload.isChart === true,
      confidence: Math.max(0, Math.min(100, Number(payload.confidence) || 0)),
      reason: typeof payload.reason === 'string' ? payload.reason : 'Chart analysis completed.',
      availability: 'ai',
      detectedPair: payload.detectedPair || null,
      timeframe: payload.timeframe || null,
      trend: payload.trend || null,
      indicators: Array.isArray(payload.indicators) ? payload.indicators : [],
      support: Array.isArray(payload.support) ? payload.support : [],
      resistance: Array.isArray(payload.resistance) ? payload.resistance : [],
      chartNotes: Array.isArray(payload.chartNotes) ? payload.chartNotes : [],
    };
  } catch (error) {
    console.error('[Chart Detection] Error:', error);
    return buildFallbackChartResult(pair, error instanceof Error ? error.message : 'Unable to analyze image.');
  }
}

export async function detectPairFromChart(imageBase64: string, mimeType = 'image/jpeg'): Promise<string | null> {
  const result = await validateChartImage(imageBase64, mimeType);
  return result.detectedPair || null;
}
