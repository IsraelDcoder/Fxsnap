const test = require('node:test');
const assert = require('node:assert/strict');
const { getTradingSessionState } = require('./tradingSessions');

test('identifies the London and New York overlap at 13:00 UTC', () => {
  const state = getTradingSessionState(new Date('2024-01-15T13:00:00Z'));
  assert.equal(state.activeSessions.length, 2);
  assert.deepEqual(state.activeSessions.map((session) => session.name), ['London', 'New York']);
  assert.equal(state.headline, 'London + New York overlap');
  assert.equal(state.isOverlap, true);
});

test('uses a single-session label when only one session is active', () => {
  const state = getTradingSessionState(new Date('2024-01-15T00:00:00Z'));
  assert.equal(state.activeSessions.length, 1);
  assert.equal(state.activeSessions[0].name, 'Tokyo');
  assert.equal(state.headline, 'Tokyo session active');
  assert.equal(state.isOverlap, false);
});
