import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import { getLearningLesson, LEARNING_CATEGORIES, LEARNING_LESSONS } from '@/data/learningContent';
import { getLearningProgress, type LearningProgress } from '@/services/learningProgress';

export default function LearningHubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setIsLoading(true);
    void getLearningProgress()
      .then((value) => {
        if (!active) return;
        setProgress(value);
        setProgressError(null);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProgressError(error instanceof Error ? error.message : 'Learning progress could not be loaded.');
        setIsLoading(false);
      });
    return () => { active = false; };
  }, []));

  const normalizedQuery = query.trim().toLowerCase();
  const matchingLessons = useMemo(() => normalizedQuery
    ? LEARNING_LESSONS.filter((lesson) => [
      lesson.title,
      lesson.shortDescription,
      lesson.intro,
      ...lesson.aliases,
      ...lesson.sections.flatMap((section) => [
        section.heading,
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
        section.formula ?? '',
      ]),
    ].join(' ').toLowerCase().includes(normalizedQuery))
    : [], [normalizedQuery]);

  const continueLesson = progress
    ? [progress.lastOpenedLessonId, ...progress.recentLessonIds]
      .filter((id): id is string => Boolean(id))
      .map(getLearningLesson)
      .find((lesson) => lesson && !progress.completedLessonIds.includes(lesson.id))
    : undefined;
  const bookmarkedLessons = (progress?.bookmarkedLessonIds ?? [])
    .map(getLearningLesson)
    .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
  const completedCount = progress?.completedLessonIds.length ?? 0;

  const openLesson = (lessonId: string) => {
    router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
      <AmbientBackdrop />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          onPress={() => router.replace('/(tabs)/home')}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerEyebrow, { color: colors.buy }]}>FXSNAP EDUCATION</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Learning Hub</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Master the markets, one concept at a time.</Text>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search trading concepts"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            accessibilityLabel="Search learning lessons"
          />
          {query.length > 0 && (
            <TouchableOpacity accessibilityLabel="Clear search" onPress={() => setQuery('')}>
              <Feather name="x-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {progressError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.sell }]}>
            <Feather name="alert-circle" size={17} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.text }]}>{progressError}</Text>
          </View>
        ) : null}

        {normalizedQuery ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Search results</Text>
            {matchingLessons.map((lesson) => {
              const category = LEARNING_CATEGORIES.find((item) => item.id === lesson.categoryId);
              return (
                <TouchableOpacity
                  key={lesson.id}
                  onPress={() => openLesson(lesson.id)}
                  style={[styles.lessonRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <View style={styles.lessonRowCopy}>
                    <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
                    <Text style={[styles.lessonMeta, { color: colors.buy }]}>{category?.title ?? 'Learning Hub'}</Text>
                    <Text style={[styles.lessonDescription, { color: colors.textSecondary }]} numberOfLines={2}>{lesson.shortDescription}</Text>
                  </View>
                  <Feather name="chevron-right" size={19} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
            {matchingLessons.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="search" size={21} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No lessons found. Try another term or abbreviation.</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={[styles.featuredCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={[styles.featuredIcon, { backgroundColor: colors.surface }]}>
                <Feather name="book-open" size={22} color={colors.buy} />
              </View>
              <Text style={[styles.featuredEyebrow, { color: colors.buy }]}>LEARN AT YOUR PACE</Text>
              <Text style={[styles.featuredTitle, { color: colors.text }]}>Build a stronger trading foundation.</Text>
              <Text style={[styles.featuredBody, { color: colors.textSecondary }]}>
                Clear, structured lessons help you understand charts, manage risk, and make more considered decisions.
              </Text>
              <Text style={[styles.disclaimer, { color: colors.textMuted }]}>For education only. Trading involves risk; no outcome is guaranteed.</Text>
            </View>

            {!isLoading && continueLesson ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Continue learning</Text>
                <TouchableOpacity
                  onPress={() => openLesson(continueLesson.id)}
                  style={[styles.continueCard, { backgroundColor: colors.segmentBackground, borderColor: colors.buy }]}
                >
                  <View style={[styles.continueIcon, { backgroundColor: colors.card }]}>
                    <Feather name="play" size={17} color={colors.buy} />
                  </View>
                  <View style={styles.continueCopy}>
                    <Text style={[styles.lessonTitle, { color: colors.text }]}>{continueLesson.title}</Text>
                    <Text style={[styles.lessonDescription, { color: colors.textSecondary }]} numberOfLines={2}>{continueLesson.shortDescription}</Text>
                  </View>
                  <Feather name="arrow-up-right" size={18} color={colors.buy} />
                </TouchableOpacity>
              </View>
            ) : null}

            {bookmarkedLessons.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Bookmarked lessons</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalLessons}>
                  {bookmarkedLessons.map((lesson) => (
                    <TouchableOpacity
                      key={lesson.id}
                      onPress={() => openLesson(lesson.id)}
                      style={[styles.bookmarkCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    >
                      <Feather name="bookmark" size={15} color={colors.buy} />
                      <Text style={[styles.lessonTitle, { color: colors.text }]} numberOfLines={2}>{lesson.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Explore topics</Text>
                <Text style={[styles.lessonDescription, { color: colors.textSecondary }]}>Six focused paths, from the basics to deliberate practice.</Text>
              </View>
              {isLoading
                ? <ActivityIndicator size="small" color={colors.buy} />
                : <Text style={[styles.completionCount, { color: colors.buy }]}>{completedCount} completed</Text>}
            </View>

            <View style={styles.categoryList}>
              {LEARNING_CATEGORIES.map((category) => {
                const lessonCount = LEARNING_LESSONS.filter((lesson) => lesson.categoryId === category.id).length;
                const categoryCompleted = (progress?.completedLessonIds ?? []).filter((id) => (
                  getLearningLesson(id)?.categoryId === category.id
                )).length;
                return (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => router.push({ pathname: '/learning-category/[categoryId]', params: { categoryId: category.id } })}
                    style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  >
                    <View style={[styles.categoryIcon, { backgroundColor: colors.surface }]}>
                      <Feather name={category.icon as React.ComponentProps<typeof Feather>['name']} size={19} color={colors.buy} />
                    </View>
                    <View style={styles.categoryCopy}>
                      <Text style={[styles.categoryTitle, { color: colors.text }]}>{category.title}</Text>
                      <Text style={[styles.categoryDescription, { color: colors.textSecondary }]} numberOfLines={2}>{category.description}</Text>
                      <Text style={[styles.categoryCount, { color: colors.textMuted }]}>
                        {lessonCount} lessons{categoryCompleted > 0 ? ` · ${categoryCompleted} completed` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={19} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {!isLoading && !continueLesson && (
              <Text style={[styles.newUserHint, { color: colors.textSecondary }]}>
                New here? Choose a topic above and start with its first lesson.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  headerSpacer: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32 },
  title: { fontSize: 27, lineHeight: 33, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  subtitle: { marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: 'Inter_400Regular' },
  errorCard: { marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 9, alignItems: 'center' },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  featuredCard: { marginTop: 16, padding: 15, borderRadius: 21, borderWidth: 1, overflow: 'hidden' },
  featuredIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  featuredEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 },
  featuredTitle: { marginTop: 6, fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  featuredBody: { marginTop: 7, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  disclaimer: { marginTop: 12, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  section: { marginTop: 19 },
  sectionHeader: { marginTop: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  completionCount: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  continueCard: { padding: 13, borderWidth: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 12 },
  continueIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  continueCopy: { flex: 1, gap: 4 },
  lessonRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  lessonRowCopy: { flex: 1, gap: 4 },
  lessonTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  lessonMeta: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  lessonDescription: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  emptyCard: { marginTop: 9, minHeight: 80, padding: 17, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  emptyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  horizontalLessons: { gap: 10, paddingRight: 20 },
  bookmarkCard: { width: 172, minHeight: 86, padding: 13, borderRadius: 15, borderWidth: 1, justifyContent: 'space-between', gap: 11 },
  categoryList: { gap: 10, marginTop: 15 },
  categoryCard: { minHeight: 92, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryCopy: { flex: 1, gap: 4 },
  categoryTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  categoryDescription: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  categoryCount: { marginTop: 1, fontSize: 9, fontFamily: 'Inter_500Medium' },
  newUserHint: { marginTop: 17, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
