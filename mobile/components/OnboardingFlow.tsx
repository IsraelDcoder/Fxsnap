import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as StoreReview from 'expo-store-review';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp, type AppSettings } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { typography } from '@/constants/typography';
import { trackEvent } from '@/services/telemetry';
import {
  requestAndRegisterPushNotifications,
  saveNotificationPreferences,
} from '@/services/notifications';

type Experience = AppSettings['onboardingExperience'];
type Market = 'forex' | 'crypto' | 'stocks' | 'commodities' | 'indices' | 'other';
type TradingStyle = AppSettings['preferredTradingStyle'];
type AnalysisDetail = AppSettings['analysisDetail'];
type IntroKind = 'opening' | 'demo' | 'analysis' | 'review';
type Phase = 'intro' | 'survey' | 'personalizing' | 'benefits' | 'notifications';

const WELCOME_HEADLINE = 'Your next winning trade starts with a photo.';

const INTRO_SLIDES: { kind: IntroKind; title: string; subtitle: string }[] = [
  {
    kind: 'opening',
    title: 'Your next winning trade starts with a photo.',
    subtitle: 'A clearer way to review the charts you already use.',
  },
  {
    kind: 'demo',
    title: 'Just snap a pic of your chart.',
    subtitle: 'Upload a chart image and let FXSnap organize a technical review.',
  },
  {
    kind: 'analysis',
    title: 'And get money-making insights.',
    subtitle: 'Review chart levels, setup details and risk information in one place.',
  },
  {
    kind: 'review',
    title: 'Help FXSnap grow.',
    subtitle: 'If you like what we are building, you can leave a review. No pressure.',
  },
];

