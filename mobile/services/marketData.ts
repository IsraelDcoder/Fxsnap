/**
 * Market Data Service — focused instrument data and signal preparation.
 *
 * The instrument registry owns precision and signal-profile differences so
 * adding a supported instrument does not require another pair-specific branch.
 */

import { getInstrument } from '@/services/instruments';
import { getApiHeaders } from '@/services/apiAuth';

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrendAnalysis {
  direction: 'BUY' | 'SELL' | null;
  confidence: number; // 0-100
  recent_high: number;
  recent_low: number;
  support: number;
  resistance: number;
  volatility: number; // pips
  isLowConfidence: boolean;
  confidenceReason?: string;
}

const MARKET_DATA_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Convert either EURUSD or EUR/USD to Alpha Vantage's two currency fields.
 */
function pairToSymbols(pair: string): { from: string; to: string } {
  const symbol = pair.replace('/', '').toUpperCase();
  return { from: symbol.slice(0, 3), to: symbol.slice(3, 6) };
}

function emptyTrend(reason: string): TrendAnalysis {
  return {
    direction: null,
    confidence: 0,
    recent_high: 0,
    recent_low: 0,
    support: 0,
    resistance: 0,
    volatility: 0,
    isLowConfidence: true,
    confidenceReason: reason,
  };
}

/**
 * Fetch intraday FX candles from Alpha Vantage
 * Returns last 30 minutes (5-min intervals)
 */
