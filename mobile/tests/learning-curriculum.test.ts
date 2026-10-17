import assert from 'node:assert/strict';
import test from 'node:test';
import { LEARNING_CURRICULUM, getCurrentLearningLevel, getLearningLessonSteps, getLearningLevelForLesson, getLearningLevelProgress, isLearningLevelUnlocked, validateLearningCurriculum } from '../data/learningCurriculum';
import { LEARNING_LESSONS } from '../data/learningContent';

test('defines twenty non-empty curriculum levels and maps every authored lesson once', () => {
  validateLearningCurriculum();
  assert.equal(LEARNING_CURRICULUM.length, 20);
  assert.deepEqual(LEARNING_CURRICULUM.map((level) => level.number), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.ok(LEARNING_CURRICULUM.every((level) => level.units.length > 0 && level.units.every((unit) => unit.lessonIds.length > 0)));
  const mappedLessons = LEARNING_CURRICULUM.flatMap((level) => level.units.flatMap((unit) => unit.lessonIds));
  assert.equal(mappedLessons.length, LEARNING_LESSONS.length);
  assert.equal(new Set(mappedLessons).size, LEARNING_LESSONS.length);
});

test('curriculum progression unlocks only after all mapped lessons in preceding levels are complete', () => {
  const firstLevel = LEARNING_CURRICULUM[0];
  const secondLevel = LEARNING_CURRICULUM[1];
  assert.ok(firstLevel);
  assert.ok(secondLevel);
  assert.equal(isLearningLevelUnlocked(firstLevel.id, []), true);
  assert.equal(isLearningLevelUnlocked(secondLevel.id, []), false);
  const firstLevelLessons = firstLevel.units.flatMap((unit) => unit.lessonIds);
  assert.equal(isLearningLevelUnlocked(secondLevel.id, firstLevelLessons), true);
  assert.equal(getLearningLevelProgress(firstLevel, firstLevelLessons).isComplete, true);
  assert.equal(getCurrentLearningLevel(firstLevelLessons)?.id, secondLevel.id);
  assert.equal(isLearningLevelUnlocked('missing-level', firstLevelLessons), false);
});

test('maps each lesson to its curriculum level without altering lesson content', () => {
  for (const lesson of LEARNING_LESSONS) {
    assert.ok(getLearningLevelForLesson(lesson.id));
  }
  assert.equal(getLearningLevelForLesson('unknown-lesson'), undefined);
});

test('every existing lesson receives a required knowledge check before practice', () => {
  for (const lesson of LEARNING_LESSONS) {
    const steps = getLearningLessonSteps(lesson);
    const checks = steps.filter((step) => step.type === 'check');
    assert.equal(checks.length, 1, `${lesson.id} must have one knowledge check`);
    const checkIndex = steps.findIndex((step) => step.type === 'check');
    const practiceIndex = steps.findIndex((step) => step.type === 'practice');
    assert.ok(practiceIndex < 0 || checkIndex < practiceIndex, `${lesson.id} check must come before practice`);
    const check = checks[0];
    assert.ok(check);
    if (check.type === 'check') {
      assert.equal(check.options.length, 2);
      assert.ok(check.feedback.length > 0);
      assert.equal(check.options[check.correctIndex], lesson.keyTakeaways[0]);
    }
  }
  assert.ok(new Set(LEARNING_LESSONS.map((lesson) => getLearningLessonSteps(lesson)
    .find((step) => step.type === 'check')?.type === 'check'
      ? getLearningLessonSteps(lesson).find((step) => step.type === 'check')?.correctIndex
      : -1)).size > 1, 'correct answers should not always appear in the same position');
});
