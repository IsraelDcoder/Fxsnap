import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getDeviceId } from '@/services/apiAuth';
import {
  getBriefDateKey,
  getDailyBriefState,
  getDailyVideoBrief,
  markDailyBriefRead,
  type DailyBriefItem,
  type DailyBriefState,
} from '@/services/dailyBrief';

const VISUAL_ICONS: Record<DailyBriefItem['visual'], string> = {
  psychology: 'target',
  risk: 'shield',
  technical: 'crosshair',
  fundamentals: 'globe',
  discipline: 'check-circle',
  structure: 'git-branch',
  mistakes: 'alert-triangle',
  strategy: 'sliders',
  candles: 'bar-chart-2',
  sessions: 'clock',
  sizing: 'divide',
  journal: 'book-open',
};

function formatBriefDate(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));
}

function FXSnapDailyBriefCard({ brief, colors, compact, onSave, saved = false }: {
  brief: DailyBriefItem;
  colors: ReturnType<typeof useColors>;
  compact: boolean;
  onSave?: () => void;
  saved?: boolean;
}) {
  const artworkHeight = compact ? 96 : 112;
  const artworkBase = colors.text === '#FFFFFF' ? '#073D31' : '#126448';
  const colorScheme = colors.text === '#FFFFFF' ? 'dark' : 'light';

  const cardContent = (
    <View style={styles.storyInner}>
      <View style={[styles.storyArtwork, { height: artworkHeight, backgroundColor: artworkBase }]}>
        <Svg width="100%" height={artworkHeight} viewBox="0 0 360 112" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="briefArtworkGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={artworkBase} />
              <Stop offset="1" stopColor="#071F1A" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="360" height="112" fill="url(#briefArtworkGradient)" />
          {[26, 52, 78].map((y) => <Line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="1" />)}
          <Path d="M0 90 C35 82 46 93 72 70 S116 77 145 57 S190 70 218 44 S258 53 283 29 S327 38 360 12" fill="none" stroke={colors.gold} strokeOpacity="0.85" strokeWidth="2" />
          <Path d="M0 103 C40 96 55 106 88 87 S133 93 165 74 S211 83 245 59 S293 70 321 49 S344 51 360 42" fill="none" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="1.5" />
          <Circle cx="283" cy="29" r="8" fill={colors.gold} fillOpacity="0.18" />
          <Circle cx="283" cy="29" r="3" fill={colors.gold} />
          <Circle cx="283" cy="29" r="16" fill="none" stroke={colors.gold} strokeOpacity="0.28" />
        </Svg>
        <View style={styles.artworkTopRow}>
          <View style={styles.editionPill}>
            <Feather name="star" size={11} color={colors.gold} />
            <Text style={styles.editionText}>FXSNAP DAILY</Text>
          </View>
          <View style={styles.storyCountPill}>
            <Text style={styles.storyCountText}>INSIGHT</Text>
          </View>
        </View>
        <View style={styles.artworkCategory}>
          <View style={styles.artworkIcon}>
            <Feather name={(VISUAL_ICONS[brief.visual] || 'book-open') as React.ComponentProps<typeof Feather>['name']} size={18} color={colors.gold} />
          </View>
          <Text numberOfLines={1} style={styles.artworkCategoryText}>{brief.category.toUpperCase()}</Text>
        </View>
      </View>

      <View style={[styles.storyContent, { padding: compact ? 14 : 18 }]}>
        <Text numberOfLines={3} style={[styles.briefTitle, { color: colors.text, fontSize: compact ? 22 : 27, lineHeight: compact ? 27 : 32 }]}>
          {brief.title}
        </Text>

        <Text numberOfLines={compact ? 4 : 5} style={[styles.briefBody, { color: colors.textSecondary, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 20 }]}>
          {brief.body}
        </Text>

        <View style={[styles.takeawayCard, { backgroundColor: colors.background, borderColor: `${colors.buy}66` }]}>
          <Text style={[styles.takeawayLabel, { color: colors.buy }]}>THE TAKEAWAY</Text>
          <Text numberOfLines={3} style={[styles.takeawayText, { color: colors.text, fontSize: compact ? 15 : 16, lineHeight: compact ? 20 : 23 }]}>
            {brief.takeaway}
          </Text>
        </View>

        {onSave ? (
          <View style={styles.storyCardFooter}>
            <TouchableOpacity
              onPress={onSave}
              style={[styles.saveButton, { backgroundColor: saved ? `${colors.buy}18` : colors.card, borderColor: saved ? `${colors.buy}66` : colors.cardBorder }]}
              accessibilityLabel={saved ? 'Saved insight' : 'Save insight'}
            >
              <Feather name="heart" size={18} color={saved ? colors.buy : colors.textSecondary} fill={saved ? colors.buy : 'transparent'} />
            </TouchableOpacity>
            <Text style={[styles.saveText, { color: colors.textSecondary }]}>{saved ? 'Saved to your briefs' : 'Save this insight'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const cardStyle = [styles.storyCard, { borderColor: `${colors.buy}66` }];
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={cardStyle}
        tintColor={colors.surface}
        colorScheme={colorScheme}
        glassEffectStyle={{ style: 'regular', animate: true, animationDuration: 0.35 }}
      >
        {cardContent}
      </GlassView>
    );
  }

  return (
    <View style={[cardStyle, { backgroundColor: colors.surface }]}>
      <LinearGradient
        pointerEvents="none"
        colors={colorScheme === 'dark'
          ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.025)', 'rgba(0,0,0,0.08)']
          : ['rgba(255,255,255,0.74)', 'rgba(255,255,255,0.26)', 'rgba(35,129,95,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {cardContent}
    </View>
  );
}

export default function DailyBriefExperience({ previewMode = false }: { previewMode?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { height: screenHeight } = useWindowDimensions();
  const { savedBriefs, saveBriefCard, deleteBriefCard } = useApp();
  const [briefState, setBriefState] = useState<DailyBriefState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const translateX = useRef(new Animated.Value(0)).current;
  const videoBrief = getDailyVideoBrief();

  useEffect(() => {
    let active = true;
    void getDailyBriefState().then((state) => {
      if (!active) return;
      setBriefState(state);
      const firstUnreadIndex = state.briefs.findIndex((brief) => !state.readIds.includes(brief.id));
      if (firstUnreadIndex < 0) setCompleted(true);
      else setCurrentIndex(firstUnreadIndex);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(''), 1800);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  const briefs = briefState?.briefs || [];
  const currentBrief = briefs[currentIndex];
  const compactLayout = screenHeight < 720;
  const deckHeight = previewMode
    ? 235
    : Math.max(400, Math.min(500, Math.round(screenHeight * (compactLayout ? 0.62 : 0.58))));
  const dateKey = briefState?.dateKey || getBriefDateKey();
  const savedBriefId = `daily-brief-${dateKey}`;
  const currentSavedBrief = currentBrief ? savedBriefs.find((item) => item.brief_id === savedBriefId && item.card_id === currentBrief.id) : null;

  const progressBars = useMemo(() => briefs.map((brief, index) => ({
    id: brief.id,
    complete: Boolean(briefState?.readIds.includes(brief.id)),
    active: index === currentIndex,
  })), [briefs, briefState?.readIds, currentIndex]);

  const visibleCards = useMemo(() => briefs
    .map((brief, index) => ({ brief, index }))
    .filter(({ index }) => index === currentIndex || index === currentIndex + 1), [briefs, currentIndex]);

  const moveTo = useCallback(async (direction: 'next' | 'previous') => {
    if (!currentBrief || !briefState) return;
    if (direction === 'previous' && currentIndex === 0) return;
    const updated = await markDailyBriefRead(currentBrief.id);
    setBriefState(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (direction === 'next') {
      if (currentIndex >= briefs.length - 1) {
        setCompleted(true);
      } else {
        setCurrentIndex((index) => index + 1);
      }
    } else {
      setCurrentIndex((index) => Math.max(0, index - 1));
    }
  }, [currentBrief, briefState, currentIndex, briefs.length]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
    onPanResponderMove: (_event, gesture) => translateX.setValue(gesture.dx * 0.28),
    onPanResponderRelease: (_event, gesture) => {
      const direction = gesture.dx < -60 ? 'next' : gesture.dx > 60 ? 'previous' : null;
      if (!direction) {
        Animated.spring(translateX, { toValue: 0, damping: 18, stiffness: 180, useNativeDriver: true }).start();
        return;
      }
      const exitX = direction === 'next' ? -width : width;
      Animated.timing(translateX, { toValue: exitX, duration: 130, useNativeDriver: true }).start(async () => {
        await moveTo(direction);
        translateX.setValue(direction === 'next' ? width * 0.45 : -width * 0.45);
        Animated.spring(translateX, { toValue: 0, damping: 19, stiffness: 190, useNativeDriver: true }).start();
      });
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, damping: 18, stiffness: 180, useNativeDriver: true }).start(),
  }), [width, translateX, moveTo]);

  const cardRotation = translateX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-4deg', '0deg', '4deg'],
    extrapolate: 'clamp',
  });

  const toggleSave = async () => {
    if (!currentBrief || !briefState) return;
    const briefId = `daily-brief-${briefState.dateKey}`;
    if (currentSavedBrief) {
      await deleteBriefCard(briefId, currentBrief.id);
      setSaveMessage('Removed from saved briefs');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    const userId = await getDeviceId();
    await saveBriefCard({
      user_id: userId,
      brief_id: briefId,
      card_id: currentBrief.id,
      instrument: currentBrief.category,
      headline: currentBrief.title,
      summary: `${currentBrief.body}\n\nFXSnap Takeaway: ${currentBrief.takeaway}`,
      created_at: new Date().toISOString(),
    });
    setSaveMessage('Saved to your briefs');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openVideo = () => {
    if (videoBrief?.videoUrl) void Linking.openURL(videoBrief.videoUrl);
  };

  const returnHome = () => router.replace('/(tabs)/home');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: previewMode ? 0 : insets.top + 6 }]}>
      <AmbientBackdrop />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={returnHome} style={[styles.topIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Back to home">
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topBrand}>
          <Text style={[styles.topBrandText, { color: colors.text }]}>FXSNAP <Text style={{ color: colors.buy }}>DAILY BRIEF</Text></Text>
          <Text style={[styles.topDate, { color: colors.textMuted }]}>{formatBriefDate(dateKey)}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/saved-briefs')} style={[styles.topIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Open saved briefs">
          <Feather name="bookmark" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.buy} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Preparing today's learning deck</Text>
        </View>
      ) : completed ? (
        <ScrollView contentContainerStyle={[styles.completionContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.completionMark, { backgroundColor: `${colors.buy}18`, borderColor: `${colors.buy}44` }]}>
            <Feather name="check" size={32} color={colors.buy} />
          </View>
          <Text style={[styles.completionKicker, { color: colors.buy }]}>YOU'RE ALL CAUGHT UP</Text>
          <Text style={[styles.completionTitle, { color: colors.text }]}>Today's 15 insights are complete.</Text>
          <Text style={[styles.completionDescription, { color: colors.textSecondary }]}>Keep learning. Keep improving. Keep trading smarter.</Text>

          {videoBrief ? <View style={[styles.videoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.videoHeading}>
              <Text style={[styles.videoEyebrow, { color: colors.buy }]}>TODAY'S VIDEO BRIEF</Text>
              <Text style={[styles.videoDate, { color: colors.textMuted }]}>{formatBriefDate(videoBrief.date)}</Text>
            </View>
            <View style={[styles.videoThumbnail, { backgroundColor: colors.surface }]}>
              {videoBrief.thumbnailUrl ? (
                <Image source={{ uri: videoBrief.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : null}
              <View style={[styles.videoPlay, { backgroundColor: `${colors.buy}E6` }]}>
                <Feather name="play" size={21} color={colors.primaryForeground} />
              </View>
            </View>
            <Text style={[styles.videoTitle, { color: colors.text }]}>{videoBrief.title}</Text>
            <Text style={[styles.videoDescription, { color: colors.textSecondary }]}>{videoBrief.description}</Text>
            <TouchableOpacity
              onPress={openVideo}
              style={[styles.watchButton, { backgroundColor: colors.buy, borderColor: colors.buy }]}
            >
              <Feather name="play-circle" size={17} color={colors.primaryForeground} />
              <Text style={[styles.watchButtonText, { color: colors.primaryForeground }]}>Watch Video</Text>
            </TouchableOpacity>
          </View> : null}

          <Text style={[styles.returnNote, { color: colors.textMuted }]}>Come back tomorrow for 15 new insights.</Text>
          <TouchableOpacity onPress={returnHome} style={[styles.homeButton, { borderColor: colors.cardBorder }]}>
            <Feather name="home" size={17} color={colors.text} />
            <Text style={[styles.homeButtonText, { color: colors.text }]}>Back to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : currentBrief && briefState ? (
        <>
          <View style={styles.deckIntro}>
            <View style={styles.deckIntroTop}>
              <View style={styles.deckIntroLabel}>
                <Feather name="star" size={12} color={colors.buy} />
                <Text style={[styles.deckEyebrow, { color: colors.buy }]}>TODAY'S INSIGHTS</Text>
              </View>
              <Text style={[styles.deckCount, { color: colors.textSecondary }]}>{String(currentIndex + 1).padStart(2, '0')} <Text style={{ color: colors.textMuted }}>/ {String(briefs.length).padStart(2, '0')}</Text></Text>
            </View>
            <Text style={[styles.deckHint, { color: colors.textSecondary }]}>Swipe to explore today's insights.</Text>
          </View>
          <View style={styles.progressBars}>
            {progressBars.map((bar) => (
              <View key={bar.id} style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
                <View style={[styles.progressFill, { width: bar.complete || bar.active ? '100%' : '0%', backgroundColor: bar.active ? colors.buy : `${colors.buy}99` }]} />
              </View>
            ))}
          </View>

          <View style={styles.deckSpacer} />
          <View style={[styles.deck, { height: deckHeight }]}>
            {visibleCards.filter(({ index }) => index !== currentIndex).map(({ brief, index }) => {
              const depth = index - currentIndex;
              return (
                <View key={brief.id} pointerEvents="none" style={[styles.briefTouchArea, styles.stackedCard, { opacity: 0.12, transform: [{ scale: 0.98 }, { translateY: 12 }, { rotate: depth > 0 ? '3deg' : '-3deg' }], zIndex: 10 }]}>
                  <FXSnapDailyBriefCard brief={brief} colors={colors} compact={compactLayout} />
                </View>
              );
            })}
            <Animated.View
              {...panResponder.panHandlers}
              style={[styles.briefTouchArea, styles.activeCard, { zIndex: 20, transform: [{ translateX }, { rotate: cardRotation }] }]}
            >
              <FXSnapDailyBriefCard brief={currentBrief} colors={colors} compact={compactLayout} onSave={() => void toggleSave()} saved={Boolean(currentSavedBrief)} />
            </Animated.View>
          </View>

          <View style={styles.deckSpacer} />
          <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Text style={[styles.navigationHint, { color: colors.textMuted }]}>Swipe to continue</Text>
          </View>
          {saveMessage ? (
            <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="check-circle" size={15} color={colors.buy} />
              <Text style={[styles.toastText, { color: colors.text }]}>{saveMessage}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  topIcon: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  topBrand: { flex: 1 },
  topBrandText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  topDate: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  deckIntro: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 7 },
  deckIntroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deckIntroLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deckEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  deckCount: { fontSize: 11, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] },
  deckHint: { marginTop: 4, fontSize: 10, fontFamily: 'Inter_400Regular' },
  progressBars: { flexDirection: 'row', gap: 3, paddingHorizontal: 18, paddingBottom: 8 },
  progressTrack: { height: 3, flex: 1, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  deck: { minHeight: 0, marginHorizontal: 13, marginBottom: 7, position: 'relative' },
  deckSpacer: { flex: 1 },
  briefTouchArea: { minHeight: 0, paddingHorizontal: 0 },
  stackedCard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingBottom: 0 },
  activeCard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingBottom: 0 },
  storyCard: { flex: 1, minHeight: 0, borderWidth: 1, borderRadius: 26, justifyContent: 'flex-start', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  storyInner: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 25 },
  storyArtwork: { paddingHorizontal: 17, paddingTop: 13, paddingBottom: 12, justifyContent: 'space-between', overflow: 'hidden' },
  artworkTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editionPill: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(4,20,16,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  editionText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  storyCountPill: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(4,20,16,0.45)' },
  storyCountText: { color: '#FFFFFF', fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7 },
  artworkCategory: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  artworkIcon: { width: 31, height: 31, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,20,16,0.56)' },
  artworkCategoryText: { flex: 1, color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.85 },
  storyContent: { flex: 1, minHeight: 0 },
  briefTitle: { fontFamily: 'Inter_700Bold', fontWeight: '700', marginTop: 2, fontSize: 22 },
  briefBody: { marginTop: 8, fontFamily: 'Inter_400Regular', fontSize: 13 },
  takeawayCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, gap: 5 },
  takeawayLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.85 },
  takeawayText: { fontFamily: 'Inter_700Bold', fontWeight: '700', fontSize: 14 },
  storyCardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  saveButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 19 },
  saveText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  navigation: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 19, paddingTop: 7 },
  navigationHint: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 },
  toast: { position: 'absolute', left: 30, right: 30, bottom: 77, minHeight: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  toastText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  completionContent: { paddingHorizontal: 19, paddingTop: 28, alignItems: 'center' },
  completionMark: { width: 64, height: 64, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  completionKicker: { marginTop: 18, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  completionTitle: { marginTop: 8, fontSize: 24, lineHeight: 30, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  completionDescription: { marginTop: 7, fontSize: 12, textAlign: 'center', lineHeight: 18, fontFamily: 'Inter_400Regular' },
  videoCard: { width: '100%', marginTop: 22, borderWidth: 1, borderRadius: 17, padding: 13 },
  videoHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  videoEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.65 },
  videoDate: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  videoThumbnail: { width: '100%', aspectRatio: 1.85, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  videoPlay: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  videoUnavailable: { position: 'absolute', bottom: 9, fontSize: 9, fontFamily: 'Inter_500Medium' },
  videoTitle: { marginTop: 12, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  videoDescription: { marginTop: 4, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  watchButton: { minHeight: 42, marginTop: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  watchButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  returnNote: { marginTop: 16, fontSize: 10, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  homeButton: { minHeight: 43, marginTop: 13, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  homeButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});