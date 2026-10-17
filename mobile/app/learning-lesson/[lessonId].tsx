import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import {
  getEstimatedLessonMinutes,
  getLearningCategory,
  getLearningLesson,
  getLessonKnowledgeCheck,
  getLessonPracticePrompt,
  LEARNING_CATEGORIES,
} from '@/data/learningContent';
import {
  getCurrentLearningStreak,
  getLearningProgress,
  markLessonCompleted,
  recordLessonOpened,
  saveLessonPosition,
  saveLessonStepPosition,
  toggleLessonBookmark,
  type LearningProgress,
} from '@/services/learningProgress';
import { shareLearningLesson } from '@/services/learningSharing';
import { trackEvent } from '@/services/telemetry';
import {
  getLearningLessonPosition,
  getLearningPathAppearance,
  getNextLearningLesson,
  isLearningLessonUnlocked,
} from '@/services/learningJourney';
import { getLearningLessonSteps, getLearningLevelForLesson } from '@/data/learningCurriculum';

type FeatherIconName = keyof typeof Feather.glyphMap;

function isFeatherIconName(value: string): value is FeatherIconName {
  return Object.prototype.hasOwnProperty.call(Feather.glyphMap, value);
}

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
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedCheckOption, setSelectedCheckOption] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedStepOption, setSelectedStepOption] = useState<number | null>(null);
  const [stepCheckResult, setStepCheckResult] = useState<'correct' | 'incorrect' | null>(null);
  const [wrongStepAttempts, setWrongStepAttempts] = useState(0);
  const [revealCorrectOption, setRevealCorrectOption] = useState(false);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [completionStreakMessage, setCompletionStreakMessage] = useState('');
  const [completionStreakCount, setCompletionStreakCount] = useState(0);
  const [lessonLocked, setLessonLocked] = useState(false);
  const completionPending = useRef(false);
  const wrongAnswerShake = useSharedValue(0);
  const wrongAnswerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: wrongAnswerShake.value }],
  }));

  useFocusEffect(useCallback(() => {
    if (!lesson) return;
    let active = true;
    setProgress(null);
    setProgressError(null);
    setProgressLoading(true);
    setContentReady(false);
    setLessonLocked(false);
    void getLearningProgress()
      .then(async (storedProgress) => {
        if (!active) return;
        setProgress(storedProgress);
        if (!isLearningLessonUnlocked(lesson.id, storedProgress.completedLessonIds)) {
          setLessonLocked(true);
          setProgressLoading(false);
          return;
        }
        const value = await recordLessonOpened(lesson.id);
        if (!active) return;
        setProgress(value);
        setProgressError(null);
        lastSavedPosition.current = value.lessonPositions[lesson.id] ?? 0;
        if (lesson.steps?.length) {
          setStepIndex(Math.min(value.stepPositions[lesson.id] ?? 0, getLearningLessonSteps(lesson).length - 1));
        }
        restorePending.current = !lesson.steps?.length && lastSavedPosition.current > 0;
        setProgressLoading(false);
      })
      .catch((error: unknown) => {
        if (active) {
          setProgressError(error instanceof Error ? error.message : 'Reading progress could not be saved.');
          setProgressLoading(false);
        }
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
  const nextLesson = lesson ? getNextLearningLesson(lesson.id) : undefined;
  const bookmarked = progress?.bookmarkedLessonIds.includes(lesson?.id ?? '') ?? false;
  const completed = progress?.completedLessonIds.includes(lesson?.id ?? '') ?? false;
  const lessonPosition = lesson ? getLearningLessonPosition(lesson.id) : { index: 0, total: 0 };
  const categoryPosition = category ? Math.max(0, LEARNING_CATEGORIES.findIndex((item) => item.id === category.id)) : 0;
  const pathAccent = getLearningPathAppearance(categoryPosition).accent;
  const knowledgeCheck = lesson ? getLessonKnowledgeCheck(lesson) : null;
  const steps = useMemo(() => lesson ? getLearningLessonSteps(lesson) : [], [lesson]);
  const learningLevel = lesson ? getLearningLevelForLesson(lesson.id) : undefined;
  const hasSteps = steps.length > 0;
  const currentStep = steps[stepIndex];
  const stepButtonLabel = currentStep?.type === 'check'
    ? stepCheckResult !== null ? 'Continue' : 'Check'
    : currentStep?.type === 'practice'
      ? 'Done'
      : currentStep?.type === 'recap'
        ? 'Mark complete'
        : 'Continue';
  const stepButtonDisabled = currentStep?.type === 'check'
    ? selectedStepOption === null && stepCheckResult === null
    : false;

  const handleStepCheck = () => {
    if (currentStep?.type !== 'check' || selectedStepOption === null || stepCheckResult !== null) return;
    const correct = selectedStepOption === currentStep.correctIndex;
    setStepCheckResult(correct ? 'correct' : 'incorrect');
    if (!correct) {
      const attempts = wrongStepAttempts + 1;
      setWrongStepAttempts(attempts);
      if (attempts >= 2) setRevealCorrectOption(true);
      if (!reduceMotion) {
        wrongAnswerShake.value = withSequence(
          withTiming(-8, { duration: 45 }),
          withTiming(8, { duration: 45 }),
          withTiming(-5, { duration: 45 }),
          withSpring(0, { damping: 8, stiffness: 280 }),
        );
      }
    }
  };

  const advanceStep = () => {
    if (!currentStep || currentStep.type === 'recap') return;
    if (currentStep.type === 'check' && stepCheckResult === 'incorrect' && !revealCorrectOption) {
      setSelectedStepOption(null);
      setStepCheckResult(null);
      return;
    }
    if (currentStep.type === 'check' && stepCheckResult === 'incorrect') {
      setSelectedStepOption(null);
      setStepCheckResult(null);
      setWrongStepAttempts(0);
      setRevealCorrectOption(false);
      return;
    }
    const nextStepIndex = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(nextStepIndex);
    if (lesson) {
      void saveLessonStepPosition(lesson.id, nextStepIndex)
        .then((value) => {
          setProgress(value);
          setProgressError(null);
        })
        .catch((error: unknown) => {
          setProgressError(error instanceof Error ? error.message : 'Lesson step progress could not be saved.');
        });
    }
    setSelectedStepOption(null);
    setStepCheckResult(null);
    setWrongStepAttempts(0);
    setRevealCorrectOption(false);
    scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
  };

  const handleStepAction = () => {
    if (currentStep?.type === 'check' && stepCheckResult === null) {
      handleStepCheck();
      return;
    }
    if (currentStep?.type === 'recap') {
      void handleComplete();
      return;
    }
    advanceStep();
  };

  useEffect(() => {
    setSelectedCheckOption(null);
    setStepIndex(0);
    setSelectedStepOption(null);
    setStepCheckResult(null);
    setWrongStepAttempts(0);
    setRevealCorrectOption(false);
    cancelAnimation(wrongAnswerShake);
    wrongAnswerShake.value = 0;
  }, [lesson?.id, wrongAnswerShake]);

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
    if (lesson?.steps?.length) return;
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
    if (!lesson || actionBusy || completionPending.current) return;
    completionPending.current = true;
    setActionBusy(true);
    try {
      const previousStreak = progress ? getCurrentLearningStreak(progress) : 0;
      const wasCompleted = progress?.completedLessonIds.includes(lesson.id) ?? false;
      const updatedProgress = await markLessonCompleted(lesson.id);
      const activeStreak = getCurrentLearningStreak(updatedProgress);
      setProgress(updatedProgress);
      setCompletionStreakCount(activeStreak);
      setCompletionStreakMessage(
        !wasCompleted && activeStreak > previousStreak
          ? previousStreak === 0
            ? 'Your learning streak has started!'
            : `Your streak grew to ${activeStreak} days!`
          : activeStreak > 0
            ? `Your ${activeStreak}-day streak is active!`
            : 'Complete another lesson today to start a new streak.',
      );
      if (!wasCompleted) {
        trackEvent('learning_lesson_completed', { lessonId: lesson.id, categoryId: lesson.categoryId });
      }
      setCompletionVisible(true);
    } catch (error) {
      Alert.alert('Progress not saved', error instanceof Error ? error.message : 'Lesson completion could not be saved.');
    } finally {
      completionPending.current = false;
      setActionBusy(false);
    }
  };

  const continueJourney = () => {
    setCompletionVisible(false);
    if (nextLesson) {
      router.replace({ pathname: '/learning-lesson/[lessonId]', params: { lessonId: nextLesson.id } });
      return;
    }
    if (category) {
      router.replace({ pathname: '/learning-category/[categoryId]', params: { categoryId: category.id } });
    }
  };

  const backToPath = () => {
    setCompletionVisible(false);
    if (category) {
      router.replace({ pathname: '/learning-category/[categoryId]', params: { categoryId: category.id } });
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

  if (progressLoading || !progress) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 25 }]}>
        {progressLoading ? <ActivityIndicator size="small" color={pathAccent} /> : <Feather name="alert-circle" size={28} color={colors.sell} />}
        <Text style={[styles.notFoundTitle, { color: colors.text }]}>{progressLoading ? 'Opening lesson' : 'Progress unavailable'}</Text>
        {!progressLoading ? <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center' }]}>{progressError ?? 'Learning progress could not be loaded.'}</Text> : null}
        {!progressLoading ? (
          <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.primaryButton, { backgroundColor: pathAccent }]}>
            <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Back to Learning Hub</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (lessonLocked) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 25 }]}>
        <Feather name="lock" size={30} color={pathAccent} />
        <Text style={[styles.notFoundTitle, { color: colors.text }]}>Lesson locked</Text>
        <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center' }]}>Finish the lesson before this one first.</Text>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/learning-category/[categoryId]', params: { categoryId: category.id } })} style={[styles.primaryButton, { backgroundColor: pathAccent }]}>
          <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Back to path</Text>
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
          accessibilityLabel="Close lesson"
          onPress={() => router.back()}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="x" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerProgressCopy}>
          <Text style={[styles.headerLabel, { color: colors.textSecondary }]} numberOfLines={1}>{category.title}</Text>
          <Text style={[styles.headerProgressText, { color: pathAccent }]} numberOfLines={1}>
            {hasSteps
              ? `LEVEL ${learningLevel?.number ?? 1} OF 20 · STEP ${stepIndex + 1} OF ${steps.length}`
              : `LESSON ${lessonPosition.index} OF ${lessonPosition.total}`}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'}
          onPress={() => void handleBookmark()}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name="bookmark" size={18} color={bookmarked ? colors.buy : colors.text} />
        </TouchableOpacity>
      </View>
      <View style={[styles.lessonProgressTrack, hasSteps && styles.stepProgressTrack, { backgroundColor: `${pathAccent}25` }]}>
        <View
          style={[
            styles.lessonProgressFill,
            hasSteps && styles.stepProgressFill,
            {
              backgroundColor: pathAccent,
              width: `${hasSteps
                ? (stepIndex + 1) / steps.length * 100
                : lessonPosition.total ? lessonPosition.index / lessonPosition.total * 100 : 0}%`,
            },
          ]}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, hasSteps && styles.stepContentContainer]}
        onScroll={handleScroll}
        onContentSizeChange={() => setContentReady(true)}
        scrollEventThrottle={300}
        showsVerticalScrollIndicator={false}
      >
        {hasSteps && currentStep ? (
          <Animated.View
            key={`${lesson.id}-step-${stepIndex}`}
            entering={reduceMotion ? undefined : FadeInDown.duration(260)}
            style={styles.stepContent}
          >
            {currentStep.type === 'learn' || currentStep.type === 'example' ? (
              <View style={[styles.stepCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.stepTypePill, { backgroundColor: `${pathAccent}18` }]}>
                  <Feather name={currentStep.type === 'example' ? 'eye' : 'book-open'} size={13} color={pathAccent} />
                  <Text style={[styles.stepTypeLabel, { color: pathAccent }]}>{currentStep.type.toUpperCase()}</Text>
                </View>

                <View style={[styles.visualPanel, { backgroundColor: `${pathAccent}14`, borderColor: `${pathAccent}22` }]}>
                  {currentStep.visual && isFeatherIconName(currentStep.visual) ? (
                    <View style={styles.visualIllustration}>
                      <View style={[styles.visualGlow, { backgroundColor: `${pathAccent}24` }]} />
                      <View style={[styles.visualSignalCard, styles.visualSignalTop, { backgroundColor: colors.card, borderColor: `${pathAccent}35` }]}>
                        <Feather name="trending-up" size={17} color={pathAccent} />
                        <View style={styles.visualSignalBars}>
                          {[12, 20, 15, 27].map((height, index) => (
                            <View key={index} style={[styles.visualSignalBar, { height, backgroundColor: `${pathAccent}${index === 3 ? 'CC' : '66'}` }]} />
                          ))}
                        </View>
                      </View>
                      <View style={[styles.visualMainIcon, { backgroundColor: pathAccent, shadowColor: pathAccent }]}>
                        <Feather name={currentStep.visual} size={38} color="#FFFFFF" />
                      </View>
                      <View style={[styles.visualSignalCard, styles.visualSignalBottom, { backgroundColor: colors.card, borderColor: `${pathAccent}35` }]}>
                        <View style={[styles.visualSignalDot, { backgroundColor: colors.gold }]} />
                        <View style={[styles.visualSignalLine, { backgroundColor: `${pathAccent}55` }]} />
                        <Feather name="arrow-up-right" size={15} color={pathAccent} />
                      </View>
                      <View style={[styles.visualOrbitDot, styles.visualOrbitTop, { backgroundColor: colors.gold }]} />
                      <View style={[styles.visualOrbitDot, styles.visualOrbitBottom, { backgroundColor: `${pathAccent}88` }]} />
                    </View>
                  ) : currentStep.visual ? (
                    <Text style={styles.stepVisual}>{currentStep.visual}</Text>
                  ) : (
                    <View style={styles.visualFallback}>
                      <View style={[styles.visualFallbackIcon, { backgroundColor: pathAccent }]}>
                        <Feather name="activity" size={26} color="#FFFFFF" />
                      </View>
                      <View style={styles.visualPatternRow}>
                        {[0, 1, 2].map((item) => (
                          <View key={item} style={[styles.visualPatternDot, { backgroundColor: item % 2 ? `${pathAccent}88` : `${pathAccent}42` }]} />
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {currentStep.title ? <Text style={[styles.stepTitle, { color: colors.text }]}>{currentStep.title}</Text> : null}
                <Text style={[styles.stepBody, { color: colors.textSecondary }]}>{currentStep.body}</Text>
                {currentStep.keyPoint ? (
                  <View style={[styles.keyPointStrip, { backgroundColor: `${colors.gold}18`, borderColor: `${colors.gold}35` }]}>
                    <View style={[styles.keyPointIcon, { backgroundColor: `${colors.gold}25` }]}>
                      <Feather name="target" size={14} color={colors.gold} />
                    </View>
                    <Text style={[styles.keyPointText, { color: colors.text }]}>{currentStep.keyPoint}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {currentStep.type === 'check' ? (
              <View style={styles.stepQuestionWrap}>
                <View style={[styles.stepTypePill, { backgroundColor: `${pathAccent}18` }]}>
                  <Feather name="help-circle" size={13} color={pathAccent} />
                  <Text style={[styles.stepTypeLabel, { color: pathAccent }]}>QUICK CHECK</Text>
                </View>
                <Text style={[styles.stepQuestion, { color: colors.text }]}>{currentStep.question}</Text>
                <Animated.View style={wrongAnswerStyle}>
                  {currentStep.options.map((option, optionIndex) => {
                    const isSelected = selectedStepOption === optionIndex;
                    const isCorrect = optionIndex === currentStep.correctIndex;
                    const showCorrect = revealCorrectOption && isCorrect;
                    const showWrong = stepCheckResult === 'incorrect' && isSelected;
                    const selected = isSelected && stepCheckResult === null;
                    const optionColor = showCorrect
                      ? colors.buy
                      : showWrong
                        ? colors.gold
                        : selected
                          ? pathAccent
                          : colors.cardBorder;
                    const optionBackground = showCorrect
                      ? `${colors.buy}18`
                      : showWrong
                        ? `${colors.gold}22`
                        : selected
                          ? `${pathAccent}15`
                          : colors.card;
                    return (
                      <TouchableOpacity
                        key={`${stepIndex}-option-${optionIndex}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected }}
                        disabled={stepCheckResult !== null || revealCorrectOption}
                        onPress={() => setSelectedStepOption(optionIndex)}
                        style={[styles.stepOption, { backgroundColor: optionBackground, borderColor: optionColor }]}
                      >
                        <View style={[styles.stepOptionMarker, { borderColor: optionColor, backgroundColor: showCorrect ? colors.buy : 'transparent' }]}>
                          {showCorrect ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                          {showWrong ? <Feather name="x" size={14} color={colors.gold} /> : null}
                          {selected ? <View style={[styles.stepOptionDot, { backgroundColor: pathAccent }]} /> : null}
                        </View>
                        <Text style={[styles.stepOptionText, { color: colors.text }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
                {stepCheckResult ? (
                  <Animated.View
                    entering={reduceMotion ? undefined : FadeIn.duration(180)}
                    style={[
                      styles.stepFeedback,
                      {
                        backgroundColor: stepCheckResult === 'correct' ? `${colors.buy}18` : `${colors.gold}20`,
                        borderColor: stepCheckResult === 'correct' ? `${colors.buy}55` : `${colors.gold}55`,
                      },
                    ]}
                  >
                    <Feather
                      name={stepCheckResult === 'correct' ? 'check-circle' : 'info'}
                      size={17}
                      color={stepCheckResult === 'correct' ? colors.buy : colors.gold}
                    />
                    <Text style={[styles.stepFeedbackText, { color: colors.text }]}>{currentStep.feedback}</Text>
                  </Animated.View>
                ) : (
                  <Text style={[styles.stepHint, { color: colors.textMuted }]}>Choose an answer, then check it.</Text>
                )}
              </View>
            ) : null}

            {currentStep.type === 'practice' ? (
              <View style={[styles.stepCard, styles.practiceStepCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.stepTypePill, { backgroundColor: `${pathAccent}18` }]}>
                  <Feather name="target" size={13} color={pathAccent} />
                  <Text style={[styles.stepTypeLabel, { color: pathAccent }]}>PUT IT INTO PRACTICE</Text>
                </View>
                <Text style={[styles.stepTitle, { color: colors.text }]}>Try this exercise</Text>
                <Text style={[styles.stepBody, { color: colors.textSecondary }]}>{currentStep.body}</Text>
              </View>
            ) : null}

            {currentStep.type === 'recap' ? (
              <View style={[styles.stepCard, styles.recapStepCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.recapIcon, { backgroundColor: `${pathAccent}18` }]}>
                  <Feather name="award" size={27} color={pathAccent} />
                </View>
                <Text style={[styles.stepTitle, styles.recapTitle, { color: colors.text }]}>You now know</Text>
                {currentStep.points.map((point, pointIndex) => (
                  <View key={`${stepIndex}-recap-${pointIndex}`} style={styles.recapPoint}>
                    <View style={[styles.recapPointNumber, { backgroundColor: pathAccent }]}>
                      <Text style={styles.recapPointNumberText}>{pointIndex + 1}</Text>
                    </View>
                    <Text style={[styles.recapPointText, { color: colors.textSecondary }]}>{point}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {!hasSteps ? (
          <>
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => router.replace('/learning-hub')}>
            <Text style={[styles.breadcrumbText, { color: colors.buy }]}>Learning Hub</Text>
          </TouchableOpacity>
          <Feather name="chevron-right" size={13} color={colors.textMuted} />
          <Text style={[styles.breadcrumbText, { color: colors.textSecondary }]} numberOfLines={1}>{category.title}</Text>
        </View>

        <Text style={[styles.eyebrow, { color: pathAccent }]}>{lesson.topicGroup.toUpperCase()}</Text>
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
          </>
        ) : null}

        {!hasSteps ? (
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
        ) : null}

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
        <TouchableOpacity
          onPress={() => void handleShare()}
          style={[styles.shareButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityLabel="Share this lesson"
        >
          <Feather name="share-2" size={17} color={colors.text} />
          <Text style={[styles.shareLabel, { color: colors.text }]}>Share</Text>
        </TouchableOpacity>
        {hasSteps && currentStep ? (
          <TouchableOpacity
            onPress={() => {
              if (currentStep.type === 'check' && stepCheckResult === null) {
                handleStepCheck();
                return;
              }
              if (currentStep.type === 'recap') {
                void handleComplete();
                return;
              }
              if (currentStep.type === 'check' && stepCheckResult !== null) {
                advanceStep();
                return;
              }
              advanceStep();
            }}
            disabled={actionBusy || (currentStep.type === 'check' ? selectedStepOption === null && stepCheckResult === null : false)}
            style={[styles.completeButton, { backgroundColor: pathAccent, opacity: actionBusy || (currentStep.type === 'check' ? selectedStepOption === null && stepCheckResult === null : false) ? 0.5 : 1 }]}
            accessibilityLabel={currentStep.type === 'recap' && completed ? 'View lesson completion celebration' : stepButtonLabel}
          >
            <Feather name={currentStep.type === 'recap' ? completed ? 'award' : 'check-circle' : 'arrow-right'} size={17} color={colors.primaryForeground} />
            <Text style={[styles.completeLabel, { color: colors.primaryForeground }]}>
              {currentStep.type === 'recap' && completed ? 'View celebration' : stepButtonLabel}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => void handleComplete()}
            disabled={actionBusy}
            style={[styles.completeButton, { backgroundColor: pathAccent, opacity: actionBusy ? 0.72 : 1 }]}
            accessibilityLabel={completed ? 'View lesson completion celebration' : 'Mark lesson as completed'}
          >
            <Feather name={completed ? 'award' : 'check'} size={17} color={colors.primaryForeground} />
            <Text style={[styles.completeLabel, { color: colors.primaryForeground }]}>
              {completed ? 'View celebration' : 'Mark complete'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <Modal transparent visible={completionVisible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setCompletionVisible(false)}>
        <View style={styles.completionOverlay}>
          <Animated.View
            entering={reduceMotion ? undefined : ZoomIn.springify().damping(15).stiffness(190)}
            style={[styles.completionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View pointerEvents="none" style={styles.confettiField}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((particle) => (
                <Animated.View
                  key={particle}
                  entering={reduceMotion ? undefined : FadeInDown.delay(particle * 35).duration(260)}
                  style={[
                    styles.confettiParticle,
                    {
                      left: `${8 + (particle * 37) % 84}%`,
                      top: 18 + (particle * 23) % 54,
                      backgroundColor: particle % 2 ? pathAccent : colors.gold,
                      transform: [{ rotate: `${particle * 23}deg` }],
                    },
                  ]}
                />
              ))}
            </View>
            <View style={[styles.completionCheck, { backgroundColor: pathAccent }]}>
              <Feather name="check" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.completionTitle, { color: colors.text }]}>Congratulations!</Text>
            <Text style={[styles.completionLesson, { color: colors.textSecondary }]}>{lesson.title} complete</Text>
            <Text style={[styles.completionPath, { color: pathAccent }]}>{category.title}</Text>
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.delay(120).duration(300)}
              style={[styles.streakCelebration, { backgroundColor: `${colors.gold}1C`, borderColor: `${colors.gold}45` }]}
            >
              <Animated.View entering={reduceMotion ? undefined : ZoomIn.delay(180).springify().damping(12)}>
                <Feather name="zap" size={19} color={colors.gold} />
              </Animated.View>
              <View style={styles.streakCelebrationCopy}>
                <Text style={[styles.streakCelebrationTitle, { color: colors.text }]}>{completionStreakMessage}</Text>
                <Text style={[styles.streakCelebrationCount, { color: colors.textSecondary }]}>
                  {completionStreakCount} {completionStreakCount === 1 ? 'day' : 'days'} of learning
                </Text>
              </View>
            </Animated.View>
            <Text style={[styles.completionSubtitle, { color: colors.textSecondary }]}>
              {nextLesson
                ? `Keep going with ${nextLesson.title}. Great traders are built one thoughtful lesson at a time.`
                : 'You completed the full learning journey. Keep learning, stay disciplined, and let steady effort shape your growth.'}
            </Text>
            <TouchableOpacity onPress={continueJourney} style={[styles.completionContinue, { backgroundColor: pathAccent }]} accessibilityRole="button">
              <Text style={styles.completionContinueText}>Continue</Text>
              <Feather name="arrow-right" size={17} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={backToPath} style={[styles.completionBack, { backgroundColor: colors.surface }]} accessibilityRole="button">
              <Text style={[styles.completionBackText, { color: colors.text }]}>Back to path</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  notFound: { justifyContent: 'center', alignItems: 'center', padding: 25, gap: 14 },
  notFoundTitle: { fontSize: 23, fontFamily: 'Inter_700Bold' },
  header: { minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerProgressCopy: { flex: 1, gap: 3 },
  headerLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  headerProgressText: { fontSize: 7, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  lessonProgressTrack: { height: 4, marginHorizontal: 18, borderRadius: 2, overflow: 'hidden' },
  lessonProgressFill: { height: '100%', borderRadius: 2 },
  stepProgressTrack: { height: 6, marginHorizontal: 18, borderRadius: 999 },
  stepProgressFill: { borderRadius: 999 },
  stepContentContainer: { flexGrow: 1, justifyContent: 'center', minHeight: 420 },
  stepContent: { marginTop: 18, marginBottom: 14, justifyContent: 'center' },
  stepCard: { padding: 16, borderWidth: 1, borderRadius: 21, shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  stepTypePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  stepTypeLabel: { fontSize: 8, letterSpacing: 0.9, fontFamily: 'Inter_700Bold' },
  visualPanel: { height: 188, borderWidth: 1, borderRadius: 18, marginTop: 14, marginBottom: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  visualIllustration: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  visualGlow: { position: 'absolute', width: 116, height: 116, borderRadius: 58 },
  visualMainIcon: { width: 78, height: 78, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 6, zIndex: 2 },
  visualSignalCard: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, borderWidth: 1, shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  visualSignalTop: { top: 22, left: '12%' },
  visualSignalBottom: { right: '10%', bottom: 24 },
  visualSignalBars: { height: 28, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  visualSignalBar: { width: 4, borderRadius: 2 },
  visualSignalDot: { width: 8, height: 8, borderRadius: 4 },
  visualSignalLine: { width: 30, height: 2, borderRadius: 1 },
  visualOrbitDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  visualOrbitTop: { top: 34, right: '23%' },
  visualOrbitBottom: { bottom: 38, left: '19%' },
  visualFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  visualFallbackIcon: { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  visualPatternRow: { position: 'absolute', bottom: 20, flexDirection: 'row', gap: 10 },
  visualPatternDot: { width: 12, height: 12, borderRadius: 6 },
  stepVisual: { fontSize: 42, textAlign: 'center' },
  stepTitle: { marginTop: 12, fontSize: 22, lineHeight: 28, fontFamily: 'Inter_700Bold' },
  stepBody: { marginTop: 10, fontSize: 16, lineHeight: 24, fontFamily: 'Inter_400Regular' },
  keyPointStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: 14, borderWidth: 1 },
  keyPointIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  keyPointText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  stepQuestionWrap: { gap: 12 },
  stepQuestion: { fontSize: 20, lineHeight: 28, fontFamily: 'Inter_700Bold' },
  stepOption: { minHeight: 52, padding: 12, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepOptionMarker: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepOptionDot: { width: 8, height: 8, borderRadius: 4 },
  stepOptionText: { flex: 1, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  stepFeedback: { marginTop: 6, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepFeedbackText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  stepHint: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  practiceStepCard: { gap: 4 },
  recapStepCard: { gap: 14 },
  recapIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  recapTitle: { marginTop: 0 },
  recapPoint: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recapPointNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recapPointNumberText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapPointText: { flex: 1, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_500Medium' },
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
  actionBar: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 5 },
  shareButton: { width: 100, height: 47, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  completeButton: { flex: 1, height: 47, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeLabel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  primaryButton: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13 },
  primaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  completionOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(13,35,29,0.55)' },
  completionCard: { width: '100%', maxWidth: 390, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderRadius: 28, padding: 23, elevation: 9, shadowColor: '#10251D', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  confettiField: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  confettiParticle: { position: 'absolute', width: 7, height: 13, borderRadius: 4, opacity: 0.72 },
  completionCheck: { width: 68, height: 68, marginTop: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 34, borderWidth: 5, borderColor: '#FFFFFF', elevation: 4, shadowColor: '#1C3A30', shadowOpacity: 0.2, shadowRadius: 8 },
  completionTitle: { marginTop: 14, fontSize: 22, fontFamily: 'Inter_700Bold' },
  completionLesson: { marginTop: 5, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  completionPath: { marginTop: 4, fontSize: 11, fontFamily: 'Inter_700Bold' },
  streakCelebration: { width: '100%', marginTop: 17, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  streakCelebrationCopy: { flex: 1, gap: 3 },
  streakCelebrationTitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  streakCelebrationCount: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  completionSubtitle: { marginTop: 13, marginBottom: 18, fontSize: 11, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  completionContinue: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24 },
  completionContinueText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  completionBack: { width: '100%', minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  completionBackText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
