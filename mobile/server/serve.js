/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');
const persistentStore = require('./persistentStore');
const { createAuth, verifyAuth } = require('./auth');
const { buildSessionContext } = require('./tradingSessions');
const { buildBiasConfidence, computeSetupConfidence } = require('./scoring');
const { parseRiskReward: rrParse, parsePriceOrRange: rrParsePriceOrRange, computeRRFromLevels } = require('./rr');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile();

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const PRIVACY_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'privacy-policy.html');
const TERMS_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'terms-of-use.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const requestCounts = new Map();
const recentEvents = [];
const AUTH_SECRET = process.env.FXSNAP_AUTH_SECRET || 'development-only-change-me';
const StrategyInputSchema = z.object({
  style: z.enum(['scalping', 'intraday', 'swing']),
  risk: z.string().regex(/^\d+(\.\d+)?$/).max(6),
  pairs: z.array(z.string().regex(/^[A-Z]{6}$/)).min(1).max(5),
  session: z.enum(['London', 'New York', 'Asian']),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  variation: z.number().int().min(0).max(100).optional(),
});
const StrategyResponseSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(20).max(700),
  marketFocus: z.string().trim().min(5).max(300),
  timeframe: z.string().trim().min(2).max(80),
  confidence: z.number().min(0).max(100),
  sections: z.array(z.object({ title: z.string(), items: z.array(z.string().trim().min(3).max(300)).min(1).max(8) })).length(5),
}).superRefine((value, ctx) => {
  const required = ['Entry rules', 'Stop loss', 'Take profit', 'Risk management', 'When not to trade'];
  const titles = value.sections.map((section) => section.title);
  if (new Set(titles).size !== required.length || required.some((title) => !titles.includes(title))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AI response must contain the five required strategy sections.' });
});
const ANALYSIS_STATUS = ['success', 'no_trade', 'invalid_image', 'ai_unavailable', 'ai_invalid_response'];
const DEFAULT_CHART = {
  is_chart: false,
  pair: '',
  timeframe: '',
  chart_quality: 'poor',
  price_scale_visible: false,
  candles_visible: false,
  has_enough_candles: false,
};
const DEFAULT_ANALYSIS = {
  trend: 'neutral',
  market_structure: '',
  structure_bias: 'neutral',
  volatility: 'low',
  volume: 'not_visible',
  indicators_detected: [],
  price_action: [],
  structure: '',
  sentiment: 'neutral',
  indicators: 'none',
  notes: '',
};
const DEFAULT_ZONES = {
  support: 'not_clear',
  resistance: 'not_clear',
  demand: [],
  supply: [],
  liquidity: [],
};
const DEFAULT_STRATEGY = {
  daily_trend: 'unavailable',
  higher_timeframe_confirmation: 'unavailable',
  zone_status: 'unavailable',
  liquidity_sweep: 'unavailable',
  bos: 'none',
  rsi_confirmation: 'unavailable',
};
const DEFAULT_STRATEGY_METRICS = {
  market_bias: 'neutral',
  market_bias_confidence: 0,
  market_structure: 'consolidation',
  short_term_momentum: 'neutral',
  price_location: 'unknown',
  setup_direction: 'none',
  setup_status: 'NO_SETUP',
  setup_quality: 0,
  setup_confidence: 0,
  entry_quality: 0,
  confirmation_status: 'awaiting_confirmation',
  decision: 'NO_TRADE',
  why_not_now: [],
  confidence_boosts: [],
  confidence_reductions: [],
  data_limitations: [],
  potential_bullish_scenario: '',
  potential_bearish_scenario: '',
  invalidation_conditions: [],
};
const SETUP_STATUSES = ['NO_SETUP', 'DEVELOPING', 'READY', 'CONFIRMED', 'INVALIDATED'];
const DEFAULT_TRADE_SETUP = {
  type: 'none',
  entry_zone: 'none',
  stop_loss: 'none',
  take_profit: 'none',
  risk_reward: null,
};
const DEFAULT_REASONS = [];

const TradeAnalysisSchema = z.object({
  status: z.enum(ANALYSIS_STATUS),
  message: z.string().trim().optional(),
  detectedPair: z.string().trim().optional().nullable(),
  timeframe: z.string().trim().optional().nullable(),
  chart: z.object({
    is_chart: z.boolean(),
    pair: z.string().trim().optional(),
    timeframe: z.string().trim().optional(),
    chart_quality: z.enum(['good', 'acceptable', 'poor']),
    price_scale_visible: z.boolean(),
    candles_visible: z.boolean(),
    has_enough_candles: z.boolean(),
  }),
  analysis: z.object({
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    market_structure: z.string().trim().max(400),
    structure_bias: z.enum(['bullish', 'bearish', 'neutral']),
    volatility: z.enum(['low', 'moderate', 'high']),
    volume: z.enum(['visible', 'not_visible']),
    indicators_detected: z.array(z.object({
      name: z.string().trim().max(50),
      visible: z.boolean(),
      interpretation: z.string().trim().max(200).optional(),
    })).optional(),
    price_action: z.array(z.string().trim().max(100)),
    structure: z.string().trim().max(300),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    indicators: z.string().trim().max(200),
    notes: z.string().trim().max(400),
  }),
  zones: z.object({
    support: z.string().trim().max(200),
    resistance: z.string().trim().max(200),
    demand: z.array(z.string().trim().max(200)),
    supply: z.array(z.string().trim().max(200)),
    liquidity: z.array(z.string().trim().max(200)),
  }),
  strategy: z.object({
    daily_trend: z.enum(['bullish', 'bearish', 'neutral', 'unavailable']),
    higher_timeframe_confirmation: z.enum(['confirmed', 'unavailable', 'conflicting']),
    zone_status: z.enum(['inside_zone', 'near_zone', 'outside_zone', 'unavailable']),
    liquidity_sweep: z.enum(['bullish', 'bearish', 'none', 'unavailable']),
    bos: z.enum(['bullish', 'bearish', 'none', 'unavailable']),
    rsi_confirmation: z.enum(['bullish', 'bearish', 'neutral', 'unavailable']),
  }),
  trade_setup: z.object({
    type: z.enum(['buy', 'sell', 'none']),
    entry_zone: z.string().trim().max(200),
    stop_loss: z.string().trim().max(200),
    take_profit: z.string().trim().max(200),
    risk_reward: z.number().nullable(),
  }),
  confidence: z.number().min(0).max(100),
  reasons: z.array(z.string().trim().max(300)),
  market_data_timestamp: z.string().optional().nullable(),
  market_data_source: z.string().trim().optional().nullable(),
});

function truncateText(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeGeminiModelName(model) {
  return String(model || '')
    .replace(/^models\//i, '')
    .trim();
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function parseIndicatorList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'object' && item !== null
        ? { name: String(item.name || '').trim(), visible: Boolean(item.visible), interpretation: item.interpretation ? String(item.interpretation).trim() : undefined }
        : { name: String(item || '').trim(), visible: true })
      .filter((item) => item.name.length > 0);
  }
  return [];
}

function computeEntryQuality(rr) {
  if (typeof rr !== 'number' || Number.isNaN(rr) || rr <= 0) return 0;
  const capped = Math.min(rr, 3);
  return Math.round(Math.min(100, (capped / 3) * 100));
}

function mergeUniqueStrings(items) {
  return Array.from(new Set(items.filter((item) => typeof item === 'string' && item.trim().length > 0)));
}

function parseRiskReward(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const ratioMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
  if (ratioMatch) {
    const numerator = Number(ratioMatch[1]);
    const denominator = Number(ratioMatch[2]);
    if (denominator > 0) return numerator / denominator;
  }
  const numberMatch = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (numberMatch) {
    const numeric = Number(numberMatch[0]);
    if (!Number.isNaN(numeric)) return numeric;
  }
  return null;
}

function parsePriceOrRange(value) {
  if (value == null) return null;
  if (typeof value === 'number') return { min: value, max: value, mid: value };
  const s = String(value).trim();
  if (!s) return null;
  // Accept ranges like '158.60-158.75', '158.60 – 158.75', '158.60–158.75', '158.60 to 158.75'
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)[\s]*[-–—to]+[\s]*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      return { min, max, mid: (min + max) / 2 };
    }
  }
  // Single number
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (numMatch) {
    const n = Number(numMatch[0]);
    if (!Number.isNaN(n)) return { min: n, max: n, mid: n };
  }
  return null;
}

function parseConfidence(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.max(0, Math.min(100, value));
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) return Math.max(0, Math.min(100, parsed));
  }
  return 0;
}

function ensureString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function ensureNullableString(value) {
  if (typeof value === 'string') return value.trim();
  return null;
}

