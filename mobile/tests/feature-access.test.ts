import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldGuardFeatureRoute } from '../services/featureAccess';

test('free users are gated from premium features while Community remains available', () => {
  [
    '/analysis',
    '/strategy',
  ].forEach((route) => assert.equal(shouldGuardFeatureRoute(route, false), true, route));
  [
    '/community',
    '/community-search',
    '/community-notifications',
  ].forEach((route) => assert.equal(shouldGuardFeatureRoute(route, false), false, route));
});

test('other app features remain accessible to free users', () => {
  [
    '/',
    '/home',
    '/(tabs)/home',
    '/settings',
    '/profile',
    '/support-chat',
    '/auth/callback',
    '/onboarding',
    '/paywall',
    '/daily-brief',
    '/economic-calendar',
    '/saved',
    '/saved-briefs',
    '/lot-size-calculator',
    '/risk-management',
    '/learning-hub',
    '/learning-lesson/intro',
    '/my-strategies',
    '/events',
    '/event-room',
  ].forEach((route) => assert.equal(shouldGuardFeatureRoute(route, false), false, route));
});
