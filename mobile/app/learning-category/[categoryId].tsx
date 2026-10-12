import React, { useCallback, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import { getEstimatedLessonMinutes, getLearningCategory, getLearningLesson } from '@/data/learningContent';
import { getLearningProgress, type LearningProgress } from '@/services/learningProgress';

export default function LearningCategoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const category = getLearningCategory(categoryId);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getLearningProgress()
      .then((value) => {
        if (!active) return;
        setProgress(value);
        setProgressError(null);
      })
      .catch((error: unknown) => {
        if (active) setProgressError(error instanceof Error ? error.message : 'Learning progress could not be loaded.');
      });
    return () => { active = false; };
  }, []));

  if (!category) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Topic not found</Text>
        <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Back to Learning Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const allLessonIds = category.groups.flatMap((group) => group.lessonIds);
  const completedCount = allLessonIds.filter((id) => progress?.completedLessonIds.includes(id)).length;
  const openLesson = (lessonId: string) => {
    router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
      <AmbientBackdrop />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to Learning Hub"
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerLabel, { color: colors.buy }]}>LEARNING HUB</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 30 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.categoryIcon, { backgroundColor: colors.surface }]}>
            <Feather name={category.icon as React.ComponentProps<typeof Feather>['name']} size={22} color={colors.buy} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{category.title}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{category.description}</Text>
          <Text style={[styles.progressLabel, { color: colors.buy }]}>
            {allLessonIds.length} lessons · {completedCount} completed
          </Text>
          {allLessonIds.length > 0 && (
            <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.buy, width: `${Math.round((completedCount / allLessonIds.length) * 100)}%` }]} />
            </View>
          )}
        </View>

        {progressError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.sell }]}>
            <Feather name="alert-circle" size={16} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.text }]}>{progressError}</Text>
          </View>
        ) : null}

        {category.groups.map((group, groupIndex) => {
          const lessons = group.lessonIds
            .map(getLearningLesson)
            .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
          if (lessons.length === 0) return null;
          return (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeading}>
                <View style={[styles.groupNumber, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.groupNumberText, { color: colors.buy }]}>{String(groupIndex + 1).padStart(2, '0')}</Text>
                </View>
                <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
              </View>
              {lessons.map((lesson, lessonIndex) => {
                const isComplete = progress?.completedLessonIds.includes(lesson.id) ?? false;
                const isStarted = progress?.recentLessonIds.includes(lesson.id) ?? false;
                return (
                  <TouchableOpacity
                    key={lesson.id}
                    onPress={() => openLesson(lesson.id)}
                    style={[styles.lessonCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  >
                    <View style={[styles.lessonIndex, { backgroundColor: colors.surface }]}>
                      {isComplete
                        ? <Feather name="check" size={15} color={colors.buy} />
                        : <Text style={[styles.lessonIndexText, { color: colors.textSecondary }]}>{lessonIndex + 1}</Text>}
                    </View>
                    <View style={styles.lessonCopy}>
                      <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
                      <Text style={[styles.lessonDescription, { color: colors.textSecondary }]} numberOfLines={2}>{lesson.shortDescription}</Text>
                      <Text style={[styles.lessonMeta, { color: colors.textMuted }]}>
                        {lesson.difficulty} · {getEstimatedLessonMinutes(lesson)} min lesson{isStarted && !isComplete ? ' · In progress' : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.allTopicsButton, { backgroundColor: colors.surface }]}>
          <Feather name="grid" size={16} color={colors.textSecondary} />
          <Text style={[styles.allTopicsText, { color: colors.text }]}>Explore all learning topics</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  unavailable: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 18 },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  hero: { padding: 15, borderRadius: 21, borderWidth: 1 },
  categoryIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  description: { marginTop: 7, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  progressLabel: { marginTop: 11, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { marginTop: 8, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  errorCard: { marginTop: 14, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  group: { marginTop: 20 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  groupNumber: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupNumberText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  groupTitle: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  lessonCard: { minHeight: 83, padding: 12, borderWidth: 1, borderRadius: 15, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  lessonIndex: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lessonIndexText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  lessonCopy: { flex: 1, gap: 3 },
  lessonTitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  lessonDescription: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  lessonMeta: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  allTopicsButton: { minHeight: 45, marginTop: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  allTopicsText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  actionButton: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13 },
  actionText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
