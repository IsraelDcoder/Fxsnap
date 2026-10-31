export const PREMIUM_FEATURE_ROUTES = new Set(['/analysis', '/strategy']);

export type ProtectedFeature = 'AI_ANALYSIS' | 'TRADE_SETUP' | 'STRATEGY_GENERATOR' | 'COMMUNITY';
export type FeatureAccessDecision = { allowed: boolean; requiresPaywall: boolean };

export function canViewFullAnalysis(isSubscribed: boolean): boolean {
  return isSubscribed;
}

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function isCommunityFeatureRoute(path: string): boolean {
  return path === '/community' || path.startsWith('/community-') || path.startsWith('/community/');
}

export function getFeatureAccessDecision(feature: string, isSubscribed: boolean): FeatureAccessDecision {
  if (feature === 'COMMUNITY') return { allowed: true, requiresPaywall: false };
  if (isSubscribed) return { allowed: true, requiresPaywall: false };
  if (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP' || feature === 'STRATEGY_GENERATOR') {
    return { allowed: false, requiresPaywall: true };
  }
  return { allowed: true, requiresPaywall: false };
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean): boolean {
  if (isCommunityFeatureRoute(path)) return getFeatureAccessDecision('COMMUNITY', isSubscribed).requiresPaywall;
  if (PREMIUM_FEATURE_ROUTES.has(path)) {
    return getFeatureAccessDecision(path === '/analysis' ? 'AI_ANALYSIS' : 'STRATEGY_GENERATOR', isSubscribed).requiresPaywall;
  }
  return false;
}
