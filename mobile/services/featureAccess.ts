export const PREMIUM_FEATURE_ROUTES = new Set([
  '/analysis',
  '/strategy',
]);

export type ProtectedFeature = 'AI_ANALYSIS' | 'TRADE_SETUP' | 'STRATEGY_GENERATOR';
export type FeatureAccessDecision = { allowed: boolean; requiresPaywall: boolean };

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function getFeatureAccessDecision(feature: string, isSubscribed: boolean): FeatureAccessDecision {
  if (isSubscribed) return { allowed: true, requiresPaywall: false };
  if (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP' || feature === 'STRATEGY_GENERATOR') return { allowed: false, requiresPaywall: true };
  return { allowed: true, requiresPaywall: false };
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean): boolean {
  if (path === '/analysis') return getFeatureAccessDecision('AI_ANALYSIS', isSubscribed).requiresPaywall;
  if (path === '/strategy') return getFeatureAccessDecision('STRATEGY_GENERATOR', isSubscribed).requiresPaywall;
  return false;
}
