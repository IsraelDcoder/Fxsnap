import type { CommunityMessage, CommunityReaction } from './community';

export const COMMUNITY_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 1000,
  waitForInteraction: false,
};

export const COMMUNITY_VIEW_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function applyCommunityReaction(
  reactions: CommunityMessage['reactions'],
  reaction: CommunityReaction,
): CommunityMessage['reactions'] {
  const selected = reactions.find((item) => item.reacted);
  const currentReaction: CommunityReaction | null = selected
    ? selected.reaction === 'like' ? 'love' : selected.reaction
    : null;
  const nextReaction = currentReaction === reaction ? null : reaction;
  const counts = new Map<CommunityReaction, number>();

  for (const item of reactions) {
    if (item.reaction !== 'like' && item.count > 0) counts.set(item.reaction, item.count);
  }
  if (currentReaction) {
    const count = counts.get(currentReaction) || 0;
    if (count <= 1) counts.delete(currentReaction);
    else counts.set(currentReaction, count - 1);
  }
  if (nextReaction) counts.set(nextReaction, (counts.get(nextReaction) || 0) + 1);

  return [...counts].map(([id, count]) => ({
    reaction: id,
    count,
    reacted: id === nextReaction,
  }));
}

export function getNewVisiblePostIds(
  posts: Array<{ id: string; authorAccountId: string }>,
  currentAccountId: string | null,
  recordedIds: Map<string, number>,
  now = Date.now(),
) {
  if (!currentAccountId) return [];
  return [...new Set(posts
    .filter((post) => {
      const lastRecordedAt = recordedIds.get(`${currentAccountId}:${post.id}`);
      return post.authorAccountId !== currentAccountId
        && (lastRecordedAt === undefined || now - lastRecordedAt >= COMMUNITY_VIEW_DEDUP_WINDOW_MS);
    })
    .map((post) => post.id))];
}
