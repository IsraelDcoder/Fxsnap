import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccessGateRoute, shouldGuardFeatureRoute } from '../services/featureAccess';

test('users must complete onboarding before reaching the paywall or app routes', () => {
  assert.equal(getAccessGateRoute('/', false, false), null);
  assert.equal(getAccessGateRoute('/onboarding', false, false), null);
  assert.equal(getAccessGateRoute('/analysis', false, false), '/onboarding');
  assert.equal(getAccessGateRoute('/paywall', false, false), null);
  assert.equal(getAccessGateRoute('/exit-offer', false, false), null);
  assert.equal(getAccessGateRoute('/home', true, false), '/paywall');
  assert.equal(getAccessGateRoute('/home', true, false, true), null);
  assert.equal(getAccessGateRoute('/(tabs)/home', true, false, true), null);
  assert.equal(getAccessGateRoute('/analysis', true, false, true), null);
  assert.equal(getAccessGateRoute('/settings', true, false, true), '/paywall');
  assert.equal(getAccessGateRoute('/exit-offer', true, false), null);
  assert.equal(getAccessGateRoute('/community', true, false), '/paywall');
  assert.equal(getAccessGateRoute('/settings', true, false), '/paywall');
  assert.equal(getAccessGateRoute('/onboarding', true, false), '/paywall');
  assert.equal(getAccessGateRoute('/paywall', true, false), null);
  assert.equal(getAccessGateRoute('/home', true, true), null);
});

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
