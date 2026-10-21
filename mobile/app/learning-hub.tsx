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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { LearningHubOnboarding } from '@/components/LearningHubOnboarding';
import { useColors } from '@/hooks/useColors';
import { getEstimatedLessonMinutes, getLearningLesson, LEARNING_CATEGORIES, LEARNING_LESSONS } from '@/data/learningContent';
import {
  completeLearningOnboarding,
  getCurrentLearningStreak,
  getLearningProgress,
  type LearningExperienceLevel,
  type LearningProgress,
} from '@/services/learningProgress';
import { getLearningLevelForLesson } from '@/data/learningCurriculum';
import {
  getCurrentLearningLesson,
  getLearningJourneyLessons,
  getLearningPathAppearance,
  getLearningPathLessons,
  getNextLearningLesson,
  isLearningLessonUnlocked,
  isLearningPathUnlocked,
} from '@/services/learningJourney';

export default function LearningHubScreen({ previewMode = false }: { previewMode?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

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

  const completedLessonIds = progress?.completedLessonIds ?? [];
  const continueLesson = progress ? getCurrentLearningLesson(completedLessonIds) : undefined;
  const currentLevel = continueLesson ? getLearningLevelForLesson(continueLesson.id) : undefined;
  const lessonJourney = getLearningJourneyLessons();
  const continueCategory = continueLesson
    ? LEARNING_CATEGORIES.find((category) => category.id === continueLesson.categoryId)
    : undefined;
  const continuePathLessons = continueLesson ? getLearningPathLessons(continueLesson.categoryId) : [];
  const continueChapter = continuePathLessons.findIndex((lesson) => lesson.id === continueLesson?.id) + 1;
  const nextLesson = continueLesson ? getNextLearningLesson(continueLesson.id) : undefined;
  const bookmarkedLessons = (progress?.bookmarkedLessonIds ?? [])
    .map(getLearningLesson)
    .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
  const completedCount = lessonJourney.filter((lesson) => completedLessonIds.includes(lesson.id)).length;
  const overallPercent = lessonJourney.length ? Math.round(completedCount / lessonJourney.length * 100) : 0;
  const streakCount = progress ? getCurrentLearningStreak(progress) : 0;
  const experienceLabel = progress?.experienceLevel
    ? {
      new_to_fx: 'New to forex',
      know_the_basics: 'I know the basics',
      experienced: 'Experienced',
    }[progress.experienceLevel]
    : null;

  const openLesson = (lessonId: string) => {
    router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId } });
  };

  const startLearningJourney = async (experienceLevel: LearningExperienceLevel) => {
    if (onboardingSaving) return;
    setOnboardingSaving(true);
    setOnboardingError(null);
    try {
      const firstLesson = getLearningJourneyLessons()[0];
      if (!firstLesson) throw new Error('The first Learning Hub lesson is not available right now.');
      const savedProgress = await completeLearningOnboarding(experienceLevel);
      setProgress(savedProgress);
      router.replace({ pathname: '/learning-lesson/[lessonId]', params: { lessonId: firstLesson.id } });
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : 'Your Learning Hub setup could not be saved. Please try again.');
    } finally {
      setOnboardingSaving(false);
    }
  };

  if (!isLoading && progress && !progress.learningOnboardingCompleted) {
    return (
      <LearningHubOnboarding
        saving={onboardingSaving}
        error={onboardingError}
        onStart={(experienceLevel) => { void startLearningJourney(experienceLevel); }}
        onBack={() => router.replace('/(tabs)/home')}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: previewMode ? 0 : Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
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
        <View style={styles.headerProgress} accessibilityLabel={`${overallPercent}% of lessons completed`}>
          <Svg width={48} height={48} viewBox="0 0 48 48">
            <Circle cx={24} cy={24} r={19} stroke={colors.cardBorder} strokeWidth={4} fill="none" />
            <Circle
              cx={24}
              cy={24}
              r={19}
              stroke={colors.buy}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 19}`}
              strokeDashoffset={2 * Math.PI * 19 * (1 - overallPercent / 100)}
              rotation="-90"
              origin="24, 24"
              fill="none"
            />
          </Svg>
          <Text style={[styles.headerProgressText, { color: colors.text }]}>{overallPercent}%</Text>
        </View>
        <View style={[styles.streakPill, { backgroundColor: `${colors.gold}20` }]}>
          <MaterialCommunityIcons name="fire" size={15} color={colors.gold} />
          <Text style={[styles.streakText, { color: colors.text }]}>{streakCount} day streak</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Learning Hub</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Beginner → Advanced • Master the markets, one step at a time.</Text>
        {experienceLabel ? (
          <View style={[styles.experiencePill, { backgroundColor: `${colors.buy}12` }]}>
            <Feather name="sliders" size={12} color={colors.buy} />
            <Text style={[styles.experienceLabel, { color: colors.buy }]}>{experienceLabel}</Text>
          </View>
        ) : null}

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
            {!isLoading ? (
              <View style={styles.section}>
                <LinearGradient colors={['#0B6F63', '#078875', '#1A9B80']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.journeyCard}>
                  <View style={styles.journeyCardGlow} />
                  {continueLesson && continueCategory ? (
                    <>
                      <View style={styles.journeyEyebrowRow}>
                        <View style={styles.journeyEyebrowPill}>
                          <Feather name="play-circle" size={12} color="#D8FFF2" />
                          <Text style={styles.journeyEyebrow}>CONTINUE LEARNING</Text>
                        </View>
                        <Text style={styles.journeyDuration}>{getEstimatedLessonMinutes(continueLesson)} MIN</Text>
                      </View>
                      <Text style={styles.journeyTitle}>{continueLesson.title}</Text>
                      <Text style={styles.journeySubtitle}>Level {currentLevel?.number ?? 1}: {currentLevel?.title ?? 'Trading Foundations'} · Chapter {continueChapter} • {continueCategory.title}</Text>
                      <View style={styles.miniPath}>
                        {[
                          ...continuePathLessons.slice(Math.max(0, continueChapter - 3), continueChapter - 1),
                          continueLesson,
                          ...continuePathLessons.slice(continueChapter, continueChapter + 3),
                        ].map((lesson, index, list) => {
                          const isCurrent = lesson.id === continueLesson.id;
                          const isCompleted = completedLessonIds.includes(lesson.id);
                          const unlocked = isLearningLessonUnlocked(lesson.id, completedLessonIds);
                          return (
                            <React.Fragment key={lesson.id}>
                              <View style={styles.miniPathNodeWrap}>
                                <View style={[styles.miniPathNode, isCurrent && styles.miniPathNodeCurrent, !isCompleted && !isCurrent && styles.miniPathNodeLocked]}>
                                  <Feather name={isCompleted ? 'check' : isCurrent ? 'play' : unlocked ? 'circle' : 'lock'} size={isCurrent ? 15 : 12} color={isCompleted || isCurrent ? '#FFFFFF' : '#B6D8D0'} />
                                </View>
                                {isCurrent ? <Text style={styles.miniPathStart}>START</Text> : null}
                              </View>
                              {index < list.length - 1 ? <View style={[styles.miniPathConnector, index < list.findIndex((item) => item.id === continueLesson.id) && styles.miniPathConnectorDone]} /> : null}
                            </React.Fragment>
                          );
                        })}
                      </View>
                      <TouchableOpacity onPress={() => openLesson(continueLesson.id)} style={styles.journeyButton} accessibilityRole="button">
                        <Text style={styles.journeyButtonText}>Continue lesson</Text>
                        <Feather name="arrow-right" size={17} color="#087B69" />
                      </TouchableOpacity>
                      {nextLesson ? (
                        <Text style={styles.nextUp}>Next up: {nextLesson.title}{` · ${getEstimatedLessonMinutes(nextLesson)} min`}</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={styles.journeyEyebrowRow}>
                        <View style={styles.journeyEyebrowPill}><Feather name="award" size={13} color="#D8FFF2" /><Text style={styles.journeyEyebrow}>JOURNEY COMPLETE</Text></View>
                      </View>
                      <Text style={styles.journeyTitle}>Journey complete</Text>
                      <Text style={styles.journeySubtitle}>You&apos;ve completed every lesson. Revisit any lesson to keep learning.</Text>
                      <View style={styles.completionHeroMark}><Feather name="check" size={24} color="#087B69" /></View>
                    </>
                  )}
                </LinearGradient>
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Explore paths</Text>
                <Text style={[styles.lessonDescription, { color: colors.textSecondary }]}>Six focused paths, from the basics to deliberate practice.</Text>
              </View>
              {isLoading
                ? <ActivityIndicator size="small" color={colors.buy} />
                : <Text style={[styles.completionCount, { color: colors.buy }]}>{completedCount} completed</Text>}
            </View>

            <View style={styles.categoryList}>
              {LEARNING_CATEGORIES.map((category, categoryIndex) => {
                const pathLessons = getLearningPathLessons(category.id);
                const lessonCount = pathLessons.length;
                const categoryCompleted = pathLessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length;
                const percent = lessonCount ? Math.round(categoryCompleted / lessonCount * 100) : 0;
                const unlocked = isLearningPathUnlocked(category.id, completedLessonIds);
                const appearance = getLearningPathAppearance(categoryIndex);
                return (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => unlocked && router.push({ pathname: '/learning-category/[categoryId]', params: { categoryId: category.id } })}
                    disabled={!unlocked}
                    style={[styles.categoryCard, { backgroundColor: unlocked ? `${appearance.accent}13` : colors.surface, borderColor: unlocked ? `${appearance.accent}35` : colors.cardBorder, opacity: unlocked ? 1 : 0.62 }]}
                  >
                    <View style={[styles.categoryIcon, { backgroundColor: appearance.accent }]}>
                      <Feather name={category.icon as React.ComponentProps<typeof Feather>['name']} size={19} color="#FFFFFF" />
                    </View>
                    <View style={styles.categoryCopy}>
                      <View style={styles.categoryTitleRow}>
                        <Text style={[styles.categoryTitle, { color: colors.text }]}>{category.title}</Text>
                        {!unlocked ? <Feather name="lock" size={13} color={colors.textMuted} /> : null}
                      </View>
                      <View style={[styles.levelBadge, { backgroundColor: `${appearance.accent}20` }]}>
                        <Text style={[styles.levelBadgeText, { color: appearance.accent }]}>{appearance.badge}</Text>
                      </View>
                      <Text style={[styles.categoryDescription, { color: colors.textSecondary }]} numberOfLines={2}>{category.description}</Text>
                      <View style={styles.categoryProgressMeta}>
                        <Text style={[styles.categoryCount, { color: appearance.accent }]}>{lessonCount} lessons · {categoryCompleted}/{lessonCount} done</Text>
                        <Text style={[styles.categoryCount, { color: appearance.accent }]}>{percent}%</Text>
                      </View>
                      <View style={[styles.categoryProgressTrack, { backgroundColor: `${appearance.accent}25` }]}>
                        <View style={[styles.categoryProgressFill, { width: `${percent}%`, backgroundColor: appearance.accent }]} />
                      </View>
                    </View>
                    <Feather name={unlocked ? 'chevron-right' : 'lock'} size={17} color={unlocked ? appearance.accent : colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.disclaimerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="info" size={14} color={colors.textMuted} />
              <Text style={[styles.disclaimer, { color: colors.textMuted }]}>For education only. Trading involves risk; no outcome is guaranteed.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 9 },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  headerSpacer: { flex: 1 },
  headerProgress: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerProgressText: { position: 'absolute', fontSize: 10, fontFamily: 'Inter_700Bold' },
  streakPill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 17 },
  streakText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 32 },
  title: { fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  subtitle: { marginTop: 5, marginBottom: 15, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  experiencePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -5, marginBottom: 12, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 13 },
  experienceLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  searchBox: { minHeight: 49, borderWidth: 1, borderRadius: 25, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1, shadowColor: '#16372D', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  searchInput: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: 'Inter_400Regular' },
  errorCard: { marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 9, alignItems: 'center' },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  section: { marginTop: 18 },
  sectionHeader: { marginTop: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  completionCount: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  journeyCard: { padding: 18, borderRadius: 28, overflow: 'hidden', elevation: 4, shadowColor: '#064A41', shadowOpacity: 0.19, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
  journeyCardGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -72, top: -105, backgroundColor: 'rgba(171,255,222,0.13)' },
  journeyEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  journeyEyebrowPill: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  journeyEyebrow: { color: '#E3FFF5', fontSize: 8, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  journeyDuration: { color: '#D8FFF2', fontSize: 8, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  journeyTitle: { marginTop: 13, color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontFamily: 'Inter_700Bold' },
  journeySubtitle: { marginTop: 4, color: '#D3F5E9', fontSize: 10, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  miniPath: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 19, marginBottom: 17 },
  miniPathNodeWrap: { minWidth: 30, alignItems: 'center', gap: 4 },
  miniPathNode: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#42B59A' },
  miniPathNodeCurrent: { width: 34, height: 34, borderRadius: 17, marginTop: -4, backgroundColor: '#F1B94E', borderWidth: 2, borderColor: '#FFFFFF' },
  miniPathNodeLocked: { backgroundColor: 'rgba(226,255,246,0.17)' },
  miniPathStart: { color: '#FFFFFF', fontSize: 7, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  miniPathConnector: { height: 3, flex: 1, marginTop: 11, borderRadius: 2, backgroundColor: 'rgba(229,255,246,0.28)' },
  miniPathConnectorDone: { backgroundColor: '#9BEAD5' },
  journeyButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 23, backgroundColor: '#FFFFFF' },
  journeyButtonText: { color: '#087B69', fontSize: 12, fontFamily: 'Inter_700Bold' },
  nextUp: { marginTop: 10, color: '#D4F5EA', fontSize: 9, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  completionHeroMark: { width: 48, height: 48, marginTop: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#FFFFFF' },
  lessonRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  lessonRowCopy: { flex: 1, gap: 4 },
  lessonTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  lessonMeta: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  lessonDescription: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  emptyCard: { marginTop: 9, minHeight: 80, padding: 17, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  emptyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  horizontalLessons: { gap: 10, paddingRight: 20 },
  bookmarkCard: { width: 172, minHeight: 86, padding: 13, borderRadius: 15, borderWidth: 1, justifyContent: 'space-between', gap: 11 },
  categoryList: { gap: 11, marginTop: 15 },
  categoryCard: { minHeight: 134, borderWidth: 1, borderRadius: 24, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  categoryIcon: { width: 41, height: 41, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  categoryCopy: { flex: 1, gap: 5 },
  categoryTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  categoryTitle: { flex: 1, fontSize: 13, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  levelBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  levelBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  categoryDescription: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  categoryProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 },
  categoryCount: { fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  categoryProgressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  categoryProgressFill: { height: '100%', borderRadius: 3 },
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 18, padding: 12, borderWidth: 1, borderRadius: 16 },
  disclaimer: { flex: 1, fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  newUserHint: { marginTop: 17, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