export async function fetchCandleData(pair: string): Promise<CandleData[] | null> {
  try {
    const instrument = getInstrument(pair);
    if (!instrument) {
      console.warn('[Market Data] Unsupported instrument:', pair);
      return null;
    }

    // Alpha Vantage's FX_INTRADAY feed accepts currency symbols. Gold needs a
    // provider adapter with true intraday XAU candles before it can produce a
    // trustworthy signal; the same endpoint is intentionally not fabricated.
    if (instrument.kind !== 'forex') {
      console.warn('[Market Data] Intraday provider unavailable for:', instrument.id);
      return null;
    }

    const response = await fetch(`${MARKET_DATA_API_URL}/api/market-data?pair=${encodeURIComponent(instrument.id)}`, { headers: await getApiHeaders() });
    if (!response.ok) {
      console.error('[Market Data] API response error:', response.status);
      return null;
    }

    const data = await response.json();

    // Check for API errors (rate limit, invalid request)
    const timeSeries = data.timeSeries;
    if (!timeSeries) {
      console.warn('[Market Data] No time series data for', pair);
      return null;
    }

    // Convert to array of candles, sorted by timestamp (most recent last)
    const candles: CandleData[] = Object.entries(timeSeries)
      .map(([timestamp, values]: [string, any]) => ({
        timestamp,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return candles;
  } catch (error) {
    console.error('[Market Data] Fetch error:', error);
    return null;
  }
}

/**
 * Analyze trend from candle data
 * Determines: BUY/SELL, confidence, support/resistance levels
 */
export function analyzeTrend(candles: CandleData[], pair: string): TrendAnalysis {
  const instrument = getInstrument(pair);
  if (!instrument) return emptyTrend('This instrument is not supported.');

  const minimumCandles = instrument.recentWindow + instrument.olderWindow;
  if (!candles || candles.length < minimumCandles) {
    return emptyTrend('Not enough price history for a reliable signal.');
  }

  const recent = candles.slice(-instrument.recentWindow);
  const older = candles.slice(
    -(instrument.recentWindow + instrument.olderWindow),
    -instrument.recentWindow
  );

  // Calculate recent and older closes
  const recentClose = recent.map((c) => c.close);
  const olderClose = older.length > 0 ? older.map((c) => c.close) : recentClose;

  const recentAvg = recentClose.reduce((a, b) => a + b, 0) / recentClose.length;
  const olderAvg = olderClose.length > 0 ? olderClose.reduce((a, b) => a + b, 0) / olderClose.length : recentAvg;

  // Direction comes from trend slope, while consistency prevents one candle
  // from producing a premium-looking but weak signal.
  const direction: 'BUY' | 'SELL' = recentAvg > olderAvg ? 'BUY' : 'SELL';
  const moveInPips = Math.abs(recentAvg - olderAvg) / instrument.pipSize;
  const alignedCandles = recent.filter((c, index) => {
    if (index === 0) return true;
    const delta = c.close - recent[index - 1].close;
    return direction === 'BUY' ? delta >= 0 : delta <= 0;
  }).length;
  const consistency = alignedCandles / recent.length;

  // Pair profiles intentionally produce different requirements: stable pairs
  // prefer consistency, while volatile pairs require more movement and are
  // penalized when the range becomes excessive.
  const trendStrength = moveInPips / Math.max(1, instrument.maxVolatilityPips);
  const profileBonus = instrument.signalProfile === 'stable'
    ? consistency * 18
    : instrument.signalProfile === 'highVolatility'
      ? Math.min(18, trendStrength * 18)
      : consistency * 10 + Math.min(8, trendStrength * 8);
  const confidence = Math.max(
    0,
    Math.min(100, Math.floor(50 + consistency * 25 + profileBonus + Math.min(15, trendStrength * 15)))
  );

  // Support/Resistance from recent high/low
  const recent_high = Math.max(...recent.map((c) => c.high));
  const recent_low = Math.min(...recent.map((c) => c.low));

  // Normalize range with the instrument's pip size. This fixes the previous
  // one-size-fits-all 10,000 multiplier for JPY and metal instruments.
  const volatility = (recent_high - recent_low) / instrument.pipSize;
  const tooVolatile = volatility > instrument.maxVolatilityPips;
  const belowThreshold = confidence < instrument.minimumConfidence;
  const isLowConfidence = belowThreshold || tooVolatile;

  // Simple support/resistance calculation
  const support = recent_low - (recent_high - recent_low) * 0.2;
  const resistance = recent_high + (recent_high - recent_low) * 0.2;

  return {
    direction,
    confidence,
    recent_high,
    recent_low,
    support: parseFloat(support.toFixed(5)),
    resistance: parseFloat(resistance.toFixed(5)),
    volatility: Math.round(volatility),
    isLowConfidence,
    confidenceReason: tooVolatile
      ? 'Volatility is outside the preferred range for this instrument.'
      : belowThreshold
        ? 'Price structure is not consistent enough for a high-conviction signal.'
        : undefined,
  };
}

/**
 * Get current price for a pair (last close price from candles)
 */
export function getCurrentPrice(candles: CandleData[]): number | null {
  if (!candles || candles.length === 0) return null;
  return candles[candles.length - 1].close;
}

/**
 * Calculate entry, SL, TP based on trend and current price
 */
export function calculateLevels(
  trend: TrendAnalysis,
  currentPrice: number,
  pair: string
): { entry: string; sl: string; tp: string; slPips: number } {
  const instrument = getInstrument(pair);
  const decimals = instrument?.decimals ?? 4;
  const pipValue = instrument?.pipSize ?? 0.0001;

  // More volatile profiles receive a wider structural stop; stable pairs use
  // a tighter fraction of their recent range.
  const volatilityDivisor = instrument?.signalProfile === 'highVolatility' ? 12 : instrument?.signalProfile === 'volatile' ? 10 : 8;
  const minimumStop = instrument?.kind === 'metal' ? 80 : instrument?.signalProfile === 'highVolatility' ? 25 : 15;
  const slPips = Math.max(minimumStop, Math.floor(trend.volatility / volatilityDivisor));

  let entry: string;
  let sl: string;
  let tp: string;

  if (trend.direction === 'BUY') {
    entry = currentPrice.toFixed(decimals);
    sl = (currentPrice - slPips * pipValue).toFixed(decimals);
    tp = (currentPrice + slPips * 2 * pipValue).toFixed(decimals);
  } else {
    entry = currentPrice.toFixed(decimals);
    sl = (currentPrice + slPips * pipValue).toFixed(decimals);
    tp = (currentPrice - slPips * 2 * pipValue).toFixed(decimals);
  }

  return {
    entry,
    sl,
    tp,
    slPips,
  };
}

/** Approximate USD risk value for one pip/point per standard lot. */
export function getDollarValuePerPipPerLot(pair: string, currentPrice: number): number {
  const instrument = getInstrument(pair);
  if (!instrument || instrument.kind !== 'forex') return 0;
  // USD-quoted majors have a stable approximately-$10 pip value per standard
  // lot. USD/JPY requires conversion from JPY into USD. Other crosses need a
  // live quote-currency/USD conversion and are intentionally withheld here.
  if (instrument.id.endsWith('USD')) return 10;
  if (instrument.id === 'USDJPY') return currentPrice > 0 ? 1000 / currentPrice : 0;
  return 0;
}

export function calculateLotSize(
  pair: string,
  accountBalance: number,
  riskPercent: number,
  slPips: number,
  currentPrice: number
): number {
  const instrument = getInstrument(pair);
  const riskAmount = accountBalance * (riskPercent / 100);
  const pipValuePerLot = getDollarValuePerPipPerLot(pair, currentPrice);
  if (pipValuePerLot <= 0) return 0;
  const rawLot = riskAmount / Math.max(1, slPips * pipValuePerLot);
  // Do not force a 0.01 minimum: for small accounts or wide stops that would
  // exceed the user's requested risk. A broker-specific minimum should be
  // applied only after the user confirms the broker's contract rules.
  if (rawLot < 0.01) return 0;
  const contract = instrument?.contract;
  if (!contract || rawLot < contract.minLot) return 0;
  const steppedLot = Math.floor(rawLot / contract.lotStep) * contract.lotStep;
  return parseFloat(Math.min(contract.maxLot, steppedLot).toFixed(2));
}