function parseJsonPayload(rawContent) {
  if (rawContent == null) return null;
  if (typeof rawContent === 'object') return rawContent;
  const trimmed = String(rawContent).trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
  }
}

function canonicalizeEnum(value, mapping) {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  return mapping[key] ?? value.trim();
}

function canonicalizeRawAnalysis(raw) {
  if (typeof raw === 'string') raw = parseJsonPayload(raw);
  if (!raw || typeof raw !== 'object') return null;

  const status = canonicalizeEnum(raw.status, {
    success: 'success',
    no_trade: 'no_trade',
    'no trade': 'no_trade',
    invalid_image: 'invalid_image',
    'invalid image': 'invalid_image',
    ai_unavailable: 'ai_unavailable',
    'ai unavailable': 'ai_unavailable',
    unavailable: 'ai_unavailable',
    ai_invalid_response: 'ai_invalid_response',
    'ai invalid response': 'ai_invalid_response',
  });

  if (!status) return null;

  const chartRaw = parseJsonField(raw.chart) || {};
  const analysisRaw = parseJsonField(raw.analysis) || {};
  const zonesRaw = parseJsonField(raw.zones) || {};
  const strategyRaw = parseJsonField(raw.strategy) || {};
  const tradeRaw = parseJsonField(raw.trade_setup) || {};

  const chartQuality = canonicalizeEnum(chartRaw.chart_quality, {
    good: 'good',
    acceptable: 'acceptable',
    poor: 'poor',
  }) || (status === 'invalid_image' ? 'poor' : 'acceptable');

  const marketStructure = ensureString(analysisRaw.market_structure, ensureString(analysisRaw.structure, ''));
  const structureBias = canonicalizeEnum(analysisRaw.structure_bias, {
    bullish: 'bullish',
    bearish: 'bearish',
    neutral: 'neutral',
  }) || canonicalizeEnum(analysisRaw.trend, {
    bullish: 'bullish',
    bearish: 'bearish',
    neutral: 'neutral',
  }) || 'neutral';

  return {
    status,
    message: ensureString(raw.message),
    detectedPair: ensureNullableString(raw.detectedPair || raw.pair),
    timeframe: ensureNullableString(raw.timeframe),
    chart: {
      ...DEFAULT_CHART,
      is_chart: parseBoolean(chartRaw.is_chart, status !== 'invalid_image'),
      pair: ensureString(chartRaw.pair, ensureString(raw.pair)),
      timeframe: ensureString(chartRaw.timeframe, ensureString(raw.timeframe)),
      chart_quality: chartQuality,
      price_scale_visible: parseBoolean(chartRaw.price_scale_visible, true),
      candles_visible: parseBoolean(chartRaw.candles_visible, true),
      has_enough_candles: parseBoolean(chartRaw.has_enough_candles, true),
    },
    analysis: {
      ...DEFAULT_ANALYSIS,
      trend: canonicalizeEnum(analysisRaw.trend, {
        bullish: 'bullish',
        bearish: 'bearish',
        neutral: 'neutral',
      }) || 'neutral',
      market_structure: marketStructure,
      structure_bias: structureBias,
      volatility: canonicalizeEnum(analysisRaw.volatility, {
        low: 'low',
        moderate: 'moderate',
        high: 'high',
      }) || 'low',
      volume: canonicalizeEnum(analysisRaw.volume, {
        visible: 'visible',
        not_visible: 'not_visible',
        'not visible': 'not_visible',
      }) || 'not_visible',
      indicators_detected: parseIndicatorList(analysisRaw.indicators_detected),
      price_action: parseStringArray(analysisRaw.price_action),
      structure: ensureString(analysisRaw.structure, marketStructure),
      sentiment: canonicalizeEnum(analysisRaw.sentiment, {
        bullish: 'bullish',
        bearish: 'bearish',
        neutral: 'neutral',
      }) || 'neutral',
      indicators: ensureString(analysisRaw.indicators, 'none'),
      notes: ensureString(analysisRaw.notes),
    },
    zones: {
      ...DEFAULT_ZONES,
      support: ensureString(zonesRaw.support, ensureString(raw.support, DEFAULT_ZONES.support)),
      resistance: ensureString(zonesRaw.resistance, ensureString(raw.resistance, DEFAULT_ZONES.resistance)),
      demand: parseStringArray(zonesRaw.demand),
      supply: parseStringArray(zonesRaw.supply),
      liquidity: parseStringArray(zonesRaw.liquidity),
    },
    strategy: {
      ...DEFAULT_STRATEGY,
      daily_trend: canonicalizeEnum(strategyRaw.daily_trend, {
        bullish: 'bullish',
        bearish: 'bearish',
        neutral: 'neutral',
        unavailable: 'unavailable',
      }) || 'unavailable',
      higher_timeframe_confirmation: canonicalizeEnum(strategyRaw.higher_timeframe_confirmation, {
        confirmed: 'confirmed',
        unavailable: 'unavailable',
        conflicting: 'conflicting',
      }) || 'unavailable',
      zone_status: canonicalizeEnum(strategyRaw.zone_status, {
        inside_zone: 'inside_zone',
        near_zone: 'near_zone',
        outside_zone: 'outside_zone',
        unavailable: 'unavailable',
      }) || 'unavailable',
      liquidity_sweep: canonicalizeEnum(strategyRaw.liquidity_sweep, {
        bullish: 'bullish',
        bearish: 'bearish',
        none: 'none',
        unavailable: 'unavailable',
      }) || 'unavailable',
      bos: canonicalizeEnum(strategyRaw.bos, {
        bullish: 'bullish',
        bearish: 'bearish',
        none: 'none',
        unavailable: 'unavailable',
      }) || 'none',
      rsi_confirmation: canonicalizeEnum(strategyRaw.rsi_confirmation, {
        bullish: 'bullish',
        bearish: 'bearish',
        neutral: 'neutral',
        unavailable: 'unavailable',
      }) || 'unavailable',
    },
    trade_setup: {
      ...DEFAULT_TRADE_SETUP,
      type: canonicalizeEnum(tradeRaw.type, {
        buy: 'buy',
        sell: 'sell',
        none: 'none',
        long: 'buy',
        short: 'sell',
      }) || 'none',
      entry_zone: ensureString(tradeRaw.entry_zone, 'none'),
      stop_loss: ensureString(tradeRaw.stop_loss, 'none'),
      take_profit: ensureString(tradeRaw.take_profit, 'none'),
      risk_reward: parseRiskReward(tradeRaw.risk_reward),
    },
    confidence: parseConfidence(raw.confidence),
    reasons: parseStringArray(raw.reasons),
    market_data_timestamp: ensureNullableString(raw.market_data_timestamp),
    market_data_source: ensureNullableString(raw.market_data_source),
  };
}

function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const analysis = raw.analysis || DEFAULT_ANALYSIS;
  const zones = raw.zones || DEFAULT_ZONES;
  const strategy = raw.strategy || DEFAULT_STRATEGY;
  const trade = raw.trade_setup || DEFAULT_TRADE_SETUP;

  return {
    status: raw.status,
    message: typeof raw.message === 'string' ? raw.message.trim() : undefined,
    detectedPair: typeof raw.detectedPair === 'string' ? raw.detectedPair.trim() : null,
    timeframe: typeof raw.timeframe === 'string' ? raw.timeframe.trim() : null,
    chart: {
      ...DEFAULT_CHART,
      ...(raw.chart || {}),
    },
    analysis: {
      ...DEFAULT_ANALYSIS,
      ...(analysis || {}),
    },
    zones: {
      ...DEFAULT_ZONES,
      ...(zones || {}),
    },
    strategy: {
      ...DEFAULT_STRATEGY,
      ...(strategy || {}),
    },
    trade_setup: {
      ...DEFAULT_TRADE_SETUP,
      ...(trade || {}),
    },
    confidence: parseConfidence(raw.confidence),
    reasons: Array.isArray(raw.reasons) ? parseStringArray(raw.reasons) : [],
    market_data_timestamp: typeof raw.market_data_timestamp === 'string' ? raw.market_data_timestamp.trim() : null,
    market_data_source: typeof raw.market_data_source === 'string' ? raw.market_data_source.trim() : null,
  };
}

