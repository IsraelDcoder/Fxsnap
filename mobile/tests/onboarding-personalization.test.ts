import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMascotMood,
  getOnboardingCta,
  ONBOARDING_CTA_COPY,
} from '../services/onboardingPersonalization';

test('CTA copy follows the three-screen onboarding journey and opens the paywall', () => {
  assert.deepEqual(ONBOARDING_CTA_COPY, [
    { label: 'Continue', variantId: 'welcome_continue' },
    { label: 'Continue', variantId: 'view_chart_demo' },
    { label: 'Unlock unlimited analysis', variantId: 'view_subscription' },
  ]);
  assert.equal(getOnboardingCta(3).label, 'Continue');
});

test('mascot mood follows each of the three onboarding screens', () => {
  assert.equal(getMascotMood(0), 'curious');
  assert.equal(getMascotMood(1), 'demonstrating');
  assert.equal(getMascotMood(2), 'explaining');
});
