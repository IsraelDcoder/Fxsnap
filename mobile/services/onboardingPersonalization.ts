export type OnboardingMascotMood = 'curious' | 'demonstrating' | 'explaining';

export const ONBOARDING_CTA_COPY = [
  { label: 'Continue', variantId: 'welcome_continue' },
  { label: 'Continue', variantId: 'view_chart_demo' },
  { label: 'Unlock unlimited analysis', variantId: 'view_subscription' },
] as const;

export function getOnboardingCta(step: number) {
  return ONBOARDING_CTA_COPY[step] ?? ONBOARDING_CTA_COPY[0];
}

export function getMascotMood(step: number): OnboardingMascotMood {
  if (step === 0) return 'curious';
  if (step === 1) return 'demonstrating';
  return 'explaining';
}