/** Build structured observations from normalized AI output without inventing missing info. */
function buildStructuredObservations(norm) {
  const obs = {
    pair: norm.detectedPair || norm.chart?.pair || null,
    chart_layout: 'single_timeframe',
    timeframes_detected: [],
    zones: norm.zones || {},
    m15: norm.m15 || null,
    raw: norm,
  };

  if (Array.isArray(norm.timeframes_detected) && norm.timeframes_detected.length > 0) {
    obs.chart_layout = norm.timeframes_detected.length > 1 ? 'multi_timeframe' : 'single_timeframe';
    obs.timeframes_detected = norm.timeframes_detected.map((tf) => ({ timeframe: String(tf.timeframe || '').toUpperCase(), observations: tf.observations || {} }));
    return obs;
  }

  const tf = (norm.timeframe || norm.chart?.timeframe || '').toString().toUpperCase();
  const structureText = String(norm.analysis?.market_structure || norm.analysis?.structure || '').toLowerCase();
  const hh = /higher\s*high/.test(structureText) || /higher\s*highs/.test(structureText) || /higher\s*highs?\b/.test(structureText);
  const hl = /higher\s*low/.test(structureText) || /higher\s*lows?\b/.test(structureText);
  const lh = /lower\s*high/.test(structureText) || /lower\s*highs?\b/.test(structureText);
  const ll = /lower\s*low/.test(structureText) || /lower\s*lows?\b/.test(structureText);

  const indicators = Array.isArray(norm.analysis?.indicators_detected)
    ? norm.analysis.indicators_detected.map((i) => ({ name: String(i.name || '').toLowerCase(), visible: Boolean(i.visible) }))
    : parseStringArray(norm.analysis?.indicators || '');

  const tfEntry = {
    timeframe: tf || 'UNKNOWN',
    observations: {
      trend: norm.analysis?.trend || 'neutral',
      structure: {
        higher_highs: !!hh,
        higher_lows: !!hl,
        lower_highs: !!lh,
        lower_lows: !!ll,
      },
      indicators: Array.isArray(indicators) ? indicators : [],
      price_action: Array.isArray(norm.analysis?.price_action) ? norm.analysis.price_action : [],
      has_rsi: Boolean((norm.analysis && norm.analysis.indicators_detected && norm.analysis.indicators_detected.find((x) => /rsi/i.test(x.name))) || /rsi/i.test(String(norm.analysis?.indicators || ''))),
      candles_visible: Boolean(norm.chart?.candles_visible),
      price_scale_visible: Boolean(norm.chart?.price_scale_visible),
      has_enough_candles: Boolean(norm.chart?.has_enough_candles),
    },
  };

  obs.timeframes_detected.push(tfEntry);
  return obs;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveMarketBias(norm) {
  const trend = normalizeText(norm.analysis?.trend);
  const structureBias = normalizeText(norm.analysis?.structure_bias);
  const bullish = trend === 'bullish' || structureBias === 'bullish';
  const bearish = trend === 'bearish' || structureBias === 'bearish';
  if (bullish && bearish) return 'mixed';
  if (bullish) return 'bullish';
  if (bearish) return 'bearish';
  return 'neutral';
}

function deriveMarketStructure(norm) {
  const structureText = normalizeText(norm.analysis?.market_structure || norm.analysis?.structure);
  if (/range|consolidat|channel/.test(structureText)) return 'range';
  if (/breakout/.test(structureText)) return 'breakout';
  if (/breakdown/.test(structureText)) return 'breakdown';
  if (/higher\s*highs?.*higher\s*lows?|uptrend|bullish/.test(structureText)) return 'uptrend';
  if (/lower\s*highs?.*lower\s*lows?|downtrend|bearish/.test(structureText)) return 'downtrend';
  if (/transition|pullback|correction/.test(structureText)) return 'transition';
  return 'consolidation';
}

function deriveShortTermMomentum(norm) {
  const marketStructure = normalizeText(norm.analysis?.market_structure || norm.analysis?.structure);
  const trend = normalizeText(norm.analysis?.trend);
  if (/strong.*bullish|momentum.*bullish|rally/.test(marketStructure) || trend === 'bullish') return 'strong_bullish';
  if (/strong.*bearish|momentum.*bearish|sell-off|dump/.test(marketStructure) || trend === 'bearish') return 'strong_bearish';
  if (/bearish|pullback|correction|weakness/.test(marketStructure)) return 'bearish';
  if (/bullish|recovery|bounce/.test(marketStructure)) return 'bullish';
  return 'neutral';
}

function derivePriceLocation(norm) {
  const status = normalizeText(norm.strategy?.zone_status);
  const direction = normalizeText(norm.trade_setup?.type);
  if (status === 'inside_zone') return direction === 'buy' ? 'at_support' : direction === 'sell' ? 'at_resistance' : 'at_zone';
  if (status === 'near_zone') return direction === 'buy' ? 'near_support' : direction === 'sell' ? 'near_resistance' : 'near_zone';
  if (status === 'outside_zone') return 'middle_of_range';
  return 'unknown';
}

function deriveSetupDirection(norm) {
  const type = normalizeText(norm.trade_setup?.type);
  return type === 'buy' || type === 'sell' ? type : 'none';
}

function deriveConfirmationStatus(norm, m15) {
  const confirmation = normalizeText(m15?.confirmation);
  const bosDetected = Boolean(m15 && m15.bos && m15.bos.detected === true);
  if (confirmation && bosDetected) return 'CONFIRMED';
  if (confirmation || bosDetected) return 'DEVELOPING';
  if (norm.trade_setup?.type && norm.trade_setup.type !== 'none') return 'DEVELOPING';
  return 'INVALIDATED';
}

function determineWhyNotNow(norm, derived) {
  const reasons = [];
  if (derived.priceLocation === 'middle_of_range') reasons.push('Price is in the middle of the range rather than near a high-probability zone.');
  if (derived.confirmationStatus === 'DEVELOPING') reasons.push('A setup exists but confirmation is still developing.');
  if (derived.confirmationStatus === 'INVALIDATED') reasons.push('The setup has been invalidated by the current structure or momentum.');
  if (derived.priceLocation === 'near_resistance' && derived.setupDirection === 'buy') reasons.push('Entry is too close to resistance.');
  if (derived.priceLocation === 'near_support' && derived.setupDirection === 'sell') reasons.push('Entry is too close to support.');
  if (norm.trade_setup?.risk_reward != null && Number(norm.trade_setup.risk_reward) < 1.5) reasons.push('Risk/reward is below the minimum tolerance.');
  if (!norm.zones || (!norm.zones.support && !norm.zones.resistance)) reasons.push('Key levels are not clearly defined on the chart.');
  return mergeUniqueStrings(reasons);
}

function deriveDataLimitations(norm) {
  const limits = [];
  if (!norm.analysis?.volume || normalizeText(norm.analysis.volume) === 'not_visible') limits.push('Volume data is not available.');
  if (!norm.analysis?.indicators || normalizeText(norm.analysis.indicators) === 'none') limits.push('Indicator data is not available.');
  if (!norm.timeframe && !norm.chart?.timeframe) limits.push('Timeframe could not be identified.');
  return mergeUniqueStrings(limits);
}

function computeSetupScores(norm, derived, m15) {
  const confirmationWeight = derived.confirmationStatus === 'CONFIRMED' ? 25 : derived.confirmationStatus === 'DEVELOPING' ? 12 : 0;
  const locationWeight = derived.priceLocation === 'at_support' || derived.priceLocation === 'at_resistance' ? 20 : derived.priceLocation === 'near_support' || derived.priceLocation === 'near_resistance' ? 12 : derived.priceLocation === 'middle_of_range' ? 2 : 8;
  const momentumWeight = derived.shortTermMomentum === 'strong_bullish' || derived.shortTermMomentum === 'strong_bearish' ? 15 : derived.shortTermMomentum === 'bullish' || derived.shortTermMomentum === 'bearish' ? 10 : 5;
  const structureWeight = derived.marketStructure === 'uptrend' || derived.marketStructure === 'downtrend' ? 18 : derived.marketStructure === 'range' ? 12 : 8;

  const rr = typeof norm.trade_setup?.risk_reward === 'number' ? norm.trade_setup.risk_reward : parseRiskReward(norm.trade_setup?.risk_reward);
  const rrWeight = rr >= 2 ? 20 : rr >= 1.5 ? 10 : rr > 0 ? 2 : 0;
  const rrPenalty = rr > 0 && rr < 1.5 ? -12 : 0;

  const dataPenalty = deriveDataLimitations(norm).length > 0 ? -8 : 0;
  const poorSetupPenalty = derived.confirmationStatus === 'INVALIDATED' ? -15 : 0;

  const rawScore = 10 + confirmationWeight + locationWeight + momentumWeight + structureWeight + rrWeight + dataPenalty + rrPenalty + poorSetupPenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const entryQuality = computeEntryQuality(rr);
  const setupQuality = Math.max(0, Math.min(100, score + (derived.priceLocation === 'at_support' || derived.priceLocation === 'at_resistance' ? 5 : 0)));

  return { score, setupQuality, entryQuality, rr: rr || 0 };
}

/** Deterministic mentor-rule evaluation. Returns validation, score, failed conditions and a candidate trade_setup (or none). */
function evaluateDecisionEngine(obs) {
  const norm = obs.raw;
  const validations = {
    daily_trend: false,
    valid_zone: false,
    price_return: false,
    liquidity_sweep: false,
    confirmation: false,
    bos: false,
    rsi: false,
    all_required_conditions_met: false,
  };
  const failed = [];
  let score = 0;
  const weights = { daily_trend: 20, zone: 20, price_return: 10, liquidity: 15, confirmation: 10, bos: 15, rsi: 10 };
  const rrIssues = [];

  // Find D1 evidence
  const d1 = obs.timeframes_detected.find((t) => /(^D1$|^1D$|DAILY)/i.test(String(t.timeframe)));
  if (!d1) {
    failed.push('Daily timeframe (D1) not visible or not detectable');
    // mandatory -> no trade
  } else {
    const s = d1.observations.structure || {};
    if (s.higher_highs && s.higher_lows) { validations.daily_trend = 'bullish'; score += weights.daily_trend; }
    else if (s.lower_highs && s.lower_lows) { validations.daily_trend = 'bearish'; score += weights.daily_trend; }
    else { failed.push('D1 structure unclear'); }
  }

  // Zones detection: prefer H1 then H4
  const h1 = (norm.zones && norm.zones.h1) || null;
  const h4 = (norm.zones && norm.zones.h4) || null;
  if (h1 || h4) {
    validations.valid_zone = true; score += weights.zone;
  } else {
    failed.push('No H1/H4 supply or demand zones detected');
  }

  // Price return: require explicit m15.inside_zone or normalized.trade_setup.entry_zone evidence
  const m15 = norm.m15 || norm.raw_m15 || obs.m15 || null;
  const priceReturned = Boolean((m15 && m15.inside_zone) || (norm.trade_setup && norm.trade_setup.entry_zone && norm.trade_setup.entry_zone !== 'none'));
  if (priceReturned) { validations.price_return = true; score += weights.price_return; }
  else { failed.push('Price did not return to the identified entry zone'); }

  // Liquidity sweep detection
  const liquidityOk = Boolean((m15 && m15.liquidity && m15.liquidity.swept) || (norm.strategy && norm.strategy.liquidity_sweep && norm.strategy.liquidity_sweep !== 'unavailable' && norm.strategy.liquidity_sweep !== 'none'));
  if (liquidityOk) { validations.liquidity_sweep = true; score += weights.liquidity; }
  else { failed.push('No liquidity sweep detected'); }

  // M15 confirmation
  const confirmationOk = Boolean(m15 && m15.confirmation && typeof m15.confirmation === 'string');
  if (confirmationOk) { validations.confirmation = true; score += weights.confirmation; }
  else { failed.push('No M15 confirmation pattern detected (engulfing, pin bar, rejection)'); }

  // BOS
  const bosOk = Boolean(m15 && m15.bos && m15.bos.detected === true);
  if (bosOk) { validations.bos = true; score += weights.bos; }
  else { failed.push('No break of structure (BOS) confirmed'); }

  // RSI
  const rsiOk = Boolean(m15 && m15.rsi && m15.rsi.visible && m15.rsi.confirms === true);
  if (rsiOk) { validations.rsi = true; score += weights.rsi; }
  else { failed.push('RSI confirmation missing or not visible'); }

  // All required conditions
  validations.all_required_conditions_met = validations.daily_trend && validations.valid_zone && validations.price_return && validations.liquidity_sweep && validations.confirmation && validations.bos && validations.rsi;

  // Candidate trade_setup from AI if present (must be validated numerically)
  let trade_setup = { ...DEFAULT_TRADE_SETUP };
  if (validations.all_required_conditions_met && norm.trade_setup && norm.trade_setup.type && norm.trade_setup.type !== 'none') {
    // Validate numeric levels
    const entry = Number(norm.trade_setup.entry_zone) || null;
    const sl = Number(norm.trade_setup.stop_loss) || null;
    const tp = Number(norm.trade_setup.take_profit) || null;
    const rr = typeof norm.trade_setup.risk_reward === 'number' ? norm.trade_setup.risk_reward : parseRiskReward(norm.trade_setup.risk_reward);
    const dir = norm.trade_setup.type;
    // Basic numeric validation: must be numbers and satisfy direction
    if (entry != null && sl != null && tp != null && !Number.isNaN(entry) && !Number.isNaN(sl) && !Number.isNaN(tp)) {
      // Prefer validated RR computed from levels which handles ranges and nonstandard formats
      const computed = computeRRFromLevels({ entry: norm.trade_setup.entry_zone, sl: norm.trade_setup.stop_loss, tp: norm.trade_setup.take_profit, direction: dir });
      if (computed && Array.isArray(computed.issues) && computed.issues.length > 0) {
        computed.issues.forEach((it) => failed.push(`RR issue: ${it}`));
        rrIssues.push(...computed.issues);
      }
      const rrComputed = Number.isFinite(computed && typeof computed.rr === 'number' ? computed.rr : NaN) ? computed.rr : (typeof rr === 'number' && !Number.isNaN(rr) ? rr : null);
      const validLevels = (dir === 'buy' && sl < entry && tp > entry) || (dir === 'sell' && sl > entry && tp < entry);
      if (validLevels && rrComputed != null && rrComputed >= 2.0) {
        trade_setup = { type: dir, entry_zone: String(entry), stop_loss: String(sl), take_profit: String(tp), risk_reward: rrComputed };
      } else {
        failed.push('Trade numeric validation failed (levels or RR insufficient)');
        validations.all_required_conditions_met = false;
      }
    } else {
      failed.push('Numeric trade levels not visible or invalid');
      validations.all_required_conditions_met = false;
    }
  } else {
    // No full candidate — ensure no trade returned
    trade_setup = { ...DEFAULT_TRADE_SETUP };
  }

  // Fallback: attempt to parse a candidate trade setup even when strict validations fail.
  // This supports AI returning ranges like "158.60-158.75" and allows DEVELOPING setups to be surfaced.
  if ((trade_setup.type === 'none' || !trade_setup) && norm.trade_setup && norm.trade_setup.type && norm.trade_setup.type !== 'none') {
    try {
      const dir = normalizeText(norm.trade_setup.type);
      const entryRange = parsePriceOrRange(norm.trade_setup.entry_zone);
      const slRange = parsePriceOrRange(norm.trade_setup.stop_loss);
      const tpRange = parsePriceOrRange(norm.trade_setup.take_profit);
      if (entryRange && slRange && tpRange) {
        const entry = entryRange.mid;
        const sl = slRange.mid;
        const tp = tpRange.mid;
        const validLevels = (dir === 'buy' && sl < entry && tp > entry) || (dir === 'sell' && sl > entry && tp < entry);
        if (validLevels) {
          // Prefer computeRRFromLevels to capture issues from ranges
          const computed = computeRRFromLevels({ entry: norm.trade_setup.entry_zone, sl: norm.trade_setup.stop_loss, tp: norm.trade_setup.take_profit, direction: dir });
          if (computed && Array.isArray(computed.issues) && computed.issues.length > 0) {
            computed.issues.forEach((it) => failed.push(`RR issue: ${it}`));
            rrIssues.push(...computed.issues);
          }
          const rrComputed = Number.isFinite(computed && typeof computed.rr === 'number' ? computed.rr : Math.abs((tp - entry) / (entry - sl))) ? (computed.rr || Math.abs((tp - entry) / (entry - sl))) : null;
          // Accept as a candidate if RR positive; stricter filtering happens later in enforceValidationRules
          if (rrComputed != null && Number.isFinite(rrComputed) && rrComputed > 0) {
            trade_setup = {
              type: dir === 'buy' ? 'buy' : dir === 'sell' ? 'sell' : 'none',
              entry_zone: String(norm.trade_setup.entry_zone),
              stop_loss: String(norm.trade_setup.stop_loss),
              take_profit: String(norm.trade_setup.take_profit),
              risk_reward: rrComputed,
            };
            result.candidate = true;
            console.log('[DecisionEngine] Fallback candidate created', trade_setup);
            // give a small score boost for candidate setups so explainable outcome reflects potential
            score = Math.max(0, Math.min(100, Math.round(score + (rrComputed >= 1.5 ? 6 : 2))));
          } else {
            failed.push('Fallback candidate: computed RR invalid');
          }
        } else {
          failed.push('Fallback candidate: level geometry invalid for direction');
        }
      } else {
        failed.push('Fallback candidate: could not parse numeric levels from AI trade_setup');
      }
    } catch (e) {
      failed.push('Fallback candidate parsing error');
    }
  }

  // Cap score to 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  const result = {
    strategy_validation: validations,
    strategy_score: score,
    failed_conditions: Array.from(new Set(failed)),
    trade_setup,
    candidate: false,
    rrIssues,
  };

  // Determine final status
  if (!obs.raw || !obs.raw.chart || !obs.raw.chart.is_chart) {
    result.status = 'invalid_image';
  } else if (!validations.all_required_conditions_met) {
    result.status = 'no_trade';
  } else {
    result.status = 'success';
  }

  return result;
}

