import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getTradingSessionState, SESSION_DEFINITIONS } from '@/services/tradingSessions';
import { getDailyBriefState, type DailyBriefItem, type DailyBriefState } from '@/services/dailyBrief';
import { getDeviceId } from '@/services/apiAuth';
import type { ProtectedFeature } from '@/services/featureAccess';

export default function HomeDashboard({ previewMode = false }: { previewMode?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const compactHeader = viewportWidth < 360;
  const reduceMotion = useReducedMotion();
  const { settings, savedBriefs, saveBriefCard, deleteBriefCard, checkFeatureAccess } = useApp();
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [sessionState, setSessionState] = useState(getTradingSessionState());
  const [briefState, setBriefState] = useState<DailyBriefState | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefLoadError, setBriefLoadError] = useState('');
  const [homeFocused, setHomeFocused] = useState(false);
  const [briefSaveMessage, setBriefSaveMessage] = useState('');
  const [briefSaveError, setBriefSaveError] = useState('');
  const [savingBrief, setSavingBrief] = useState(false);
  const saveInFlight = useRef(false);
  const briefRequestId = useRef(0);

  const firstName = settings.displayName.trim().split(/\s+/)[0] || 'Trader';
  const greeting = getTimeGreeting();
  const estimatedLot = settings.balanceSet
    ? Math.max(0.01, (settings.accountBalance * (settings.riskPercent / 100)) / (20 * 10)).toFixed(2)
    : null;

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setSessionState(getTradingSessionState());
    }, 30000);
    return () => {
      clearInterval(clockTimer);
    };
  }, []);

  const loadDailyBrief = useCallback(async () => {
    const requestId = ++briefRequestId.current;
    setBriefLoading(true);
    setBriefLoadError('');
    try {
      const state = await getDailyBriefState();
      if (requestId === briefRequestId.current) setBriefState(state);
    } catch (error) {
      console.error('[Home] Daily Brief load failed.', error);
      if (requestId === briefRequestId.current) {
        setBriefLoadError('Your brief could not be loaded. Check your connection and try again.');
      }
    } finally {
      if (requestId === briefRequestId.current) setBriefLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setHomeFocused(true);
    void loadDailyBrief();
    return () => {
      setHomeFocused(false);
      briefRequestId.current += 1;
    };
  }, [loadDailyBrief]));

  useEffect(() => {
    if (!briefSaveMessage && !briefSaveError) return;
    const timer = setTimeout(() => {
      setBriefSaveMessage('');
      setBriefSaveError('');
    }, briefSaveError ? 4000 : 1800);
    return () => clearTimeout(timer);
  }, [briefSaveError, briefSaveMessage]);

  const navigate = (path: '/analysis' | '/strategy' | '/settings' | '/daily-brief' | '/community-notifications' | '/economic-calendar' | '/lot-size-calculator' | '/risk-management' | '/saved' | '/my-strategies' | '/learning-hub' | '/support-chat') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  };

  const openProtectedFeature = async (feature: ProtectedFeature, route: '/analysis' | '/strategy') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const access = await checkFeatureAccess(feature, route, route === '/analysis');
      if (access.error) {
        Alert.alert('Unable to verify access', access.error);
        return;
      }
      if (!access.allowed) return;
      router.push(route);
    } catch (error) {
      Alert.alert('Unable to open feature', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const openAnalysis = () => openProtectedFeature('AI_ANALYSIS', '/analysis');
  const openStrategy = () => openProtectedFeature('STRATEGY_GENERATOR', '/strategy');

  const showSessions = () => setSessionModalVisible(true);
  const support = () => navigate('/support-chat');
  const activeSessionNames = sessionState.activeSessions.map((session) => session.name);
  const toggleBriefSave = async (brief: DailyBriefItem, event: GestureResponderEvent) => {
    event.stopPropagation?.();
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSavingBrief(true);
    setBriefSaveError('');
    const briefId = `daily-brief-${briefState?.dateKey || 'today'}`;
    const isSaved = savedBriefs.some((saved) => saved.brief_id === briefId && saved.card_id === brief.id);
    try {
      if (isSaved) {
        await deleteBriefCard(briefId, brief.id);
        setBriefSaveMessage('Removed from saved briefs');
        return;
      }
      const userId = await getDeviceId();
      await saveBriefCard({
        user_id: userId,
        brief_id: briefId,
        card_id: brief.id,
        instrument: brief.category,
        headline: brief.title,
        summary: `${brief.body}\n\nFXSnap Takeaway: ${brief.takeaway}`,
        created_at: new Date().toISOString(),
      });
      setBriefSaveMessage('Insight saved! 🔖');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setBriefSaveError(error instanceof Error ? error.message : 'Could not update your saved insights. Please try again.');
      console.error('[Home] Daily Brief save failed.', error);
    } finally {
      saveInFlight.current = false;
      setSavingBrief(false);
    }
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop variant="home" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: previewMode ? 4 : insets.top + 12, paddingBottom: previewMode ? 76 : 116 + insets.bottom }}
      >
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(380)} style={[styles.header, compactHeader && styles.compactHeader]}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, compactHeader && styles.compactBrandMark]}>
              <Feather name="trending-up" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.brandCopy}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.greetingName, compactHeader && styles.compactGreetingName, { color: colors.text }]}
              >
                {compactHeader
                  ? `${greeting.replace(/^Good\s+/, '').replace(/^./, (character) => character.toUpperCase())}, ${firstName}!`
                  : `${greeting}, ${firstName}! 👋`}
              </Text>
              <Text numberOfLines={1} style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                {compactHeader ? 'Trade with more clarity.' : 'Trade with more clarity today 📈'}
              </Text>
            </View>
          </View>
          {!previewMode ? (
            <View style={[styles.headerActions, compactHeader && styles.compactHeaderActions]}>
              <TouchableOpacity onPress={support} style={styles.headerIconTouch} accessibilityLabel="Contact support">
                <LiquidGlassSurface
                  style={styles.headerIcon}
                  fallbackStyle={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
                  tintColor={colors.card}
                  colorScheme={colors.text === '#FFFFFF' ? 'dark' : 'light'}
                >
                  <Feather name="mail" size={18} color={colors.text} />
                </LiquidGlassSurface>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigate('/community-notifications')} style={styles.headerIconTouch} accessibilityLabel="Open notifications">
                <LiquidGlassSurface
                  style={styles.headerIcon}
                  fallbackStyle={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
                  tintColor={colors.card}
                  colorScheme={colors.text === '#FFFFFF' ? 'dark' : 'light'}
                >
                  <Feather name="bell" size={18} color={colors.text} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(90).duration(430)}>
          <TouchableOpacity
            onPress={showSessions}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="View trading sessions"
            style={styles.marketBanner}
          >
            <LinearGradient
              colors={['#064E43', '#087A68']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.marketBannerGradient}
            >
              <LiquidGlassSheen width={viewportWidth} reduceMotion={reduceMotion} />
              <View style={styles.marketBannerIcon}>
                <Feather name="clock" size={21} color="#075D50" />
              </View>
              <View style={styles.marketBannerCopy}>
                <View style={styles.marketTitleRow}>
                  <Text style={styles.marketBannerTitle}>Market sessions</Text>
                  <View style={styles.marketStatus}>
                    <MarketStatusIndicator isOpen={activeSessionNames.length > 0} />
                    <Text style={styles.marketStatusText}>{activeSessionNames.length ? 'OPEN' : 'CLOSED'}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.marketBannerText}>
                  {activeSessionNames.length
                    ? `${activeSessionNames.join(' & ')} ${activeSessionNames.length === 1 ? 'session is' : 'sessions are'} open`
                    : 'Forex markets are currently closed'}
                </Text>
              </View>
              <Feather name="chevron-right" size={21} color="#B7F1E2" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <MarketBriefCard
          briefState={briefState}
          loading={briefLoading}
          error={briefLoadError}
          focused={homeFocused}
          reduceMotion={reduceMotion}
          savedBriefIds={new Set(
            savedBriefs
              .filter((brief) => brief.brief_id === `daily-brief-${briefState?.dateKey}`)
              .map((brief) => brief.card_id),
          )}
          saving={savingBrief}
          saveMessage={briefSaveMessage}
          saveError={briefSaveError}
          onOpen={() => navigate('/daily-brief')}
          onRetry={() => void loadDailyBrief()}
          onSave={toggleBriefSave}
        />

        <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(180).duration(480)}>
          <LinearGradient
            colors={['#0A6258', '#0D776B', '#118778']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.toolsPanel}
          >
            <View pointerEvents="none" style={styles.panelGlowTop} />
            <View pointerEvents="none" style={styles.panelGlowBottom} />
            <LiquidGlassSheen width={viewportWidth} reduceMotion={reduceMotion} />
            <View style={styles.toolsHeading}>
              <View style={styles.toolsHeadingCopy}>
                <Text style={styles.toolsEyebrow}>BUILT FOR BETTER DECISIONS</Text>
                <Text style={styles.toolsTitle}>Your trading toolkit</Text>
                <Text style={styles.toolsSubtitle}>Everything you need, in one place</Text>
              </View>
              <View style={styles.toolsCount}>
                <Feather name="grid" size={13} color="#D9FFF2" />
                <Text style={styles.toolsCountText}>{toolsExpanded ? '9 TOOLS' : '6 OF 9'}</Text>
              </View>
            </View>
            <View style={styles.toolsGrid}>
              <FeatureShortcut icon="grid" label="Lot Calculator" onPress={() => navigate('/lot-size-calculator')} />
              <FeatureShortcut icon="calendar" label="Economic Calendar" onPress={() => navigate('/economic-calendar')} />
              <FeatureShortcut icon="bookmark" label="Saved Setups" onPress={() => navigate('/saved')} />
              <FeatureShortcut
                icon="book-open"
                label="Learning Hub"
                badge="🔥"
                animated
                animationActive={homeFocused}
                reduceMotion={reduceMotion}
                onPress={() => router.push('/learning-hub')}
              />
              <FeatureShortcut icon="headphones" label="Help & Support" onPress={() => navigate('/support-chat')} />
              <FeatureShortcut icon="sliders" label="Strategies" onPress={() => void openStrategy()} />
              {toolsExpanded ? (
                <Animated.View
                  entering={reduceMotion ? undefined : FadeInDown.duration(220)}
                  exiting={reduceMotion ? undefined : FadeOutUp.duration(160)}
                  style={styles.toolsLastRow}
                >
                  <FeatureShortcut icon="shield" label="Risk Management" onPress={() => navigate('/risk-management')} />
                  <FeatureShortcut icon="book-open" label="Daily Brief" onPress={() => navigate('/daily-brief')} />
                  <FeatureShortcut icon="trending-up" label="Trade Setup" onPress={() => void openProtectedFeature('TRADE_SETUP', '/analysis')} />
                </Animated.View>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setToolsExpanded((expanded) => !expanded);
              }}
              style={styles.toolsPanelFooter}
              accessibilityRole="button"
              accessibilityLabel={toolsExpanded ? 'Show fewer trading tools' : 'Show all trading tools'}
              accessibilityState={{ expanded: toolsExpanded }}
            >
              <Text style={styles.toolsFooterLabel}>{toolsExpanded ? 'Show less' : 'Show 3 more'}</Text>
              <Feather name={toolsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#C7F4E7" />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(280).duration(480)} style={styles.dashboardCards}>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.dashboardCardHeader}>
              <View style={styles.cardEyebrow}>
                <Feather name="pie-chart" size={13} color={colors.buy} />
                <Text style={[styles.cardEyebrowText, { color: colors.buy }]}>RISK SNAPSHOT</Text>
              </View>
              <TouchableOpacity onPress={() => navigate('/risk-management')} accessibilityLabel="Open risk management">
                <Feather name="edit-2" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.dashboardCardTitle, { color: colors.text }]}>{settings.balanceSet ? `$${settings.accountBalance.toLocaleString()}` : 'Not set'}</Text>
            <Text style={[styles.dashboardCardBody, { color: colors.textSecondary }]}>
              {settings.balanceSet ? 'Account balance' : 'Add balance in Risk Management'}
            </Text>
            <View style={[styles.riskSummary, { borderTopColor: colors.cardBorder }]}>
              <View>
                <Text style={[styles.riskSummaryLabel, { color: colors.textMuted }]}>Risk / trade</Text>
                <Text style={[styles.riskSummaryValue, { color: colors.text }]}>{settings.riskPercent}%</Text>
              </View>
              <View style={[styles.riskDivider, { backgroundColor: colors.cardBorder }]} />
              <View>
                <Text style={[styles.riskSummaryLabel, { color: colors.textMuted }]}>20-pip FX estimate</Text>
                <Text style={[styles.riskSummaryValue, { color: estimatedLot ? colors.buy : colors.textMuted }]}>{estimatedLot || '—'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <NavItem icon="home" label="Home" active colors={colors} onPress={() => {}} />
        <NavItem icon="users" label="Community" colors={colors} onPress={() => router.push('/community')} />
        <TouchableOpacity onPress={() => void openAnalysis()} style={styles.aiNavButton} accessibilityLabel="Open FXSnap AI analysis">
          <LiquidGlassSurface
            style={styles.aiNavCircle}
            fallbackStyle={{ backgroundColor: colors.buy }}
            tintColor={colors.buy}
            colorScheme={colors.text === '#FFFFFF' ? 'dark' : 'light'}
          >
            <LiquidGlassSheen width={72} reduceMotion={reduceMotion} compact />
            <Feather name="aperture" size={26} color={colors.primaryForeground} />
            <Text style={[styles.aiNavLabel, { color: colors.primaryForeground }]}>Analyze</Text>
          </LiquidGlassSurface>
        </TouchableOpacity>
        <NavItem icon="calendar" label="Events" colors={colors} onPress={() => router.push('/events')} />
        <NavItem icon="user" label="Profile" colors={colors} onPress={() => router.push('/profile')} />
      </View>

      <Modal visible={sessionModalVisible} transparent animationType="fade" onRequestClose={() => setSessionModalVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.sessionModal, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trading Sessions</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{sessionState.headline}</Text>
              </View>
              <TouchableOpacity onPress={() => setSessionModalVisible(false)} style={[styles.modalClose, { backgroundColor: colors.surface }]} accessibilityLabel="Close sessions">
                <Feather name="x" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {SESSION_DEFINITIONS.map((session) => {
              const active = activeSessionNames.includes(session.name);
              return (
                <View key={session.name} style={[styles.sessionRow, { borderTopColor: colors.cardBorder }]}>
                  <View style={[styles.badgeDot, { backgroundColor: active ? colors.buy : colors.textMuted }]} />
                  <Text style={[styles.sessionName, { color: colors.text }]}>{session.name}</Text>
                  <Text style={[styles.sessionOpen, { color: active ? colors.buy : colors.textMuted }]}>{active ? 'Open' : 'Closed'}</Text>
                </View>
              );
            })}
            <Text style={[styles.modalFootnote, { color: colors.textMuted }]}>Hours use each market’s local timezone, including daylight-saving changes. Local holidays are not reflected.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FeatureShortcut({
  icon,
  label,
  badge,
  animated = false,
  animationActive = false,
  reduceMotion = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  badge?: string;
  animated?: boolean;
  animationActive?: boolean;
  reduceMotion?: boolean;
  onPress: () => void;
}) {
  const breathing = useSharedValue(0);
  const iconBreathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathing.value * 0.045 }],
  }));
  const flameMotion = useSharedValue(0);
  const flameStyle = useAnimatedStyle(() => ({
    opacity: 0.82 + flameMotion.value * 0.18,
    textShadowRadius: 2 + flameMotion.value * 3,
    transform: [
      { rotate: `${-5 + flameMotion.value * 10}deg` },
      { scale: 0.96 + flameMotion.value * 0.08 },
    ],
  }));
  const orbit = useSharedValue(0);
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }],
  }));
  const learningLine = useSharedValue(0);
  const lineStyle = useAnimatedStyle(() => ({
    width: 40 * learningLine.value,
  }));
  const lineSparkleStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (learningLine.value - 0.82) / 0.18),
  }));
  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  const delayedPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelAnimation(breathing);
    cancelAnimation(flameMotion);
    cancelAnimation(orbit);
    cancelAnimation(learningLine);
    if (!animated || !animationActive || reduceMotion) {
      breathing.value = 0;
      flameMotion.value = 0;
      orbit.value = 0;
      learningLine.value = 1;
      return;
    }
    breathing.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    flameMotion.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    orbit.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.linear }), -1, false);
    learningLine.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 200, easing: Easing.linear }),
        withTiming(0, { duration: 6000 }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(breathing);
      cancelAnimation(flameMotion);
      cancelAnimation(orbit);
      cancelAnimation(learningLine);
    };
  }, [animated, animationActive, breathing, flameMotion, learningLine, orbit, reduceMotion]);

  useEffect(() => () => {
    if (delayedPress.current) clearTimeout(delayedPress.current);
  }, []);

  const handlePress = () => {
    if (!animated) {
      onPress();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reduceMotion) {
      pressScale.value = withSequence(
        withTiming(0.88, { duration: 75, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 180, easing: Easing.out(Easing.back(1.5)) }),
      );
      learningLine.value = withSequence(
        withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 180 }),
      );
      delayedPress.current = setTimeout(onPress, 100);
      return;
    }
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.featureShortcut} activeOpacity={0.8} accessibilityRole="button">
      <View style={styles.featureIconOuter}>
        {animated ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.learningHubOrbit, orbitStyle]}>
              <View style={styles.learningHubOrbitLight} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.learningHubLine, lineStyle]} />
            <Animated.Text pointerEvents="none" style={[styles.learningHubLineSparkle, lineSparkleStyle]}>✦</Animated.Text>
            <Sparkle active={animationActive && !reduceMotion} style={styles.learningSparkleOne} driftX={-5} driftY={-8} />
            <Sparkle active={animationActive && !reduceMotion} style={styles.learningSparkleTwo} driftX={5} driftY={-7} />
            <Sparkle active={animationActive && !reduceMotion} style={styles.learningSparkleThree} driftX={-7} driftY={-3} />
          </>
        ) : null}
        <Animated.View style={[styles.featureIcon, animated && iconBreathingStyle, animated && pressStyle]}>
          <Feather name={icon} size={20} color="#075D50" />
        </Animated.View>
        {badge ? (
          <View style={styles.featureBadge} accessibilityLabel={badge}>
            <Animated.Text style={[styles.featureBadgeText, animated && flameStyle]}>{badge}</Animated.Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.featureLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Sparkle({
  active,
  style,
  driftX,
  driftY,
}: {
  active: boolean;
  style: React.ComponentProps<typeof Animated.Text>['style'];
  driftX: number;
  driftY: number;
}) {
  const progress = useSharedValue(0);
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.12
      ? progress.value / 0.12
      : Math.max(0, 1 - (progress.value - 0.12) / 0.88),
    transform: [
      { translateX: driftX * progress.value },
      { translateY: driftY * progress.value },
      { scale: 0.65 + 0.35 * Math.sin(progress.value * Math.PI) },
    ],
  }));

  useEffect(() => {
    cancelAnimation(progress);
    if (!active) {
      progress.value = 0;
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const scheduleSparkle = () => {
      timer = setTimeout(() => {
        progress.value = 0;
        progress.value = withTiming(1, { duration: 680, easing: Easing.out(Easing.quad) });
        scheduleSparkle();
      }, 5000 + Math.random() * 3000);
    };
    scheduleSparkle();
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [active, progress]);

  return (
    <Animated.Text pointerEvents="none" style={[styles.learningSparkle, style, sparkleStyle]}>
      ✦
    </Animated.Text>
  );
}

function MarketBriefCard({
  briefState,
  loading,
  error,
  focused,
  reduceMotion,
  savedBriefIds,
  saving,
  saveMessage,
  saveError,
  onOpen,
  onRetry,
  onSave,
}: {
  briefState: DailyBriefState | null;
  loading: boolean;
  error: string;
  focused: boolean;
  reduceMotion: boolean;
  savedBriefIds: Set<string>;
  saving: boolean;
  saveMessage: string;
  saveError: string;
  onOpen: () => void;
  onRetry: () => void;
  onSave: (brief: DailyBriefItem, event: GestureResponderEvent) => void;
}) {
  const { width } = useWindowDimensions();
  const unreadBriefs = briefState?.briefs.filter((brief) => !briefState.readIds.includes(brief.id)) || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const sweepPosition = useSharedValue(-100);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepPosition.value }],
  }));
  const currentBrief = unreadBriefs[currentIndex] || null;
  const currentSaved = Boolean(currentBrief && savedBriefIds.has(currentBrief.id));

  useEffect(() => {
    setCurrentIndex((index) => index < unreadBriefs.length ? index : 0);
  }, [briefState?.dateKey, unreadBriefs.length]);

  useEffect(() => {
    if (!focused || reduceMotion || unreadBriefs.length < 2) return;
    const timer = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % unreadBriefs.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [focused, reduceMotion, unreadBriefs.length]);

  useEffect(() => {
    cancelAnimation(sweepPosition);
    if (!focused || reduceMotion) {
      sweepPosition.value = -100;
      return;
    }
    sweepPosition.value = -100;
    sweepPosition.value = withRepeat(
      withTiming(width + 100, { duration: 7600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(sweepPosition);
  }, [focused, reduceMotion, sweepPosition, width]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(145).duration(420)}
      style={styles.marketBriefWrap}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={currentBrief ? `Open Market Brief: ${currentBrief.title}` : 'Open Market Brief'}
        style={styles.marketBriefCard}
      >
        <View pointerEvents="none" style={styles.marketBriefTopLine}>
          <Animated.View style={[styles.marketBriefSweep, sweepStyle]} />
        </View>
        <View style={styles.marketBriefHeader}>
          <View style={styles.marketBriefHeaderLeft}>
            <Feather name="book-open" size={15} color="#E8B96A" />
            <Text style={styles.marketBriefEyebrow}>MARKET BRIEF</Text>
          </View>
          {briefState && briefState.unreadCount > 0 ? (
            <View style={styles.marketBriefUnread}>
              <Text style={styles.marketBriefUnreadText}>
                {briefState.unreadCount} UNREAD
              </Text>
            </View>
          ) : null}
          {currentBrief ? (
            <TouchableOpacity
              onPress={(event) => onSave(currentBrief, event)}
              disabled={saving}
              style={styles.marketBriefSave}
              accessibilityRole="button"
              accessibilityLabel={currentSaved ? 'Remove insight from saved briefs' : 'Save this insight'}
              accessibilityState={{ disabled: saving, selected: currentSaved }}
            >
              <Feather
                name="bookmark"
                size={16}
                color={currentSaved ? '#E8B96A' : '#C7C4C0'}
                fill={currentSaved ? '#E8B96A' : 'transparent'}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.marketBriefMessage}>
            <Text style={styles.marketBriefTitle}>Preparing your daily insight…</Text>
          </View>
        ) : error ? (
          <View style={styles.marketBriefMessage}>
            <Text style={styles.marketBriefTitle}>Brief temporarily unavailable</Text>
            <View style={styles.marketBriefMessageFooter}>
              <Text numberOfLines={1} style={styles.marketBriefBody}>{error}</Text>
              <TouchableOpacity
                onPress={onRetry}
                style={styles.marketBriefRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry loading Market Brief"
              >
                <Feather name="refresh-cw" size={14} color="#E8B96A" />
              </TouchableOpacity>
            </View>
          </View>
        ) : currentBrief ? (
          <Animated.View
            key={currentBrief.id}
            entering={reduceMotion ? undefined : FadeInDown.duration(230)}
            style={styles.marketBriefStory}
          >
            <Text numberOfLines={2} style={styles.marketBriefTitle}>{currentBrief.title}</Text>
            <Text numberOfLines={1} style={styles.marketBriefBody}>{currentBrief.body}</Text>
          </Animated.View>
        ) : (
          <View style={styles.marketBriefMessage}>
            <Text style={styles.marketBriefTitle}>You’re all caught up</Text>
            <Text style={styles.marketBriefBody}>Come back tomorrow for your next trading insight.</Text>
          </View>
        )}

        <View style={styles.marketBriefFooter}>
          <Text numberOfLines={1} style={styles.marketBriefCategory}>
            {currentBrief?.category.toUpperCase() || 'DAILY TRADING INSIGHT'}
          </Text>
          {unreadBriefs.length > 1 ? (
            <View
              style={styles.marketBriefProgressTrack}
              accessibilityLabel={`Insight ${currentIndex + 1} of ${unreadBriefs.length}`}
            >
              <View
                style={[
                  styles.marketBriefProgressFill,
                  { width: `${((currentIndex + 1) / unreadBriefs.length) * 100}%` },
                ]}
              />
            </View>
          ) : null}
          <View style={styles.marketBriefReadMore}>
            <Text style={styles.marketBriefReadMoreText}>READ BRIEF</Text>
            <Feather name="arrow-up-right" size={13} color="#E8B96A" />
          </View>
        </View>
        {saveMessage ? <Text style={styles.marketBriefFeedback}>{saveMessage}</Text> : null}
        {saveError ? <Text accessibilityRole="alert" style={styles.marketBriefFeedback}>{saveError}</Text> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function MarketStatusIndicator({ isOpen }: { isOpen: boolean }) {
  const pulse = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  useEffect(() => {
    pulse.value = isOpen && !reduceMotion ? withRepeat(withTiming(1.18, { duration: 1100 }), -1, true) : 1;
    return () => cancelAnimation(pulse);
  }, [isOpen, pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.marketStatusDot,
        { backgroundColor: isOpen ? '#65E6AC' : '#D7B85C' },
        animatedStyle,
      ]}
    />
  );
}

function LiquidGlassSurface({
  children,
  style,
  fallbackStyle,
  tintColor,
  colorScheme,
}: {
  children: React.ReactNode;
  style: React.ComponentProps<typeof View>['style'];
  fallbackStyle: React.ComponentProps<typeof View>['style'];
  tintColor: string;
  colorScheme: 'light' | 'dark';
}) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={style}
        tintColor={tintColor}
        colorScheme={colorScheme}
        isInteractive
        glassEffectStyle={{ style: 'regular', animate: true, animationDuration: 0.35 }}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, styles.fallbackGlassSurface, fallbackStyle]}>
      <LinearGradient
        colors={colorScheme === 'dark'
          ? ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.025)', 'rgba(0,0,0,0.08)']
          : ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.12)', 'rgba(35,129,95,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.nonInteractive]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.nonInteractive,
          styles.fallbackGlassTint,
          { borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.58)' },
        ]}
      />
      {children}
    </View>
  );
}

