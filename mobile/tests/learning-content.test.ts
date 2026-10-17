import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEstimatedLessonMinutes,
  getLearningCategory,
  getLearningLesson,
  getLessonKnowledgeCheck,
  getLessonPracticePrompt,
  LEARNING_CATEGORIES,
  LEARNING_LESSONS,
} from '../data/learningContent';

test('publishes all six populated Learning Hub categories', () => {
  assert.deepEqual(
    LEARNING_CATEGORIES.map((category) => category.id),
    ['fundamentals', 'technical-analysis', 'risk-management', 'fundamental-analysis', 'trading-psychology', 'strategies-practice'],
  );
  for (const category of LEARNING_CATEGORIES) {
    assert.ok(category.title.length > 0);
    assert.ok(category.description.length > 0);
    assert.ok(category.groups.length > 0);
    assert.ok(category.groups.every((group) => group.lessonIds.length > 0), `${category.title} has an empty topic group`);
    const categoryLessonCount = category.groups.reduce((count, group) => count + group.lessonIds.length, 0);
    assert.ok(categoryLessonCount >= 10, `${category.title} should have a substantial learning path`);
  }
});

test('every lesson has real content and belongs to exactly one category group', () => {
  const lessonIds = LEARNING_LESSONS.map((lesson) => lesson.id);
  assert.equal(new Set(lessonIds).size, lessonIds.length, 'lesson identifiers must be unique');

  const groupedIds = LEARNING_CATEGORIES.flatMap((category) => category.groups.flatMap((group) => group.lessonIds));
  assert.equal(new Set(groupedIds).size, groupedIds.length, 'lesson identifiers must appear in one topic group');
  assert.deepEqual([...groupedIds].sort(), [...lessonIds].sort());

  for (const lesson of LEARNING_LESSONS) {
    assert.ok(getLearningCategory(lesson.categoryId), `${lesson.id} has no category`);
    assert.ok(lesson.title.trim().length > 0);
    assert.ok(lesson.shortDescription.trim().length > 0);
    assert.ok(lesson.intro.trim().length > 0);
    assert.ok(lesson.estimatedMinutes > 0);
    assert.equal(lesson.estimatedMinutes, getEstimatedLessonMinutes(lesson), `${lesson.id} has an outdated reading estimate`);
    assert.ok(lesson.sections.length >= 2, `${lesson.id} needs structured article content`);
    assert.ok(lesson.keyTakeaways.length > 0);
    const knowledgeCheck = getLessonKnowledgeCheck(lesson);
    assert.equal(knowledgeCheck.options.filter((option) => option.isCorrect).length, 1);
    assert.equal(new Set(knowledgeCheck.options.map((option) => option.id)).size, knowledgeCheck.options.length);
    assert.ok(getLessonPracticePrompt(lesson).length >= 50, `${lesson.id} needs a practical exercise`);
    const body = lesson.sections.flatMap((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      section.formula ?? '',
    ]).join(' ').trim();
    assert.ok(body.length >= 250, `${lesson.id} is too short to be a complete lesson`);
    for (const relatedId of lesson.relatedLessonIds) {
      assert.ok(getLearningLesson(relatedId), `${lesson.id} refers to missing lesson ${relatedId}`);
    }
  }
});

test('searchable curriculum covers key requested chart, risk, macro, and psychology concepts', () => {
  const searchable = LEARNING_LESSONS.map((lesson) => [
    lesson.title,
    lesson.shortDescription,
    ...lesson.aliases,
    lesson.intro,
    ...lesson.sections.flatMap((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
    ]),
  ].join(' ').toLowerCase()).join('\n');

  for (const concept of [
    'doji',
    'bullish engulfing',
    'bearish engulfing',
    'pin bar',
    'hammer',
    'shooting star',
    'morning star',
    'evening star',
    'inside bar',
    'head and shoulders',
    'double top',
    'double bottom',
    'triple top',
    'ascending triangle',
    'descending triangle',
    'symmetrical triangle',
    'rising wedge',
    'falling wedge',
    'break of structure',
    'change of character',
    'fair value gap',
    'order block',
    'position sizing',
    'risk of ruin',
    'correlation',
    'CPI',
    'PPI',
    'GDP',
    'FOMO',
    'revenge trading',
    'backtesting',
    'demo account',
  ]) {
    assert.ok(searchable.includes(concept.toLowerCase()), `missing searchable concept: ${concept}`);
  }
});
