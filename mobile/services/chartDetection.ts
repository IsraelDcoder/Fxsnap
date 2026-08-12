import { getApiHeaders, resolveApiBaseUrl } from '@/services/apiAuth';

const API_URL = resolveApiBaseUrl();

export type AnalysisStatus = 'success' | 'no_trade' | 'invalid_image' | 'ai_unavailable' | 'ai_invalid_response';

export interface ChartAnalysisResult {
  status: AnalysisStatus;
  message?: string;
  detectedPair?: string | null;
  timeframe?: string | null;
  analysis: {
    trend: 'bullish' | 'bearish' | 'neutral';
    structure: string;
    volatility: 'low' | 'moderate' | 'high';
    volume: 'low' | 'moderate' | 'high' | 'not_visible';
    sentiment: 'bullish' | 'bearish' | 'neutral';
    indicators: string;
    notes: string;
  };
  zones: {
    support: string;
    resistance: string;
    liquidity: string;
  };
  trade_setup: {
    type: 'buy' | 'sell' | 'none';
    entry_zone: string;
    stop_loss: string;
    take_profit: string;
    risk_reward: number | string;
  };
  marketBias?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  marketBiasConfidence?: number;
  // Canonical analysis scores
  marketConfidence?: number;
  entryReadiness?: number;
  tradeDecision?: 'BUY' | 'SELL' | 'WAIT' | 'NONE';
  tradeStatus?: string;
  setupStatus?: string;
  setupConfidence?: number;
  tradeTrigger?: string;
  whyNotNow?: string[];
  dataLimitations?: string[];
  confidence: number;
}

function emptyAnalysis(status: AnalysisStatus, message: string): ChartAnalysisResult {
  return {
    status,
    message,
    analysis: {
      trend: 'neutral',
      structure: '',
      volatility: 'low',
      volume: 'not_visible',
      sentiment: 'neutral',
      indicators: 'none',
      notes: message,
    },
    zones: {
      support: 'not_clear',
      resistance: 'not_clear',
      liquidity: 'not_clear',
    },
    trade_setup: {
      type: 'none',
      entry_zone: 'none',
      stop_loss: 'none',
      take_profit: 'none',
      risk_reward: 'none',
    },
    marketBias: 'neutral',
    marketBiasConfidence: 0,
    tradeStatus: 'no_setup',
    setupStatus: 'NO_SETUP',
    setupConfidence: 0,
    tradeTrigger: '',
    whyNotNow: [],
    dataLimitations: [],
    confidence: 0,
  };
}

/**
 * Send a chart image to the backend for strict, disciplined price-action
 * analysis. The server enforces the full system prompt + validation layer and
 * returns exactly one clean state: success | no_trade | invalid_image |
 * ai_unavailable.
 */
export async function analyzeChartImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  pair?: string
): Promise<ChartAnalysisResult> {
  try {
    const response = await fetch(`${API_URL}/analyze-chart`, {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({ imageBase64, mimeType, pair }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return emptyAnalysis('ai_unavailable', payload.error || 'Chart AI is unavailable.');
    }

    const status: AnalysisStatus = ['success', 'no_trade', 'invalid_image', 'ai_unavailable', 'ai_invalid_response'].includes(payload.status)
      ? payload.status
      : 'ai_unavailable';

    if (status === 'ai_unavailable') {
      return emptyAnalysis(status, payload.message || 'Chart AI is unavailable right now. Please try again shortly.');
    }

    return {
      status,
      message: payload.message || undefined,
      detectedPair: payload.detectedPair ?? null,
      timeframe: payload.timeframe ?? null,
      analysis: {
        trend: payload.analysis?.trend || 'neutral',
        structure: payload.analysis?.structure || '',
        volatility: payload.analysis?.volatility || 'low',
        volume: payload.analysis?.volume || 'not_visible',
        sentiment: payload.analysis?.sentiment || 'neutral',
        indicators: payload.analysis?.indicators || 'none',
        notes: payload.analysis?.notes || '',
      },
      zones: {
        support: payload.zones?.support || 'not_clear',
        resistance: payload.zones?.resistance || 'not_clear',
        liquidity: payload.zones?.liquidity || 'not_clear',
      },
      trade_setup: {
        type: payload.trade_setup?.type || 'none',
        entry_zone: payload.trade_setup?.entry_zone || 'none',
        stop_loss: payload.trade_setup?.stop_loss || 'none',
        take_profit: payload.trade_setup?.take_profit || 'none',
        risk_reward: payload.trade_setup?.risk_reward ?? 'none',
      },
      marketBias: payload.marketBias || 'neutral',
      marketBiasConfidence: Math.max(0, Math.min(100, Number(payload.marketBiasConfidence) || 0)),
      tradeStatus: payload.tradeStatus || 'no_setup',
      setupStatus: payload.setupStatus || 'NO_SETUP',
      setupConfidence: Math.max(0, Math.min(100, Number(payload.setupConfidence) || 0)),
      tradeTrigger: payload.tradeTrigger || '',
      whyNotNow: Array.isArray(payload.whyNotNow) ? payload.whyNotNow.map(String) : [],
      dataLimitations: Array.isArray(payload.dataLimitations) ? payload.dataLimitations.map(String) : [],
      confidence: Math.max(0, Math.min(100, Number(payload.confidence) || 0)),
    };
  } catch (error) {
    console.error('[Chart Detection] Error:', error);
    return emptyAnalysis(
      'ai_unavailable',
      error instanceof Error ? error.message : 'Unable to analyze image.'
    );
  }
}

