import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_VERSION = 6;
export const ONBOARDING_STATE_KEY = 'fxsnap:onboardingState:v6';
const PREVIOUS_ONBOARDING_STATE_KEY = 'fxsnap:onboardingState:v5';
const LEGACY_V4_ONBOARDING_STATE_KEY = 'fxsnap:onboardingState:v4';
const LEGACY_V3_ONBOARDING_STATE_KEY = 'fxsnap:onboardingState:v3';
const LEGACY_ONBOARDING_STATE_KEY = 'fxsnap:onboardingState:v2';

export const TRADING_CHALLENGES = [
  'chart_reading',
  'entry_timing',
  'bad_setups',
  'risk_management',
  'confidence',
] as const;

export const MAX_TRADING_CHALLENGES = 1;

export type TradingChallenge = typeof TRADING_CHALLENGES[number];
export type ConsequenceResponse = 'yes' | 'sometimes';
export type TradingExperience = 'beginner' | 'intermediate' | 'advanced';

export const TRADING_EXPERIENCES: readonly TradingExperience[] = [
  'beginner',
  'intermediate',
  'advanced',
];

export interface OnboardingState {
  version: typeof ONBOARDING_VERSION;
  startedAt: string | null;
  currentStep: number;
  challenges: TradingChallenge[];
  experience: TradingExperience | null;
  consequence: ConsequenceResponse | null;
  completedAt: string | null;
}

export function createInitialOnboardingState(): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 0,
    challenges: [],
    experience: null,
    consequence: null,
    completedAt: null,
  };
}

export function parseOnboardingState(value: string | null): OnboardingState {
  if (value === null) return createInitialOnboardingState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Saved onboarding progress could not be read. Please try again.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Saved onboarding progress has an invalid format. Please try again.');
  }

  const stored = parsed as Record<string, unknown>;
  if (stored.version === 5) {
    return migrateVersionFiveState(stored);
  }
  if (stored.version === 4) {
    return migrateVersionFourState(stored);
  }
  if (stored.version === 3) {
    return migrateVersionThreeState(stored);
  }
  if (stored.version === 2) {
    return migrateVersionTwoState(stored);
  }
  if (
    stored.version !== ONBOARDING_VERSION
    || (stored.startedAt !== null && typeof stored.startedAt !== 'string')
    || !Number.isInteger(stored.currentStep)
    || (stored.currentStep as number) < 0
    || (stored.currentStep as number) > 2
    || !Array.isArray(stored.challenges)
    || stored.challenges.some((challenge) => !TRADING_CHALLENGES.includes(challenge as TradingChallenge))
    || (stored.experience !== null && !TRADING_EXPERIENCES.includes(stored.experience as TradingExperience))
    || (stored.consequence !== null && stored.consequence !== 'yes' && stored.consequence !== 'sometimes')
    || (stored.completedAt !== null && typeof stored.completedAt !== 'string')
  ) {
    throw new Error('Saved onboarding progress is incompatible. Please restart onboarding.');
  }

  return {
    version: ONBOARDING_VERSION,
    startedAt: stored.startedAt as string | null,
    currentStep: stored.currentStep as number,
    challenges: Array.from(new Set(stored.challenges as TradingChallenge[])).slice(0, MAX_TRADING_CHALLENGES),
    experience: stored.experience as TradingExperience | null,
    consequence: stored.consequence as ConsequenceResponse | null,
    completedAt: stored.completedAt as string | null,
  };
}

function validateLegacyState(legacy: Record<string, unknown>, maximumStep: number) {
  if (
    (legacy.startedAt !== null && typeof legacy.startedAt !== 'string')
    || !Number.isInteger(legacy.currentStep)
    || (legacy.currentStep as number) < 0
    || (legacy.currentStep as number) > maximumStep
    || !Array.isArray(legacy.challenges)
    || legacy.challenges.some((challenge) => !TRADING_CHALLENGES.includes(challenge as TradingChallenge))
    || (legacy.experience !== null && !['beginner', 'intermediate', 'advanced', 'expert'].includes(legacy.experience as string))
    || (legacy.consequence !== null && legacy.consequence !== 'yes' && legacy.consequence !== 'sometimes')
    || (legacy.completedAt !== null && typeof legacy.completedAt !== 'string')
  ) {
    throw new Error('Saved onboarding progress is incompatible. Please restart onboarding.');
  }
}

