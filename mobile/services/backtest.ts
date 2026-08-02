/** Minimal candle shape used by the backtest engine. */
export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Signal shape produced by a signal function fed to the backtest engine. */
export interface TrendAnalysis {
  direction: 'BUY' | 'SELL' | null;
  confidence: number; // 0-100
  isLowConfidence: boolean;
  [key: string]: unknown;
}

export interface BacktestTrade {
  index: number;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  outcome: 'win' | 'loss' | 'open';
  rMultiple: number;
  exitIndex?: number;
}
export interface BacktestMetrics {
  sampleSize: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
  expectancyR: number;
  maxDrawdownR: number;
  totalR: number;
  inSample: boolean;
}
export interface BacktestConfig {
  warmupCandles: number;
  stopPips: number;
  rewardRisk: number;
  pipSize: number;
  maxBarsInTrade?: number;
  splitRatio?: number;
}

export function evaluateTrade(candles: CandleData[], start: number, direction: 'BUY' | 'SELL', config: BacktestConfig): BacktestTrade {
  const entry = candles[start].close;
  const stopDistance = config.stopPips * config.pipSize;
  const sl = direction === 'BUY' ? entry - stopDistance : entry + stopDistance;
  const tp = direction === 'BUY' ? entry + stopDistance * config.rewardRisk : entry - stopDistance * config.rewardRisk;
  const max = Math.min(candles.length - 1, start + (config.maxBarsInTrade || 48));
  for (let i = start + 1; i <= max; i += 1) {
    const candle = candles[i];
    const hitStop = direction === 'BUY' ? candle.low <= sl : candle.high >= sl;
    const hitTarget = direction === 'BUY' ? candle.high >= tp : candle.low <= tp;
    // Conservative same-candle rule: count a stop before a target.
    if (hitStop) return { index: start, direction, entry, sl, tp, outcome: 'loss', rMultiple: -1, exitIndex: i };
    if (hitTarget) return { index: start, direction, entry, sl, tp, outcome: 'win', rMultiple: config.rewardRisk, exitIndex: i };
  }
  return { index: start, direction, entry, sl, tp, outcome: 'open', rMultiple: 0 };
}

export function calculateMetrics(trades: BacktestTrade[], inSample: boolean): BacktestMetrics {
  const wins = trades.filter((trade) => trade.outcome === 'win').length;
  const losses = trades.filter((trade) => trade.outcome === 'loss').length;
  let equity = 0; let peak = 0; let maxDrawdownR = 0;
  for (const trade of trades) { equity += trade.rMultiple; peak = Math.max(peak, equity); maxDrawdownR = Math.max(maxDrawdownR, peak - equity); }
  return { sampleSize: trades.length, wins, losses, open: trades.length - wins - losses, winRate: wins + losses ? wins / (wins + losses) : 0, expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length : 0, maxDrawdownR, totalR: equity, inSample };
}

export function runBacktest(candles: CandleData[], signalFor: (history: CandleData[]) => TrendAnalysis | null, config: BacktestConfig): { trades: BacktestTrade[]; inSample: BacktestMetrics; outOfSample: BacktestMetrics } {
  const split = Math.floor(candles.length * (config.splitRatio || 0.7));
  const trades: BacktestTrade[] = [];
  for (let index = config.warmupCandles; index < candles.length - 1; index += 1) {
    const signal = signalFor(candles.slice(0, index + 1));
    if (!signal?.direction || signal.isLowConfidence) continue;
    trades.push(evaluateTrade(candles, index, signal.direction, config));
  }
  return { trades, inSample: calculateMetrics(trades.filter((trade) => trade.index < split), true), outOfSample: calculateMetrics(trades.filter((trade) => trade.index >= split), false) };
}

