export type AssetType = 'Forex' | 'Commodity' | 'Index' | 'Crypto' | 'Other';

export type InstrumentState = 'bullish' | 'bearish' | 'neutral';

export interface Instrument {
  symbol: string; // e.g. EUR/USD
  name?: string; // friendly name, optional
  assetType: AssetType;
  // market fields - may be null/undefined when not available yet
  price?: number | null;
  change?: number | null; // absolute change
  changePercent?: number | null; // percent change
  state?: InstrumentState; // derived from change when available
}
