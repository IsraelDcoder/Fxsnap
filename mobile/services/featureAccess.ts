export const PREMIUM_FEATURE_ROUTES = new Set([
  '/analysis',
  '/strategy',
  '/risk-management',
  '/lot-size-calculator',
]);

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean): boolean {
  return isPremiumFeatureRoute(path) && !isSubscribed;
}