function LiquidGlassSheen({
  width,
  reduceMotion,
  compact = false,
}: {
  width: number;
  reduceMotion: boolean;
  compact?: boolean;
}) {
  const position = useSharedValue(-150);
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }, { rotate: '22deg' }],
  }));

  useEffect(() => {
    cancelAnimation(position);
    if (reduceMotion) {
      position.value = 0;
      return;
    }
    position.value = -150;
    position.value = withRepeat(
      withTiming(width + 170, { duration: compact ? 5200 : 7600, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(position);
  }, [compact, position, reduceMotion, width]);

  return (
    <Animated.View
      style={[
        styles.glassSheen,
        styles.nonInteractive,
        compact && styles.compactGlassSheen,
        sheenStyle,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        locations={[0, 0.2, 0.5, 0.8, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.glassSheenGradient}
      />
    </Animated.View>
  );
}

function NavItem({ icon, label, active, colors, onPress }: { icon: string; label: string; active?: boolean; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.navItem} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon as any} size={20} color={active ? colors.buy : colors.textMuted} />
      <Text style={[styles.navLabel, { color: active ? colors.buy : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  compactHeader: { paddingHorizontal: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  brandMark: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#168779' },
  compactBrandMark: { width: 40, height: 40, borderRadius: 13 },
  brandCopy: { flex: 1, minWidth: 0 },
  greetingName: { fontSize: 19, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  compactGreetingName: { fontSize: 15, lineHeight: 20 },
  headerSubtitle: { marginTop: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  headerActions: { flexDirection: 'row', gap: 9, marginLeft: 8 },
  compactHeaderActions: { gap: 6, marginLeft: 6 },
  headerIconTouch: { width: 42, height: 42, borderRadius: 21 },
  headerIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallbackGlassSurface: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  fallbackGlassTint: { borderWidth: 1, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  nonInteractive: { pointerEvents: 'none' },
  marketBanner: { marginTop: 18, marginHorizontal: 18, borderRadius: 22, overflow: 'hidden', elevation: 5, shadowColor: '#075D50', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  marketBannerGradient: { minHeight: 80, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, gap: 12 },
  marketBannerIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3D35A' },
  marketBannerCopy: { flex: 1, gap: 4 },
  marketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  marketBannerTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' },
  marketStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)' },
  marketStatusDot: { width: 5, height: 5, borderRadius: 3 },
  marketStatusText: { color: '#E4FFF5', fontSize: 7, letterSpacing: 0.4, fontFamily: 'Inter_700Bold' },
  marketBannerText: { color: '#C6EEE3', fontSize: 11, fontFamily: 'Inter_500Medium' },
  toolsPanel: { marginTop: 17, marginHorizontal: 16, paddingHorizontal: 12, paddingTop: 17, paddingBottom: 9, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  panelGlowTop: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -66, top: -112, backgroundColor: 'rgba(113,239,206,0.13)' },
  panelGlowBottom: { position: 'absolute', width: 150, height: 150, borderRadius: 75, left: -94, bottom: -82, backgroundColor: 'rgba(4,52,65,0.18)' },
  glassSheen: { position: 'absolute', zIndex: 1, top: -90, bottom: -90, left: 0, width: 105 },
  compactGlassSheen: { top: -18, bottom: -18, width: 55 },
  glassSheenGradient: { flex: 1, width: '100%' },
  toolsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7, marginBottom: 10 },
  toolsHeadingCopy: { flex: 1 },
  toolsEyebrow: { color: '#A8E8D5', fontSize: 8, letterSpacing: 1.1, marginBottom: 4, fontFamily: 'Inter_700Bold' },
  toolsTitle: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Inter_700Bold' },
  toolsSubtitle: { color: '#C7F4E7', fontSize: 11, marginTop: 3, fontFamily: 'Inter_400Regular' },
  toolsCount: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  toolsCountText: { color: '#D9FFF2', fontSize: 8, letterSpacing: 0.4, fontFamily: 'Inter_700Bold' },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  featureShortcut: { width: '33.333%', minHeight: 92, alignItems: 'center', justifyContent: 'flex-start', gap: 6, paddingTop: 4, paddingHorizontal: 2 },
  featureIconOuter: { position: 'relative', width: 60, height: 60, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  learningHubOrbit: { position: 'absolute', width: 60, height: 60, alignItems: 'center' },
  learningHubOrbitLight: { position: 'absolute', top: -2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD18A', shadowColor: '#FFBD62', shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
  learningHubLine: { position: 'absolute', bottom: 3, left: 10, height: 2, borderRadius: 1, backgroundColor: '#E8B96A', shadowColor: '#FFD18A', shadowOpacity: 0.8, shadowRadius: 3 },
  learningHubLineSparkle: { position: 'absolute', right: 7, bottom: -3, color: '#FFE0A6', fontSize: 10 },
  learningSparkle: { position: 'absolute', zIndex: 4, color: '#FFD18A', fontSize: 11 },
  learningSparkleOne: { top: -8, right: 14 },
  learningSparkleTwo: { top: 0, right: -7, fontSize: 9 },
  learningSparkleThree: { top: 10, right: 14, fontSize: 8 },
  featureBadge: { position: 'absolute', top: -3, right: -3, width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, borderColor: '#0A6258', backgroundColor: '#FFF8EA' },
  featureBadgeText: { fontSize: 13, lineHeight: 17, textShadowColor: 'rgba(255,177,71,0.8)' },
  featureIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F3', elevation: 3, shadowColor: '#042D29', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  featureLabel: { minHeight: 28, color: '#FFFFFF', fontSize: 10, lineHeight: 13, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  toolsLastRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-around' },
  toolsPanelFooter: { minWidth: 112, height: 32, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12 },
  toolsFooterLabel: { color: '#C7F4E7', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  marketBriefWrap: { marginTop: 13, marginHorizontal: 16 },
  marketBriefCard: { minHeight: 126, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(232,185,106,0.28)', backgroundColor: '#111A29', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, elevation: 3, shadowColor: '#101827', shadowOpacity: 0.14, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  marketBriefTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, overflow: 'hidden', backgroundColor: 'rgba(232,185,106,0.18)' },
  marketBriefSweep: { width: 62, height: 1, backgroundColor: '#E8B96A', opacity: 0.75 },
  marketBriefHeader: { minHeight: 19, flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketBriefHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  marketBriefEyebrow: { color: '#E8B96A', fontSize: 9, letterSpacing: 1.15, fontFamily: 'Inter_700Bold' },
  marketBriefUnread: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(232,185,106,0.12)' },
  marketBriefUnreadText: { color: '#E8B96A', fontSize: 7, letterSpacing: 0.45, fontFamily: 'Inter_700Bold' },
  marketBriefSave: { width: 28, height: 28, marginLeft: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)' },
  marketBriefStory: { marginTop: 4 },
  marketBriefMessage: { flex: 1, justifyContent: 'center', minHeight: 58, paddingTop: 4 },
  marketBriefMessageFooter: { flexDirection: 'row', alignItems: 'center' },
  marketBriefRetry: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  marketBriefTitle: { color: '#F7F4EE', fontSize: 14, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  marketBriefBody: { flex: 1, marginTop: 3, color: '#C4C7CE', fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  marketBriefFooter: { minHeight: 17, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  marketBriefCategory: { flexShrink: 1, color: '#AEB6C2', fontSize: 7, letterSpacing: 0.55, fontFamily: 'Inter_600SemiBold' },
  marketBriefProgressTrack: { width: 38, height: 2, overflow: 'hidden', borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
  marketBriefProgressFill: { height: '100%', borderRadius: 1, backgroundColor: '#E8B96A' },
  marketBriefReadMore: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  marketBriefReadMoreText: { color: '#E8B96A', fontSize: 7, letterSpacing: 0.45, fontFamily: 'Inter_700Bold' },
  marketBriefFeedback: { marginTop: 3, color: '#E8B96A', fontSize: 9, fontFamily: 'Inter_500Medium' },
  dashboardCards: { flexDirection: 'column', gap: 10, marginTop: 13, marginHorizontal: 16 },
  dashboardCard: { width: '100%', minWidth: 0, minHeight: 150, borderWidth: 1, borderRadius: 20, padding: 13, elevation: 2, shadowColor: '#252D2A', shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  dashboardCardHeader: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  cardEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardEyebrowText: { fontSize: 8, letterSpacing: 0.45, fontFamily: 'Inter_700Bold' },
  dashboardCardTitle: { fontSize: 14, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  dashboardCardBody: { marginTop: 5, fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  saveInsight: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  saveInsightText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  dashboardToast: { marginTop: 5, fontSize: 9, fontFamily: 'Inter_500Medium' },
  riskSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  riskSummaryLabel: { fontSize: 8, fontFamily: 'Inter_500Medium' },
  riskSummaryValue: { marginTop: 2, fontSize: 12, fontFamily: 'Inter_700Bold' },
  riskDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  aiNavButton: { width: 76, alignItems: 'center', justifyContent: 'center', marginTop: -23 },
  aiNavCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', gap: 1, overflow: 'hidden', elevation: 8, shadowColor: '#087A68', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  aiNavLabel: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end', padding: 16 },
  sessionModal: { borderWidth: 1, borderRadius: 20, padding: 18, paddingBottom: 23 },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalSubtitle: { marginTop: 4, fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalClose: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  sessionName: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sessionOpen: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  modalFootnote: { marginTop: 10, fontSize: 10, fontFamily: 'Inter_400Regular' },
});