import { getLearningLesson } from '@/data/learningContent';
import { getLearningLevelForLesson, isLearningLevelUnlocked, LEARNING_CURRICULUM } from '@/data/learningCurriculum';

export const UNLOCK_MODE: 'journey' | 'free' = 'journey';

export const LEARNING_PATH_ACCENTS = ['#087F70', '#D58B1F', '#E47763', '#8A63C7', '#5964C8', '#4799CF'] as const;
export const LEARNING_PATH_BADGES = [
  'Beginner',
  'Beginner → Intermediate',
  'Intermediate',
  'Intermediate → Advanced',
  'Advanced',
  'Advanced',
] as const;

export function getLearningPathAppearance(index: number) {
  const paletteIndex = ((index % LEARNING_PATH_ACCENTS.length) + LEARNING_PATH_ACCENTS.length) % LEARNING_PATH_ACCENTS.length;
  return {
    accent: LEARNING_PATH_ACCENTS[paletteIndex],
    badge: LEARNING_PATH_BADGES[paletteIndex],
  };
}

export function getLearningJourneyLessons() {
  return LEARNING_CURRICULUM.flatMap((level) => level.units.flatMap((unit) => (
    unit.lessonIds.map(getLearningLesson).filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson))
  )));
}

export function getLearningPathLessons(categoryId: string) {
  return getLearningJourneyLessons().filter((lesson) => lesson.categoryId === categoryId);
}

export function isLearningLessonUnlocked(lessonId: string, completedLessonIds: string[]) {
  if (UNLOCK_MODE === 'free') return true;
  if (completedLessonIds.includes(lessonId)) return true;
  const level = getLearningLevelForLesson(lessonId);
  if (!level || !isLearningLevelUnlocked(level.id, completedLessonIds)) return false;
  return areLearningPredecessorsComplete(lessonId, completedLessonIds);
}

function areLearningPredecessorsComplete(lessonId: string, completedLessonIds: string[]) {
  const journey = getLearningJourneyLessons();
  const lessonIndex = journey.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex < 0) return false;
  const completed = new Set(completedLessonIds);
  return journey.slice(0, lessonIndex).every((lesson) => completed.has(lesson.id));
}

export function isLearningPathUnlocked(categoryId: string, completedLessonIds: string[]) {
  if (UNLOCK_MODE === 'free') return true;
  const lessons = getLearningPathLessons(categoryId);
  return lessons.length > 0 && areLearningPredecessorsComplete(lessons[0].id, completedLessonIds);
}

export function getCurrentLearningLesson(completedLessonIds: string[]) {
  return getLearningJourneyLessons().find((lesson) => !completedLessonIds.includes(lesson.id));
}

export function getNextLearningLesson(lessonId: string) {
  const journey = getLearningJourneyLessons();
  const lessonIndex = journey.findIndex((lesson) => lesson.id === lessonId);
  return lessonIndex >= 0 ? journey[lessonIndex + 1] : undefined;
}

export function getLearningLessonPosition(lessonId: string) {
  const lesson = getLearningJourneyLessons().find((item) => item.id === lessonId);
  if (!lesson) return { index: -1, total: 0 };
  const lessons = getLearningPathLessons(lesson.categoryId);
  return { index: lessons.findIndex((item) => item.id === lessonId) + 1, total: lessons.length };
}
