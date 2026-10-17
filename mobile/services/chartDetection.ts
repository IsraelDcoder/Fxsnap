import { getApiHeaders, resolveApiBaseUrl } from '@/services/apiAuth';

const API_URL = resolveApiBaseUrl();

export type AnalysisStatus = 'success' | 'no_trade' | 'invalid_image' | 'ai_unavailable' | 'ai_invalid_response' | 'premium_required';

export function normalizeChartAnalysisError(payload: any): { status: AnalysisStatus; message: string } {
  const code = typeof payload?.code === 'string' ? payload.code : typeof payload?.error === 'string' ? payload.error : '';
  const reason = typeof payload?.reason === 'string' ? payload.reason : '';
  const combined = `${code} ${reason} ${payload?.message || ''} ${typeof payload?.error === 'object' && payload?.error ? payload.error.message || '' : ''}`.toLowerCase();

  if (code === 'PREMIUM_REQUIRED' || combined.includes('premium_required')) {
    return {
      status: 'premium_required',
      message: 'A Premium subscription is required for chart analysis.',
    };
  }

  const quotaLike = combined.includes('quota')
    || combined.includes('exceeded your current quota')
    || combined.includes('insufficient_quota')
    || combined.includes('rate limit')
    || combined.includes('billing details')
    || combined.includes('credit')
    || combined.includes('limit reached');

  if (quotaLike) {
    return {
      status: 'ai_unavailable',
      message: 'Analysis is not available at the moment. Please try again later.',
    };
  }

  return {
    status: 'ai_unavailable',
    message: payload?.message || payload?.error || 'Chart AI is unavailable right now. Please try again shortly.',
  };
}

export interface ChartAnalysisResult {
  status: AnalysisStatus;
  message?: string;
  detectedPair?: string | null;
  timeframe?: string | null;
  latestVisiblePrice?: number;
  priceSeries?: number[];
  reasoning?: string[];
  supportResistance?: {
    support: string[];
    resistance: string[];
  };
  analysis: {
    trend: 'bullish' | 'bearish' | 'neutral';
    structure: string;
    volatility: 'low' | 'moderate' | 'high';
    volume: 'low' | 'moderate' | 'high' | 'visible' | 'not_visible';
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
    take_profit_levels?: string[];
    risk_reward: number | string;
  };
  tradePlan?: {
    direction: 'BUY' | 'SELL';
    entryType: 'market' | 'trigger';
    triggerEvent: string | null;
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number | null;
    riskReward: number;
  } | null;
  verdict?: 'TRADE_PLAN' | 'CONDITIONAL_PLAN' | 'NO_TRADE';
  conviction?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  verdictReason?: string;
  noTradeReason?: string | null;
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
  entryStatus?: 'waiting_for_trigger' | 'trigger_observed' | 'missed' | 'unverified';
  setupType?: 'limit_zone' | 'breakout' | 'rejection' | 'other' | 'unspecified';
  candidateReview?: {
    status: 'selected' | 'none' | 'ambiguous' | 'invalid_response';
    direction?: 'buy' | 'sell';
    evidenceScore?: number;
    reason: string;
  };
  breakdown?: {
    trend?: number;
    zone?: number;
    priceLocation?: number;
    liquidity?: number;
    confirmation?: number;
    bos?: number;
    rsi?: number;
    rawScore?: number;
  };
  confidence: number;
  multiTimeframe?: {
    alignment: 'aligned' | 'conflicting' | 'unclear';
    summary: string;
    h4: { trend: 'bullish' | 'bearish' | 'neutral'; structure: string };
    m15: { trend: 'bullish' | 'bearish' | 'neutral'; structure: string; confirmation: string };
  };
}

export interface MultiTimeframeChartImage {
  imageBase64: string;
  mimeType: string;
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
      marketConfidence: 0,
      entryReadiness: 0,
      tradeDecision: 'NONE',
    tradeStatus: 'no_setup',
    setupStatus: 'NO_SETUP',
    setupConfidence: 0,
    tradeTrigger: '',
    whyNotNow: [],
    dataLimitations: [],
    confidence: 0,
  };
}

function firstAnalysisValue(...values: unknown[]): unknown {
  return values.find((value) => value != null && String(value).trim() !== ''
    && !['none', 'not_clear', 'unknown', 'n/a', 'na'].includes(String(value).trim().toLowerCase()));
}

