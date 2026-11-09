import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isDiscountedFirstYearPrice, isYearlyExitOfferOption } = require('../services/exitOffer.ts');

test('yearly exit offer matches the configured Google Play offer ID formats', () => {
  assert.equal(isYearlyExitOfferOption('yearly:yearly-exit-20off'), true);
  assert.equal(isYearlyExitOfferOption('fxsnap_premium_yearly:yearly-exit-20off'), true);
  assert.equal(isYearlyExitOfferOption('yearly:inactive-exit-offer'), false);
});

test('yearly exit offer accepts a valid localized first-year discount', () => {
  assert.equal(isDiscountedFirstYearPrice({
    formatted: '€79.99',
    amountMicros: 79_990_000,
  }, 99.99), true);
});

test('yearly exit offer rejects a full-price or invalid first-year phase', () => {
  assert.equal(isDiscountedFirstYearPrice({
    formatted: '$10.00',
    amountMicros: 10_000_000,
  }, 10), false);
  assert.equal(isDiscountedFirstYearPrice({
    formatted: '$8.00',
    amountMicros: Number.NaN,
  }, 10), false);
  assert.equal(isDiscountedFirstYearPrice(undefined, 10), false);
});
