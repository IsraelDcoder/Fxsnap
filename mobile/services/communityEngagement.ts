export const COMMUNITY_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 1000,
  waitForInteraction: false,
};

export const COMMUNITY_VIEW_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

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