function determineSetupStatus(evalRes, derived) {
  if (!evalRes.trade_setup || evalRes.trade_setup.type === 'none') return 'NO_SETUP';
  if (derived.confirmationStatus === 'CONFIRMED') return 'CONFIRMED';
  if (evalRes.status === 'success') return 'READY';
  if (evalRes.trade_setup && evalRes.trade_setup.type !== 'none') return 'DEVELOPING';
  return 'INVALIDATED';
}

function deriveTradeStatus(setupStatus, derived) {
  if (setupStatus === 'CONFIRMED') return 'actionable';
  if (setupStatus === 'READY') return 'waiting_for_confirmation';
  if (setupStatus === 'DEVELOPING') {
    if (derived.priceLocation === 'at_support' && derived.setupDirection === 'sell') return 'waiting_for_pullback';
    if (derived.priceLocation === 'at_resistance' && derived.setupDirection === 'buy') return 'waiting_for_pullback';
    if (derived.priceLocation === 'near_support' && derived.setupDirection === 'sell') return 'waiting_for_pullback';
    if (derived.priceLocation === 'near_resistance' && derived.setupDirection === 'buy') return 'waiting_for_pullback';
    if (derived.priceLocation === 'middle_of_range') return 'waiting_for_breakout';
    return 'waiting_for_confirmation';
  }
  if (setupStatus === 'INVALIDATED') return 'invalid';
  return 'no_setup';
}