type Choice<T extends string> = { value: T; label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name'] };

const EXPERIENCE_OPTIONS: Choice<Experience>[] = [
  { value: 'beginner', label: 'Beginner', detail: 'I’m still learning the basics.', icon: 'book-open' },
  { value: 'intermediate', label: 'Intermediate', detail: 'I understand the fundamentals.', icon: 'activity' },
  { value: 'expert', label: 'Expert', detail: 'I have substantial trading experience.', icon: 'award' },
];

const MARKET_OPTIONS: Choice<Market>[] = [
  { value: 'forex', label: 'Forex', detail: 'Currency pairs such as EUR/USD.', icon: 'refresh-cw' },
  { value: 'crypto', label: 'Cryptocurrency', detail: 'BTC, ETH and digital assets.', icon: 'hexagon' },
  { value: 'stocks', label: 'Stocks', detail: 'Companies and equity markets.', icon: 'bar-chart-2' },
  { value: 'commodities', label: 'Commodities', detail: 'Gold, oil and other resources.', icon: 'layers' },
  { value: 'indices', label: 'Indices', detail: 'Major market indices.', icon: 'trending-up' },
  { value: 'other', label: 'Other markets', detail: 'Markets not listed above.', icon: 'grid' },
];

const STYLE_OPTIONS: Choice<TradingStyle>[] = [
  { value: 'scalping', label: 'Scalping', detail: 'Very short-term trades and quick decisions.', icon: 'zap' },
  { value: 'day_trading', label: 'Day trading / intraday', detail: 'Open and close positions within a day.', icon: 'sun' },
  { value: 'swing', label: 'Swing trading', detail: 'Look for moves that may last several days.', icon: 'activity' },
  { value: 'position', label: 'Position trading', detail: 'Focus on longer-term market moves.', icon: 'trending-up' },
  { value: 'other', label: 'Other / still exploring', detail: 'I am finding the approach that fits.', icon: 'compass' },
];

const DETAIL_OPTIONS: Choice<AnalysisDetail>[] = [
  { value: 'beginner', label: 'Beginner', detail: 'Clear explanations and simple terminology.', icon: 'book-open' },
  { value: 'intermediate', label: 'Intermediate', detail: 'More technical context and chart interpretation.', icon: 'activity' },
  { value: 'advanced', label: 'Advanced', detail: 'Detailed context and technical terminology.', icon: 'bar-chart-2' },
];

const QUESTIONS = [
  { title: 'How much trading experience do you have?', subtitle: 'We’ll adjust explanations to suit your experience.' },
  { title: 'Which markets do you trade?', subtitle: 'Select all that apply.' },
  { title: 'What is your trading style?', subtitle: 'Choose the approach that best describes you.' },
  { title: 'How much analysis detail do you prefer?', subtitle: 'You can change this preference at any time.' },
];

const QUESTION_COUNT = QUESTIONS.length;

function useVideoStatus(player: ReturnType<typeof useVideoPlayer>) {
  const [status, setStatus] = useState(player.status);
  useEffect(() => {
    setStatus(player.status);
    const subscription = player.addListener('statusChange', ({ status: nextStatus }) => setStatus(nextStatus));
    return () => subscription.remove();
  }, [player]);
  return status;
}

function DemoVideo({ reduceMotion }: { reduceMotion: boolean }) {
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const deviceHeight = Math.min(448, Math.max(310, windowHeight * 0.52));
  const player = useVideoPlayer(require('../assets/videos/fxsnap-demo.mov'), (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    if (!reduceMotion) videoPlayer.play();
  });
  const status = useVideoStatus(player);
  useEffect(() => {
    if (reduceMotion) player.pause();
    else player.play();
  }, [player, reduceMotion]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ZoomIn.delay(360).duration(400)}
      style={styles.demoPhoneArea}
    >
      <View style={[styles.demoPhone, { height: deviceHeight }]}>
        <View style={styles.demoSideButtonTop} />
        <View style={styles.demoSideButtonBottom} />
        <View style={styles.demoPhoneBezel}>
          <View style={[styles.demoPhoneScreen, { backgroundColor: colors.surface }]}>
            <View style={styles.demoDynamicIsland} />
            <View style={styles.demoStatusBar}>
              <Text style={[styles.demoStatusText, { color: colors.text }]}>9:41</Text>
              <Feather name="battery" size={14} color={colors.text} />
            </View>
            <View style={styles.demoAppHeader}>
              <Feather name="x" size={18} color={colors.textSecondary} />
              <Text style={[styles.demoAppTitle, { color: colors.text }]}>Analyze Asset</Text>
              <View style={styles.demoHeaderSpacer} />
            </View>
            <View style={[styles.demoVideoScreen, { backgroundColor: colors.background }]}>
              {status === 'error' ? (
                <View style={styles.demoVideoFallback}>
                  <Feather name="trending-up" size={46} color={colors.accent} />
                  <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>See how a chart review comes together.</Text>
                </View>
              ) : (
                <>
                  <VideoView
                    player={player}
                    style={styles.video}
                    contentFit="cover"
                    nativeControls={reduceMotion}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                  />
                  {status !== 'readyToPlay' && (
                    <View style={[styles.videoLoading, { backgroundColor: colors.background }]}>
                      <Feather name="camera" size={40} color={colors.accent} />
                      <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>Loading the FXSnap demo…</Text>
                    </View>
                  )}
                </>
              )}
            </View>
            <View pointerEvents="none" style={styles.demoPhoneBottom}>
              <View style={[styles.demoHomeIndicator, { backgroundColor: colors.textMuted }]} />
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { settings, updateSettings, completeOnboarding } = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [introIndex, setIntroIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradingStyle, setTradingStyle] = useState<TradingStyle | null>(null);
  const [analysisDetail, setAnalysisDetail] = useState<AnalysisDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [compileStep, setCompileStep] = useState(0);
  const [compileReady, setCompileReady] = useState(false);
  const [compileRunId, setCompileRunId] = useState(0);
  const [personalizationSaved, setPersonalizationSaved] = useState(false);
  const [personalizedResultComplete, setPersonalizedResultComplete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 12) + 12;

  useEffect(() => {
    if (phase !== 'personalizing') return;
    if (reduceMotion) {
      setCompileStep(3);
    } else if (compileStep < 3) {
      const stepTimer = setTimeout(() => setCompileStep((step) => Math.min(step + 1, 3)), 1100);
      return () => clearTimeout(stepTimer);
    }
  }, [compileRunId, compileStep, phase, reduceMotion]);

  useEffect(() => {
    if (phase !== 'personalizing') return;
    const timer = setTimeout(() => setCompileReady(true), reduceMotion ? 1200 : 4000);
    return () => clearTimeout(timer);
  }, [compileRunId, phase, reduceMotion]);

  useEffect(() => {
    if (phase === 'personalizing' && personalizationSaved && compileReady) {
      setPhase('benefits');
    }
  }, [compileReady, personalizationSaved, phase]);

  useEffect(() => {
    const screen = phase === 'intro'
      ? `intro_${INTRO_SLIDES[introIndex].kind}`
      : phase === 'survey'
        ? `question_${questionIndex + 1}`
        : phase;
    trackEvent('onboarding_screen_view', { screen });
  }, [introIndex, phase, questionIndex]);

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaveError(null);
    setFinishError(null);
    if (phase === 'intro') {
      if (introIndex > 0) setIntroIndex((index) => index - 1);
    } else if (phase === 'survey') {
      if (questionIndex > 0) setQuestionIndex((index) => index - 1);
      else {
        setPhase('intro');
        setIntroIndex(INTRO_SLIDES.length - 1);
      }
    } else if (phase === 'notifications') {
      setPhase('benefits');
    } else if (phase === 'benefits') {
      setPhase('survey');
      setQuestionIndex(QUESTION_COUNT - 1);
    }
  };

  const savePersonalization = async () => {
    if (!experience || markets.length === 0 || !tradingStyle || !analysisDetail || saving) return;
    setSaving(true);
    setSaveError(null);
    setCompileStep(0);
    setCompileReady(false);
    setCompileRunId((runId) => runId + 1);
    setPersonalizationSaved(false);
    setPersonalizedResultComplete(false);
    setPhase('personalizing');
    try {
      const preferredMarket = markets[0] === 'commodities' || markets[0] === 'indices'
        ? 'futures'
        : markets[0] === 'other'
          ? settings.preferredMarket
          : markets[0];
      await updateSettings({
        onboardingExperience: experience,
        onboardingMarkets: markets,
        preferredTradingStyle: tradingStyle,
        analysisDetail,
        preferredMarket,
      });
      trackEvent('onboarding_personalization_saved', {
        experience,
        markets: markets.join(','),
        trading_style: tradingStyle,
        analysis_detail: analysisDetail,
      });
      setPersonalizationSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Your choices could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const continueSurvey = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (questionIndex < QUESTION_COUNT - 1) {
      setQuestionIndex((index) => index + 1);
      return;
    }
    void savePersonalization();
  };

  const completeOnboardingAndOpenPaywall = async () => {
    await completeOnboarding();
    trackEvent('onboarding_paywall_view', { source: 'onboarding' });
    router.replace({ pathname: '/paywall', params: { source: 'onboarding' } });
  };

  const continueOnboarding = async () => {
    setSaving(true);
    setFinishError(null);
    try {
      await completeOnboardingAndOpenPaywall();
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : 'Unable to continue right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const enableOnboardingNotifications = async () => {
    if (saving) return;
    setSaving(true);
    setNotificationError(null);
    const preferences = {
      enabled: true,
      dailyBrief: true,
      inactivity: true,
      weekly: true,
      community: true,
      systemAnnouncements: true,
    };
    try {
      const registration = await requestAndRegisterPushNotifications(preferences, true);
      if (registration.granted) {
        await saveNotificationPreferences(preferences);
        trackEvent('onboarding_push_notifications_enabled');
      } else {
        await saveNotificationPreferences({ ...preferences, enabled: false });
        trackEvent('onboarding_push_notifications_skipped');
      }
      await completeOnboardingAndOpenPaywall();
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Push notifications could not be enabled. You can try again in Settings.');
    } finally {
      setSaving(false);
    }
  };

  const skipOnboardingNotifications = () => {
    if (saving) return;
    trackEvent('onboarding_push_notifications_skipped');
    void continueOnboarding();
  };

  const selectExperience = (value: Experience) => {
    setExperience(value);
    trackEvent('onboarding_answer', { question: 'experience', answer: value });
  };

  const toggleMarket = (value: Market) => {
    const next = markets.includes(value) ? markets.filter((market) => market !== value) : [...markets, value];
    setMarkets(next);
    trackEvent('onboarding_answer', { question: 'markets', answer: next.join(',') });
  };

  const requestReview = async () => {
    try {
      if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
      else Alert.alert('Review unavailable', 'You can leave a review from your app store page.');
    } catch {
      Alert.alert('Review unavailable', 'You can leave a review from your app store page.');
    }
  };

  const isAnswerSelected = questionIndex === 0
    ? experience !== null
    : questionIndex === 1
      ? markets.length > 0
      : questionIndex === 2
        ? tradingStyle !== null
        : analysisDetail !== null;

  const title = phase === 'intro'
    ? INTRO_SLIDES[introIndex].title
    : phase === 'survey'
      ? QUESTIONS[questionIndex].title
      : phase === 'personalizing'
        ? 'Putting your profile together'
        : phase === 'notifications'
          ? 'Stay up to date'
          : 'Transform your trading journey.';
  const isOpeningScreen = phase === 'intro' && introIndex === 0;
  const isDemoScreen = phase === 'intro' && introIndex === 1;
  const isCompactReview = phase === 'intro' && INTRO_SLIDES[introIndex].kind === 'review' && viewportHeight < 700;
  const personalizedResult = `Your ${markets.map((market) => MARKET_OPTIONS.find((option) => option.value === market)?.label).join(', ')} profile is ready. FXSnap will tailor chart reviews to your ${STYLE_OPTIONS.find((option) => option.value === tradingStyle)?.label.toLowerCase()} approach with ${analysisDetail} explanations.`;

  const continueFromWelcome = () => {
    setIntroIndex(1);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar
        barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      {isOpeningScreen ? (
        <WelcomeScreen
          onContinue={continueFromWelcome}
          reduceMotion={Boolean(reduceMotion)}
          bottomPadding={bottomPadding}
        />
      ) : (
        <>
          <LinearGradient
            colors={[`${colors.accent}22`, `${colors.accent}08`, 'transparent']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {isDemoScreen ? <View style={styles.demoTopSpacer} /> : (
            <View style={styles.topBar}>
              <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
                <Feather name="chevron-left" size={26} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.topBarSpacer} />
            </View>
          )}

          <Animated.View
            key={`${phase}-${phase === 'intro' ? introIndex : phase === 'survey' ? questionIndex : 0}`}
            entering={reduceMotion ? undefined : FadeIn.duration(240)}
            exiting={reduceMotion ? undefined : FadeOut.duration(300)}
            style={styles.page}
          >
            {phase === 'intro' ? (
              <ScrollView contentContainerStyle={[styles.content, isDemoScreen && styles.demoContent, isCompactReview && styles.compactReviewContent]} showsVerticalScrollIndicator={false}>
                {isDemoScreen ? (
                  <>
                    <Animated.Text
                      entering={reduceMotion ? undefined : FadeInDown.duration(380)}
                      style={[typography.heading, styles.demoTitle, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}
                    >
                      {title}
                    </Animated.Text>
                    <DemoVideo reduceMotion={Boolean(reduceMotion)} />
                  </>
                ) : (
                  <>
                    <Animated.Text
                      entering={reduceMotion ? undefined : FadeIn.duration(300)}
                      style={[styles.eyebrow, styles.centeredText, { color: colors.accent }]}
                    >
                      FXSNAP GURU
                    </Animated.Text>
                    {INTRO_SLIDES[introIndex].kind === 'analysis' ? (
                      <TypewriterHeading
                        text={title}
                        reduceMotion={Boolean(reduceMotion)}
                        style={[typography.heading, styles.title, styles.introTitle, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}
                      />
                    ) : (
                      <Animated.Text
                        entering={reduceMotion ? undefined : FadeInDown.duration(380)}
                        style={[typography.heading, styles.title, styles.introTitle, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}
                      >
                        {title}
                      </Animated.Text>
                    )}
                    <Animated.Text
                      entering={reduceMotion ? undefined : FadeInDown.delay(150).duration(350)}
                      style={[typography.body, styles.subtitle, styles.introSubtitle, viewportWidth < 360 && typography.compactBody, { color: colors.textSecondary }]}
                    >
                      {INTRO_SLIDES[introIndex].subtitle}
                    </Animated.Text>
                    {INTRO_SLIDES[introIndex].kind === 'analysis' ? (
                      <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(300).duration(400)}>
                        <AnalysisPreview />
                      </Animated.View>
                    ) : (
                      <ReviewInvitation reduceMotion={Boolean(reduceMotion)} compact={isCompactReview} />
                    )}
                  </>
                )}
              </ScrollView>
            ) : phase === 'survey' ? (
              <ScrollView contentContainerStyle={[styles.content, styles.surveyContent]} showsVerticalScrollIndicator={false}>
                <View style={styles.surveyMeta}>
                  <Text style={[styles.surveyEyebrow, { color: colors.accent }]}>YOUR PROFILE</Text>
                  <View style={[styles.stepPill, { backgroundColor: `${colors.accent}1A` }]}>
                    <Text style={[styles.stepPillText, { color: colors.accent }]}>STEP {String(questionIndex + 1).padStart(2, '0')} / {String(QUESTION_COUNT).padStart(2, '0')}</Text>
                  </View>
                </View>
                <Text style={[typography.heading, styles.title, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}>{title}</Text>
                <Text style={[typography.body, styles.subtitle, styles.surveySubtitle, viewportWidth < 360 && typography.compactBody, { color: colors.textSecondary }]}>{QUESTIONS[questionIndex].subtitle}</Text>
                <View style={styles.options}>
                  {questionIndex === 0 && EXPERIENCE_OPTIONS.map((option, index) => (
                    <ChoiceCard key={option.value} {...option} selected={experience === option.value} index={index} onPress={() => selectExperience(option.value)} />
                  ))}
                  {questionIndex === 1 && MARKET_OPTIONS.map((option, index) => (
                    <ChoiceCard key={option.value} {...option} selected={markets.includes(option.value)} index={index} onPress={() => toggleMarket(option.value)} />
                  ))}
                  {questionIndex === 2 && STYLE_OPTIONS.map((option, index) => (
                    <ChoiceCard key={option.value} {...option} selected={tradingStyle === option.value} index={index} onPress={() => {
                      setTradingStyle(option.value);
                      trackEvent('onboarding_answer', { question: 'trading_style', answer: option.value });
                    }} />
                  ))}
                  {questionIndex === 3 && DETAIL_OPTIONS.map((option, index) => (
                    <ChoiceCard key={option.value} {...option} selected={analysisDetail === option.value} index={index} onPress={() => {
                      setAnalysisDetail(option.value);
                      trackEvent('onboarding_answer', { question: 'analysis_detail', answer: option.value });
                    }} />
                  ))}
                </View>
              </ScrollView>
            ) : phase === 'personalizing' ? (
              <View style={styles.centerContent}>
                <PersonalizingLoader reduceMotion={Boolean(reduceMotion)} />
                <Text style={[typography.heading, styles.title, styles.centerTitle, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}>{title}</Text>
                <Text style={[typography.body, styles.subtitle, styles.centerSubtitle, viewportWidth < 360 && typography.compactBody, { color: colors.textSecondary }]}>Building a starting point around the way you trade.</Text>
                <View style={styles.compileSteps}>
                  {[
                    'Reviewing your trading experience',
                    'Organizing your selected markets',
                    'Setting your analysis detail',
                    'Building your personalized starting point',
                  ].map((step, index) => (
                    <View key={step} style={styles.compileStep}>
                      <View style={[styles.compileStepMarker, { backgroundColor: index < compileStep ? colors.accent : colors.cardBorder }]}>
                        {index < compileStep
                          ? <Feather name="check" size={12} color={colors.primaryForeground} />
                          : index === compileStep && !compileReady
                            ? <ActivityIndicator size="small" color={colors.accent} />
                            : null}
                      </View>
                      <Text style={[styles.compileStepText, { color: index <= compileStep ? colors.text : colors.textMuted }]}>{step}</Text>
                    </View>
                  ))}
                </View>
                {saveError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{saveError}</Text> : null}
              </View>
            ) : phase === 'benefits' ? (
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={[styles.eyebrow, styles.centeredText, { color: colors.accent }]}>MADE FOR YOUR APPROACH</Text>
                <Text style={[typography.heading, styles.title, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}>{title}</Text>
                <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.profileEyebrow, { color: colors.accent }]}>YOUR STARTING PROFILE</Text>
                  <Text style={[styles.profileTitle, { color: colors.text }]}>
                    {EXPERIENCE_OPTIONS.find((option) => option.value === experience)?.label} · {STYLE_OPTIONS.find((option) => option.value === tradingStyle)?.label}
                  </Text>
                  <Text style={[typography.body, { color: colors.textSecondary }]}>
                    {markets.map((market) => MARKET_OPTIONS.find((option) => option.value === market)?.label).join(', ')} · {analysisDetail} analysis detail
                  </Text>
                  <View style={[styles.profileDivider, { backgroundColor: colors.cardBorder }]} />
                  <TypewriterText
                    key={personalizedResult}
                    text={personalizedResult}
                    reduceMotion={Boolean(reduceMotion)}
                    onComplete={() => setPersonalizedResultComplete(true)}
                    style={[typography.body, styles.resultText, { color: colors.text }]}
                  />
                </View>
                {personalizedResultComplete ? (
                  <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(380)} style={styles.benefitList}>
                    <Benefit icon="camera" text="Analyze a chart screenshot in one place." />
                    <Benefit icon="bar-chart-2" text={`Get explanations at your ${analysisDetail} detail level.`} />
                    <Benefit icon="target" text="Review chart structure, price levels and risk together." />
                    <Benefit icon="book-open" text="Explore lessons and market briefings at your own pace." />
                  </Animated.View>
                ) : null}
                <Text style={[styles.disclaimer, { color: colors.textMuted }]}>FXSnap provides educational information, not financial advice. Trading involves risk.</Text>
                {finishError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{finishError}</Text> : null}
              </ScrollView>
            ) : (
              <View style={styles.notificationPrompt}>
                <View style={[styles.notificationIcon, { backgroundColor: `${colors.accent}18` }]}>
                  <Feather name="bell" size={32} color={colors.accent} />
                </View>
                <Text style={[typography.heading, styles.title, viewportWidth < 360 && typography.compactHeading, { color: colors.text }]}>{title}</Text>
                <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
                  Turn on push notifications for market briefings, community activity, and important FXSnap updates.
                </Text>
                {notificationError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{notificationError}</Text> : null}
              </View>
            )}
          </Animated.View>

          <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
            {phase === 'intro' ? (
              <>
                {!isDemoScreen && (
                  <View style={styles.dots}>
                    {INTRO_SLIDES.slice(1).map((slide, index) => (
                      <View key={slide.kind} style={[styles.dot, { backgroundColor: index === introIndex - 1 ? colors.accent : colors.cardBorder }, index === introIndex - 1 && styles.activeDot]} />
                    ))}
                  </View>
                )}
                {!isDemoScreen && INTRO_SLIDES[introIndex].kind === 'review' && (
                  <TouchableOpacity style={styles.reviewButton} onPress={() => void requestReview()} accessibilityRole="button">
                    <Text style={[styles.reviewButtonText, { color: colors.accent }]}>Leave a review</Text>
                  </TouchableOpacity>
                )}
                <PrimaryButton label={introIndex === INTRO_SLIDES.length - 1 ? 'Maybe later' : 'Continue'} onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (introIndex < INTRO_SLIDES.length - 1) setIntroIndex((index) => index + 1);
                  else setPhase('survey');
                }} />
              </>
            ) : phase === 'survey' ? (
              <PrimaryButton
                label={questionIndex === QUESTION_COUNT - 1 ? 'Save my preferences' : 'Continue'}
                onPress={continueSurvey}
                disabled={!isAnswerSelected || saving}
              />
            ) : phase === 'personalizing' ? (
              saveError ? <PrimaryButton label="Retry saving" onPress={() => void savePersonalization()} disabled={saving} /> : null
            ) : phase === 'benefits' ? (
              personalizedResultComplete
                ? <PrimaryButton label="Continue" onPress={() => setPhase('notifications')} disabled={saving} />
                : null
            ) : (
              <>
                <PrimaryButton
                  label={saving ? 'Enabling notifications…' : 'Enable push notifications'}
                  onPress={() => void enableOnboardingNotifications()}
                  disabled={saving}
                />
                <TouchableOpacity
                  onPress={skipOnboardingNotifications}
                  disabled={saving}
                  style={styles.skipNotifications}
                  accessibilityRole="button"
                >
                  <Text style={[styles.skipNotificationsText, { color: colors.textMuted }]}>Maybe later</Text>
                </TouchableOpacity>
                {finishError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{finishError}</Text> : null}
              </>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function WelcomeScreen({ onContinue, reduceMotion, bottomPadding }: { onContinue: () => void; reduceMotion: boolean; bottomPadding: number }) {
  const colors = useColors();
  const { width: viewportWidth } = useWindowDimensions();
  const [typedCharacterCount, setTypedCharacterCount] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const hasStartedTyping = useRef(false);
  const navigationStarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorOpacity = useSharedValue(1);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  useEffect(() => {
    if (hasStartedTyping.current) return;
    hasStartedTyping.current = true;
    if (reduceMotion) {
      setTypedCharacterCount(WELCOME_HEADLINE.length);
      setIsTyping(false);
      return;
    }

    let characterIndex = 0;
    let active = true;
    const typeNextCharacter = () => {
      if (!active) return;
      characterIndex += 1;
      setTypedCharacterCount(characterIndex);
      if (characterIndex === WELCOME_HEADLINE.length) {
        setIsTyping(false);
        return;
      }
      timer.current = setTimeout(typeNextCharacter, 48);
    };
    timer.current = setTimeout(typeNextCharacter, 300);
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (!isTyping || reduceMotion) {
      cursorOpacity.value = 0;
      return;
    }
    cursorOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 520 }), withTiming(1, { duration: 520 })),
      -1,
      false,
    );
  }, [cursorOpacity, isTyping, reduceMotion]);

  const handleContinue = () => {
    if (isTyping || navigationStarted.current) return;
    navigationStarted.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onContinue();
  };
  const headlineLines = viewportWidth < 360
    ? ['Your next', 'winning trade', 'starts with a', 'photo.']
    : ['Your next winning', 'trade starts with a', 'photo.'];
  let lineStart = 0;
  const visibleLines = headlineLines.map((line) => {
    const visibleLength = Math.max(0, Math.min(line.length, typedCharacterCount - lineStart));
    const showCursor = isTyping && typedCharacterCount >= lineStart && typedCharacterCount <= lineStart + line.length;
    lineStart += line.length + 1;
    return { text: line.slice(0, visibleLength), showCursor };
  });

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(350)}
      style={styles.welcomeScreen}
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(400)}
        style={styles.welcomeHero}
      >
        <View
          style={styles.welcomeHeadlineFrame}
          accessible
          accessibilityRole="header"
          accessibilityLabel={WELCOME_HEADLINE}
        >
          {visibleLines.map((line, index) => (
            <Text key={index} accessible={false} style={[typography.heroHeading, viewportWidth < 360 && styles.compactWelcomeTitle, styles.welcomeTitle, { color: colors.text }]}>
              {line.text}
              {line.showCursor ? <Animated.Text style={[styles.welcomeCursor, { color: colors.text }, cursorStyle]}>|</Animated.Text> : null}
            </Text>
          ))}
        </View>
      </Animated.View>
      {!isTyping ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(350)}
          style={{ paddingBottom: bottomPadding }}
        >
          <PrimaryButton label="Continue" onPress={handleContinue} />
        </Animated.View>
      ) : (
        <View style={{ height: 56 + bottomPadding }} />
      )}
    </Animated.View>
  );
}

