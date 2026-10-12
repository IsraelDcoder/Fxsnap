import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOutLeft,
  FadeOutRight,
  Layout,
  ZoomIn,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp, type AppSettings } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type PreferenceKey = 'preferredMarket' | 'onboardingRiskTolerance' | 'preferredTradingStyle' | 'analysisDetail';
type OnboardingStep = 'welcome' | 'market' | 'risk' | 'style' | 'progress' | 'detail';
type OnboardingPreferences = Pick<AppSettings, PreferenceKey>;

const OPTIONS: Record<Exclude<OnboardingStep, 'welcome' | 'progress'>, {
  key: PreferenceKey;
  title: string;
  subtitle?: string;
  options: { value: AppSettings[PreferenceKey]; label: string; detail?: string; icon?: React.ComponentProps<typeof Feather>['name'] }[];
}> = {
  market: {
    key: 'preferredMarket',
    title: 'Which market do you trade most frequently?',
    subtitle: 'This helps personalize your chart analysis.',
    options: [
      { value: 'crypto', label: 'Crypto' },
      { value: 'stocks', label: 'Stocks' },
      { value: 'forex', label: 'Forex' },
      { value: 'futures', label: 'Futures' },
    ],
  },
  risk: {
    key: 'onboardingRiskTolerance',
    title: 'What is your risk tolerance?',
    subtitle: 'This helps personalize your chart analysis.',
    options: [
      { value: 'low', label: 'Low Risk' },
      { value: 'medium', label: 'Medium Risk' },
      { value: 'high', label: 'High Risk' },
    ],
  },
  style: {
    key: 'preferredTradingStyle',
    title: 'What is your preferred trading strategy?',
    subtitle: 'This helps personalize your chart analysis.',
    options: [
      { value: 'scalping', label: 'Scalping', detail: 'Short-term trades from seconds to minutes', icon: 'zap' },
      { value: 'day_trading', label: 'Day Trading', detail: 'Holding positions for hours', icon: 'clock' },
      { value: 'swing', label: 'Swing Trading', detail: 'Longer trades held for days or weeks', icon: 'calendar' },
    ],
  },
  detail: {
    key: 'analysisDetail',
    title: 'How Detailed Should Your Chart Analysis Be?',
    subtitle: 'This helps personalize your chart analysis.',
    options: [
      { value: 'basic', label: 'Basic' },
      { value: 'standard', label: 'Standard' },
      { value: 'advanced', label: 'Advanced' },
    ],
  },
};

const STEPS: OnboardingStep[] = ['welcome', 'market', 'risk', 'style', 'progress', 'detail'];

