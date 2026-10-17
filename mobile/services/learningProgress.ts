import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyAccountDataChanged } from '@/services/accountDataEvents';

export const LEARNING_PROGRESS_KEY = 'fxsnap:learningHub:v1';
const MAX_RECENT_LESSONS = 8;

export interface LearningProgress {
  lastOpenedLessonId: string | null;
  recentLessonIds: string[];
  bookmarkedLessonIds: string[];
  completedLessonIds: string[];
  lessonPositions: Record<string, number>;
  stepPositions: Record<string, number>;
  lastCompletionDate: string | null;
  streakCount: number;
}

const emptyProgress: LearningProgress = {
  lastOpenedLessonId: null,
  recentLessonIds: [],
  bookmarkedLessonIds: [],
  completedLessonIds: [],
  lessonPositions: {},
  stepPositions: {},
  lastCompletionDate: null,
  streakCount: 0,
};

let writeQueue: Promise<void> = Promise.resolve();

function normalizeProgress(value: unknown): LearningProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved Learning Hub progress is invalid. Clear the Learning Hub data and try again.');
  }
  const data = value as Record<string, unknown>;
  const stringList = (list: unknown) => Array.isArray(list)
    ? [...new Set(list.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];
  const normalizePositions = (value: unknown) => {
    const rawPositions = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return Object.fromEntries(
      Object.entries(rawPositions)
        .filter(([, position]) => typeof position === 'number' && Number.isFinite(position) && position >= 0)
        .map(([id, position]) => [id, Math.floor(position as number)]),
    );
  };
  return {
    lastOpenedLessonId: typeof data.lastOpenedLessonId === 'string' ? data.lastOpenedLessonId : null,
    recentLessonIds: stringList(data.recentLessonIds).slice(0, MAX_RECENT_LESSONS),
    bookmarkedLessonIds: stringList(data.bookmarkedLessonIds),
    completedLessonIds: stringList(data.completedLessonIds),
    lessonPositions: normalizePositions(data.lessonPositions),
    stepPositions: normalizePositions(data.stepPositions),
    lastCompletionDate: typeof data.lastCompletionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.lastCompletionDate)
      ? data.lastCompletionDate
      : null,
    streakCount: typeof data.streakCount === 'number' && Number.isInteger(data.streakCount) && data.streakCount >= 0
      ? data.streakCount
      : 0,
  };
}

export async function getLearningProgress(): Promise<LearningProgress> {
  const stored = await AsyncStorage.getItem(LEARNING_PROGRESS_KEY);
  if (stored == null) return emptyProgress;
  try {
    return normalizeProgress(JSON.parse(stored));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Saved Learning Hub progress could not be read. Clear the Learning Hub data and try again.');
    }
    throw error;
  }
}

export function getCurrentLearningStreak(
  progress: Pick<LearningProgress, 'lastCompletionDate' | 'streakCount'>,
  now = new Date(),
) {
  if (!progress.lastCompletionDate || progress.streakCount < 1) return 0;
  const today = localDateKey(now);
  const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  return progress.lastCompletionDate === today || progress.lastCompletionDate === yesterday
    ? progress.streakCount
    : 0;
}

function updateLearningProgress(
  update: (progress: LearningProgress) => LearningProgress,
): Promise<LearningProgress> {
  const operation = writeQueue.then(async () => {
    const current = await getLearningProgress();
    const next = normalizeProgress(update(current));
    await AsyncStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(next));
    notifyAccountDataChanged();
    return next;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function recordLessonOpened(lessonId: string) {
  return updateLearningProgress((progress) => ({
    ...progress,
    lastOpenedLessonId: lessonId,
    recentLessonIds: [lessonId, ...progress.recentLessonIds.filter((id) => id !== lessonId)].slice(0, MAX_RECENT_LESSONS),
  }));
}

export function saveLessonPosition(lessonId: string, position: number) {
  if (!Number.isFinite(position) || position < 0) {
    return Promise.reject(new Error('Lesson reading position must be a non-negative number.'));
  }
  return updateLearningProgress((progress) => ({
    ...progress,
    lessonPositions: { ...progress.lessonPositions, [lessonId]: Math.floor(position) },
  }));
}

export function saveLessonStepPosition(lessonId: string, position: number) {
  if (!Number.isInteger(position) || position < 0) {
    return Promise.reject(new Error('Lesson step position must be a non-negative integer.'));
  }
  return updateLearningProgress((progress) => ({
    ...progress,
    stepPositions: { ...progress.stepPositions, [lessonId]: position },
  }));
}

export function toggleLessonBookmark(lessonId: string) {
  return updateLearningProgress((progress) => ({
    ...progress,
    bookmarkedLessonIds: progress.bookmarkedLessonIds.includes(lessonId)
      ? progress.bookmarkedLessonIds.filter((id) => id !== lessonId)
      : [...progress.bookmarkedLessonIds, lessonId],
  }));
}

export function markLessonCompleted(lessonId: string) {
  return updateLearningProgress((progress) => {
    if (progress.completedLessonIds.includes(lessonId)) return progress;
    const today = localDateKey(new Date());
    const yesterday = localDateKey(new Date(new Date().setDate(new Date().getDate() - 1)));
    const streakCount = progress.lastCompletionDate === today
      ? progress.streakCount
      : progress.lastCompletionDate === yesterday
        ? progress.streakCount + 1
        : 1;
    return {
      ...progress,
      completedLessonIds: [...progress.completedLessonIds, lessonId],
      lessonPositions: { ...progress.lessonPositions, [lessonId]: 0 },
      stepPositions: { ...progress.stepPositions, [lessonId]: 0 },
      lastCompletionDate: today,
      streakCount,
    };
  });
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
