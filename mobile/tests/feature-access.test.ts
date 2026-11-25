import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccessGateRoute, getFeatureAccessDecision, shouldGuardFeatureRoute } from '../services/featureAccess';

test('users must complete onboarding before reaching app routes', () => {
  assert.equal(getAccessGateRoute('/', false, false), null);
  assert.equal(getAccessGateRoute('/onboarding', false, false), null);
  assert.equal(getAccessGateRoute('/analysis', false, false), '/onboarding');
  assert.equal(getAccessGateRoute('/paywall', false, false), null);
  assert.equal(getAccessGateRoute('/exit-offer', false, false), null);
  assert.equal(getAccessGateRoute('/home', true, false), null);
  assert.equal(getAccessGateRoute('/home', true, false, true), null);
  assert.equal(getAccessGateRoute('/(tabs)/home', true, false, true), null);
  assert.equal(getAccessGateRoute('/analysis', true, false, true), null);
  assert.equal(getAccessGateRoute('/settings', true, false, true), null);
  assert.equal(getAccessGateRoute('/exit-offer', true, false), null);
  assert.equal(getAccessGateRoute('/community', true, false), '/paywall');
  assert.equal(getAccessGateRoute('/community', true, true), null);
  assert.equal(getAccessGateRoute('/settings', true, false), null);
  assert.equal(getAccessGateRoute('/onboarding', true, false), null);
  assert.equal(getAccessGateRoute('/paywall', true, false), null);
  assert.equal(getAccessGateRoute('/home', true, true), null);
});

test('free users are gated from premium features and Community', () => {
  assert.equal(shouldGuardFeatureRoute('/analysis', false), true);
  assert.equal(shouldGuardFeatureRoute('/analysis', true), false);
  assert.equal(shouldGuardFeatureRoute('/strategy', false), true);
  assert.equal(shouldGuardFeatureRoute('/strategy', true), false);
  [
    '/community',
    '/community-search',
    '/community-notifications',
    '/(tabs)/community',
  ].forEach((route) => assert.equal(shouldGuardFeatureRoute(route, false), true, route));
  assert.equal(shouldGuardFeatureRoute('/community', true), false);
});

test('chart analysis, trade setup, and strategy generation require subscription access', () => {
  assert.equal(getFeatureAccessDecision('AI_ANALYSIS', false).requiresPaywall, true);
  assert.equal(getFeatureAccessDecision('TRADE_SETUP', false).requiresPaywall, true);
  assert.equal(getFeatureAccessDecision('STRATEGY_GENERATOR', false).requiresPaywall, true);
  assert.equal(getFeatureAccessDecision('COMMUNITY', false).allowed, false);
  assert.equal(getFeatureAccessDecision('COMMUNITY', true).allowed, true);
});

test('other app features remain accessible to free users', () => {
  [
    '/',
    '/home',
    '/(tabs)/home',
    '/settings',
    '/profile',
    '/support-chat',
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
