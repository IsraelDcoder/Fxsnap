export function formatCompactCommunityCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return '—';
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.floor(value));
}