// buildBiasConfidence moved to mobile/server/scoring.js

// computeSetupConfidence moved to mobile/server/scoring.js

function buildTradeTrigger(tradeStatus, derived) {
  if (tradeStatus === 'actionable') {
    return 'Enter the setup when the trade direction is confirmed and the entry zone remains valid.';
  }
  if (tradeStatus === 'waiting_for_pullback') {
    return 'Wait for a pullback into the entry zone and a bearish/bullish rejection before entering.';
  }
  if (tradeStatus === 'waiting_for_breakout') {
    return 'Wait for a breakout or retest to confirm the setup before entering.';
  }
  if (tradeStatus === 'waiting_for_confirmation') {
    return 'Wait for confirmation of the setup before taking a trade.';
  }
  return 'No actionable setup is available at this time.';
}

// Produce a componentized, explainable scoring breakdown and final decision
function buildExplainableOutcome(obs, evalRes) {
  const norm = obs.raw || {};
  const marketBias = deriveMarketBias(norm);
  const marketStructure = deriveMarketStructure(norm);
  const shortTermMomentum = deriveShortTermMomentum(norm);
  const priceLocation = derivePriceLocation(norm);
  const setupDirection = deriveSetupDirection(norm);
  const confirmationStatus = deriveConfirmationStatus(norm, norm.m15 || null);
  const setupStatus = determineSetupStatus(evalRes, { confirmationStatus });
  const tradeStatus = deriveTradeStatus(setupStatus, { priceLocation, setupDirection, confirmationStatus });
  const tradeTrigger = buildTradeTrigger(tradeStatus, { priceLocation, setupDirection, confirmationStatus });

  const trendComp = evalRes.strategy_validation.daily_trend ? 20 : 10;
  const zoneComp = evalRes.strategy_validation.valid_zone ? 20 : 10;
  const priceLocationComp = evalRes.strategy_validation.price_return ? 15 : 8;
  const liquidityComp = evalRes.strategy_validation.liquidity_sweep ? 10 : 6;
  const confirmationComp = evalRes.strategy_validation.confirmation ? 15 : 8;
  const bosComp = evalRes.strategy_validation.bos ? 10 : 6;
  const rsiComp = evalRes.strategy_validation.rsi ? 10 : 4;

  const rawScore = trendComp + zoneComp + priceLocationComp + liquidityComp + confirmationComp + bosComp + rsiComp;
  const setupQuality = Math.max(0, Math.min(100, Math.round(rawScore)));
  const entryQuality = (evalRes.trade_setup && evalRes.trade_setup.type !== 'none') ? Math.round(Math.max(0, Math.min(100, setupQuality - 12))) : 0;

  const derived = {
    marketBias,
    marketStructure,
    shortTermMomentum,
    priceLocation,
    setupDirection,
    confirmationStatus,
    dataLimitations: [],
  };
  derived.dataLimitations = deriveDataLimitations(norm);

  const marketBiasConfidence = buildBiasConfidence(norm, derived);
  const setupConfidence = computeSetupConfidence(norm, derived, evalRes);

  const decision = tradeStatus === 'actionable'
    ? evalRes.trade_setup.type === 'buy' ? 'BUY' : 'SELL'
    : tradeStatus.startsWith('waiting') ? 'WAIT' : 'NO_TRADE';

  const whyNotNow = Array.isArray(evalRes.failed_conditions) ? evalRes.failed_conditions.slice() : [];
  if (tradeStatus === 'waiting_for_pullback' && !whyNotNow.includes('Current price is near a structure boundary and the entry is not favorable.')) {
    whyNotNow.push('Current price is near a structure boundary and the entry is not favorable.');
  }
  if (tradeStatus === 'waiting_for_breakout' && !whyNotNow.includes('The price is in the middle of the range and needs a breakout or retest.')) {
    whyNotNow.push('The price is in the middle of the range and needs a breakout or retest.');
  }
  if (tradeStatus === 'waiting_for_confirmation' && !whyNotNow.includes('The setup is still developing and needs confirmation.')) {
    whyNotNow.push('The setup is still developing and needs confirmation.');
  }

  const dataLimitations = [];
  if (!obs.timeframes_detected || obs.timeframes_detected.length === 0) dataLimitations.push('Single timeframe or timeframe not detected');
  if (!(norm.analysis && norm.analysis.volume) || norm.analysis.volume === 'not_visible') dataLimitations.push('Volume not available');

  return {
    breakdown: {
      trend: trendComp,
      zone: zoneComp,
      priceLocation: priceLocationComp,
      liquidity: liquidityComp,
      confirmation: confirmationComp,
      bos: bosComp,
      rsi: rsiComp,
      rawScore,
    },
    setupQuality,
    entryQuality: Math.max(0, Math.min(100, entryQuality)),
    confirmationStatus,
    setupStatus,
    tradeStatus,
    tradeTrigger,
    marketBias,
    marketBiasConfidence,
    setupConfidence,
    decision,
    whyNotNow,
    dataLimitations,
  };
}

