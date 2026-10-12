import assert from 'node:assert/strict';
import test from 'node:test';
import { getTradingSessionState } from '../services/tradingSessions';

function activeNames(isoDate: string) {
  return getTradingSessionState(new Date(isoDate)).activeSessions.map((session) => session.name);
}

test('session status follows local session hours through winter and summer DST', () => {
  assert.ok(activeNames('2026-01-12T08:30:00.000Z').includes('London'));
  assert.ok(activeNames('2026-07-13T07:30:00.000Z').includes('London'));
  assert.ok(activeNames('2026-01-12T13:30:00.000Z').includes('New York'));
  assert.ok(activeNames('2026-07-13T12:30:00.000Z').includes('New York'));
});

test('session status closes outside local hours and on weekends', () => {
  assert.ok(!activeNames('2026-01-12T07:59:00.000Z').includes('London'));
  assert.ok(!activeNames('2026-01-12T17:00:00.000Z').includes('London'));
  assert.deepEqual(activeNames('2026-01-10T12:00:00.000Z'), []);
});

test('session status follows Tokyo and Sydney local market hours', () => {
  assert.ok(activeNames('2026-01-12T01:00:00.000Z').includes('Tokyo'));
  assert.ok(activeNames('2026-01-12T05:00:00.000Z').includes('Sydney'));
});
