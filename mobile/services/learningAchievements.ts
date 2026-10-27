import { getLearningJourneyLessons } from './learningJourney';
import { getCurrentLearningStreak, type LearningProgress } from './learningProgress';

export interface LearningAchievement {
  id: string;
  title: string;
  description: string;
  icon: 'book-open' | 'award' | 'zap' | 'flag' | 'trending-up';
}

const ACHIEVEMENTS: LearningAchievement[] = [
  { id: 'first-lesson', title: 'First lesson', description: 'Completed your first lesson.', icon: 'book-open' },
  { id: 'five-lessons', title: 'Knowledge builder', description: 'Completed 5 lessons.', icon: 'award' },
  { id: 'ten-lessons', title: 'Dedicated learner', description: 'Completed 10 lessons.', icon: 'zap' },
  { id: 'three-day-streak', title: 'Three-day streak', description: 'Learned on 3 consecutive days.', icon: 'trending-up' },
  { id: 'curriculum-complete', title: 'Curriculum complete', description: 'Completed every lesson in the learning journey.', icon: 'flag' },
];

export function getLearningAchievements(
  progress: Pick<LearningProgress, 'completedLessonIds' | 'lastCompletionDate' | 'streakCount'>,
  now = new Date(),
) {
  const journeyLessonIds = new Set(getLearningJourneyLessons().map((lesson) => lesson.id));
  const completedLessonIds = new Set(progress.completedLessonIds.filter((id) => journeyLessonIds.has(id)));
  const completedCount = completedLessonIds.size;
  const currentStreak = getCurrentLearningStreak(progress, now);
  const earnedIds = new Set<string>();

  if (completedCount >= 1) earnedIds.add('first-lesson');
  if (completedCount >= 5) earnedIds.add('five-lessons');
  if (completedCount >= 10) earnedIds.add('ten-lessons');
  if (currentStreak >= 3) earnedIds.add('three-day-streak');
  if (journeyLessonIds.size > 0 && completedCount === journeyLessonIds.size) earnedIds.add('curriculum-complete');

  return {
    completedCount,
    currentStreak,
    earned: ACHIEVEMENTS.filter((achievement) => earnedIds.has(achievement.id)),
  };
}