export function normalizeChartTradeSetup(payload: unknown): ChartAnalysisResult['trade_setup'] {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const nested = root.trade_setup && typeof root.trade_setup === 'object'
    ? root.trade_setup as Record<string, unknown>
    : root.tradeSetup && typeof root.tradeSetup === 'object'
      ? root.tradeSetup as Record<string, unknown>
      : {};
  const rawTarget = firstAnalysisValue(
    nested.take_profit,
    nested.takeProfit,
    nested.take_profit_price,
    nested.tp,
    nested.target,
    root.take_profit,
    root.takeProfit,
    root.tp,
    root.target,
  );
  const rawTargetLevels = [
    nested.take_profit_levels,
    nested.takeProfitLevels,
    nested.targets,
    root.take_profit_levels,
    root.takeProfitLevels,
    root.targets,
  ].find((levels) => Array.isArray(levels) && levels.length > 0);
  const splitTargetList = (value: string) => value.split(/(?:,\s+|,(?!\d{3}(?:\D|$))|[;|\n])+/)
    .map((level) => level.trim())
    .filter((level) => firstAnalysisValue(level) != null)
    .slice(0, 2);
  const takeProfitLevels = Array.isArray(rawTargetLevels)
    ? rawTargetLevels.map((level) => String(level).trim()).filter((level) => firstAnalysisValue(level) != null).slice(0, 2)
    : Array.isArray(rawTarget)
      ? rawTarget.map((level) => String(level).trim()).filter((level) => firstAnalysisValue(level) != null).slice(0, 2)
      : typeof rawTarget === 'string'
        ? splitTargetList(rawTarget)
        : rawTarget == null ? [] : [String(rawTarget).trim()];
  const rawType = String(firstAnalysisValue(
    nested.type,
    nested.trade_type,
    nested.direction,
    root.trade_type,
    root.trade_direction,
    root.direction,
  ) ?? 'none').trim().toLowerCase();
  const type = ['buy', 'long'].includes(rawType) ? 'buy'
    : ['sell', 'short'].includes(rawType) ? 'sell' : 'none';
  const entry = firstAnalysisValue(
    nested.entry_zone,
    nested.entry,
    nested.entry_price,
    root.entry_zone,
    root.entry,
    root.entry_price,
  );
  const stop = firstAnalysisValue(
    nested.stop_loss,
    nested.stopLoss,
    nested.stop_loss_price,
    nested.sl,
    nested.stop,
    root.stop_loss,
    root.stopLoss,
    root.sl,
    root.stop,
  );
  const takeProfit = takeProfitLevels[0] ?? rawTarget;
  const rawRiskReward = firstAnalysisValue(nested.risk_reward, nested.riskReward, nested.rr, root.risk_reward, root.riskReward, root.rr);

  return {
    type,
    entry_zone: entry == null ? 'none' : String(entry).trim(),
    stop_loss: stop == null ? 'none' : String(stop).trim(),
    take_profit: takeProfit == null ? 'none' : String(takeProfit).trim(),
    take_profit_levels: takeProfitLevels,
    risk_reward: typeof rawRiskReward === 'number' || typeof rawRiskReward === 'string' ? rawRiskReward : 'none',
  };
}

export function normalizeChartTradePlan(payload: unknown): NonNullable<ChartAnalysisResult['tradePlan']> | null {
  if (!payload || typeof payload !== 'object') return null;
  const plan = (payload as Record<string, unknown>).trade_plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const raw = plan as Record<string, unknown>;
  const direction = raw.direction;
  const entryType = raw.entry_type;
  const prices = [raw.entry, raw.stop_loss, raw.take_profit_1, raw.risk_reward].map(Number);
  if ((direction !== 'BUY' && direction !== 'SELL')
    || (entryType !== 'market' && entryType !== 'trigger')
    || !prices.every((price) => Number.isFinite(price) && price > 0)) return null;
  const takeProfit2 = raw.take_profit_2 == null ? null : Number(raw.take_profit_2);
  if (takeProfit2 != null && (!Number.isFinite(takeProfit2) || takeProfit2 <= 0)) return null;
  return {
    direction,
    entryType,
    triggerEvent: typeof raw.trigger_event === 'string' ? raw.trigger_event : null,
    entry: prices[0],
    stopLoss: prices[1],
    takeProfit1: prices[2],
    takeProfit2,
    riskReward: prices[3],
  };
}

