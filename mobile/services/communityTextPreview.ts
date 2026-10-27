export const COMMUNITY_POST_PREVIEW_LINES = 3;

export function communityTextExceedsPreview(body: string, renderedLines: readonly string[]): boolean {
  if (renderedLines.length > COMMUNITY_POST_PREVIEW_LINES) return true;
  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
  return normalizeWhitespace(renderedLines.join(' ')) !== normalizeWhitespace(body);
}