/** Apply mentor decision engine to normalized analysis and produce final response. */
function applyMentorStrategy(normalized) {
  if (!normalized || typeof normalized !== 'object') return normalized;
  const obs = buildStructuredObservations(normalized);
  const evalRes = evaluateDecisionEngine(obs);

  // Start from normalized object and override with deterministic outputs
  const response = { ...normalized };
  response.status = evalRes.status || normalized.status || 'no_trade';
  response.trade_setup = evalRes.trade_setup || { ...DEFAULT_TRADE_SETUP };
  response.confidence = typeof evalRes.strategy_score === 'number' ? evalRes.strategy_score : (normalized.confidence || 0);
  response.reasons = Array.isArray(normalized.reasons) ? Array.from(new Set([...normalized.reasons, ...(evalRes.failed_conditions || [])])) : Array.from(new Set([...(evalRes.failed_conditions || [])]));

  // Copy back high-level strategy flags
  response.strategy = {
    ...normalized.strategy,
    liquidity_sweep: evalRes.strategy_validation && evalRes.strategy_validation.liquidity_sweep ? (evalRes.strategy_validation.liquidity_sweep === true ? 'confirmed' : normalized.strategy.liquidity_sweep) : normalized.strategy.liquidity_sweep,
    bos: evalRes.strategy_validation && evalRes.strategy_validation.bos ? (evalRes.strategy_validation.bos === true ? 'confirmed' : normalized.strategy.bos) : normalized.strategy.bos,
  };

  // Attach explainable outcome components
  const explain = buildExplainableOutcome(obs, { ...evalRes, status: response.status, trade_setup: response.trade_setup });
  response.analysis = response.analysis || {};
  response.marketBias = explain.marketBias;
  response.marketBiasConfidence = explain.marketBiasConfidence;
  response.tradeStatus = explain.tradeStatus;
  response.tradeTrigger = explain.tradeTrigger;
  response.tradeType = response.trade_setup.type === 'buy' ? 'BUY' : response.trade_setup.type === 'sell' ? 'SELL' : 'NONE';
  response.analysis.marketBias = explain.marketBias;
  response.analysis.marketStructure = explain.marketStructure;
  response.analysis.shortTermMomentum = explain.shortTermMomentum;
  response.analysis.priceLocation = explain.priceLocation;

  response.setupDirection = response.trade_setup.type || 'none';
  response.setupStatus = explain.setupStatus || 'NO_SETUP';
  response.setupQuality = explain.setupQuality;
  response.setupConfidence = explain.setupConfidence;
  // Expose separate scored fields: marketConfidence, setupConfidence, entryReadiness
  response.marketConfidence = explain.marketBiasConfidence;
  response.entryReadiness = explain.entryQuality;
  response.entryQuality = explain.entryQuality;
  response.confirmationStatus = explain.confirmationStatus;
  response.decision = explain.decision;
  response.whyNotNow = explain.whyNotNow;
  response.dataLimitations = explain.dataLimitations;
  response.breakdown = explain.breakdown;
  // Expose RR parsing/validation issues for UI diagnostics
  response.rrIssues = Array.isArray(evalRes.rrIssues) ? Array.from(new Set(evalRes.rrIssues)) : [];

  // If evaluation failed mandatory conditions, ensure trade_setup is none
  // If evaluation failed mandatory conditions, only clear trade_setup when no candidate was provided.
  if (response.status !== 'success' && (!evalRes.trade_setup || !evalRes.trade_setup.type || evalRes.trade_setup.type === 'none') && !evalRes.candidate) {
    response.trade_setup = { ...DEFAULT_TRADE_SETUP };
  }

  // Enforce additional server-side rules (should not wipe out valid analysis)
  const enforced = enforceValidationRules(response) || response;
  return enforced;
}

function getTraderSystemPrompt() {
  return `You are a professional price action trader and technical analyst.

Your job is to analyze a trading chart image and return a structured, disciplined, and consistent analysis.

Current session context: ${buildSessionContext()}

You MUST behave like a strict, rule-based trader — not a storyteller.

IMPORTANT RULES:

1. The analysis is based ONLY on the uploaded chart image.
2. Do NOT assume real-time market data.
3. Do NOT hallucinate unknown data (news, fundamentals, unseen candles).
4. If the chart is unclear or not a valid trading chart → return "invalid_image".
5. If there is no clear, high-probability setup → return "no_trade".
6. You must be conservative. Avoid forcing trades.
7. Confidence must reflect clarity of structure, not guesswork.
8. Keep explanations short, precise, and professional.

ANALYSIS REQUIREMENTS:

You must extract and evaluate:

- Trend (bullish, bearish, or neutral)
- Market structure (higher highs/lows or lower highs/lows)
- Key zones (support and resistance)
- Liquidity areas (if visible)
- Volatility (low, moderate, high based on candle size and movement)
- Volume (only if visible on chart)
- Indicators (only if clearly visible)
- Price behavior (breakouts, consolidations, rejections)

TRADE DECISION RULES:

Only return a trade if ALL conditions are met:
- Clear trend or strong range structure
- Clear entry zone
- Logical stop loss placement
- Minimum risk-reward ratio of 1.5
- No conflicting signals

If any condition fails → return "no_trade"

OUTPUT FORMAT (STRICT JSON):

{
  "status": "success | no_trade | invalid_image",

  "analysis": {
    "trend": "bullish | bearish | neutral",
    "structure": "short description",
    "volatility": "low | moderate | high",
    "volume": "low | moderate | high | not_visible",
    "sentiment": "bullish | bearish | neutral",
    "indicators": "list or 'none'",
    "notes": "short explanation"
  },

  "zones": {
    "support": "price zone or description",
    "resistance": "price zone or description",
    "liquidity": "description or 'not_clear'"
  },

  "trade_setup": {
    "type": "buy | sell | none",
    "entry_zone": "zone or 'none'",
    "stop_loss": "level or 'none'",
    "take_profit": "level or 'none'",
    "risk_reward": "number or 'none'"
  },

  "confidence": 0-100
}

FINAL RULES:

- If status = "no_trade", a conditional trade_setup may still be provided when directional bias is strong but the current price is not an actionable entry.
- If status = "invalid_image", all fields except status can be null or minimal
- Do NOT include extra text outside JSON
- Do NOT explain beyond what is required`;
}

/** Backend validation layer — enforced AFTER the AI responds. */
function enforceValidationRules(response) {
  if (!response) return null;

  // Previously this function forcibly converted responses with low single-value confidence
  // into `no_trade` and cleared trade setups. That conflates market analysis with entry
  // readiness and hides valid directional information. Updated behavior:
  // - Do NOT clear or wipe valid trade_setup or marketBias when a score is low.
  // - Attach explanatory notes and set tradeStatus/tradeTrigger to reflect reasons to wait.
  // - Keep response.status intact (success/no_trade) as determined by the evaluation engine.
  if (response.status === 'success') {
    try {
      const rr = Number(response.trade_setup && response.trade_setup.risk_reward) || 0;
      if (rr > 0 && rr < 1.5) {
        // Preserve analysis; mark setup as waiting for a better entry
        if (!response.tradeStatus || response.tradeStatus === 'actionable') response.tradeStatus = 'waiting_for_pullback';
        response.tradeTrigger = response.tradeTrigger || 'Entry quality is below the minimum risk-reward threshold; wait for a better setup.';
        response.analysis = response.analysis || {};
        response.analysis.notes = mergeUniqueStrings([response.analysis.notes || '', 'Signal held back: risk-reward is below the 1.5 minimum.']).join(' ').trim();
      }
      if (typeof response.marketConfidence === 'number' && response.marketConfidence < 40) {
        response.analysis = response.analysis || {};
        response.analysis.notes = mergeUniqueStrings([response.analysis.notes || '', 'Market clarity is low; consider waiting for additional confirmation.']).join(' ').trim();
      }
    } catch (err) {
      console.error('[Validation] enforceValidationRules error', err);
    }
  }

  return response;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return appJson.expo?.name || 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'content-type': contentType });
  res.end(content);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type, authorization, x-device-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function signToken(deviceId) {
  return createAuth(AUTH_SECRET, deviceId);
}
function verifyToken(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifyAuth(AUTH_SECRET, token);
}
function requireAuth(req, res) {
  const deviceId = verifyToken(req);
  if (!deviceId) { sendJson(res, 401, { error: 'A valid anonymous session is required.' }); return null; }
  return deviceId;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 12_000_000) reject(new Error('Request is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

async function generateStrategy(req, res) {
  if (!requireAuth(req, res)) return;
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.startsWith('replace_')) {
    return sendJson(res, 503, { error: 'OpenRouter is not configured. Set OPENROUTER_API_KEY on the server.' });
  }

  try {
    const inputResult = StrategyInputSchema.safeParse(await readJsonBody(req));
    if (!inputResult.success) return sendJson(res, 400, { error: 'Invalid strategy profile.', details: inputResult.error.flatten() });
    const input = inputResult.data;
    const prompt = `Create a personalized forex trading strategy from this user profile. Keep the plan concise and actionable. Return ONLY valid JSON matching the requested schema. Profile: ${JSON.stringify({
      style: input.style,
      risk: input.risk,
      pairs: input.pairs,
      session: input.session,
      experience: input.experience,
      variation: input.variation,
    })}`;
    const schema = {
      name: 'string', description: 'string', marketFocus: 'string', timeframe: 'string', confidence: 'number 0-100',
      sections: [{ title: 'string', items: ['string'] }],
    };
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'FXSnap',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: `You are a careful professional trading-plan assistant. Make the plan specific to every input. Include sections titled exactly: Entry rules, Stop loss, Take profit, Risk management, When not to trade. Keep confidence as a calibrated opinion, not a probability of profit. JSON schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const payload = await response.json();
    if (!response.ok) return sendJson(res, 502, { error: payload.error?.message || 'AI provider request failed.' });
    const content = payload.choices?.[0]?.message?.content;
    const rawStrategy = typeof content === 'string' ? JSON.parse(content) : null;
    const parsed = StrategyResponseSchema.safeParse(rawStrategy);
    if (!parsed.success) return sendJson(res, 502, { error: 'AI returned an invalid strategy shape.', details: parsed.error.flatten() });
    const strategy = { ...parsed.data, description: `${parsed.data.description} Educational information only; this is not financial advice and confidence is a model score, not a probability of profit.` };
    return sendJson(res, 200, strategy);
  } catch (error) {
    console.error('[Strategy AI]', error);
    return sendJson(res, 502, { error: error.message || 'Unable to generate strategy.' });
  }
}

async function allowRequest(req, deviceId) {
  const ip = deviceId || req.socket.remoteAddress || 'unknown';
  const redisCount = await persistentStore.increment(`fxsnap:rate:${ip}`, 60);
  if (redisCount !== null) return redisCount <= 30;
  const now = Date.now();
  const record = requestCounts.get(ip) || { started: now, count: 0 };
  if (now - record.started > 60_000) { record.started = now; record.count = 0; }
  record.count += 1;
  requestCounts.set(ip, record);
  return record.count <= 30;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function logProviderResponse(provider, model, details = {}) {
  const status = details.httpStatus ?? 'n/a';
  const error = details.error ? ` error=${String(details.error)}` : '';
  const preview = details.rawText ? ` raw=${String(details.rawText).slice(0, 180)}` : '';
  console.log(`[Chart AI] ${provider} model ${model} status=${status}${error}${preview}`);
}

async function callVisionModel(messages, timeoutMs = 30000) {
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const model = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'FXSnap',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    }),
  }, timeoutMs);

  const rawText = await response.text();
  let payload = null;
  try { payload = JSON.parse(rawText); } catch {}
  logProviderResponse('openrouter', model, {
    httpStatus: response.status,
    rawText,
    parsedJson: payload,
    error: response.ok ? null : payload?.error?.message || 'OpenRouter vision failed',
  });

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Chart AI request failed.');
  }

  return parseJsonPayload(payload.choices?.[0]?.message?.content);
}

/**
 * Google Gemini Vision — single-pass disciplined chart analysis.
 *
 * Uses the native REST API (no SDK) so it works in this CommonJS server with
 * the existing fetchWithTimeout helper. Primary/fallback Gemini models are
 * defined by GEMINI_VISION_MODEL_PRIMARY and GEMINI_VISION_MODEL_FALLBACK.
 */
const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash';
const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.5';

async function callGeminiTrader(imageBase64, mimeType, pair, model, timeoutMs = 30000) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('replace_')) {
    throw new Error('Gemini API key is not configured.');
  }

  const modelName = normalizeGeminiModelName(model || process.env.GEMINI_VISION_MODEL_PRIMARY || DEFAULT_GEMINI_PRIMARY_MODEL);
  if (!modelName) {
    throw new Error('Gemini model name is not configured.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Analyze this forex chart image for ${pair || 'unknown'} with careful market structure and risk-aware trade setup.\n\n${getTraderSystemPrompt()}` },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
    }),
  }, timeoutMs);

  const rawText = await response.text();
  const payload = parseJsonPayload(rawText);
  logProviderResponse('gemini', modelName, {
    httpStatus: response.status,
    rawText,
    parsedJson: payload,
    error: response.ok ? null : payload?.error?.message || `Gemini HTTP ${response.status}`,
  });

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  }

  const text = String(
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').filter(Boolean).join('') || ''
  ).trim();
  if (!text) throw new Error('Gemini returned an empty response.');

  const parsed = parseJsonPayload(text);
  if (!parsed) {
    logProviderResponse('gemini', modelName, {
      httpStatus: response.status,
      rawText: text,
      error: 'Could not parse Gemini JSON from text response.',
    });
  }
  return parsed;
}

