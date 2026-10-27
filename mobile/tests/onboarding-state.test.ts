import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialOnboardingState,
  MAX_TRADING_CHALLENGES,
  ONBOARDING_VERSION,
  parseOnboardingState,
} from '../services/onboardingState';

test('new onboarding state starts at the first step', () => {
  assert.deepEqual(createInitialOnboardingState(), {
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 0,
    challenges: [],
    experience: null,
    consequence: null,
    completedAt: null,
  });
});

test('versioned onboarding state preserves answers and deduplicates legacy selections', () => {
  const state = parseOnboardingState(JSON.stringify({
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 2,
    challenges: ['risk_management', 'confidence', 'risk_management'],
    experience: null,
    consequence: 'sometimes',
    completedAt: null,
  }));

  assert.deepEqual(state.challenges, ['risk_management']);
  assert.equal(state.experience, null);
  assert.equal(state.consequence, 'sometimes');
  assert.equal(state.currentStep, 2);
});

test('onboarding state preserves a valid trading experience and rejects unsupported values', () => {
  const state = parseOnboardingState(JSON.stringify({
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 2,
    challenges: [],
    experience: 'advanced',
    consequence: null,
    completedAt: null,
  }));

  assert.equal(state.experience, 'advanced');
  assert.throws(() => parseOnboardingState(JSON.stringify({
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 2,
    challenges: [],
    experience: 'novice',
    consequence: null,
    completedAt: null,
  })), /incompatible/i);
});

test('invalid or unsupported onboarding state is surfaced', () => {
  assert.throws(() => parseOnboardingState('{'), /could not be read/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({
    version: ONBOARDING_VERSION + 1,
    currentStep: 0,
    challenges: [],
    consequence: null,
    completedAt: null,
  })), /incompatible/i);
});

test('onboarding state limits restored challenges to one selected option', () => {
  assert.equal(MAX_TRADING_CHALLENGES, 1);
  const state = parseOnboardingState(JSON.stringify({
    version: ONBOARDING_VERSION,
    startedAt: null,
    currentStep: 2,
    challenges: ['chart_reading', 'entry_timing', 'confidence'],
    experience: null,
    consequence: null,
    completedAt: null,
  }));
  assert.deepEqual(state.challenges, ['chart_reading']);
});

test('version two onboarding progress migrates to the three-screen journey', () => {
  const mappedSteps = [0, 2, 2, 2, 2, 2, 2];
  mappedSteps.forEach((expectedStep, currentStep) => {
    const state = parseOnboardingState(JSON.stringify({
      version: 2,
      startedAt: '2025-01-01T00:00:00.000Z',
      currentStep,
      challenges: ['entry_timing'],
      experience: 'expert',
      consequence: null,
      completedAt: null,
    }));

    assert.equal(state.version, ONBOARDING_VERSION);
    assert.equal(state.currentStep, expectedStep);
    assert.equal(state.experience, 'advanced');
    assert.deepEqual(state.challenges, ['entry_timing']);
  });
});

test('version three onboarding progress maps to the three-screen journey', () => {
  const mappedSteps = [0, 2, 2, 1, 2];
  mappedSteps.forEach((expectedStep, currentStep) => {
    const state = parseOnboardingState(JSON.stringify({
      version: 3,
      startedAt: '2025-01-01T00:00:00.000Z',
      currentStep,
      challenges: ['entry_timing'],
      experience: 'intermediate',
      consequence: null,
      completedAt: null,
    }));

    assert.equal(state.version, ONBOARDING_VERSION);
    assert.equal(state.currentStep, expectedStep);
    assert.equal(state.experience, 'intermediate');
    assert.deepEqual(state.challenges, ['entry_timing']);
  });
});

test('version four onboarding progress migrates later steps to the final showcase screen', () => {
  const mappedSteps = [0, 1, 2, 2, 2];
  mappedSteps.forEach((expectedStep, currentStep) => {
    const state = parseOnboardingState(JSON.stringify({
      version: 4,
      startedAt: '2025-01-01T00:00:00.000Z',
      currentStep,
      challenges: ['entry_timing'],
      experience: 'intermediate',
      consequence: null,
      completedAt: null,
    }));

    assert.equal(state.version, ONBOARDING_VERSION);
    assert.equal(state.currentStep, expectedStep);
    assert.equal(state.experience, 'intermediate');
    assert.deepEqual(state.challenges, ['entry_timing']);
  });
});

test('version five onboarding progress migrates to the three-screen journey', () => {
  const mappedSteps = [0, 1, 2, 2, 2, 2];
  mappedSteps.forEach((expectedStep, currentStep) => {
    const state = parseOnboardingState(JSON.stringify({
      version: 5,
      startedAt: '2025-01-01T00:00:00.000Z',
      currentStep,
      challenges: ['entry_timing'],
      experience: 'intermediate',
      consequence: null,
      completedAt: null,
    }));

    assert.equal(state.version, ONBOARDING_VERSION);
    assert.equal(state.currentStep, expectedStep);
    assert.equal(state.experience, 'intermediate');
    assert.deepEqual(state.challenges, ['entry_timing']);
  });
});

test('version two onboarding migration rejects malformed legacy answers', () => {
  const legacy = {
    version: 2,
    startedAt: null,
    currentStep: 2,
    challenges: [],
    experience: null,
    consequence: null,
    completedAt: null,
  };

  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, currentStep: 7 })), /incompatible/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, challenges: ['unknown'] })), /incompatible/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, experience: 'novice' })), /incompatible/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, consequence: 'no' })), /incompatible/i);
});

test('version three onboarding migration rejects malformed legacy answers', () => {
  const legacy = {
    version: 3,
    startedAt: null,
    currentStep: 2,
    challenges: [],
    experience: null,
    consequence: null,
    completedAt: null,
  };

  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, currentStep: 5 })), /incompatible/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, challenges: ['unknown'] })), /incompatible/i);
  assert.throws(() => parseOnboardingState(JSON.stringify({ ...legacy, experience: 'novice' })), /incompatible/i);
});