export function normalizeLatestVisiblePrice(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const chart = root.chart && typeof root.chart === 'object'
    ? root.chart as Record<string, unknown>
    : {};
  const hasReadableSource = chart.price_scale_visible === true
    && ['visible_price_marker', 'latest_candle_scale_read'].includes(String(chart.current_price_source));
  if (!hasReadableSource) return undefined;

  const rawPrice = chart.latest_visible_price;
  const normalizedPrice = typeof rawPrice === 'string' && /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(rawPrice.trim())
    ? rawPrice.trim().replace(/,/g, '')
    : rawPrice;
  const price = typeof normalizedPrice === 'number'
    ? normalizedPrice
    : typeof normalizedPrice === 'string' && /^\d+(?:\.\d+)?$/.test(normalizedPrice.trim())
      ? Number(normalizedPrice.trim())
      : Number.NaN;
  return Number.isFinite(price) && price > 0 ? price : undefined;
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
  return sendChartAnalysis('/analyze-chart', { imageBase64, mimeType, pair });
}

export async function analyzeMultiTimeframeCharts(
  h4Chart: MultiTimeframeChartImage,
  m15Chart: MultiTimeframeChartImage,
  pair: string,
): Promise<ChartAnalysisResult> {
  return sendChartAnalysis('/api/multi-timeframe-analysis', {
    pair,
    charts: {
      h4: h4Chart,
      m15: m15Chart,
    },
  });
}

