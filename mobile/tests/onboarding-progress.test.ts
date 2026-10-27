import test from 'node:test';
import assert from 'node:assert/strict';
import { getOnboardingProgress } from '../services/onboardingProgress';

test('onboarding progress shows the rounded percentage and accessible step for all three screens', () => {
  const progress = Array.from({ length: 3 }, (_, step) => getOnboardingProgress(step));

  assert.deepEqual(progress.map((item) => item.percentage), [33, 67, 100]);
  assert.deepEqual(progress.map((item) => item.stepNumber), [1, 2, 3]);
  assert.equal(progress[2].accessibleLabel, 'Onboarding progress, 3 of 3.');
  assert.equal(progress[2].fraction, 1);
});

test('onboarding progress rejects steps outside the three-screen journey', () => {
  assert.throws(() => getOnboardingProgress(-1), RangeError);
  assert.throws(() => getOnboardingProgress(3), RangeError);
  assert.throws(() => getOnboardingProgress(1.5), RangeError);
});