async function callGeminiTraderWithFallback(imageBase64, mimeType, pair, timeoutMs = 30000) {
  const models = [
    process.env.GEMINI_VISION_MODEL_PRIMARY || DEFAULT_GEMINI_PRIMARY_MODEL,
    process.env.GEMINI_VISION_MODEL_FALLBACK || DEFAULT_GEMINI_FALLBACK_MODEL,
  ];

  let lastError = null;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const isFallback = modelIndex === 1;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.log(`[Chart AI] Gemini ${isFallback ? 'fallback' : 'primary'} model ${model} attempt ${attempt}`);
        const result = await callGeminiTrader(imageBase64, mimeType, pair, model, timeoutMs);
        if (attempt > 1) {
          console.log(`[Chart AI] Gemini model ${model} succeeded after retry ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        console.error(`[Chart AI] Gemini model failure: ${model} attempt ${attempt} - ${(error instanceof Error ? error.message : String(error))}`);
        if (attempt < 2) continue;
      }
    }

    if (isFallback) {
      console.error(`[Chart AI] Falling back to Gemini model: ${model}`);
    }
  }

  throw lastError || new Error('Gemini analysis failed after retries and fallback.');
}

/** OpenRouter vision fallback — single-pass disciplined chart analysis. */
async function callOpenRouterTrader(imageBase64, mimeType, pair, timeoutMs = 45000) {
  const messages = [
    { role: 'system', content: getTraderSystemPrompt() },
    { role: 'user', content: [{ type: 'text', text: `Analyze this trading chart image for ${pair || 'unknown'}.` }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] },
  ];
  return callVisionModel(messages, timeoutMs);
}

function aiUnavailableResponse(input, message) {
  return {
    status: 'ai_unavailable',
    availability: 'ai_unavailable',
    message: message || 'Chart AI is unavailable right now. Please try again shortly.',
    detectedPair: input?.pair || null,
    timeframe: input?.timeframe || null,
    chart: {
      ...DEFAULT_CHART,
      is_chart: false,
      chart_quality: 'poor',
    },
    analysis: DEFAULT_ANALYSIS,
    zones: DEFAULT_ZONES,
    strategy: DEFAULT_STRATEGY,
    trade_setup: DEFAULT_TRADE_SETUP,
    confidence: 0,
    reasons: [message || 'Chart AI is unavailable right now. Please try again shortly.'],
  };
}

function aiInvalidResponse(input, message) {
  return {
    status: 'ai_invalid_response',
    message: message || 'The analysis engine returned an invalid response. Please try again.',
    detectedPair: input?.pair || null,
    timeframe: input?.timeframe || null,
    chart: {
      ...DEFAULT_CHART,
      is_chart: false,
      chart_quality: 'poor',
    },
    analysis: DEFAULT_ANALYSIS,
    zones: DEFAULT_ZONES,
    strategy: DEFAULT_STRATEGY,
    trade_setup: DEFAULT_TRADE_SETUP,
    confidence: 0,
    reasons: [message || 'The analysis engine returned an invalid response. Please try again.'],
  };
}

/**
 * Single-pass disciplined chart analysis.
 *
 * Flow:
 * 1. Send image → AI (with the strict trader system prompt)
 * 2. AI returns structured JSON
 * 3. Backend validates rules (confidence < 70 → no_trade, RR < 1.5 → no_trade)
 * 4. Return ONE clean state: success | no_trade | invalid_image | ai_unavailable
 */
async function analyzeChart(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId))) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });

  let input = {};
  try {
    input = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Invalid JSON body.' });
  }

  try {
    const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : typeof input.image === 'string' ? input.image : '';
    const mime = typeof input.mimeType === 'string' ? input.mimeType : 'image/jpeg';

    if (!imageBase64 || imageBase64.length < 100 || imageBase64.length > 10_000_000) {
      return sendJson(res, 400, { error: 'A chart image between 100 bytes and 7.5 MB is required.' });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return sendJson(res, 400, { error: 'Only JPEG, PNG, and WebP chart images are supported.' });
    }
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('replace_'));
    const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.startsWith('replace_'));
    if (!hasGemini && !hasOpenRouter) {
      return sendJson(res, 200, aiUnavailableResponse(input, 'Chart AI is not configured on the server.'));
    }

    // Preferred provider: Google Gemini Vision. Fallback: OpenRouter vision.
    let raw = null;
    let lastError = null;
    if (hasGemini) {
      try {
        raw = await callGeminiTraderWithFallback(imageBase64, mime, input.pair || 'unknown', 30000);
      } catch (error) {
        lastError = error;
        console.error('[Chart AI] Gemini pipeline failed, falling back to OpenRouter.', error);
      }
    }

    if (!raw && hasOpenRouter) {
      try {
        raw = await callOpenRouterTrader(imageBase64, mime, input.pair || 'unknown', 45000);
      } catch (error) {
        lastError = error;
        console.error('[Chart AI] OpenRouter fallback failed.', error);
      }
    }

    if (!raw) {
      console.error('[Chart AI] Provider failed:', lastError);
      const message = `Chart AI could not analyze the image. ${(lastError instanceof Error ? lastError.message : 'unknown provider error')}`;
      return sendJson(res, 200, aiUnavailableResponse(input, message));
    }

    const canonical = canonicalizeRawAnalysis(raw);
    if (!canonical) {
      console.error('[Chart AI] Invalid raw AI payload:', raw);
      return sendJson(res, 200, aiInvalidResponse(input, 'The analysis engine returned an invalid response. Please try again.'));
    }

    const parsed = TradeAnalysisSchema.safeParse(canonical);
    if (!parsed.success) {
      console.error('[Chart AI] Invalid AI shape:', parsed.error.flatten(), 'canonical:', canonical);
      return sendJson(res, 200, aiInvalidResponse(input, 'The analysis engine returned an invalid response. Please try again.'));
    }

    const normalized = normalizeAnalysis(parsed.data);
    if (!normalized) {
      console.error('[Chart AI] Normalization failed:', parsed.data);
      return sendJson(res, 200, aiInvalidResponse(input, 'The analysis engine returned an invalid response. Please try again.'));
    }

    const finalResult = applyMentorStrategy(normalized);
    if (finalResult.status === 'success' && finalResult.trade_setup.type === 'none') {
      finalResult.status = 'no_trade';
    }

    if (finalResult.status === 'success' && finalResult.trade_setup.type !== 'none') {
      try {
        const generatedSignal = {
          deviceId,
          pair: finalResult.detectedPair || input.pair || '',
          timeframe: finalResult.timeframe || finalResult.chart?.timeframe || '',
          direction: finalResult.trade_setup.type === 'buy' ? 'BUY' : 'SELL',
          entry: finalResult.trade_setup.entry_zone,
          sl: finalResult.trade_setup.stop_loss,
          tp: finalResult.trade_setup.take_profit,
          rr: finalResult.trade_setup.risk_reward,
          confidence: finalResult.confidence,
          strategyVersion: 'mentor-sd-ms-rsi-v1',
          provider: raw.provider || 'unknown',
          generatedAt: new Date().toISOString(),
          market_data_timestamp: finalResult.market_data_timestamp || null,
          market_data_source: finalResult.market_data_source || null,
        };
        const id = crypto.randomBytes(10).toString('hex');
        await persistentStore.setJson(`fxsnap:generatedSignal:${deviceId}:${id}`, generatedSignal, 60 * 60 * 24 * 365);
      } catch (error) {
        console.error('[Chart AI] Failed to persist generated signal:', error);
      }
    }

    return sendJson(res, 200, finalResult);
  } catch (error) {
    console.error('[Chart AI] Error:', error);
    return sendJson(res, 200, aiUnavailableResponse(input, `Chart AI failed: ${(error instanceof Error ? error.message : 'unknown error')}`));
  }
}

async function receiveEvent(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId))) return sendJson(res, 429, { error: 'Too many requests.' });
  try {
    const event = await readJsonBody(req);
    if (typeof event.name !== 'string' || event.name.length > 80) return sendJson(res, 400, { error: 'Invalid event.' });
    const storedEvent = { deviceId, name: event.name, properties: event.properties || {}, occurredAt: event.occurredAt || new Date().toISOString() };
    if (!(await persistentStore.appendJson('fxsnap:events', storedEvent, 10000, 60 * 60 * 24 * 90))) recentEvents.push(storedEvent);
    if (recentEvents.length > 1000) recentEvents.shift();
    return sendJson(res, 204, {});
  } catch (error) { return sendJson(res, 400, { error: error.message }); }
}

async function getEntitlement(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';
  if (!secret || secret.startsWith('replace_')) return sendJson(res, 503, { error: 'RevenueCat server verification is not configured.' });
  try {
    const response = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, { headers: { authorization: `Bearer ${secret}` } });
    const payload = await response.json();
    if (!response.ok) return sendJson(res, 502, { error: 'RevenueCat entitlement lookup failed.' });
    const entitlement = payload.subscriber?.entitlements?.[entitlementId];
    const expiresAt = entitlement?.expires_date ? Date.parse(entitlement.expires_date) : null;
    const active = Boolean(entitlement && (!expiresAt || expiresAt > Date.now()));
    return sendJson(res, 200, { active, expiresAt: entitlement?.expires_date || null, store: entitlement?.store || null });
  } catch (error) { return sendJson(res, 504, { error: error.name === 'AbortError' ? 'RevenueCat lookup timed out.' : 'RevenueCat lookup failed.' }); }
}

async function recordSignal(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const result = z.object({ id: z.string().min(8).max(100), pair: z.string().regex(/^[A-Z]{6}$/), direction: z.enum(['BUY', 'SELL']), entry: z.number(), sl: z.number(), tp: z.number(), generatedAt: z.string().datetime() }).safeParse(await readJsonBody(req));
  if (!result.success) return sendJson(res, 400, { error: 'Invalid signal record.' });
  const record = { ...result.data, deviceId, outcome: 'open', outcomeAt: null };
  await persistentStore.setJson(`fxsnap:signal:${deviceId}:${record.id}`, record, 60 * 60 * 24 * 365);
  return sendJson(res, 201, { accepted: true });
}

async function updateSignalOutcome(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const id = String(req.url || '').split('/').pop();
  const result = z.object({ outcome: z.enum(['win', 'loss', 'open']), outcomeAt: z.string().datetime().optional(), realizedR: z.number().min(-10).max(10).optional() }).safeParse(await readJsonBody(req));
  if (!result.success || !id) return sendJson(res, 400, { error: 'Invalid signal outcome.' });
  const key = `fxsnap:signal:${deviceId}:${id}`;
  const existing = await persistentStore.getJson(key);
  if (!existing) return sendJson(res, 404, { error: 'Signal not found.' });
  await persistentStore.setJson(key, { ...existing, ...result.data, outcomeAt: result.data.outcomeAt || new Date().toISOString() }, 60 * 60 * 24 * 365);
  return sendJson(res, 200, { accepted: true });
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const privacyTemplate = fs.existsSync(PRIVACY_TEMPLATE_PATH) ? fs.readFileSync(PRIVACY_TEMPLATE_PATH, 'utf-8') : null;
const termsTemplate = fs.existsSync(TERMS_TEMPLATE_PATH) ? fs.readFileSync(TERMS_TEMPLATE_PATH, 'utf-8') : null;
const appName = getAppName();

function createRequestHandler() {
  return (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = url.pathname;

    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok', service: 'fxsnap' });
    if (pathname === '/api/session' && req.method === 'POST') {
      return readJsonBody(req).then((body) => {
        const deviceId = String(body.deviceId || '');
        if (!/^[a-zA-Z0-9_-]{16,128}$/.test(deviceId)) return sendJson(res, 400, { error: 'Invalid device identity.' });
        return sendJson(res, 200, { token: signToken(deviceId), expiresIn: 30 * 24 * 60 * 60 });
      }).catch((error) => sendJson(res, 400, { error: error.message }));
    }

    if (pathname === '/api/strategy' && req.method === 'POST') return generateStrategy(req, res);
    if ((pathname === '/api/chart-analysis' || pathname === '/analyze-chart') && req.method === 'POST') return analyzeChart(req, res);
    if (pathname === '/api/events' && req.method === 'POST') return receiveEvent(req, res);
    if (pathname === '/api/entitlement' && req.method === 'GET') return getEntitlement(req, res);
    if (pathname === '/api/signals' && req.method === 'POST') return recordSignal(req, res);
    if (pathname.startsWith('/api/signals/') && req.method === 'PATCH') return updateSignalOutcome(req, res);
    if (pathname === '/api/strategy' && req.method !== 'POST') return sendJson(res, 405, { error: 'POST required.' });

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || '/';
    }

    // Serve the privacy policy HTML template if requested
    if (pathname === '/privacy') {
      if (privacyTemplate) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(privacyTemplate);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Privacy policy not found.');
      return;
    }

    if (pathname === '/terms') {
      if (termsTemplate) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(termsTemplate);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Terms of use not found.');
      return;
    }

    if (pathname === '/' || pathname === '/manifest') {
      const platform = req.headers['expo-platform'];
      if (platform === 'ios' || platform === 'android') {
        return serveManifest(platform, res);
      }

      if (pathname === '/') {
        return serveLandingPage(req, res, landingPageTemplate, appName);
      }
    }

    serveStaticFile(pathname, res);
  };
}

const requestHandler = createRequestHandler();

if (require.main === module) {
  const server = http.createServer(requestHandler);
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
}

module.exports = requestHandler;
module.exports.createRequestHandler = createRequestHandler;
// Expose internals for unit testing
module.exports.buildStructuredObservations = buildStructuredObservations;
module.exports.evaluateDecisionEngine = evaluateDecisionEngine;
module.exports.applyMentorStrategy = applyMentorStrategy;
module.exports.enforceValidationRules = enforceValidationRules;