function PersonalizingLoader({ reduceMotion }: { reduceMotion: boolean }) {
  const colors = useColors();
  const rotation = useSharedValue(0);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (!reduceMotion) {
      rotation.value = withRepeat(withTiming(360, { duration: 2200 }), -1, false);
    }
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ZoomIn.duration(420)}
      style={styles.loaderWrap}
      accessibilityLabel="Preparing your personalized trading profile"
    >
      <Animated.View style={[styles.loaderRing, { borderColor: colors.cardBorder, borderTopColor: colors.accent }, ringStyle]} />
      <View style={[styles.loaderCenter, { backgroundColor: `${colors.accent}20` }]}>
        <Feather name="sliders" size={30} color={colors.accent} />
      </View>
      <View style={[styles.loaderSpark, styles.loaderSparkTop, { backgroundColor: colors.accent, borderColor: colors.background }]} />
      <View style={[styles.loaderSpark, styles.loaderSparkBottom, { backgroundColor: `${colors.accent}80`, borderColor: colors.background }]} />
    </Animated.View>
  );
}

function TypewriterText({
  text,
  reduceMotion,
  onComplete,
  style,
}: {
  text: string;
  reduceMotion: boolean;
  onComplete: () => void;
  style: React.ComponentProps<typeof Text>['style'];
}) {
  const colors = useColors();
  const [visibleLength, setVisibleLength] = useState(reduceMotion ? text.length : 0);
  const cursorOpacity = useSharedValue(1);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));
  const onCompleteRef = useRef(onComplete);
  const completionSent = useRef(false);
  const isTyping = visibleLength < text.length;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    completionSent.current = false;
    if (reduceMotion) {
      setVisibleLength(text.length);
      return;
    }
    let active = true;
    let characterIndex = 0;
    let timer: ReturnType<typeof setTimeout>;
    const typeNextCharacter = () => {
      if (!active) return;
      characterIndex += 1;
      setVisibleLength(characterIndex);
      if (characterIndex < text.length) timer = setTimeout(typeNextCharacter, 38);
    };
    setVisibleLength(0);
    timer = setTimeout(typeNextCharacter, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reduceMotion, text]);

  useEffect(() => {
    if (visibleLength === text.length && !completionSent.current) {
      completionSent.current = true;
      onCompleteRef.current();
    }
  }, [text, visibleLength]);

  useEffect(() => {
    if (!isTyping || reduceMotion) {
      cursorOpacity.value = 0;
      return;
    }
    cursorOpacity.value = withRepeat(
      withSequence(withTiming(0.25, { duration: 520 }), withTiming(1, { duration: 520 })),
      -1,
      false,
    );
    return () => cancelAnimation(cursorOpacity);
  }, [cursorOpacity, isTyping, reduceMotion]);

  return (
    <View style={styles.resultTypewriter}>
      <Text accessible={false} style={[style, styles.resultReserve]}>{text}</Text>
      <Animated.Text accessibilityLabel={text} style={[style, styles.resultOverlay]}>
        {text.slice(0, visibleLength)}
        {isTyping ? <Animated.Text style={[styles.welcomeCursor, { color: colors.accent }, cursorStyle]}>|</Animated.Text> : null}
      </Animated.Text>
    </View>
  );
}

