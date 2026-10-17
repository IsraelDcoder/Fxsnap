import assert from 'node:assert/strict';
import test from 'node:test';
import { LEARNING_CATEGORIES } from '../data/learningContent';
import { LEARNING_CURRICULUM } from '../data/learningCurriculum';
import {
  getLearningJourneyLessons,
  getLearningPathLessons,
  isLearningLessonUnlocked,
  isLearningPathUnlocked,
  UNLOCK_MODE,
} from '../services/learningJourney';
import { getCurrentLearningStreak } from '../services/learningProgress';

const journey = getLearningJourneyLessons();

test('uses curriculum category and lesson order for the journey', () => {
  assert.deepEqual(
    journey.map((lesson) => lesson.id),
    LEARNING_CURRICULUM.flatMap((level) => level.units.flatMap((unit) => unit.lessonIds)),
  );
});

test('journey mode unlocks a lesson only after its predecessors are complete', () => {
  assert.equal(UNLOCK_MODE, 'journey');
  assert.equal(isLearningLessonUnlocked(journey[0].id, []), true);
  assert.equal(isLearningLessonUnlocked(journey[1].id, []), false);
  assert.equal(isLearningLessonUnlocked(journey[1].id, [journey[0].id]), true);
  assert.equal(isLearningLessonUnlocked('unknown-lesson', []), false);
});

test('completed lessons remain available for review and later paths stay locked', () => {
  const laterLesson = journey[1];
  const laterPath = LEARNING_CATEGORIES[1];
  const firstLessonInLaterPath = getLearningPathLessons(laterPath.id)[0];
  assert.ok(laterPath);
  assert.ok(firstLessonInLaterPath);

  assert.equal(isLearningLessonUnlocked(laterLesson.id, [laterLesson.id]), true);
  assert.equal(isLearningPathUnlocked(laterPath.id, [laterLesson.id]), false);
  assert.equal(isLearningPathUnlocked(laterPath.id, [firstLessonInLaterPath.id]), false);
  const precedingLessons = journey.slice(0, journey.findIndex((lesson) => lesson.id === firstLessonInLaterPath.id));
  assert.equal(isLearningPathUnlocked(laterPath.id, precedingLessons.map((lesson) => lesson.id)), true);
});

test('path lessons follow their existing grouped lesson order', () => {
  const category = LEARNING_CATEGORIES[0];
  assert.deepEqual(
    getLearningPathLessons(category.id).map((lesson) => lesson.id),
    journey.filter((lesson) => lesson.categoryId === category.id).map((lesson) => lesson.id),
  );
});

test('current streak includes today or yesterday and expires after a missed day', () => {
  const today = new Date(2025, 5, 15, 12);
  const key = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  assert.equal(getCurrentLearningStreak({ lastCompletionDate: key(today), streakCount: 4 }, today), 4);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12);
  assert.equal(getCurrentLearningStreak({ lastCompletionDate: key(yesterday), streakCount: 4 }, today), 4);
  const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 12);
  assert.equal(getCurrentLearningStreak({ lastCompletionDate: key(twoDaysAgo), streakCount: 4 }, today), 0);
});
