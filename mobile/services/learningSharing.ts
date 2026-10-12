import { Alert, Platform, Share } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { trackEvent } from '@/services/telemetry';
import { GOOGLE_PLAY_RATING_URL } from '@/services/ratingPrompt';

export interface ShareableLearningLesson {
  id: string;
  title: string;
  shortDescription: string;
  categoryId: string;
}

export function getLearningLessonUrl(lessonId: string) {
  return Linking.createURL(`learning-lesson/${encodeURIComponent(lessonId)}`);
}

export async function shareLearningLesson(lesson: ShareableLearningLesson): Promise<boolean> {
  const lessonUrl = getLearningLessonUrl(lesson.id);
  const message = [
    `Learn ${lesson.title} with FXSnap.`,
    lesson.shortDescription,
    'Explore this lesson and more trading concepts in the FXSnap Learning Hub.',
    `Open this lesson in FXSnap: ${lessonUrl}`,
    ...(Platform.OS === 'android' ? [`Get FXSnap on Google Play: ${GOOGLE_PLAY_RATING_URL}`] : []),
  ].join('\n\n');

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: lesson.title, text: message, url: lessonUrl });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return false;
        throw error;
      }
    } else {
      await Clipboard.setStringAsync(message);
      Alert.alert('Lesson link copied', 'Share the copied FXSnap lesson link with a friend.');
    }
  } else {
    const result = await Share.share({
      title: lesson.title,
      message,
      url: lessonUrl,
    });
    if (result.action !== Share.sharedAction) return false;
  }

  trackEvent('learning_lesson_shared', {
    lessonId: lesson.id,
    categoryId: lesson.categoryId,
    platform: Platform.OS,
  });
  return true;
}