function WelcomePreview() {
  const colors = useColors();
  return (
    <View style={[styles.deviceFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.deviceScreen, { backgroundColor: colors.background }]}>
        <View style={styles.deviceStatus}>
          <Text style={[styles.deviceStatusText, { color: colors.textSecondary }]}>10:01</Text>
          <View style={styles.devicePill} />
          <Feather name="battery-charging" size={17} color={colors.text} />
        </View>
        <View style={styles.deviceHeading}>
          <Feather name="chevron-left" size={20} color={colors.text} />
          <Text style={[styles.deviceTitle, { color: colors.text }]}>Chart Analysis</Text>
          <View style={styles.deviceHeaderSpacer} />
        </View>
        <View style={styles.previewChart}>
          <Svg width="100%" height="100%" viewBox="0 0 280 112" preserveAspectRatio="none">
            {[24, 52, 80, 108].map((y) => (
              <Line key={y} x1="4" x2="276" y1={y} y2={y} stroke={colors.cardBorder} strokeDasharray="4 5" />
            ))}
            <Path d="M4 89 L28 77 L53 82 L78 61 L103 69 L128 39 L153 49 L178 25 L203 44 L228 18 L252 31 L276 9" fill="none" stroke={colors.buy} strokeWidth="3" />
            {[4, 53, 103, 153, 203, 252, 276].map((x, index) => (
              <Circle key={x} cx={x} cy={[89, 82, 69, 49, 44, 31, 9][index]} r="3.5" fill={colors.text} />
            ))}
          </Svg>
        </View>
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.previewSectionTitle, { color: colors.text }]}>Key Insights</Text>
          <View style={styles.previewStats}>
            <PreviewStat icon="trending-up" label="Trend" value="Bullish" />
            <PreviewStat icon="bar-chart-2" label="Volatility" value="Moderate" />
          </View>
          <View style={styles.previewMeterRow}>
            <View style={[styles.previewMeter, { backgroundColor: colors.surface }]}><Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Volume</Text><Text style={[styles.previewValue, { color: colors.text }]}>Moderate</Text><View style={[styles.meterTrack, { backgroundColor: colors.cardBorder }]}><View style={[styles.meterFill, { width: '54%', backgroundColor: colors.buy }]} /></View></View>
            <View style={[styles.previewMeter, { backgroundColor: colors.surface }]}><Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Structure</Text><Text style={[styles.previewValue, { color: colors.text }]}>Developing</Text><View style={[styles.meterTrack, { backgroundColor: colors.cardBorder }]}><View style={[styles.meterFill, { width: '67%', backgroundColor: colors.buy }]} /></View></View>
          </View>
        </View>
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.previewSectionTitle, { color: colors.text }]}>Trade Plan</Text>
          <Text style={[styles.previewBody, { color: colors.textSecondary }]}>Review the latest price action, nearby levels, and risk before considering a setup.</Text>
        </View>
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.previewSectionTitle, { color: colors.text }]}>Detailed Analysis</Text>
          {['Market structure', 'Support & resistance'].map((item, index) => (
            <View key={item} style={[styles.previewListRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.previewNumber, { backgroundColor: colors.card }]}><Text style={[styles.previewNumberText, { color: colors.accent }]}>{index + 1}</Text></View>
              <Text style={[styles.previewListText, { color: colors.text }]}>{item}</Text>
              <Feather name="chevron-right" size={17} color={colors.textMuted} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function PreviewStat({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.previewStat}>
      <View style={[styles.previewStatIcon, { backgroundColor: colors.surface }]}><Feather name={icon} size={16} color={colors.gold} /></View>
      <View><Text style={[styles.previewLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.previewValue, { color: colors.text }]}>{value}</Text></View>
    </View>
  );
}

function ProgressIllustration() {
  const colors = useColors();
  return (
    <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.progressCardTitle, { color: colors.text }]}>Your Trading Journey</Text>
      <View style={styles.progressGraph}>
        <Svg width="100%" height="100%" viewBox="0 0 330 184" preserveAspectRatio="none">
          {[24, 66, 108, 150].map((y) => (
            <Line key={y} x1="8" x2="322" y1={y} y2={y} stroke={colors.cardBorder} strokeDasharray="5 6" />
          ))}
          <Path d="M8 132 C46 127 57 125 91 122 S141 107 172 101 S225 76 251 60 S292 34 322 19 L322 150 L8 150 Z" fill={colors.buy} opacity="0.18" />
          <Path d="M8 132 C46 127 57 125 91 122 S141 107 172 101 S225 76 251 60 S292 34 322 19" fill="none" stroke={colors.buy} strokeWidth="3" />
          {[[8, 132], [91, 122], [194, 87], [322, 19]].map(([cx, cy]) => (
            <Circle key={cx} cx={cx} cy={cy} r="4" fill={colors.text} />
          ))}
          <Circle cx="322" cy="19" r="14" fill={colors.buy} />
          <Path d="M322 10 L322 27 M318 14 C318 10 326 10 326 14 C326 18 318 18 318 22 C318 26 326 26 326 22" fill="none" stroke="#FFFFFF" strokeWidth="1.7" />
        </Svg>
      </View>
      <View style={styles.graphLabels}>
        <Text style={[styles.graphLabel, { color: colors.textSecondary }]}>Learn</Text><Text style={[styles.graphLabel, { color: colors.textSecondary }]}>Review</Text>
        <Text style={[styles.graphLabel, { color: colors.textSecondary }]}>Refine</Text><Text style={[styles.graphLabel, { color: colors.textSecondary }]}>Practice</Text>
      </View>
      <Text style={[styles.progressDisclaimer, { color: colors.textSecondary }]}>Illustrative learning journey only. Trading involves risk; no profits or returns are promised.</Text>
    </View>
  );
}

