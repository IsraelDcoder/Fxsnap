import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import {
  getEstimatedLessonMinutes,
  getLearningCategory,
  getLearningLesson,
  getLessonKnowledgeCheck,
  getLessonPracticePrompt,
} from '@/data/learningContent';
import {
  markLessonCompleted,
  recordLessonOpened,
  saveLessonPosition,
  toggleLessonBookmark,
  type LearningProgress,
} from '@/services/learningProgress';
import { shareLearningLesson } from '@/services/learningSharing';
import { trackEvent } from '@/services/telemetry';

export default function LearningLessonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const lesson = getLearningLesson(lessonId);
  const category = lesson ? getLearningCategory(lesson.categoryId) : undefined;
  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPosition = useRef(0);
  const pendingPosition = useRef<number | null>(null);
  const restorePending = useRef(false);
  const [contentReady, setContentReady] = useState(false);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedCheckOption, setSelectedCheckOption] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lesson) return;
    let active = true;
    setContentReady(false);
    void recordLessonOpened(lesson.id)
      .then((value) => {
        if (!active) return;
        setProgress(value);
        setProgressError(null);
        lastSavedPosition.current = value.lessonPositions[lesson.id] ?? 0;
        restorePending.current = lastSavedPosition.current > 0;
      })
      .catch((error: unknown) => {
        if (active) setProgressError(error instanceof Error ? error.message : 'Reading progress could not be saved.');
      });
    return () => {
      active = false;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const position = pendingPosition.current;
      pendingPosition.current = null;
      if (position !== null) {
        void saveLessonPosition(lesson.id, position)
          .then((value) => {
            lastSavedPosition.current = position;
            setProgress(value);
            setProgressError(null);
          })
          .catch((error: unknown) => {
            setProgressError(error instanceof Error ? error.message : 'Reading position could not be saved.');
          });
      }
    };
  }, [lesson?.id]));

  const flattenedLessons = useMemo(() => category
    ? category.groups.flatMap((group) => group.lessonIds)
      .map(getLearningLesson)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [], [category]);
  const lessonIndex = flattenedLessons.findIndex((item) => item.id === lesson?.id);
  const previousLesson = lessonIndex > 0 ? flattenedLessons[lessonIndex - 1] : undefined;
  const nextLesson = lessonIndex >= 0 ? flattenedLessons[lessonIndex + 1] : undefined;
  const bookmarked = progress?.bookmarkedLessonIds.includes(lesson?.id ?? '') ?? false;
  const completed = progress?.completedLessonIds.includes(lesson?.id ?? '') ?? false;
  const knowledgeCheck = lesson ? getLessonKnowledgeCheck(lesson) : null;

  useEffect(() => {
    setSelectedCheckOption(null);
  }, [lesson?.id]);

  const savePosition = (position: number) => {
    if (!lesson || Math.abs(position - lastSavedPosition.current) < 100) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingPosition.current = position;
    saveTimer.current = setTimeout(() => {
      const pending = pendingPosition.current;
      pendingPosition.current = null;
      saveTimer.current = null;
      if (pending === null) return;
      void saveLessonPosition(lesson.id, pending)
        .then((value) => {
          lastSavedPosition.current = pending;
          setProgress(value);
          setProgressError(null);
        })
        .catch((error: unknown) => {
          setProgressError(error instanceof Error ? error.message : 'Reading position could not be saved.');
        });
    }, 500);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    savePosition(event.nativeEvent.contentOffset.y);
  };

  useEffect(() => {
    if (!restorePending.current || !contentReady || !lesson) return;
    restorePending.current = false;
    if (lastSavedPosition.current > 0) {
      scrollRef.current?.scrollTo({ y: lastSavedPosition.current, animated: false });
    }
  }, [contentReady, lesson?.id, progress]);

  const handleBookmark = async () => {
    if (!lesson || actionBusy) return;
    setActionBusy(true);
    try {
      setProgress(await toggleLessonBookmark(lesson.id));
      trackEvent('learning_lesson_bookmarked', { lessonId: lesson.id, bookmarked: !bookmarked });
    } catch (error) {
      Alert.alert('Bookmark unavailable', error instanceof Error ? error.message : 'The lesson could not be bookmarked.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!lesson || actionBusy) return;
    setActionBusy(true);
    try {
      setProgress(await markLessonCompleted(lesson.id));
      trackEvent('learning_lesson_completed', { lessonId: lesson.id, categoryId: lesson.categoryId });
    } catch (error) {
      Alert.alert('Progress not saved', error instanceof Error ? error.message : 'Lesson completion could not be saved.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleShare = async () => {
    if (!lesson || actionBusy) return;
    setShareError(null);
    setActionBusy(true);
    try {
      await shareLearningLesson(lesson);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'The lesson could not be shared.');
    } finally {
      setActionBusy(false);
    }
  };

  if (!lesson || !category) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 25 }]}>
        <Feather name="book-open" size={30} color={colors.textSecondary} />
        <Text style={[styles.notFoundTitle, { color: colors.text }]}>Lesson not found</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>This lesson link may be outdated. Browse the Learning Hub to find another lesson.</Text>
        <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Open Learning Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
      <AmbientBackdrop />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Back to ${category.title}`}
          onPress={() => router.back()}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerLabel, { color: colors.textSecondary }]} numberOfLines={1}>{category.title}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'}
          onPress={() => void handleBookmark()}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="bookmark" size={18} color={bookmarked ? colors.buy : colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        onContentSizeChange={() => setContentReady(true)}
        scrollEventThrottle={300}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => router.replace('/learning-hub')}>
            <Text style={[styles.breadcrumbText, { color: colors.buy }]}>Learning Hub</Text>
          </TouchableOpacity>
          <Feather name="chevron-right" size={13} color={colors.textMuted} />
          <Text style={[styles.breadcrumbText, { color: colors.textSecondary }]} numberOfLines={1}>{category.title}</Text>
        </View>

        <Text style={[styles.eyebrow, { color: colors.buy }]}>{lesson.topicGroup.toUpperCase()}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{lesson.title}</Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{lesson.intro}</Text>
        <View style={styles.metaRow}>
          <Feather name="clock" size={13} color={colors.textMuted} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{getEstimatedLessonMinutes(lesson)} min lesson</Text>
          <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{lesson.difficulty}</Text>
        </View>

        <View style={[styles.articleDivider, { backgroundColor: colors.cardBorder }]} />
        {lesson.sections.map((section, index) => (
          <Animated.View
            key={`${lesson.id}-${index}`}
            entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index * 25, 150)).duration(300)}
            style={styles.articleSection}
          >
            <Text style={[styles.sectionHeading, { color: colors.text }]}>{section.heading}</Text>
            {section.paragraphs?.map((paragraph, paragraphIndex) => (
              <Text key={`${index}-p-${paragraphIndex}`} style={[styles.body, { color: colors.textSecondary }]}>{paragraph}</Text>
            ))}
            {section.formula ? (
              <View style={[styles.formulaCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="divide" size={15} color={colors.buy} />
                <Text style={[styles.formulaText, { color: colors.text }]}>{section.formula}</Text>
              </View>
            ) : null}
            {section.bullets?.map((bullet, bulletIndex) => (
              <View key={`${index}-b-${bulletIndex}`} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: colors.buy }]} />
                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{bullet}</Text>
              </View>
            ))}
          </Animated.View>
        ))}

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.delay(180).duration(350)}
          style={[styles.practiceCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <View style={styles.practiceHeading}>
            <View style={[styles.practiceIcon, { backgroundColor: colors.surface }]}>
              <Feather name="target" size={16} color={colors.buy} />
            </View>
            <View style={styles.practiceCopy}>
              <Text style={[styles.practiceEyebrow, { color: colors.buy }]}>PUT IT INTO PRACTICE</Text>
              <Text style={[styles.practiceTitle, { color: colors.text }]}>Try this exercise</Text>
            </View>
          </View>
          <Text style={[styles.practiceBody, { color: colors.textSecondary }]}>{getLessonPracticePrompt(lesson)}</Text>
        </Animated.View>

        {knowledgeCheck ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(220).duration(350)}
            style={[styles.quizCard, { backgroundColor: colors.segmentBackground, borderColor: colors.cardBorder }]}
          >
            <View style={styles.quizHeading}>
              <Feather name="help-circle" size={18} color={colors.buy} />
              <Text style={[styles.sectionHeading, styles.quizTitle, { color: colors.text }]}>Quick knowledge check</Text>
            </View>
            <Text style={[styles.quizQuestion, { color: colors.textSecondary }]}>{knowledgeCheck.question}</Text>
            {knowledgeCheck.options.map((option) => {
              const isSelected = selectedCheckOption === option.id;
              const showResult = selectedCheckOption !== null;
              const optionColor = showResult && isSelected
                ? option.isCorrect ? colors.buy : colors.sell
                : colors.cardBorder;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => setSelectedCheckOption(option.id)}
                  style={[styles.quizOption, { backgroundColor: colors.card, borderColor: optionColor }]}
                >
                  <View style={[styles.quizOptionMarker, { borderColor: optionColor, backgroundColor: isSelected && option.isCorrect ? colors.buy : 'transparent' }]}>
                    {isSelected && option.isCorrect ? <Feather name="check" size={12} color={colors.primaryForeground} /> : null}
                    {isSelected && !option.isCorrect ? <Feather name="x" size={12} color={colors.sell} /> : null}
                  </View>
                  <Text style={[styles.quizOptionText, { color: colors.text }]}>{option.text}</Text>
                </TouchableOpacity>
              );
            })}
            {selectedCheckOption ? (
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(220)} style={styles.quizFeedback}>
                <Feather
                  name={selectedCheckOption === 'takeaway' ? 'check-circle' : 'info'}
                  size={16}
                  color={selectedCheckOption === 'takeaway' ? colors.buy : colors.gold}
                />
                <Text style={[styles.quizFeedbackText, { color: colors.textSecondary }]}>
                  {selectedCheckOption === 'takeaway'
                    ? 'That is one of this lesson’s key takeaways.'
                    : `That describes a common pitfall. Keep in mind: ${knowledgeCheck.options[0].text}`}
                </Text>
              </Animated.View>
            ) : (
              <Text style={[styles.quizHint, { color: colors.textMuted }]}>Choose an answer to see the explanation.</Text>
            )}
            {selectedCheckOption ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedCheckOption(null)} style={styles.tryAgainButton}>
                <Text style={[styles.tryAgainText, { color: colors.buy }]}>Try again</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        ) : null}

        <View style={[styles.takeawayCard, { backgroundColor: colors.segmentBackground, borderColor: colors.cardBorder }]}>
          <View style={styles.takeawayHeading}>
            <Feather name="check-circle" size={17} color={colors.buy} />
            <Text style={[styles.sectionHeading, styles.takeawayTitle, { color: colors.text }]}>Key takeaways</Text>
          </View>
          {lesson.keyTakeaways.map((takeaway, index) => (
            <View key={`takeaway-${index}`} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.buy }]} />
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{takeaway}</Text>
            </View>
          ))}
        </View>

        {lesson.commonMistakes.length > 0 && (
          <View style={styles.mistakes}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Common mistakes</Text>
            {lesson.commonMistakes.map((mistake, index) => (
              <View key={`mistake-${index}`} style={styles.bulletRow}>
                <Feather name="alert-circle" size={14} color={colors.gold} />
                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{mistake}</Text>
              </View>
            ))}
          </View>
        )}

        {lesson.toolRoute ? (
          <TouchableOpacity onPress={() => {
            if (lesson.toolRoute) router.push(lesson.toolRoute);
          }} style={[styles.toolLink, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="tool" size={16} color={colors.buy} />
            <Text style={[styles.toolLinkText, { color: colors.text }]}>Explore this tool in FXSnap</Text>
            <Feather name="arrow-up-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}

        {lesson.relatedLessonIds.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Related lessons</Text>
            {lesson.relatedLessonIds.map((relatedId) => {
              const related = getLearningLesson(relatedId);
              if (!related) return null;
              return (
                <TouchableOpacity
                  key={related.id}
                  onPress={() => router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId: related.id } })}
                  style={[styles.relatedCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.relatedCategory, { color: colors.buy }]}>{related.topicGroup}</Text>
                    <Text style={[styles.lessonLinkTitle, { color: colors.text }]}>{related.title}</Text>
                  </View>
                  <Feather name="arrow-up-right" size={17} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.lessonNavigation}>
          {previousLesson ? (
            <TouchableOpacity onPress={() => router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId: previousLesson.id } })} style={[styles.navCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="arrow-left" size={15} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.navCaption, { color: colors.textMuted }]}>PREVIOUS</Text>
                <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={2}>{previousLesson.title}</Text>
              </View>
            </TouchableOpacity>
          ) : <View style={styles.navCardPlaceholder} />}
          {nextLesson ? (
            <TouchableOpacity onPress={() => router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId: nextLesson.id } })} style={[styles.navCard, styles.nextNavCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navCaption, { color: colors.textMuted, textAlign: 'right' }]}>NEXT</Text>
                <Text style={[styles.navTitle, { color: colors.text, textAlign: 'right' }]} numberOfLines={2}>{nextLesson.title}</Text>
              </View>
              <Feather name="arrow-right" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : <View style={styles.navCardPlaceholder} />}
        </View>

        {progressError ? <Text style={[styles.errorText, { color: colors.sell }]}>{progressError}</Text> : null}
        {shareError ? <Text style={[styles.errorText, { color: colors.sell }]}>{shareError}</Text> : null}

        <View style={[styles.disclaimerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="info" size={15} color={colors.textMuted} />
          <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
            Educational information only, not financial advice. Markets are uncertain and trading can result in losses.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={() => void handleShare()} style={[styles.shareButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Share this lesson">
          <Feather name="share-2" size={17} color={colors.text} />
          <Text style={[styles.shareLabel, { color: colors.text }]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleComplete()}
          style={[styles.completeButton, { backgroundColor: completed ? colors.surface : colors.primary }]}
          accessibilityLabel={completed ? 'Lesson completed' : 'Mark lesson as completed'}
        >
          <Feather name={completed ? 'check-circle' : 'check'} size={17} color={completed ? colors.buy : colors.primaryForeground} />
          <Text style={[styles.completeLabel, { color: completed ? colors.buy : colors.primaryForeground }]}>
            {completed ? 'Completed' : 'Mark complete'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  notFound: { justifyContent: 'center', alignItems: 'center', padding: 25, gap: 14 },
  notFoundTitle: { fontSize: 23, fontFamily: 'Inter_700Bold' },
  header: { minHeight: 50, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 15 },
  breadcrumbText: { maxWidth: 180, fontSize: 10, fontFamily: 'Inter_500Medium' },
  eyebrow: { marginBottom: 8, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  title: { fontSize: 26, lineHeight: 33, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  intro: { marginTop: 11, fontSize: 15, lineHeight: 23, fontFamily: 'Inter_500Medium' },
  metaRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  metaDot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 2 },
  articleDivider: { height: 1, marginTop: 23, marginBottom: 22 },
  articleSection: { marginBottom: 23 },
  sectionHeading: { marginBottom: 10, fontSize: 17, lineHeight: 23, fontFamily: 'Inter_700Bold' },
  body: { marginBottom: 11, fontSize: 14, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  formulaCard: { marginTop: 4, marginBottom: 13, padding: 13, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  formulaText: { flex: 1, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  takeawayCard: { marginTop: 2, marginBottom: 22, padding: 16, borderWidth: 1, borderRadius: 17 },
  practiceCard: { marginBottom: 14, padding: 15, borderWidth: 1, borderRadius: 17 },
  practiceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  practiceIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  practiceCopy: { gap: 2 },
  practiceEyebrow: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  practiceTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  practiceBody: { fontSize: 12, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  quizCard: { marginBottom: 22, padding: 15, borderWidth: 1, borderRadius: 17 },
  quizHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quizTitle: { marginBottom: 0, fontSize: 15, lineHeight: 21 },
  quizQuestion: { marginTop: 10, marginBottom: 12, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  quizOption: { minHeight: 48, marginBottom: 8, padding: 11, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  quizOptionMarker: { width: 19, height: 19, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  quizOptionText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  quizFeedback: { marginTop: 5, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  quizFeedbackText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  quizHint: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  tryAgainButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4, paddingRight: 8 },
  tryAgainText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  takeawayHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  takeawayTitle: { marginBottom: 10 },
  mistakes: { marginBottom: 22 },
  toolLink: { minHeight: 47, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 22 },
  toolLinkText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  relatedSection: { marginBottom: 22 },
  relatedCard: { minHeight: 57, marginBottom: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  relatedCategory: { marginBottom: 3, fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  lessonLinkTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  lessonNavigation: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  navCard: { flex: 1, minHeight: 62, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextNavCard: { justifyContent: 'flex-end' },
  navCardPlaceholder: { flex: 1 },
  navCaption: { marginBottom: 3, fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  navTitle: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_600SemiBold' },
  errorText: { marginBottom: 12, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  disclaimerCard: { padding: 12, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  disclaimerText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  actionBar: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
  shareButton: { width: 100, height: 47, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  completeButton: { flex: 1, height: 47, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeLabel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  primaryButton: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13 },
  primaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
