export const ONBOARDING_STEP_COUNT = 3;

export interface OnboardingProgress {
  stepNumber: number;
  percentage: number;
  fraction: number;
  accessibleLabel: string;
}

export function getOnboardingProgress(stepIndex: number): OnboardingProgress {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= ONBOARDING_STEP_COUNT) {
    throw new RangeError(`Onboarding step must be between 0 and ${ONBOARDING_STEP_COUNT - 1}.`);
  }

  const stepNumber = stepIndex + 1;
  const fraction = stepNumber / ONBOARDING_STEP_COUNT;
  return {
    stepNumber,
    percentage: Math.round(fraction * 100),
    fraction,
    accessibleLabel: `Onboarding progress, ${stepNumber} of ${ONBOARDING_STEP_COUNT}.`,
  };
}
