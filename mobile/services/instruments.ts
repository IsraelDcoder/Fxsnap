export type InstrumentTier = 'core' | 'secondary' | 'extended';
export type InstrumentCategory = 'popular' | 'forex' | 'others';
export type InstrumentKind = 'forex' | 'metal';
export type SignalProfile = 'stable' | 'volatile' | 'highVolatility';

export interface InstrumentConfig {
  id: string;
  label: string;
  category: InstrumentCategory;
  tier: InstrumentTier;
  kind: InstrumentKind;
  signalProfile: SignalProfile;
  decimals: number;
  pipSize: number;
  minimumConfidence: number;
  recentWindow: number;
  olderWindow: number;
  maxVolatilityPips: number;
  contract?: { minLot: number; lotStep: number; maxLot: number; standardUnits: number };
}

/**
 * Deliberately focused release universe. Keep this registry as the single
 * source of truth for the picker, provider adapters, and signal engine.
 */
export const INSTRUMENTS: readonly InstrumentConfig[] = [
  {
    id: 'EURUSD',
    label: 'EUR/USD',
    category: 'popular',
    tier: 'core',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 68,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 80,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'GBPUSD',
    label: 'GBP/USD',
    category: 'popular',
    tier: 'core',
    kind: 'forex',
    signalProfile: 'volatile',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 66,
    recentWindow: 10,
    olderWindow: 20,
    maxVolatilityPips: 130,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'USDJPY',
    label: 'USD/JPY',
    category: 'popular',
    tier: 'core',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 2,
    pipSize: 0.01,
    minimumConfidence: 68,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 90,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'XAUUSD',
    label: 'Gold / USD',
    category: 'popular',
    tier: 'core',
    kind: 'metal',
    signalProfile: 'highVolatility',
    decimals: 2,
    pipSize: 0.01,
    minimumConfidence: 70,
    recentWindow: 8,
    olderWindow: 16,
    maxVolatilityPips: 600,
  },
  {
    id: 'GBPJPY',
    label: 'GBP/JPY',
    category: 'forex',
    tier: 'secondary',
    kind: 'forex',
    signalProfile: 'highVolatility',
    decimals: 2,
    pipSize: 0.01,
    minimumConfidence: 72,
    recentWindow: 8,
    olderWindow: 16,
    maxVolatilityPips: 180,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'EURJPY',
    label: 'EUR/JPY',
    category: 'forex',
    tier: 'secondary',
    kind: 'forex',
    signalProfile: 'volatile',
    decimals: 2,
    pipSize: 0.01,
    minimumConfidence: 70,
    recentWindow: 10,
    olderWindow: 20,
    maxVolatilityPips: 150,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'USDCAD',
    label: 'USD/CAD',
    category: 'forex',
    tier: 'secondary',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 69,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 100,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'AUDUSD',
    label: 'AUD/USD',
    category: 'forex',
    tier: 'extended',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 70,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 90,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'USDCHF',
    label: 'USD/CHF',
    category: 'others',
    tier: 'extended',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 70,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 90,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
  {
    id: 'NZDUSD',
    label: 'NZD/USD',
    category: 'others',
    tier: 'extended',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 70,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 90,
  },
  {
    id: 'EURGBP',
    label: 'EUR/GBP',
    category: 'others',
    tier: 'extended',
    kind: 'forex',
    signalProfile: 'stable',
    decimals: 4,
    pipSize: 0.0001,
    minimumConfidence: 70,
    recentWindow: 12,
    olderWindow: 24,
    maxVolatilityPips: 70,
    contract: { minLot: 0.01, lotStep: 0.01, maxLot: 100, standardUnits: 100000 },
  },
];

export const INSTRUMENTS_BY_ID: Readonly<Record<string, InstrumentConfig>> =
  Object.fromEntries(INSTRUMENTS.map((instrument) => [instrument.id, instrument]));

export const INSTRUMENT_GROUPS: readonly {
  key: InstrumentCategory;
  title: string;
  icon: string;
  description: string;
}[] = [
  { key: 'popular', title: 'Popular', icon: 'star', description: 'Core instruments we focus on first' },
  { key: 'forex', title: 'Forex', icon: 'bar-chart-2', description: 'Liquid pairs for experienced traders' },
  { key: 'others', title: 'Others', icon: 'layers', description: 'Extended coverage for advanced users' },
];

export function getInstrument(id: string): InstrumentConfig | null {
  return INSTRUMENTS_BY_ID[id.toUpperCase()] ?? null;
}

export function getInstrumentLabel(id: string): string {
  return getInstrument(id)?.label ?? id;
}
