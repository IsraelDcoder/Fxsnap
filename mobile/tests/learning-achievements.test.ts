import assert from 'node:assert/strict';
import test from 'node:test';
import { getLearningJourneyLessons } from '../services/learningJourney';
import { getLearningAchievements } from '../services/learningAchievements';

const today = new Date(2026, 9, 27, 12);
const todayKey = '2026-10-27';
const journey = getLearningJourneyLessons();

test('learning achievements are granted from unique completed curriculum lessons', () => {
  const result = getLearningAchievements({
    completedLessonIds: [journey[0].id, journey[1].id, journey[0].id, 'unknown-lesson'],
    lastCompletionDate: todayKey,
    streakCount: 1,
  }, today);

  assert.equal(result.completedCount, 2);
  assert.deepEqual(result.earned.map((achievement) => achievement.id), ['first-lesson']);
});

test('lesson count and current streak milestones unlock only at their thresholds', () => {
  const fiveLessons = getLearningAchievements({
    completedLessonIds: journey.slice(0, 5).map((lesson) => lesson.id),
    lastCompletionDate: todayKey,
    streakCount: 2,
  }, today);
  assert.deepEqual(fiveLessons.earned.map((achievement) => achievement.id), ['first-lesson', 'five-lessons']);

  const tenLessonsAndStreak = getLearningAchievements({
    completedLessonIds: journey.slice(0, 10).map((lesson) => lesson.id),
    lastCompletionDate: todayKey,
    streakCount: 3,
  }, today);
  assert.deepEqual(tenLessonsAndStreak.earned.map((achievement) => achievement.id), [
    'first-lesson',
    'five-lessons',
    'ten-lessons',
    'three-day-streak',
  ]);
});

test('curriculum completion badge requires every journey lesson', () => {
  const completed = getLearningAchievements({
    completedLessonIds: journey.map((lesson) => lesson.id),
    lastCompletionDate: todayKey,
    streakCount: 1,
  }, today);
  assert.equal(completed.earned.at(-1)?.id, 'curriculum-complete');

  const incomplete = getLearningAchievements({
    completedLessonIds: journey.slice(0, -1).map((lesson) => lesson.id),
    lastCompletionDate: todayKey,
    streakCount: 1,
  }, today);
  assert.equal(incomplete.earned.some((achievement) => achievement.id === 'curriculum-complete'), false);
});
