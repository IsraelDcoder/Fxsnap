import { resolveApiBaseUrl } from '@/services/apiAuth';

export interface PaywallTestimonial {
  quote: string;
  attribution: string;
}

export interface PaywallRemoteConfig {
  traderCount: number | null;
  googlePlayRating: number | null;
  googlePlayRatingCount: number | null;
  testimonials: PaywallTestimonial[];
}

export function normalizePaywallRemoteConfig(payload: any): PaywallRemoteConfig {
  const rating = Number(payload?.googlePlayRating);
  const ratingCount = Number(payload?.googlePlayRatingCount);
  const validRating = rating >= 1 && rating <= 5 && Number.isInteger(ratingCount) && ratingCount > 0;
  const testimonials = Array.isArray(payload?.testimonials)
    ? payload.testimonials
      .filter((item: any) => typeof item?.quote === 'string' && item.quote.trim() && typeof item?.attribution === 'string' && item.attribution.trim())
      .slice(0, 2)
      .map((item: any) => ({ quote: item.quote.trim(), attribution: item.attribution.trim() }))
    : [];
  const traderCount = Number(payload?.traderCount);

  return {
    traderCount: Number.isInteger(traderCount) && traderCount > 0 ? traderCount : null,
    googlePlayRating: validRating ? rating : null,
    googlePlayRatingCount: validRating ? ratingCount : null,
    testimonials,
  };
}

export async function getPaywallRemoteConfig(): Promise<PaywallRemoteConfig | null> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/paywall-config`);
    if (!response.ok) return null;
    return normalizePaywallRemoteConfig(await response.json());
  } catch {
    return null;
  }
}