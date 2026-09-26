export const REVENUECAT_ENTITLEMENT_CANDIDATES = Array.from(new Set([
  process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID,
  process.env.REVENUECAT_ENTITLEMENT_ID,
  'premium',
  'Premium',
  'Pro',
  'pro',
].filter((value): value is string => Boolean(value && value.trim())))).map((value) => value.trim());

export function hasRevenueCatEntitlement(activeEntitlements: Record<string, unknown> | null | undefined): boolean {
  if (!activeEntitlements || typeof activeEntitlements !== 'object') return false;
  return Object.keys(activeEntitlements).some((key) =>
    REVENUECAT_ENTITLEMENT_CANDIDATES.some((candidate) => candidate.toLowerCase() === key.toLowerCase())
  );
}