function mapThreeScreenStep(step: number) {
  return Math.min(step, 2);
}

function mapDemoFirstLegacyStep(step: number) {
  return [0, 1, 2, 2, 2, 2][step] ?? 0;
}

function mapLegacyStepToCurrent(step: number) {
  return [0, 2, 2, 1, 2][step] ?? 0;
}

function migrateVersionFiveState(previous: Record<string, unknown>): OnboardingState {
  validateLegacyState(previous, 5);
  return {
    ...createInitialOnboardingState(),
    startedAt: previous.startedAt as string | null,
    currentStep: mapThreeScreenStep(previous.currentStep as number),
    challenges: Array.from(new Set(previous.challenges as TradingChallenge[])).slice(0, MAX_TRADING_CHALLENGES),
    experience: previous.experience as TradingExperience | null,
    consequence: previous.consequence as ConsequenceResponse | null,
    completedAt: previous.completedAt as string | null,
  };
}

function migrateVersionFourState(previous: Record<string, unknown>): OnboardingState {
  validateLegacyState(previous, 4);
  return {
    ...createInitialOnboardingState(),
    startedAt: previous.startedAt as string | null,
    currentStep: mapDemoFirstLegacyStep(previous.currentStep as number),
    challenges: Array.from(new Set(previous.challenges as TradingChallenge[])).slice(0, MAX_TRADING_CHALLENGES),
    experience: previous.experience as TradingExperience | null,
    consequence: previous.consequence as ConsequenceResponse | null,
    completedAt: previous.completedAt as string | null,
  };
}

function migrateVersionThreeState(legacy: Record<string, unknown>): OnboardingState {
  validateLegacyState(legacy, 4);
  return {
    ...createInitialOnboardingState(),
    startedAt: legacy.startedAt as string | null,
    currentStep: mapLegacyStepToCurrent(legacy.currentStep as number),
    challenges: Array.from(new Set(legacy.challenges as TradingChallenge[])).slice(0, MAX_TRADING_CHALLENGES),
    experience: legacy.experience === 'expert' ? 'advanced' : legacy.experience as TradingExperience | null,
    consequence: legacy.consequence as ConsequenceResponse | null,
    completedAt: legacy.completedAt as string | null,
  };
}

function migrateVersionTwoState(legacy: Record<string, unknown>): OnboardingState {
  validateLegacyState(legacy, 6);

  const mappedStep = [0, 2, 2, 2, 2, 2, 2][legacy.currentStep as number];
  const mappedExperience: TradingExperience | null =
    legacy.experience === 'beginner'
      ? 'beginner'
      : legacy.experience === 'advanced'
        ? 'intermediate'
        : legacy.experience === 'expert'
          ? 'advanced'
          : null;

  return {
    ...createInitialOnboardingState(),
    startedAt: legacy.startedAt as string | null,
    currentStep: mappedStep,
    challenges: Array.from(new Set(legacy.challenges as TradingChallenge[])).slice(0, MAX_TRADING_CHALLENGES),
    experience: mappedExperience,
    completedAt: legacy.completedAt as string | null,
  };
}

export async function loadOnboardingState() {
  const currentState = await AsyncStorage.getItem(ONBOARDING_STATE_KEY);
  if (currentState !== null) return parseOnboardingState(currentState);

  const previousState = await AsyncStorage.getItem(PREVIOUS_ONBOARDING_STATE_KEY);
  if (previousState !== null) return parseOnboardingState(previousState);

  const legacyV4State = await AsyncStorage.getItem(LEGACY_V4_ONBOARDING_STATE_KEY);
  if (legacyV4State !== null) return parseOnboardingState(legacyV4State);

  const legacyV3State = await AsyncStorage.getItem(LEGACY_V3_ONBOARDING_STATE_KEY);
  if (legacyV3State !== null) return parseOnboardingState(legacyV3State);

  const legacyState = await AsyncStorage.getItem(LEGACY_ONBOARDING_STATE_KEY);
  return parseOnboardingState(legacyState);
}

export async function saveOnboardingState(state: OnboardingState) {
  await AsyncStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state));
}
