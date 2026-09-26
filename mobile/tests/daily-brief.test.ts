import assert from 'node:assert/strict';
import test from 'node:test';
import { addBriefRead, CURATED_BRIEFS, getUnreadBriefCount, selectDailyBriefIds } from '../services/dailyBrief';

test('curated daily brief library has enough unique lessons for a 15-brief deck', () => {
  const ids = CURATED_BRIEFS.map((brief) => brief.id);
  assert.ok(CURATED_BRIEFS.length >= 45);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CURATED_BRIEFS.every((brief) => brief.title && brief.body && brief.takeaway));
});

test('daily selection is stable for a date and avoids the prior two decks', () => {
  const yesterday = selectDailyBriefIds('2026-09-25', {});
  const twoDaysAgo = selectDailyBriefIds('2026-09-24', {});
  const assignments = {
    '2026-09-24': twoDaysAgo,
    '2026-09-25': yesterday,
  };
  const today = selectDailyBriefIds('2026-09-26', assignments);
  assert.equal(today.length, 15);
  assert.equal(new Set(today).size, 15);
  assert.deepEqual(today, selectDailyBriefIds('2026-09-26', assignments));
  assert.equal(today.some((id) => yesterday.includes(id) || twoDaysAgo.includes(id)), false);
});

test('read progress deduplicates insights and calculates unread count', () => {
  const firstRead = addBriefRead([], 'psych-01');
  const repeatedRead = addBriefRead(firstRead, 'psych-01');
  assert.deepEqual(repeatedRead, ['psych-01']);
  assert.equal(getUnreadBriefCount(15, repeatedRead), 14);
  assert.equal(getUnreadBriefCount(15, [...repeatedRead, ...Array.from({ length: 14 }, (_, index) => `read-${index}`)]), 0);
});