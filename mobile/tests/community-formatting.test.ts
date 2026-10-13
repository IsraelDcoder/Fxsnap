import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCompactCommunityCount } from '../services/communityFormatting';
import {
  applyCommunityReaction,
  COMMUNITY_VIEW_DEDUP_WINDOW_MS,
  COMMUNITY_VIEWABILITY_CONFIG,
  getNewVisiblePostIds,
} from '../services/communityEngagement';
import { CommunityReactionTapGuard } from '../services/communityReactionInteraction';

test('formats compact Community engagement counts', () => {
  assert.equal(formatCompactCommunityCount(0), '0');
  assert.equal(formatCompactCommunityCount(950), '950');
  assert.equal(formatCompactCommunityCount(1_200), '1.2K');
  assert.equal(formatCompactCommunityCount(15_000), '15K');
  assert.equal(formatCompactCommunityCount(1_000_000), '1M');
  assert.equal(formatCompactCommunityCount(Number.NaN), '—');
});

test('uses a minimum visibility dwell and deduplicates own, repeated, and recent views', () => {
  assert.equal(COMMUNITY_VIEWABILITY_CONFIG.itemVisiblePercentThreshold, 60);
  assert.equal(COMMUNITY_VIEWABILITY_CONFIG.minimumViewTime, 1000);
  const now = 100_000;
  const alreadySent = new Map([
    ['current-account:old-post', now],
    ['current-account:expired-post', now - COMMUNITY_VIEW_DEDUP_WINDOW_MS - 1],
  ]);
  const eligible = getNewVisiblePostIds([
    { id: 'another-post', authorAccountId: 'other-account' },
    { id: 'own-post', authorAccountId: 'current-account' },
    { id: 'old-post', authorAccountId: 'other-account' },
    { id: 'another-post', authorAccountId: 'other-account' },
    { id: 'expired-post', authorAccountId: 'other-account' },
  ], 'current-account', alreadySent, now);
  assert.deepEqual(eligible, ['another-post', 'expired-post']);
  for (const id of eligible) alreadySent.set(`current-account:${id}`, now);
  assert.deepEqual(getNewVisiblePostIds([
    { id: 'another-post', authorAccountId: 'other-account' },
  ], 'current-account', alreadySent, now + 1), []);
});

test('optimistic reactions add, change, and toggle off one account selection', () => {
  const existing = [
    { reaction: 'love' as const, count: 3, reacted: true },
    { reaction: 'fire' as const, count: 2, reacted: false },
  ];
  assert.deepEqual(applyCommunityReaction(existing, 'love'), [
    { reaction: 'love', count: 2, reacted: false },
    { reaction: 'fire', count: 2, reacted: false },
  ]);
  assert.deepEqual(applyCommunityReaction(existing, 'fire'), [
    { reaction: 'love', count: 2, reacted: false },
    { reaction: 'fire', count: 3, reacted: true },
  ]);
  assert.deepEqual(applyCommunityReaction([], 'wow'), [
    { reaction: 'wow', count: 1, reacted: true },
  ]);
  assert.deepEqual(applyCommunityReaction([
    { reaction: 'love', count: 3, reacted: true },
    { reaction: 'like', count: 3, reacted: true },
  ], 'love'), [
    { reaction: 'love', count: 2, reacted: false },
  ]);
});

test('a long-press consumes its following press without applying a second default reaction', () => {
  const guard = new CommunityReactionTapGuard();
  assert.equal(guard.consumeSuppressedTap(), false);
  guard.suppressNextTap();
  assert.equal(guard.consumeSuppressedTap(), true);
  assert.equal(guard.consumeSuppressedTap(), false);
  guard.suppressNextTap();
  guard.reset();
  assert.equal(guard.consumeSuppressedTap(), false);
});
