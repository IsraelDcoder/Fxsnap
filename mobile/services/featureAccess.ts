export const PREMIUM_FEATURE_ROUTES = new Set([
  '/strategy',
]);

export type ProtectedFeature = 'AI_ANALYSIS' | 'TRADE_SETUP' | 'STRATEGY_GENERATOR';
export type FeatureAccessDecision = { allowed: boolean; requiresPaywall: boolean };

export function isFreeAnalysisExhausted(freeAnalysesUsed: number, freeAnalysisLimit: number, isSubscribed: boolean): boolean {
  return !isSubscribed && freeAnalysisLimit > 0 && freeAnalysesUsed >= freeAnalysisLimit;
}

export function canViewFullAnalysis(isSubscribed: boolean, freeAnalysisUsed: boolean): boolean {
  return isSubscribed || freeAnalysisUsed;
}

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function getFeatureAccessDecision(feature: string, isSubscribed: boolean): FeatureAccessDecision {
  if (isSubscribed || feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP') return { allowed: true, requiresPaywall: false };
  if (feature === 'STRATEGY_GENERATOR') return { allowed: false, requiresPaywall: true };
  return { allowed: true, requiresPaywall: false };
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean): boolean {
  if (path === '/analysis') return getFeatureAccessDecision('AI_ANALYSIS', isSubscribed).requiresPaywall;
  if (path === '/strategy') return getFeatureAccessDecision('STRATEGY_GENERATOR', isSubscribed).requiresPaywall;
  return false;
}
