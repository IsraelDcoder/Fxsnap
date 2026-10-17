import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Path, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import { getEstimatedLessonMinutes, getLearningCategory, LEARNING_CATEGORIES } from '@/data/learningContent';
import { getLearningProgress, type LearningProgress } from '@/services/learningProgress';
import {
  getLearningPathAppearance,
  getLearningPathLessons,
  isLearningLessonUnlocked,
  isLearningPathUnlocked,
} from '@/services/learningJourney';
import { getLearningLevelForLesson } from '@/data/learningCurriculum';

const PATH_NODE_X = [22, 50, 78, 50] as const;
const PATH_ROW_HEIGHT = 112;

export default function LearningCategoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const category = getLearningCategory(categoryId);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [lockedHintId, setLockedHintId] = useState<string | null>(null);
  const [shakingLessonId, setShakingLessonId] = useState<string | null>(null);
  const pulse = useSharedValue(1);
  const shake = useSharedValue(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const lessons = useMemo(() => category ? getLearningPathLessons(category.id) : [], [category]);
  const completedLessonIds = progress?.completedLessonIds ?? [];
  const pathUnlocked = Boolean(category && progress && isLearningPathUnlocked(category.id, completedLessonIds));
  const completedCount = lessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length;
  const currentLesson = lessons.find((lesson) => (
    !completedLessonIds.includes(lesson.id) && isLearningLessonUnlocked(lesson.id, completedLessonIds)
  ));
  const categoryIndex = category ? Math.max(0, LEARNING_CATEGORIES.findIndex((item) => item.id === category.id)) : 0;
  const appearance = getLearningPathAppearance(categoryIndex);
  const pathHeight = lessons.length * PATH_ROW_HEIGHT;
  const pathWidth = Math.max(280, width - 40);
  const pathCoordinates = lessons.map((_, index) => ({
    x: PATH_NODE_X[index % PATH_NODE_X.length],
    y: 46 + index * PATH_ROW_HEIGHT,
  }));
  const pathLine = pathCoordinates.reduce((value, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = pathCoordinates[index - 1];
    const middleY = (previous.y + point.y) / 2;
    return `${value} C ${previous.x} ${middleY}, ${point.x} ${middleY}, ${point.x} ${point.y}`;
  }, '');
  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const animatedShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  useEffect(() => {
    if (currentLesson && pathUnlocked && !reduceMotion) {
      pulse.value = withRepeat(withTiming(1.045, { duration: 900 }), -1, true);
    } else {
      pulse.value = 1;
    }
    return () => cancelAnimation(pulse);
  }, [currentLesson?.id, pathUnlocked, pulse, reduceMotion]);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    cancelAnimation(pulse);
    cancelAnimation(shake);
  }, [pulse, shake]);

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

  if (!progress) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <AmbientBackdrop />
        {progressError
          ? <Feather name="alert-circle" size={26} color={colors.sell} />
          : <ActivityIndicator size="small" color={appearance.accent} />}
        <Text style={[styles.title, { color: colors.text }]}>{progressError ? 'Progress unavailable' : 'Loading learning path'}</Text>
        {progressError ? <Text style={[styles.lockedPathCopy, { color: colors.textSecondary }]}>{progressError}</Text> : null}
        {progressError ? (
          <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.actionButton, { backgroundColor: appearance.accent }]}>
            <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Back to Learning Hub</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (progress && !pathUnlocked) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <AmbientBackdrop />
        <View style={[styles.lockedPathIcon, { backgroundColor: colors.surface }]}><Feather name="lock" size={24} color={colors.textMuted} /></View>
        <Text style={[styles.title, { color: colors.text }]}>Path locked</Text>
        <Text style={[styles.lockedPathCopy, { color: colors.textSecondary }]}>Finish the lesson before this one first.</Text>
        <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Back to Learning Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const openLesson = (lessonId: string) => {
    if (!isLearningLessonUnlocked(lessonId, completedLessonIds)) {
      setLockedHintId(lessonId);
      setShakingLessonId(lessonId);
      if (!reduceMotion) {
        shake.value = withSequence(
          withTiming(-7, { duration: 45 }),
          withTiming(7, { duration: 45 }),
          withTiming(-5, { duration: 45 }),
          withSpring(0, { damping: 8, stiffness: 280 }),
        );
      }
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => {
        setLockedHintId(null);
        setShakingLessonId(null);
      }, 1800);
      return;
    }
    router.push({ pathname: '/learning-lesson/[lessonId]', params: { lessonId } });
  };

  const categoryProgress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const nodePositions = pathCoordinates.map((point, index) => ({
    left: `${point.x}%` as const,
    top: index * PATH_ROW_HEIGHT + 4,
  }));

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
        <Text style={[styles.headerLabel, { color: appearance.accent }]}>LEARNING HUB</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 30 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(300)} style={[styles.hero, { backgroundColor: appearance.accent }]}>
          <View style={styles.heroTop}>
            <View style={[styles.categoryIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Feather name={category.icon as React.ComponentProps<typeof Feather>['name']} size={22} color="#FFFFFF" />
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{appearance.badge}</Text>
            </View>
          </View>
          <Text style={styles.title}>{category.title}</Text>
          <Text style={styles.description}>{category.description}</Text>
          <View style={styles.heroProgressMeta}>
            <Text style={styles.heroProgressLabel}>{completedCount} of {lessons.length} lessons</Text>
            <Text style={styles.heroProgressLabel}>{categoryProgress}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${categoryProgress}%` }]} /></View>
        </Animated.View>

        {progressError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.sell }]}>
            <Feather name="alert-circle" size={16} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.text }]}>{progressError}</Text>
          </View>
        ) : null}

        <View style={styles.pathHeading}>
          <Text style={[styles.pathHeadingTitle, { color: colors.text }]}>Your learning path</Text>
          <Text style={[styles.pathHeadingMeta, { color: appearance.accent }]}>{completedCount}/{lessons.length} complete</Text>
        </View>
        <View style={[styles.pathCanvas, { height: pathHeight }]}>
          <Svg width={pathWidth} height={pathHeight} viewBox={`0 0 100 ${pathHeight}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
            <Path d={pathLine} fill="none" stroke={`${appearance.accent}35`} strokeWidth={2.3} strokeLinecap="round" />
            {completedCount > 0 ? (
              <Path
                d={lessons.slice(0, completedCount + (currentLesson ? 1 : 0)).map((_, index) => {
                  const point = pathCoordinates[index];
                  if (index === 0) return `M ${point.x} ${point.y}`;
                  const previous = pathCoordinates[index - 1];
                  const middleY = (previous.y + point.y) / 2;
                  return `C ${previous.x} ${middleY}, ${point.x} ${middleY}, ${point.x} ${point.y}`;
                }).join(' ')}
                fill="none"
                stroke={appearance.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ) : null}
          </Svg>
          {lessons.map((lesson, index) => {
            const completed = completedLessonIds.includes(lesson.id);
            const current = lesson.id === currentLesson?.id;
            const unlocked = isLearningLessonUnlocked(lesson.id, completedLessonIds);
            const lessonLevel = getLearningLevelForLesson(lesson.id);
            const isShaking = shakingLessonId === lesson.id;
            const position = nodePositions[index];
            return (
              <View key={lesson.id} style={[styles.pathNodeSlot, position, { transform: [{ translateX: -82 }] }]}>
                {current ? (
                  <View style={[styles.startPill, { backgroundColor: appearance.accent }]}>
                    <Text style={styles.startPillText}>START</Text>
                  </View>
                ) : null}
                <Animated.View style={isShaking ? animatedShakeStyle : undefined}>
                  <Animated.View style={current ? animatedPulseStyle : undefined}>
                    <TouchableOpacity
                      onPress={() => openLesson(lesson.id)}
                      style={[
                        styles.pathNode,
                        current && styles.currentNode,
                        { backgroundColor: completed || current ? appearance.accent : '#D9DEDC', borderColor: completed || current ? '#FFFFFF' : '#D9DEDC' },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${lesson.title}${completed ? ', completed' : current ? ', current lesson' : ', locked'}`}
                    >
                      <Feather
                        name={completed ? 'check' : current ? 'play' : unlocked ? 'circle' : 'lock'}
                        size={current ? 21 : 18}
                        color={completed || current ? '#FFFFFF' : '#929B98'}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>
                <TouchableOpacity
                  onPress={() => openLesson(lesson.id)}
                  style={styles.pathNodeCopy}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${lesson.title}`}
                >
                  <Text style={[styles.nodeTitle, { color: completed || unlocked ? colors.text : colors.textMuted }]} numberOfLines={2}>{lesson.title}</Text>
                  <Text style={[styles.nodeMeta, { color: completed ? appearance.accent : colors.textMuted }]}>
                    {`LEVEL ${lessonLevel?.number ?? '-'} · ${completed ? 'COMPLETED' : current ? `${getEstimatedLessonMinutes(lesson)} MIN` : unlocked ? 'READY' : 'LOCKED'}`}
                  </Text>
                </TouchableOpacity>
                {lockedHintId === lesson.id ? (
                  <View style={[styles.lockedTooltip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.lockedTooltipText, { color: colors.text }]}>Finish the lesson before this one first.</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => router.replace('/learning-hub')} style={[styles.allTopicsButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="grid" size={16} color={appearance.accent} />
          <Text style={[styles.allTopicsText, { color: colors.text }]}>Explore all learning paths</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  unavailable: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 15 },
  lockedPathIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  lockedPathCopy: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 30 },
  hero: { padding: 18, borderRadius: 26, elevation: 4, shadowColor: '#24362E', shadowOpacity: 0.15, shadowRadius: 13, shadowOffset: { width: 0, height: 5 } },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  categoryIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.19)' },
  heroBadgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 23, lineHeight: 29, color: '#FFFFFF', fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  description: { marginTop: 6, color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  heroProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 17, marginBottom: 7 },
  heroProgressLabel: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
  progressTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.26)' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFFFFF' },
  errorCard: { marginTop: 14, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  pathHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 23, marginBottom: 10 },
  pathHeadingTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  pathHeadingMeta: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  pathCanvas: { position: 'relative', marginHorizontal: -4 },
  pathNodeSlot: { position: 'absolute', width: 164, minHeight: 108, alignItems: 'center', zIndex: 1 },
  startPill: { position: 'absolute', top: -2, zIndex: 2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, elevation: 2 },
  startPillText: { color: '#FFFFFF', fontSize: 7, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  pathNode: { width: 56, height: 56, marginTop: 16, borderWidth: 3, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#213B33', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  currentNode: { width: 68, height: 68, marginTop: 10, borderRadius: 34, borderWidth: 4, elevation: 5, shadowOpacity: 0.2, shadowRadius: 9 },
  pathNodeCopy: { width: 158, alignItems: 'center', marginTop: 6, gap: 3, paddingHorizontal: 3 },
  nodeTitle: { fontSize: 9, lineHeight: 13, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  nodeMeta: { fontSize: 7, letterSpacing: 0.55, fontFamily: 'Inter_700Bold' },
  lockedTooltip: { position: 'absolute', top: 82, zIndex: 4, width: 160, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 12, elevation: 5, shadowColor: '#20382F', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  lockedTooltipText: { fontSize: 9, lineHeight: 13, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  allTopicsButton: { minHeight: 46, marginTop: 12, borderWidth: 1, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  allTopicsText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  actionButton: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 20 },
  actionText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