function TypewriterHeading({
  text,
  reduceMotion,
  style,
}: {
  text: string;
  reduceMotion: boolean;
  style: React.ComponentProps<typeof Text>['style'];
}) {
  const colors = useColors();
  const [visibleLength, setVisibleLength] = useState(reduceMotion ? text.length : 0);
  const cursorOpacity = useSharedValue(1);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));
  const isTyping = visibleLength < text.length;

  useEffect(() => {
    if (reduceMotion) {
      setVisibleLength(text.length);
      return;
    }
    let active = true;
    let characterIndex = 0;
    let timer: ReturnType<typeof setTimeout>;
    const typeNextCharacter = () => {
      if (!active) return;
      characterIndex += 1;
      setVisibleLength(characterIndex);
      if (characterIndex < text.length) timer = setTimeout(typeNextCharacter, 46);
    };
    setVisibleLength(0);
    timer = setTimeout(typeNextCharacter, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reduceMotion, text]);

  useEffect(() => {
    if (!isTyping || reduceMotion) {
      cursorOpacity.value = 0;
      return;
    }
    cursorOpacity.value = withRepeat(
      withSequence(withTiming(0.25, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      false,
    );
  }, [cursorOpacity, isTyping, reduceMotion]);

  return (
    <View style={styles.typewriterFrame}>
      <Text accessible={false} style={[style, styles.typewriterReserve]}>{text}</Text>
      <Animated.Text
        accessibilityRole="header"
        accessibilityLabel={text}
        style={[style, styles.typewriterOverlay]}
      >
        {text.slice(0, visibleLength)}
        {isTyping ? <Animated.Text style={[styles.welcomeCursor, { color: colors.text }, cursorStyle]}>|</Animated.Text> : null}
      </Animated.Text>
    </View>
  );
}

function AnalysisPreview() {
  const colors = useColors();
  return (
    <View style={[styles.analysisCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.analysisHeader}>
        <View>
          <Text style={[styles.previewLabel, { color: colors.textMuted }]}>CHART REVIEW</Text>
          <Text style={[styles.previewTitle, { color: colors.text }]}>Structure at a glance</Text>
        </View>
        <View style={[styles.previewPill, { backgroundColor: `${colors.accent}20` }]}>
          <Text style={[styles.previewPillText, { color: colors.accent }]}>ANALYSIS</Text>
        </View>
      </View>
      <View style={[styles.previewDivider, { backgroundColor: colors.cardBorder }]} />
      <PreviewRow label="Market structure" value="Trend and key levels" icon="trending-up" />
      <PreviewRow label="Trade setup" value="Entry, stop and targets" icon="target" />
      <PreviewRow label="Risk context" value="Risk-to-reward overview" icon="shield" />
      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>An analysis is a tool for review, not a guarantee or instruction to trade.</Text>
    </View>
  );
}

function PreviewRow({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof Feather>['name'] }) {
  const colors = useColors();
  return (
    <View style={styles.previewRow}>
      <View style={[styles.previewIcon, { backgroundColor: `${colors.accent}18` }]}><Feather name={icon} size={17} color={colors.accent} /></View>
      <View style={styles.previewCopy}>
        <Text style={[styles.previewRowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.previewRowValue, { color: colors.textSecondary }]}>{value}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </View>
  );
}

function ReviewInvitation({ reduceMotion, compact }: { reduceMotion: boolean; compact: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.reviewCard, compact && styles.compactReviewCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Animated.View
        entering={reduceMotion ? undefined : ZoomIn.delay(150).duration(420)}
        style={[styles.heartBadge, compact && styles.compactHeartBadge, { backgroundColor: `${colors.accent}24` }]}
      >
        <Text style={[styles.heartEmoji, compact && styles.compactHeartEmoji]} accessibilityLabel="White heart">🤍</Text>
      </Animated.View>
      <View style={styles.reviewMessage}>
        <Text style={[styles.reviewCopy, { color: colors.text }]}>A little love goes a long way.</Text>
        <Text style={[styles.reviewSupportingCopy, { color: colors.textSecondary }]}>Your feedback helps us make FXSnap more useful for traders.</Text>
      </View>
    </View>
  );
}

function ChoiceCard({
  label,
  detail,
  icon,
  selected,
  index,
  onPress,
}: {
  label: string;
  detail: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  selected: boolean;
  index: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(index * 45).duration(280)}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[
          styles.choiceCard,
          {
            borderColor: selected ? colors.accent : colors.cardBorder,
            backgroundColor: selected ? `${colors.accent}15` : colors.card,
          },
          selected && styles.choiceCardSelected,
        ]}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={[styles.choiceIcon, { backgroundColor: selected ? colors.accent : `${colors.accent}18` }]}>
          <Feather name={icon} size={20} color={selected ? colors.primaryForeground : colors.accent} />
        </View>
        <View style={styles.choiceCopy}>
          <Text style={[styles.choiceTitle, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.choiceDetail, { color: colors.textSecondary }]}>{detail}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function Benefit({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.benefitCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      <View style={[styles.benefitIcon, { backgroundColor: `${colors.accent}18` }]}><Feather name={icon} size={20} color={colors.accent} /></View>
      <Text style={[styles.benefitText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, { backgroundColor: colors.primary }, disabled && styles.buttonDisabled]}
      activeOpacity={0.86}
      accessibilityRole="button"
    >
      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{label}</Text>
      <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  welcomeScreen: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 30 },
  welcomeHero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcomeHeadlineFrame: { width: '100%', maxWidth: 360, minHeight: 176, justifyContent: 'center', alignItems: 'center' },
  welcomeTitle: {
    width: '100%',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  compactWelcomeTitle: { fontSize: 30, lineHeight: 36 },
  welcomeCursor: { fontFamily: 'Inter_400Regular', fontWeight: '400' },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  topBarSpacer: { flex: 1 },
  backButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 21 },
  page: { flex: 1 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24, flexGrow: 1 },
  surveyContent: { paddingTop: 16 },
  compactReviewContent: { paddingTop: 8, paddingBottom: 10 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 16, letterSpacing: 1.2, marginBottom: 12 },
  centeredText: { textAlign: 'center' },
  title: { textAlign: 'center' },
  introTitle: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  typewriterFrame: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  typewriterReserve: { opacity: 0 },
  typewriterOverlay: { position: 'absolute', left: 0, right: 0, top: 0 },
  subtitle: { maxWidth: 440, alignSelf: 'center', textAlign: 'center', marginTop: 10 },
  surveySubtitle: { marginTop: 8 },
  surveyMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  surveyEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 14, letterSpacing: 1.2 },
  stepPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  stepPillText: { fontFamily: 'Inter_700Bold', fontSize: 9, lineHeight: 12, letterSpacing: 0.7 },
  introSubtitle: { maxWidth: 360 },
  compactTitle: { fontSize: 26, lineHeight: 32 },
  demoTopSpacer: { height: 10 },
  demoContent: { width: '100%', maxWidth: 520, flexGrow: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 },
  demoTitle: { width: '100%', maxWidth: 380, textAlign: 'center' },
  demoPhoneArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  demoPhone: {
    width: '70%',
    maxWidth: 266,
    borderWidth: 1.5,
    borderColor: '#57595D',
    borderRadius: 42,
    padding: 5,
    backgroundColor: '#242629',
    shadowColor: '#161719',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  demoPhoneBezel: { flex: 1, borderWidth: 1, borderColor: '#707276', borderRadius: 36, padding: 3 },
  demoPhoneScreen: { flex: 1, borderRadius: 32, overflow: 'hidden', position: 'relative' },
  demoSideButtonTop: { position: 'absolute', zIndex: 2, width: 3, height: 34, right: -3, top: 92, borderRadius: 2, backgroundColor: '#77797D' },
  demoSideButtonBottom: { position: 'absolute', zIndex: 2, width: 3, height: 54, left: -3, top: 108, borderRadius: 2, backgroundColor: '#77797D' },
  demoDynamicIsland: { position: 'absolute', zIndex: 2, top: 7, alignSelf: 'center', width: 76, height: 19, borderRadius: 12, backgroundColor: '#111214' },
  demoStatusBar: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  demoStatusText: { fontSize: 9, fontWeight: '700' },
  demoAppHeader: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  demoAppTitle: { fontSize: 13, fontWeight: '600' },
  demoHeaderSpacer: { width: 19 },
  demoVideoScreen: { flex: 1, borderRadius: 23, overflow: 'hidden', position: 'relative' },
  video: { width: '100%', height: '100%' },
  demoVideoFallback: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 18 },
  videoLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 16 },
  demoPhoneBottom: { height: 16, alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 0, left: 0, right: 0 },
  demoHomeIndicator: { width: 54, height: 3, borderRadius: 3, opacity: 0.72 },
  fallbackText: { textAlign: 'center', fontSize: 14 },
  analysisCard: { borderWidth: 1, borderRadius: 22, padding: 20, marginTop: 26 },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  previewTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 24, marginTop: 4 },
  previewPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  previewPillText: { fontSize: 9, letterSpacing: 0.7, fontWeight: '800' },
  previewDivider: { height: 1, marginVertical: 16 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  previewIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewCopy: { flex: 1 },
  previewRowLabel: { ...typography.optionTitle },
  previewRowValue: { ...typography.caption, marginTop: 3 },
  disclaimer: { ...typography.caption, marginTop: 16 },
  reviewCard: { minHeight: 270, borderWidth: 1, borderRadius: 22, marginTop: 26, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 22 },
  compactReviewCard: { minHeight: 150, marginTop: 12, padding: 12, gap: 8 },
  heartBadge: { width: 150, height: 150, borderRadius: 75, justifyContent: 'center', alignItems: 'center' },
  compactHeartBadge: { width: 86, height: 86, borderRadius: 43 },
  heartEmoji: { fontSize: 96, lineHeight: 116, textAlign: 'center' },
  compactHeartEmoji: { fontSize: 66, lineHeight: 82 },
  reviewMessage: { alignItems: 'center', gap: 8 },
  reviewCopy: { ...typography.optionTitle, fontSize: 17, textAlign: 'center' },
  reviewSupportingCopy: { ...typography.body, textAlign: 'center' },
  options: { gap: 12, marginTop: 22 },
  choiceCard: { minHeight: 82, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  choiceCardSelected: { borderWidth: 2, shadowColor: '#9B842A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  choiceIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  choiceCopy: { flex: 1 },
  choiceTitle: { ...typography.optionTitle, fontSize: 15 },
  choiceDetail: { ...typography.optionDescription, marginTop: 3 },
  centerContent: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  notificationPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 16 },
  notificationIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  skipNotifications: { alignItems: 'center', paddingVertical: 12 },
  skipNotificationsText: { fontSize: 14, fontWeight: '600' },
  centerTitle: { textAlign: 'center', marginTop: 24 },
  centerSubtitle: { textAlign: 'center' },
  loaderWrap: { width: 104, height: 104, justifyContent: 'center', alignItems: 'center' },
  loaderRing: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderRadius: 52 },
  loaderCenter: { width: 68, height: 68, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  loaderSpark: { position: 'absolute', width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  loaderSparkTop: { top: 6, right: 20 },
  loaderSparkBottom: { bottom: 12, left: 9 },
  compileSteps: { width: '100%', maxWidth: 330, gap: 16, marginTop: 28 },
  compileStep: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compileStepMarker: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  compileStepText: { ...typography.caption, flex: 1 },
  errorText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  benefitList: { gap: 10, marginTop: 24 },
  profileCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8, marginTop: 22 },
  profileEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  profileTitle: { ...typography.optionTitle, marginBottom: 2 },
  profileDivider: { height: 1, marginVertical: 8 },
  resultText: { lineHeight: 25 },
  resultTypewriter: { width: '100%' },
  resultReserve: { opacity: 0 },
  resultOverlay: { position: 'absolute', left: 0, right: 0, top: 0 },
  benefitCard: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  benefitText: { ...typography.optionTitle, flex: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 10, gap: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 8 },
  activeDot: { width: 20 },
  reviewButton: { height: 40, alignItems: 'center', justifyContent: 'center' },
  reviewButtonText: { ...typography.button },
  primaryButton: { minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  primaryButtonText: { ...typography.button },
  buttonDisabled: { opacity: 0.45 },
});
