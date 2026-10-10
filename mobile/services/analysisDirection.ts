export type AnalysisDirection = 'BUY' | 'SELL';

export function resolveAnalysisDirection(...values: unknown[]): AnalysisDirection | undefined {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'buy' || normalized === 'bullish') return 'BUY';
    if (normalized === 'sell' || normalized === 'bearish') return 'SELL';
  }
  return undefined;
}

export function formatAnalysisDirection(
  direction: AnalysisDirection | undefined,
  isValidatedSetup: boolean,
  fallback = 'DIRECTION UNCLEAR',
) {
  if (!direction) return fallback;
  return isValidatedSetup ? direction : `${direction} BIAS`;
}
