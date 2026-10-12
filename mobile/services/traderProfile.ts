import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyAccountDataChanged } from '@/services/accountDataEvents';
import {
  EMPTY_TRADER_PROFILE,
  normalizeTraderProfile,
  type TraderProfile,
} from '@/services/traderProfileModel';

export { EMPTY_TRADER_PROFILE, normalizeTraderProfile } from '@/services/traderProfileModel';
export type {
  TraderProfile,
  TradingExperience,
  TradingMarket,
  TradingStyle,
} from '@/services/traderProfileModel';

const TRADER_PROFILE_KEY = 'fxsnap:traderProfile:v1';


export async function getTraderProfile(): Promise<TraderProfile> {
  const stored = await AsyncStorage.getItem(TRADER_PROFILE_KEY);
  if (!stored) return EMPTY_TRADER_PROFILE;
  try {
    return normalizeTraderProfile(JSON.parse(stored) as unknown);
  } catch (error) {
    console.error('[Profile] Saved trading profile could not be parsed.', error);
    throw new Error('Your saved trading profile could not be loaded. Please try again.');
  }
}

export async function saveTraderProfile(value: unknown): Promise<TraderProfile> {
  const profile = normalizeTraderProfile(value);
  if (typeof value === 'object' && value !== null && 'bio' in value
    && typeof (value as { bio?: unknown }).bio === 'string'
    && (value as { bio: string }).bio.trim().length > 160) {
    throw new Error('Bio must be 160 characters or fewer.');
  }
  await AsyncStorage.setItem(TRADER_PROFILE_KEY, JSON.stringify(profile));
  notifyAccountDataChanged();
  return profile;
}