async function sendChartAnalysis(path: string, body: Record<string, unknown>): Promise<ChartAnalysisResult> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const normalized = normalizeChartAnalysisError(payload);
      if (normalized.status === 'premium_required') {
        return emptyAnalysis(normalized.status, normalized.message);
      }
      return emptyAnalysis('ai_unavailable', normalized.message);
    }

    const status: AnalysisStatus = ['success', 'no_trade', 'invalid_image', 'ai_unavailable', 'ai_invalid_response'].includes(payload.status)
      ? payload.status
      : 'ai_unavailable';

    if (status === 'ai_unavailable' || status === 'ai_invalid_response') {
      return emptyAnalysis(status, payload.message || 'Chart AI is unavailable right now. Please try again shortly.');
    }

    const tradeSetup = normalizeChartTradeSetup(payload);
    const tradePlan = normalizeChartTradePlan(payload);
    const takeProfitLevels = tradeSetup.take_profit_levels ?? [];
    const rawSeries = payload.price_series ?? payload.chart_data?.price_series;
    const priceSeries = Array.isArray(rawSeries)
      ? rawSeries.map((point: unknown) => {
        if (typeof point === 'number') return point;
        if (point && typeof point === 'object') {
          const value = Number((point as { price?: unknown; close?: unknown }).price ?? (point as { close?: unknown }).close);
          return value;
        }
        return Number.NaN;
      }).filter(Number.isFinite)
      : [];
    const latestVisiblePrice = normalizeLatestVisiblePrice(payload);
    const suppliedSupportResistance = payload.support_resistance ?? {};
    const supportLevels = Array.isArray(suppliedSupportResistance.support) && suppliedSupportResistance.support.length
      ? suppliedSupportResistance.support.map(String)
      : tradePlan?.direction === 'BUY' ? [String(tradePlan.entry)] : [];
    const resistanceLevels = Array.isArray(suppliedSupportResistance.resistance) && suppliedSupportResistance.resistance.length
      ? suppliedSupportResistance.resistance.map(String)
      : tradePlan?.direction === 'BUY' ? [String(tradePlan.takeProfit1)] : [];
    const resolvedSupportResistance = {
      support: supportLevels.length ? supportLevels : tradePlan?.direction === 'SELL' ? [String(tradePlan.takeProfit1)] : [],
      resistance: resistanceLevels.length ? resistanceLevels : tradePlan?.direction === 'SELL' ? [String(tradePlan.entry)] : [],
    };

    return {
      status,
      message: payload.message || undefined,
      detectedPair: payload.detectedPair ?? null,
      timeframe: payload.timeframe ?? null,
      latestVisiblePrice,
      priceSeries,
      reasoning: Array.isArray(payload.reasoning)
        ? payload.reasoning.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 5)
        : Array.isArray(payload.analysis?.reasoning)
          ? payload.analysis.reasoning.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 5)
          : [],
      supportResistance: {
        support: resolvedSupportResistance.support,
        resistance: resolvedSupportResistance.resistance,
      },
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
      trade_setup: tradeSetup,
      tradePlan,
      verdict: ['TRADE_PLAN', 'CONDITIONAL_PLAN', 'NO_TRADE'].includes(payload.verdict) ? payload.verdict : undefined,
      conviction: ['HIGH', 'MEDIUM', 'LOW'].includes(payload.conviction) ? payload.conviction : payload.conviction === null ? null : undefined,
      verdictReason: typeof payload.verdict_reason === 'string' ? payload.verdict_reason : undefined,
      noTradeReason: typeof payload.no_trade_reason === 'string' ? payload.no_trade_reason : payload.no_trade_reason === null ? null : undefined,
      marketBias: payload.marketBias || 'neutral',
      marketBiasConfidence: Math.max(0, Math.min(100, Number(payload.marketBiasConfidence) || 0)),
      tradeStatus: payload.tradeStatus || 'no_setup',
      setupStatus: payload.setupStatus || 'NO_SETUP',
      setupConfidence: Math.max(0, Math.min(100, Number(payload.setupConfidence) || 0)),
      marketConfidence: Math.max(0, Math.min(100, Number(payload.marketConfidence) || 0)),
      entryReadiness: Math.max(0, Math.min(100, Number(payload.entryReadiness) || 0)),
      tradeDecision: payload.tradeDecision || 'NONE',
      tradeTrigger: payload.tradeTrigger || '',
      entryStatus: ['waiting_for_trigger', 'trigger_observed', 'missed', 'unverified'].includes(payload.entryStatus)
        ? payload.entryStatus
        : undefined,
      setupType: ['limit_zone', 'breakout', 'rejection', 'other', 'unspecified'].includes(payload.setupType)
        ? payload.setupType
        : undefined,
      candidateReview: payload.candidateReview && typeof payload.candidateReview === 'object'
        ? {
          status: ['selected', 'none', 'ambiguous', 'invalid_response'].includes(payload.candidateReview.status)
            ? payload.candidateReview.status
            : 'invalid_response',
          direction: ['buy', 'sell'].includes(payload.candidateReview.direction)
            ? payload.candidateReview.direction
            : undefined,
          evidenceScore: typeof payload.candidateReview.evidenceScore === 'number'
            ? payload.candidateReview.evidenceScore
            : undefined,
          reason: typeof payload.candidateReview.reason === 'string' ? payload.candidateReview.reason : '',
        }
        : undefined,
      whyNotNow: Array.isArray(payload.whyNotNow) ? payload.whyNotNow.map(String) : [],
      dataLimitations: Array.isArray(payload.dataLimitations) ? payload.dataLimitations.map(String) : [],
      confidence: Math.max(0, Math.min(100, Number(payload.confidence) || 0)),
      multiTimeframe: payload.multiTimeframe && typeof payload.multiTimeframe === 'object' ? {
        alignment: ['aligned', 'conflicting', 'unclear'].includes(payload.multiTimeframe.alignment) ? payload.multiTimeframe.alignment : 'unclear',
        summary: typeof payload.multiTimeframe.summary === 'string' ? payload.multiTimeframe.summary : '',
        h4: {
          trend: ['bullish', 'bearish', 'neutral'].includes(payload.multiTimeframe.h4?.trend) ? payload.multiTimeframe.h4.trend : 'neutral',
          structure: typeof payload.multiTimeframe.h4?.structure === 'string' ? payload.multiTimeframe.h4.structure : '',
        },
        m15: {
          trend: ['bullish', 'bearish', 'neutral'].includes(payload.multiTimeframe.m15?.trend) ? payload.multiTimeframe.m15.trend : 'neutral',
          structure: typeof payload.multiTimeframe.m15?.structure === 'string' ? payload.multiTimeframe.m15.structure : '',
          confirmation: typeof payload.multiTimeframe.m15?.confirmation === 'string' ? payload.multiTimeframe.m15.confirmation : '',
        },
      } : undefined,
    };
  } catch (error) {
    console.error('[Chart Detection] Error:', error);
    return emptyAnalysis(
      'ai_unavailable',
      error instanceof Error ? error.message : 'Unable to analyze image.'
    );
  }
}
