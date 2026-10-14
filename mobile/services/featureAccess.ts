export const PREMIUM_FEATURE_ROUTES = new Set(['/analysis', '/strategy']);

export type ProtectedFeature = 'AI_ANALYSIS' | 'TRADE_SETUP' | 'STRATEGY_GENERATOR';
export type FeatureAccessDecision = { allowed: boolean; requiresPaywall: boolean };

export function isDevelopmentPremiumBypassEnabled(): boolean {
  return process.env.EXPO_PUBLIC_DEV_PREMIUM_BYPASS === 'true'
    && typeof __DEV__ !== 'undefined'
    && __DEV__;
}

export function canViewFullAnalysis(isSubscribed: boolean): boolean {
  return isSubscribed || isDevelopmentPremiumBypassEnabled();
}

export function isPremiumFeatureRoute(path: string): boolean {
  return PREMIUM_FEATURE_ROUTES.has(path);
}

export function getFeatureAccessDecision(feature: string, isSubscribed: boolean): FeatureAccessDecision {
  const hasPremiumAccess = isSubscribed
    || (isDevelopmentPremiumBypassEnabled() && (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP'));
  if (hasPremiumAccess) return { allowed: true, requiresPaywall: false };
  if (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP' || feature === 'STRATEGY_GENERATOR') {
    return { allowed: false, requiresPaywall: true };
  }
  return { allowed: true, requiresPaywall: false };
}

export function shouldGuardFeatureRoute(path: string, isSubscribed: boolean): boolean {
  if (isPremiumFeatureRoute(path)) {
    const feature = path === '/analysis' ? 'AI_ANALYSIS' : 'STRATEGY_GENERATOR';
    return getFeatureAccessDecision(feature, isSubscribed).requiresPaywall;
  }
  return false;
}
