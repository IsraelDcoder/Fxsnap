export const PREMIUM_FEATURE_ROUTES = new Set([
  '/analysis',
  '/strategy',
  '/risk-management',
  '/lot-size-calculator',
]);

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function shouldAllowAnalysisAccess({ isSubscribed, hasUsedFreeAnalysis }: { isSubscribed: boolean; hasUsedFreeAnalysis: boolean }): boolean {
  return isSubscribed || !hasUsedFreeAnalysis;
}

export function shouldShowPaywall({ isSubscribed, hasUsedFreeAnalysis }: { isSubscribed: boolean; hasUsedFreeAnalysis: boolean }): boolean {
  return !isSubscribed && hasUsedFreeAnalysis;
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean, hasUsedFreeAnalysis = false): boolean {
  if (!isPremiumFeatureRoute(path)) return false;
  if (path === '/analysis') return !isSubscribed && hasUsedFreeAnalysis;
  return !isSubscribed;
}
