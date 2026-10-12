export type TradingExperience = 'beginner' | 'intermediate' | 'advanced';
export type TradingStyle = 'scalping' | 'day_trading' | 'swing';
export type TradingMarket = 'forex' | 'indices' | 'commodities' | 'crypto' | 'other';

export interface TraderProfile {
  bio: string;
  experience: TradingExperience | '';
  markets: TradingMarket[];
  tradingStyle: TradingStyle | '';
  favoriteInstruments: string[];
}

export interface ProfileCompletionInput {
  displayName: string;
  hasPhoto: boolean;
  username: string;
  bio: string;
}

export const EMPTY_TRADER_PROFILE: TraderProfile = {
  bio: '',
  experience: '',
  markets: [],
  tradingStyle: '',
  favoriteInstruments: [],
};

const EXPERIENCE_VALUES: TradingExperience[] = ['beginner', 'intermediate', 'advanced'];
const STYLE_VALUES: TradingStyle[] = ['scalping', 'day_trading', 'swing'];
const MARKET_VALUES: TradingMarket[] = ['forex', 'indices', 'commodities', 'crypto', 'other'];
const INSTRUMENT_PATTERN = /^[A-Z0-9._/-]{2,16}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTraderProfile(value: unknown): TraderProfile {
  if (!isRecord(value)) return EMPTY_TRADER_PROFILE;
  return {
    bio: typeof value.bio === 'string' ? value.bio.trim().slice(0, 160) : '',
    experience: EXPERIENCE_VALUES.includes(value.experience as TradingExperience)
      ? value.experience as TradingExperience
      : '',
    markets: Array.isArray(value.markets)
      ? [...new Set(value.markets.filter((item): item is TradingMarket => MARKET_VALUES.includes(item as TradingMarket)))]
      : [],
    tradingStyle: STYLE_VALUES.includes(value.tradingStyle as TradingStyle)
      ? value.tradingStyle as TradingStyle
      : '',
    favoriteInstruments: Array.isArray(value.favoriteInstruments)
      ? [...new Set(value.favoriteInstruments
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => INSTRUMENT_PATTERN.test(item)))].slice(0, 5)
      : [],
  };
}

export function getProfileCompletion(input: ProfileCompletionInput) {
  const fields = [
    Boolean(input.displayName.trim()),
    input.hasPhoto,
    Boolean(input.username.trim()),
    Boolean(input.bio.trim()),
  ];
  const nextField = !fields[0]
    ? 'name'
    : !fields[1]
      ? 'photo'
      : !fields[2]
        ? 'username'
        : !fields[3]
          ? 'bio'
          : 'complete';
  return {
    percentage: Math.round(fields.filter(Boolean).length * 25),
    nextField,
  } as const;
}

export function getFavoriteInstrumentError(value: string) {
  const instruments = [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
  if (instruments.length > 5) return 'Add up to five favourite instruments.';
  if (instruments.some((instrument) => !INSTRUMENT_PATTERN.test(instrument))) {
    return 'Use valid instrument codes separated by commas (for example, EURUSD, GBPUSD).';
  }
  return null;
}
