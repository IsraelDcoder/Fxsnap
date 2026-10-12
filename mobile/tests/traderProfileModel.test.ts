import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFavoriteInstrumentError,
  getProfileCompletion,
  normalizeTraderProfile,
} from '../services/traderProfileModel';

test('normalizes stored trader preferences and drops unsupported values', () => {
  assert.deepEqual(normalizeTraderProfile({
    bio: '  Learning the markets  ',
    experience: 'intermediate',
    markets: ['forex', 'forex', 'unsupported'],
    tradingStyle: 'swing',
    favoriteInstruments: [' eurusd ', 'EURUSD', 'bad code!'],
    isAdmin: true,
  }), {
    bio: 'Learning the markets',
    experience: 'intermediate',
    markets: ['forex'],
    tradingStyle: 'swing',
    favoriteInstruments: ['EURUSD'],
  });
});

test('normalizes malformed or absent persisted preferences to an empty profile', () => {
  assert.deepEqual(normalizeTraderProfile(null), normalizeTraderProfile({}));
  assert.deepEqual(normalizeTraderProfile({
    bio: 42,
    experience: 'expert',
    markets: 'forex',
    tradingStyle: 'position',
    favoriteInstruments: [null],
  }), {
    bio: '',
    experience: '',
    markets: [],
    tradingStyle: '',
    favoriteInstruments: [],
  });
});

test('caps bio and favourite instruments to the supported profile limits', () => {
  const normalized = normalizeTraderProfile({
    bio: 'x'.repeat(180),
    favoriteInstruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD'],
  });
  assert.equal(normalized.bio.length, 160);
  assert.equal(normalized.favoriteInstruments.length, 5);
});

test('profile completion reflects only the four actual public identity fields', () => {
  assert.deepEqual(getProfileCompletion({
    displayName: 'Trader',
    hasPhoto: false,
    username: '',
    bio: 'Learning',
  }), {
    percentage: 50,
    nextField: 'photo',
  });
  assert.deepEqual(getProfileCompletion({
    displayName: ' ',
    hasPhoto: true,
    username: 'fx_user',
    bio: 'Learning',
  }), {
    percentage: 75,
    nextField: 'name',
  });
});

test('validates favourite instrument count and syntax', () => {
  assert.equal(getFavoriteInstrumentError('EURUSD, GBPUSD'), null);
  assert.match(getFavoriteInstrumentError('EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, NZDUSD') || '', /up to five/i);
  assert.match(getFavoriteInstrumentError('EUR USD') || '', /valid instrument codes/i);
});
