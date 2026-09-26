import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
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

function BriefArtwork({ brief, colors, height }: { brief: DailyBriefItem; colors: ReturnType<typeof useColors>; height: number }) {
  const green = colors.buy;
  const muted = colors.cardBorder;
  const white = colors.textSecondary;

  return (
    <View style={[styles.artwork, { height, backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
      <View style={styles.artworkTopline}>
        <View style={[styles.artworkIcon, { backgroundColor: `${green}18` }]}>
          <Feather name={VISUAL_ICONS[brief.visual] as any} size={17} color={green} />
        </View>
      </View>
      <Svg width="100%" height={Math.max(78, height - 42)} viewBox="0 0 300 78" preserveAspectRatio="xMidYMid meet">
        {brief.visual === 'candles' || brief.visual === 'technical' ? (
          <>
            {[15, 39, 63].map((y) => <Line key={y} x1="0" x2="300" y1={y} y2={y} stroke={muted} strokeWidth="1" />)}
            {[{ x: 45, a: 54, b: 28, up: true }, { x: 93, a: 27, b: 48, up: false }, { x: 141, a: 52, b: 34, up: true }, { x: 189, a: 32, b: 55, up: false }, { x: 237, a: 57, b: 23, up: true }].map((candle) => (
              <React.Fragment key={candle.x}>
                <Line x1={candle.x} x2={candle.x} y1={candle.a - 8} y2={candle.b + 8} stroke={candle.up ? green : colors.sell} strokeWidth="1.5" />
                <Rect x={candle.x - 7} y={Math.min(candle.a, candle.b)} width="14" height={Math.max(9, Math.abs(candle.b - candle.a))} rx="2" fill={candle.up ? green : colors.sell} opacity="0.88" />
              </React.Fragment>
            ))}
          </>
        ) : null}
        {brief.visual === 'risk' ? (
          <>
            <Rect x="12" y="19" width="276" height="42" rx="12" fill={colors.surface} stroke={muted} />
            {[0, 1, 2, 3].map((index) => <Rect key={index} x={25 + index * 66} y="31" width="52" height="18" rx="5" fill={index < 2 ? green : muted} opacity={index < 2 ? 0.82 : 0.48} />)}
            <Line x1="158" x2="158" y1="13" y2="67" stroke={white} strokeDasharray="3 4" opacity="0.72" />
          </>
        ) : null}
        {brief.visual === 'sizing' ? (
          <>
            <Rect x="16" y="14" width="85" height="49" rx="10" fill={colors.surface} stroke={muted} />
            <Rect x="108" y="14" width="80" height="49" rx="10" fill={colors.surface} stroke={muted} />
            <Rect x="195" y="14" width="88" height="49" rx="10" fill={`${green}18`} stroke={`${green}66`} />
            <SvgText x="58" y="36" textAnchor="middle" fill={white} fontSize="10">RISK</SvgText>
            <SvgText x="148" y="36" textAnchor="middle" fill={white} fontSize="10">STOP</SvgText>
            <SvgText x="239" y="36" textAnchor="middle" fill={green} fontSize="10">SIZE</SvgText>
            <Path d="M 94 39 L 105 39 M 181 39 L 192 39" stroke={green} strokeWidth="1.5" />
          </>
        ) : null}
        {brief.visual === 'structure' ? (
          <>
            <Line x1="16" x2="284" y1="20" y2="20" stroke={white} strokeDasharray="4 5" opacity="0.65" />
            <Line x1="16" x2="284" y1="59" y2="59" stroke={green} strokeDasharray="4 5" opacity="0.8" />
            <Path d="M 20 50 L 60 42 L 89 49 L 126 30 L 158 39 L 193 23 L 226 31 L 278 14" stroke={green} strokeWidth="2.4" fill="none" />
            <Circle cx="126" cy="30" r="4" fill={green} />
            <Circle cx="193" cy="23" r="4" fill={green} />
          </>
        ) : null}
        {brief.visual === 'strategy' ? (
          <>
            <Line x1="48" x2="252" y1="39" y2="39" stroke={muted} strokeWidth="2" />
            {[{ x: 48, label: 'PLAN' }, { x: 150, label: 'EXECUTE' }, { x: 252, label: 'REVIEW' }].map((node) => (
              <React.Fragment key={node.label}>
                <Circle cx={node.x} cy="39" r="15" fill={colors.surface} stroke={green} strokeWidth="2" />
                <Circle cx={node.x} cy="39" r="4" fill={green} />
                <SvgText x={node.x} y="70" textAnchor="middle" fill={white} fontSize="8">{node.label}</SvgText>
              </React.Fragment>
            ))}
          </>
        ) : null}
        {brief.visual === 'sessions' ? (
          <>
            <Line x1="24" x2="276" y1="40" y2="40" stroke={muted} strokeWidth="3" />
            <Rect x="27" y="34" width="67" height="12" rx="6" fill={white} opacity="0.48" />
            <Rect x="101" y="34" width="92" height="12" rx="6" fill={green} opacity="0.83" />
            <Rect x="201" y="34" width="69" height="12" rx="6" fill={white} opacity="0.48" />
            <SvgText x="60" y="67" textAnchor="middle" fill={white} fontSize="9">ASIA</SvgText>
            <SvgText x="147" y="67" textAnchor="middle" fill={green} fontSize="9">LONDON</SvgText>
            <SvgText x="235" y="67" textAnchor="middle" fill={white} fontSize="9">NEW YORK</SvgText>
          </>
        ) : null}
        {brief.visual === 'psychology' ? (
          <>
            <Circle cx="150" cy="39" r="27" stroke={muted} strokeWidth="1" fill="none" />
            <Circle cx="150" cy="39" r="17" stroke={green} strokeWidth="1.5" fill={`${green}10`} />
            <Circle cx="150" cy="39" r="5" fill={green} />
            <Line x1="150" x2="150" y1="4" y2="74" stroke={muted} strokeWidth="1" opacity="0.7" />
            <Line x1="115" x2="185" y1="39" y2="39" stroke={muted} strokeWidth="1" opacity="0.7" />
            <Path d="M 35 57 C 53 57 55 22 75 22 S 98 57 116 57" stroke={white} strokeWidth="1.5" fill="none" opacity="0.8" />
            <Path d="M 184 21 C 204 21 205 57 225 57 S 247 23 265 23" stroke={green} strokeWidth="1.5" fill="none" opacity="0.8" />
          </>
        ) : null}
        {brief.visual === 'discipline' ? (
          <>
            <Line x1="56" x2="244" y1="39" y2="39" stroke={muted} strokeWidth="2" />
            {[56, 150, 244].map((x, index) => (
              <React.Fragment key={x}>
                <Circle cx={x} cy="39" r="17" fill={index < 2 ? `${green}20` : colors.surface} stroke={index < 2 ? green : muted} strokeWidth="2" />
                {index < 2 ? <Path d={`M ${x - 6} 39 L ${x - 1} 44 L ${x + 7} 34`} stroke={green} strokeWidth="2" fill="none" /> : <Circle cx={x} cy="39" r="3" fill={muted} />}
              </React.Fragment>
            ))}
          </>
        ) : null}
        {brief.visual === 'mistakes' ? (
          <>
            <Path d="M 150 11 L 185 65 L 115 65 Z" fill={`${colors.sell}12`} stroke={colors.sell} strokeWidth="1.5" />
            <Line x1="150" x2="150" y1="27" y2="45" stroke={colors.sell} strokeWidth="3" strokeLinecap="round" />
            <Circle cx="150" cy="54" r="2" fill={colors.sell} />
            <Path d="M 44 53 C 62 27 79 28 98 49 M 202 48 C 221 25 239 28 258 51" stroke={muted} strokeWidth="1.5" fill="none" />
          </>
        ) : null}
        {brief.visual === 'fundamentals' ? (
          <>
            <Circle cx="150" cy="39" r="28" stroke={green} strokeWidth="1.5" fill={`${green}10`} />
            <Path d="M 122 39 H 178 M 150 11 C 136 22 136 56 150 67 M 150 11 C 164 22 164 56 150 67" stroke={muted} strokeWidth="1.3" fill="none" />
            <Line x1="127" x2="173" y1="25" y2="25" stroke={muted} strokeWidth="1" />
            <Line x1="127" x2="173" y1="53" y2="53" stroke={muted} strokeWidth="1" />
          </>
        ) : null}
        {brief.visual === 'journal' ? (
          <>
            <Rect x="104" y="8" width="92" height="63" rx="7" fill={colors.surface} stroke={muted} />
            <Line x1="121" x2="179" y1="25" y2="25" stroke={green} strokeWidth="2" />
            <Line x1="121" x2="179" y1="37" y2="37" stroke={white} strokeWidth="1.4" opacity="0.7" />
            <Line x1="121" x2="173" y1="48" y2="48" stroke={white} strokeWidth="1.4" opacity="0.7" />
            <Line x1="121" x2="163" y1="59" y2="59" stroke={white} strokeWidth="1.4" opacity="0.7" />
            <Path d="M 44 56 C 60 56 66 28 83 28" stroke={green} strokeWidth="1.8" fill="none" />
            <Circle cx="83" cy="28" r="3" fill={green} />
            <Path d="M 217 52 C 232 52 239 30 256 30" stroke={white} strokeWidth="1.6" fill="none" opacity="0.65" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

function BriefCard({ brief, colors, height, compact, onSave, saved = false }: {
  brief: DailyBriefItem;
  colors: ReturnType<typeof useColors>;
  height: number;
  compact: boolean;
  onSave?: () => void;
  saved?: boolean;
}) {
  return (
    <View style={[styles.storyCard, { backgroundColor: colors.card, borderColor: `${colors.buy}55`, padding: compact ? 16 : 19 }]}>
      <View style={styles.storyHeader}>
        <View style={styles.categoryRow}>
          <View style={[styles.categoryMarker, { backgroundColor: colors.buy }]} />
          <Text style={[styles.categoryText, { color: colors.buy }]}>{brief.category.toUpperCase()}</Text>
        </View>
        <Text style={[styles.storyEyebrow, { color: colors.textMuted }]}>FXSNAP DAILY BRIEF</Text>
      </View>
      <Text numberOfLines={3} style={[styles.briefTitle, { color: colors.text, fontSize: compact ? 22 : 27, lineHeight: compact ? 27 : 32 }]}>{brief.title}</Text>
      <View style={[styles.visualStage, { height: compact ? 185 : 232 }]}>
        <View style={[styles.visualBackplate, { backgroundColor: `${colors.text}12`, transform: [{ rotate: '7deg' }] }]} />
        <View style={[styles.visualAccent, { backgroundColor: colors.buy, transform: [{ rotate: '4deg' }] }]} />
        <View style={[styles.visualArtwork, { transform: [{ rotate: '-4deg' }] }]}>
          <BriefArtwork brief={brief} colors={colors} height={compact ? 138 : Math.min(184, height + 20)} />
        </View>
      </View>
      <Text numberOfLines={compact ? 2 : 3} style={[styles.briefBody, { color: colors.textSecondary, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }]}>{brief.body}</Text>
      <View style={[styles.takeawayCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.takeawayLabel, { color: colors.buy }]}>FXSNAP TAKEAWAY</Text>
        <Text numberOfLines={1} style={[styles.takeawayText, { color: colors.text, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 17 }]}>{brief.takeaway}</Text>
      </View>
      {onSave ? (
        <View style={styles.storyCardFooter}>
          <TouchableOpacity onPress={onSave} style={[styles.saveButton, { backgroundColor: saved ? `${colors.buy}20` : `${colors.text}0A`, borderColor: saved ? `${colors.buy}70` : `${colors.text}24` }]} accessibilityLabel={saved ? 'Saved insight' : 'Save insight'}>
            <Feather name="heart" size={18} color={saved ? colors.buy : colors.textSecondary} fill={saved ? colors.buy : 'transparent'} />
          </TouchableOpacity>
          <View style={[styles.cardCta, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.cardCtaText, { color: colors.text }]}>Swipe to continue</Text>
            <Feather name="chevrons-right" size={15} color={colors.buy} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function DailyBriefExperience() {
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
  const artworkHeight = compactLayout ? 128 : Math.max(154, Math.min(188, Math.round(screenHeight * 0.23)));
  const deckHeight = Math.max(460, Math.min(570, Math.round(screenHeight * 0.7)));
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
    .filter(({ index }) => Math.abs(index - currentIndex) <= 1), [briefs, currentIndex]);

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
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 6 }]}>
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
            <Text style={[styles.deckHint, { color: colors.textSecondary }]}>Swipe through today's insights.</Text>
          </View>
          <View style={styles.progressBars}>
            {progressBars.map((bar) => (
              <View key={bar.id} style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
                <View style={[styles.progressFill, { width: bar.complete || bar.active ? '100%' : '0%', backgroundColor: bar.active ? colors.buy : `${colors.buy}99` }]} />
              </View>
            ))}
          </View>

          <View style={[styles.deck, { height: deckHeight }]}>
            {visibleCards.filter(({ index }) => index !== currentIndex).reverse().map(({ brief, index }) => {
              const depth = Math.abs(index - currentIndex);
              const rotation = index > currentIndex ? '3deg' : '-3deg';
              return (
                <View key={brief.id} pointerEvents="none" style={[styles.briefTouchArea, styles.stackedCard, { opacity: 0.78, transform: [{ scale: 1 - depth * 0.05 }, { translateY: depth * 12 }, { rotate: rotation }], zIndex: 10 - depth }]}>
                  <BriefCard brief={brief} colors={colors} height={artworkHeight} compact={compactLayout} />
                </View>
              );
            })}
            <Animated.View
              {...panResponder.panHandlers}
              style={[styles.briefTouchArea, styles.activeCard, { zIndex: 20, transform: [{ translateX }, { rotate: cardRotation }] }]}
            >
              <BriefCard brief={currentBrief} colors={colors} height={artworkHeight} compact={compactLayout} onSave={() => void toggleSave()} saved={Boolean(currentSavedBrief)} />
            </Animated.View>
          </View>

          <View style={[styles.navigation, { borderTopColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TouchableOpacity onPress={() => void moveTo('previous')} disabled={currentIndex === 0} style={[styles.navigationButton, { borderColor: colors.cardBorder, opacity: currentIndex === 0 ? 0.3 : 1 }]} accessibilityLabel="Previous brief">
              <Feather name="arrow-left" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.navigationHint, { color: colors.textMuted }]}>Swipe to continue</Text>
            <TouchableOpacity onPress={() => void moveTo('next')} style={[styles.navigationButton, styles.nextButton, { backgroundColor: colors.buy, borderColor: colors.buy }]} accessibilityLabel={currentIndex === briefs.length - 1 ? 'Complete daily brief' : 'Next brief'}>
              <Feather name={currentIndex === briefs.length - 1 ? 'check' : 'arrow-right'} size={18} color={colors.primaryForeground} />
            </TouchableOpacity>
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
  deckHint: { marginTop: 2, fontSize: 10, fontFamily: 'Inter_400Regular' },
  progressBars: { flexDirection: 'row', gap: 3, paddingHorizontal: 18, paddingBottom: 8 },
  progressTrack: { height: 3, flex: 1, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  deck: { minHeight: 0, marginHorizontal: 13, marginBottom: 7, position: 'relative' },
  briefTouchArea: { minHeight: 0, paddingHorizontal: 0 },
  stackedCard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingBottom: 0 },
  activeCard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingBottom: 0 },
  storyCard: { flex: 1, minHeight: 0, borderWidth: 1, borderRadius: 28, justifyContent: 'flex-start', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  storyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  storyEyebrow: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  visualStage: { width: '100%', marginTop: 10, marginBottom: 10, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  visualBackplate: { position: 'absolute', width: '88%', height: '86%', borderRadius: 25, right: -4, top: 10 },
  visualAccent: { position: 'absolute', width: '88%', height: '86%', borderRadius: 25, left: -3, top: 7 },
  visualArtwork: { width: '92%', height: '88%', borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  artwork: { height: 145, flexShrink: 0, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingTop: 10, overflow: 'hidden', backgroundColor: '#101713' },
  artworkTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  artworkIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  categoryMarker: { width: 6, height: 6, borderRadius: 3 },
  categoryText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  briefTitle: { fontSize: 23, lineHeight: 29, fontFamily: 'Georgia', fontWeight: '700' },
  briefBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Georgia' },
  takeawayCard: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 5, backgroundColor: '#101713' },
  takeawayLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.65 },
  takeawayText: { fontSize: 14, lineHeight: 20, fontFamily: 'Georgia', fontWeight: '700' },
  storyCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  saveButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 19 },
  cardCta: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 19, paddingHorizontal: 14 },
  cardCtaText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  navigation: { height: 58, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 19, paddingTop: 7 },
  navigationButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nextButton: { borderWidth: 0 },
  navigationHint: { fontSize: 10, fontFamily: 'Inter_500Medium' },
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