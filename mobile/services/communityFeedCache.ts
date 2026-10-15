import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunityCategory, CommunityFeed, CommunityPage, CommunityProfile } from './community';

const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedCommunityFeed {
  profile: CommunityProfile;
  page: CommunityPage;
  savedAt: number;
}

function cacheKey(accountIdentity: string, feed: CommunityFeed, category: CommunityCategory | null) {
  return `fxsnap:community-feed:${CACHE_VERSION}:${encodeURIComponent(accountIdentity.toLowerCase())}:${feed}:${category || 'all'}`;
}

export async function readCommunityFeedCache(
  accountIdentity: string,
  feed: CommunityFeed,
  category: CommunityCategory | null,
): Promise<CachedCommunityFeed | null> {
  const key = cacheKey(accountIdentity, feed, category);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;

  let cached: CachedCommunityFeed;
  try {
    cached = JSON.parse(stored) as CachedCommunityFeed;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }

  if (!cached
    || typeof cached.profile?.accountId !== 'string'
    || !Array.isArray(cached.page?.messages)
    || typeof cached.savedAt !== 'number'
    || Date.now() - cached.savedAt > CACHE_TTL_MS) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  return cached;
}

export function writeCommunityFeedCache(
  accountIdentity: string,
  feed: CommunityFeed,
  category: CommunityCategory | null,
  profile: CommunityProfile,
  page: CommunityPage,
) {
  const cached: CachedCommunityFeed = { profile, page, savedAt: Date.now() };
  return AsyncStorage.setItem(cacheKey(accountIdentity, feed, category), JSON.stringify(cached));
}