export default function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { settings, updateSettings, completeOnboarding } = useApp();
  const [stepIndex, setStepIndex] = useState(0);
  const [motionDirection, setMotionDirection] = useState<'forward' | 'back'>('forward');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<OnboardingPreferences>(() => ({
    preferredMarket: settings.preferredMarket,
    onboardingRiskTolerance: settings.onboardingRiskTolerance,
    preferredTradingStyle: settings.preferredTradingStyle,
    analysisDetail: settings.analysisDetail,
  }));
  const step = STEPS[stepIndex];

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMotionDirection('forward');
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMotionDirection('back');
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      setFinishError(null);
      await updateSettings(preferences);
      await completeOnboarding();
      router.replace('/analysis');
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to save your onboarding choices. Please try again.');
    } finally {
      setFinishing(false);
    }
  };

  const selectOption = <K extends PreferenceKey>(key: K, value: AppSettings[K]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 12) + 12;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['rgba(255, 216, 77, 0.11)', 'rgba(255, 216, 77, 0.025)', 'transparent']}
        locations={[0, 0.42, 1]}
        style={styles.ambientGlow}
        pointerEvents="none"
      />
      <Animated.View
        key={step}
        entering={reduceMotion ? undefined : motionDirection === 'forward' ? FadeInRight.duration(380) : FadeInLeft.duration(380)}
        exiting={reduceMotion ? undefined : motionDirection === 'forward' ? FadeOutLeft.duration(220) : FadeOutRight.duration(220)}
        style={styles.screenContent}
      >
      {step === 'welcome' ? (
        <>
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(100).duration(550)} style={styles.welcomeTitleWrap}>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>Your Next Trade Insight</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>Just One Photo Away</Text>
          </Animated.View>
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(220).duration(700)} style={styles.welcomePreviewWrap}>
            <WelcomePreview />
          </Animated.View>
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(430).duration(500)} style={[styles.footer, { paddingBottom: bottomPadding }]}>
            <PrimaryButton label="Get Started" onPress={advance} />
          </Animated.View>
        </>
      ) : (
        <>
          <View style={styles.progressHeader}>
            <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Feather name="chevron-left" size={28} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
              <Animated.View layout={Layout.springify().damping(20)} style={[styles.progressFill, { width: `${stepIndex * 12}%`, backgroundColor: colors.accent }]} />
            </View>
          </View>
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {step === 'progress' ? (
              <>
                <Animated.Text entering={reduceMotion ? undefined : FadeInDown.delay(80).duration(520)} style={[styles.pageTitle, { color: colors.text }]}>
                  AI-Powered Insights to Help You Trade with Clarity
                </Animated.Text>
                <Animated.View entering={reduceMotion ? undefined : ZoomIn.delay(220).duration(650)}>
                  <ProgressIllustration />
                </Animated.View>
              </>
            ) : (
              <>
                <Animated.Text entering={reduceMotion ? undefined : FadeInDown.delay(80).duration(520)} style={[styles.pageTitle, { color: colors.text }]}>
                  {OPTIONS[step].title}
                </Animated.Text>
                {OPTIONS[step].subtitle ? (
                  <Animated.Text entering={reduceMotion ? undefined : FadeInDown.delay(170).duration(520)} style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
                    {OPTIONS[step].subtitle}
                  </Animated.Text>
                ) : null}
                <View style={[styles.options, step === 'style' && styles.styleOptions]}>
                  {OPTIONS[step].options.map((option, optionIndex) => {
                    const selected = preferences[OPTIONS[step].key] === option.value;
                    return (
                      <Animated.View
                        key={option.value}
                        entering={reduceMotion ? undefined : FadeInUp.delay(220 + optionIndex * 85).duration(440)}
                        layout={reduceMotion ? undefined : Layout.springify().damping(18)}
                      >
                        <TouchableOpacity
                          onPress={() => selectOption(OPTIONS[step].key, option.value)}
                          style={[
                            styles.option,
                            step === 'style' && styles.styleOption,
                            { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.cardBorder },
                          ]}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          {option.icon ? (
                            <Feather name={option.icon} size={28} color={selected ? colors.primaryForeground : colors.text} />
                          ) : null}
                          <View style={styles.optionCopy}>
                            <Text style={[styles.optionLabel, { color: selected ? colors.primaryForeground : colors.text }]}>{option.label}</Text>
                            {option.detail ? <Text style={[styles.optionDetail, { color: selected ? colors.primaryForeground : colors.textSecondary }]}>{option.detail}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
            {finishError ? <Text style={[styles.finishError, { color: colors.destructive }]}>{finishError}</Text> : null}
            <PrimaryButton
              label={finishing ? 'Saving…' : 'Next'}
              onPress={stepIndex === STEPS.length - 1 ? () => void finish() : advance}
              disabled={finishing}
              leading={finishing ? <ActivityIndicator color={colors.primaryForeground} /> : undefined}
            />
          </View>
        </>
      )}
      </Animated.View>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  leading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  leading?: React.ReactNode;
}) {
  const colors = useColors();
  const pulse = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  React.useEffect(() => {
    cancelAnimation(pulse);
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.012, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * pressScale.value }],
  }));

  return (
    <Animated.View style={motionStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { pressScale.value = reduceMotion ? 1 : withSpring(0.97, { damping: 14, stiffness: 280 }); }}
        onPressOut={() => { pressScale.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 280 }); }}
        disabled={disabled}
        style={[styles.primaryButton, { backgroundColor: colors.primary }, disabled && styles.buttonDisabled]}
        accessibilityRole="button"
      >
        {leading}
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { flex: 1 },
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 310 },
  welcomeTitleWrap: { paddingHorizontal: 28, marginTop: 40, alignItems: 'center' },
  welcomeTitle: { fontSize: 25, lineHeight: 34, textAlign: 'center', fontWeight: '700' },
  welcomePreviewWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 42, paddingTop: 28, paddingBottom: 18 },
  deviceFrame: {
    flex: 1,
    width: '100%',
    maxHeight: 570,
    alignSelf: 'center',
    backgroundColor: '#F1F3F5',
    borderColor: '#AAA8AA',
    borderWidth: 2,
    borderRadius: 42,
    padding: 10,
  },
  deviceScreen: { flex: 1, borderRadius: 32, overflow: 'hidden', paddingHorizontal: 10, paddingTop: 8, gap: 9 },
  deviceStatus: { height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  deviceStatusText: { fontSize: 10, fontWeight: '600' },
  devicePill: { width: 70, height: 17, backgroundColor: '#050505', borderRadius: 12, position: 'absolute', left: '40%' },
  deviceHeading: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceTitle: { fontSize: 16, fontWeight: '700' },
  deviceHeaderSpacer: { width: 20 },
  previewChart: { height: 90, paddingHorizontal: 2 },
  previewCard: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 9 },
  previewSectionTitle: { textAlign: 'center', fontWeight: '700', fontSize: 14 },
  previewStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  previewStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewStatIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  previewLabel: { fontSize: 9 },
  previewValue: { fontSize: 11, fontWeight: '600' },
  previewMeterRow: { flexDirection: 'row', gap: 8 },
  previewMeter: { flex: 1, borderRadius: 8, padding: 7, gap: 3 },
  meterTrack: { height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 3 },
  meterFill: { height: '100%', borderRadius: 4 },
  previewBody: { textAlign: 'center', fontSize: 10, lineHeight: 15 },
  previewListRow: { minHeight: 38, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 },
  previewNumber: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  previewNumberText: { fontSize: 11, fontWeight: '700' },
  previewListText: { flex: 1, fontSize: 10 },
  footer: { paddingHorizontal: 22, paddingTop: 8 },
  primaryButton: { minHeight: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonDisabled: { opacity: 0.72 },
  primaryButtonText: { fontSize: 20, fontWeight: '700' },
  progressHeader: { height: 46, marginTop: 14, marginHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 17 },
  backButton: { width: 30, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  progressTrack: { height: 4, flex: 1, overflow: 'hidden' },
  progressFill: { height: '100%' },
  contentScroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 46, alignItems: 'stretch' },
  pageTitle: { fontSize: 25, lineHeight: 32, fontWeight: '700', textAlign: 'center', marginHorizontal: 0 },
  pageSubtitle: { fontSize: 17, lineHeight: 24, textAlign: 'center', marginTop: 10, marginHorizontal: 14 },
  options: { marginTop: 70, gap: 16 },
  styleOptions: { marginTop: 54 },
  option: { minHeight: 72, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  styleOption: { minHeight: 88, flexDirection: 'row', justifyContent: 'flex-start', gap: 15 },
  optionSelected: {},
  optionCopy: { alignItems: 'center', flex: 1 },
  optionLabel: { fontSize: 19, fontWeight: '600', textAlign: 'center' },
  optionLabelSelected: { color: '#191819' },
  optionDetail: { fontSize: 14, marginTop: 3 },
  optionDetailSelected: { color: '#525054' },
  progressCard: { marginTop: 70, borderRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18 },
  progressCardTitle: { fontSize: 19, fontWeight: '700' },
  progressGraph: { height: 184, marginTop: 13 },
  graphLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 3 },
  graphLabel: { fontSize: 12 },
  progressDisclaimer: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 25 },
  finishError: { color: '#FF7272', textAlign: 'center', fontSize: 13, lineHeight: 18, marginBottom: 8 },
});
