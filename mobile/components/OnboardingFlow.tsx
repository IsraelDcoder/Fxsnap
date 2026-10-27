import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  ActivityIndicator,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { FXSnapMascot } from '@/components/FXSnapMascot';
import { OnboardingProgressRing } from '@/components/OnboardingProgressRing';
import { useColors } from '@/hooks/useColors';
import { trackEvent } from '@/services/telemetry';
import {
  createInitialOnboardingState,
  loadOnboardingState,
  ONBOARDING_VERSION,
  saveOnboardingState,
  type OnboardingState,
} from '@/services/onboardingState';
import {
  getMascotMood,
  getOnboardingCta,
  type OnboardingMascotMood,
} from '@/services/onboardingPersonalization';
import { getOnboardingProgress } from '@/services/onboardingProgress';
import { API_BASE_URL } from '@/services/apiAuth';
import { signInWithGoogle } from '@/services/account';
import {
  getNotificationPreferences,
  requestAndRegisterPushNotifications,
  saveNotificationPreferences,
} from '@/services/notifications';
import { useApp } from '@/context/AppContext';

const PRIVACY_URL = `${API_BASE_URL}/privacy`;
const TERMS_URL = `${API_BASE_URL}/terms`;
const WELCOME_HEADLINE = 'Your next winning\nstreak starts just\nwith a snap';
const WELCOME_HEADLINE_CHARACTERS = Array.from(WELCOME_HEADLINE);

function triggerCtaHaptic() {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

function screenName(step: number) {
  return [
    'outcome',
    'product_demo',
    'analysis_insights',
  ][step];
}

function ScreenHeader({
  step,
  onBack,
  mascotMood,
  interactionKey,
}: {
  step: number;
  onBack: () => void;
  mascotMood: OnboardingMascotMood;
  interactionKey: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeading}>
        {step !== 2 ? <OnboardingProgressRing step={step} /> : null}
        {step > 0 ? (
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Go to previous onboarding screen"
          >
            <Feather name="arrow-left" size={19} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.headerSpacer} />
      {step !== 2 ? (
        <View style={styles.brandMark}>
          <Feather name="activity" size={18} color={colors.buy} />
          {step === 0 ? (
            <Text style={[styles.brandName, { color: colors.text }]}>FXSnap</Text>
          ) : (
            <FXSnapMascot mood={mascotMood} size={40} interactionKey={interactionKey} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function WelcomeEmblem({ accentColor }: { accentColor: string }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = reduceMotion
      ? 1
      : withRepeat(
        withTiming(1.07, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  return (
    <Animated.View style={[styles.welcomeEmblem, pulseStyle]}>
      <View style={[styles.welcomeEmblemHalo, { borderColor: `${accentColor}35` }]} />
      <View style={[styles.welcomeEmblemCore, { backgroundColor: `${accentColor}16`, borderColor: `${accentColor}40` }]}>
        <Feather name="trending-up" size={38} color={accentColor} />
      </View>
      <View style={[styles.welcomeEmblemSpark, styles.welcomeEmblemSparkTop, { backgroundColor: accentColor }]} />
      <View style={[styles.welcomeEmblemSpark, styles.welcomeEmblemSparkBottom, { backgroundColor: `${accentColor}99` }]} />
    </Animated.View>
  );
}

function WelcomeHeadline({
  color,
  accentColor,
  onComplete,
}: {
  color: string;
  accentColor: string;
  onComplete: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(
    reduceMotion ? WELCOME_HEADLINE_CHARACTERS.length : 0,
  );
  const isTyping = visibleCharacterCount < WELCOME_HEADLINE_CHARACTERS.length;

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCharacterCount(WELCOME_HEADLINE_CHARACTERS.length);
      onComplete();
      return;
    }

    let characterIndex = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const startDelay = setTimeout(() => {
      interval = setInterval(() => {
        characterIndex += 1;
        setVisibleCharacterCount(characterIndex);
        if (characterIndex >= WELCOME_HEADLINE_CHARACTERS.length) {
          onComplete();
        }
        if (characterIndex >= WELCOME_HEADLINE_CHARACTERS.length && interval !== undefined) {
          clearInterval(interval);
        }
      }, 38);
    }, 420);

    return () => {
      clearTimeout(startDelay);
      if (interval !== undefined) clearInterval(interval);
    };
  }, [onComplete, reduceMotion]);

  return (
    <Animated.Text
      accessibilityRole="header"
      accessibilityLabel={WELCOME_HEADLINE.replaceAll('\n', ' ')}
      entering={reduceMotion ? undefined : FadeInUp.delay(360).duration(650)}
      style={[styles.welcomeTitle, { color }]}
    >
      {WELCOME_HEADLINE_CHARACTERS.slice(0, visibleCharacterCount).join('')}
      {isTyping ? <Text style={{ color: accentColor }}>{'|'}</Text> : null}
    </Animated.Text>
  );
}

function AnalysisInsightPreview({ maxHeight }: { maxHeight: number }) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const frameHeight = Math.min(maxHeight, (windowWidth - 56) * 19 / 9);
  const frameWidth = frameHeight * 9 / 19;

  return (
    <View style={[styles.insightPhoneFrame, { width: frameWidth, height: frameHeight }]}>
      <View style={styles.insightPhoneScreen}>
        <View style={styles.insightStatusBar}>
          <Text style={styles.insightStatusText}>9:41</Text>
          <View style={styles.insightStatusDots}>
            <View style={styles.insightStatusDot} />
            <View style={styles.insightStatusDot} />
            <View style={styles.insightStatusDot} />
          </View>
        </View>
        <View style={styles.insightTopBar}>
          <View style={styles.insightBrand}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.insightBrandText, { color: colors.text }]}>FXSNAP AI</Text>
          </View>
          <View style={styles.insightTopActions}>
            <Feather name="info" size={15} color={colors.textSecondary} />
            <Feather name="bookmark" size={15} color={colors.textSecondary} />
          </View>
        </View>
        <View style={styles.insightAssetRow}>
          <View style={styles.insightAssetCopy}>
            <Text style={[styles.insightAssetName, { color: colors.text }]}>EUR/USD</Text>
            <Text style={[styles.insightTimeframe, { color: colors.textSecondary, backgroundColor: colors.surface }]}>15 MIN</Text>
          </View>
          <View style={[styles.insightSampleBadge, { backgroundColor: `${colors.buy}18` }]}>
            <Text style={[styles.insightSampleBadgeText, { color: colors.buy }]}>SAMPLE</Text>
          </View>
        </View>
        <View style={[styles.insightReadCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.insightSectionLabel, { color: colors.textSecondary }]}>MARKET READ</Text>
          <View style={styles.insightReadTitleRow}>
            <Text style={[styles.insightReadTitle, { color: colors.text }]}>Setup context</Text>
            <Feather name="trending-up" size={15} color={colors.buy} />
          </View>
          <Text style={[styles.insightReadBody, { color: colors.textSecondary }]}>
            Structure, key levels, and risk context in one view.
          </Text>
        </View>
        <View style={styles.insightLevelsSection}>
          <Text style={[styles.insightLevelsTitle, { color: colors.text }]}>SL and TP</Text>
          <View style={[styles.insightLevelsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {[
              ['Stop-loss', 'Risk boundary', colors.sell],
              ['Take-profit', 'Scenario level', colors.buy],
            ].map(([label, detail, accent], index) => (
              <View key={label}>
                {index > 0 ? <View style={[styles.insightDivider, { backgroundColor: colors.cardBorder }]} /> : null}
                <View style={styles.insightLevelRow}>
                  <View style={styles.insightLevelCopy}>
                    <View style={[styles.insightLevelDot, { backgroundColor: accent }]} />
                    <Text style={[styles.insightLevelLabel, { color: colors.text }]}>{label}</Text>
                  </View>
                  <Text style={[styles.insightLevelValue, { color: colors.textSecondary }]}>{detail}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.insightDivider, { backgroundColor: colors.cardBorder }]} />
            <Text style={[styles.insightReasoningTitle, { color: colors.text }]}>Reasoning</Text>
            <Text style={[styles.insightReasoning, { color: colors.textSecondary }]}>
              Review structure and invalidation levels before making a decision.
            </Text>
          </View>
        </View>
        <View style={styles.insightTabBar}>
          {(['home', 'book-open', 'crosshair', 'users', 'user'] as const).map((icon, index) => (
            <Feather key={icon} name={icon} size={16} color={index === 2 ? colors.buy : colors.textMuted} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function OnboardingFlow() {
  const colors = useColors();
  const { syncAccountData } = useApp();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [state, setState] = useState<OnboardingState>(createInitialOnboardingState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [welcomeHeadlineComplete, setWelcomeHeadlineComplete] = useState(false);
  const stateRef = useRef(state);
  const persistedStateRef = useRef(state);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const transitionLockRef = useRef(false);
  const lastTrackedStepRef = useRef<number | null>(null);
  const lastTrackedMascotRef = useRef<string | null>(null);
  const firstScreenStartedAtRef = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const notificationPromptHandledRef = useRef(false);
  const step = state.currentStep;
  const compact = windowWidth < 370;
  const mascotMood = getMascotMood(step);
  const cta = getOnboardingCta(step);
  const completeWelcomeHeadline = useCallback(() => {
    setWelcomeHeadlineComplete(true);
  }, []);

  const restoreProgress = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stored = await loadOnboardingState();
      const initial = stored.startedAt
        ? stored
        : { ...stored, startedAt: new Date().toISOString() };
      if (!stored.startedAt) {
        await saveOnboardingState(initial);
        trackEvent('onboarding_started', { version: ONBOARDING_VERSION });
      }
      stateRef.current = initial;
      persistedStateRef.current = initial;
      setState(initial);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not restore onboarding. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restoreProgress();
  }, [restoreProgress]);

  useEffect(() => {
    if (loading || lastTrackedStepRef.current === step) return;
    lastTrackedStepRef.current = step;
    if (step === 0) firstScreenStartedAtRef.current = Date.now();
    trackEvent('onboarding_screen_viewed', { version: ONBOARDING_VERSION, screen: screenName(step) });
    trackEvent('onboarding_progress_viewed', {
      version: ONBOARDING_VERSION,
      screen: screenName(step),
      step: getOnboardingProgress(step).stepNumber,
      step_count: 3,
      progress_percent: getOnboardingProgress(step).percentage,
    });
    if (step === 1) trackEvent('onboarding_demo_viewed', { version: ONBOARDING_VERSION });
  }, [loading, step]);

  useEffect(() => {
    if (loading) return undefined;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;
      const current = stateRef.current;
      if (
        previousAppState === 'active'
        && nextAppState === 'background'
        && current.completedAt === null
      ) {
        trackEvent('onboarding_exited', {
          version: ONBOARDING_VERSION,
          screen: screenName(current.currentStep),
          screen_index: current.currentStep + 1,
          exit_reason: 'app_backgrounded',
        });
      }
    });
    return () => subscription.remove();
  }, [loading]);

  useEffect(() => {
    const mascotTrackingKey = `${step}:${mascotMood}`;
    if (loading || lastTrackedMascotRef.current === mascotTrackingKey) return;
    lastTrackedMascotRef.current = mascotTrackingKey;
    trackEvent('onboarding_mascot_state_changed', {
      version: ONBOARDING_VERSION,
      screen: screenName(step),
      mascot_state: mascotMood,
    });
  }, [loading, mascotMood, step]);

  const persist = useCallback(async (next: OnboardingState) => {
    setError('');
    stateRef.current = next;
    setState(next);
    const pendingSave = saveQueueRef.current.then(() => saveOnboardingState(next));
    saveQueueRef.current = pendingSave.then(() => undefined, () => undefined);
    try {
      await pendingSave;
      persistedStateRef.current = next;
      return true;
    } catch (saveError) {
      if (stateRef.current === next) {
        stateRef.current = persistedStateRef.current;
        setState(persistedStateRef.current);
        setError(saveError instanceof Error ? saveError.message : 'Your onboarding progress could not be saved.');
      }
      return false;
    }
  }, []);

  const moveTo = async (nextStep: number) => {
    if (transitioning || transitionLockRef.current || nextStep < 0 || nextStep > 2) return;
    transitionLockRef.current = true;
    setTransitioning(true);
    try {
      const saved = await persist({ ...stateRef.current, currentStep: nextStep });
      if (saved && nextStep === 0) setWelcomeHeadlineComplete(false);
      if (saved && nextStep === step + 1) {
        trackEvent('onboarding_screen_completed', {
          version: ONBOARDING_VERSION,
          screen: screenName(step),
          screen_index: step + 1,
        });
        if (step === 0) {
          trackEvent('onboarding_screen_progressed', {
            version: ONBOARDING_VERSION,
            from: screenName(step),
            to: screenName(nextStep),
            duration_ms: Math.max(0, Date.now() - (firstScreenStartedAtRef.current ?? Date.now())),
          });
        }
      }
    } finally {
      transitionLockRef.current = false;
      setTransitioning(false);
    }
  };

  const goBack = () => { void moveTo(step - 1); };
  const handleBack = goBack;

  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dx) > 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (transitioning) return;
      if (gesture.dx > 70) {
        if (step > 0) handleBack();
        return;
      }
      if (gesture.dx < -70 && step < 2) {
        void moveTo(step + 1);
      }
    },
  }), [handleBack, moveTo, step, transitioning]);

  const requestAppNotifications = async () => {
    if (Platform.OS === 'web' || notificationPromptHandledRef.current) return;
    notificationPromptHandledRef.current = true;
    let preferences;
    try {
      preferences = await getNotificationPreferences();
    } catch (preferencesError) {
      console.error('[Onboarding] Could not load notification preferences.', preferencesError);
      return;
    }
    if (preferences.enabled) return;
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Stay up to date with FXSnap',
        'Allow notifications for app updates like your Daily Brief, trading reminders, weekly overview, Community activity, and important announcements. You can change notification preferences in Settings at any time.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!proceed) return;

    const nextPreferences = {
      ...preferences,
      enabled: true,
    };
    try {
      const registration = await requestAndRegisterPushNotifications(nextPreferences, true);
      if (!registration.granted) return;
      await saveNotificationPreferences(nextPreferences);
    } catch (notificationError) {
      console.error('[Onboarding] Could not enable push notifications.', notificationError);
    }
  };

  const trackCtaTap = () => {
    trackEvent('onboarding_cta_tapped', {
      version: ONBOARDING_VERSION,
      screen: screenName(step),
      cta_variant: cta.variantId,
      platform: Platform.OS,
    });
  };

  const signInExistingAccount = async () => {
    if (accountBusy || transitioning) return;
    setError('');
    if (Platform.OS === 'web') {
      setError('Sign-in is available in the installed FXSnap app on iOS or Android.');
      return;
    }
    setAccountBusy(true);
    try {
      const account = await signInWithGoogle();
      if (!account) return;
      await syncAccountData();
      trackEvent('onboarding_existing_account_signed_in', { version: ONBOARDING_VERSION });
      await moveTo(1);
    } catch (signInError) {
      console.error('[Onboarding] Could not sign in to an existing account.', signInError);
      setError(signInError instanceof Error ? signInError.message : 'Could not sign in. Please try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const openLegalDocument = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (linkError) {
      console.error('[Onboarding] Could not open a legal document.', linkError);
      setError('Could not open this link. Please try again.');
    }
  };

  const continueToPaywall = async () => {
    if (transitioning || transitionLockRef.current) return;
    transitionLockRef.current = true;
    setTransitioning(true);
    setError('');
    try {
      await requestAppNotifications();
      const currentStep = stateRef.current.currentStep;
      const saved = await persist({ ...stateRef.current, currentStep });
      if (!saved) return;
      trackEvent('onboarding_screen_completed', {
        version: ONBOARDING_VERSION,
        screen: screenName(currentStep),
        screen_index: currentStep + 1,
      });
      trackEvent('onboarding_paywall_viewed', { version: ONBOARDING_VERSION, source: 'onboarding' });
      trackEvent('onboarding_paywall_view', { version: ONBOARDING_VERSION, source: 'onboarding' });
      router.replace({ pathname: '/paywall', params: { source: 'onboarding' } });
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : 'Could not continue to plans. Please try again.');
    } finally {
      transitionLockRef.current = false;
      setTransitioning(false);
    }
  };

  if (loading || (error && !state.startedAt)) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centeredState}>
          {loading ? <ActivityIndicator size="large" color={colors.buy} /> : <Feather name="alert-circle" size={28} color={colors.destructive} />}
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{loading ? 'Restoring your progress…' : error}</Text>
          {!loading ? (
            <PrimaryButton label="Retry" onPress={() => void restoreProgress()} disabled={transitioning} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
      {...swipeResponder.panHandlers}
    >
      {step === 0 ? (
        <>
          <StatusBar
            barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
            backgroundColor={colors.background}
          />
          <View style={styles.welcomeScreen}>
            <LinearGradient
              colors={[`${colors.buy}18`, `${colors.buy}08`, 'transparent', `${colors.primary}08`]}
              locations={[0, 0.25, 0.7, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.delay(100).duration(650)}
              style={styles.welcomeHero}
            >
              <WelcomeEmblem accentColor={colors.buy} />
              <View style={styles.welcomeCopy}>
                <Animated.Text
                  entering={reduceMotion ? undefined : FadeInDown.delay(260).duration(500)}
                  style={[styles.welcomeEyebrow, { color: colors.buy }]}
                >
                  MARKET CLARITY, IN A SNAP
                </Animated.Text>
                <WelcomeHeadline
                  color={colors.text}
                  accentColor={colors.buy}
                  onComplete={completeWelcomeHeadline}
                />
                <Animated.View
                  entering={reduceMotion ? undefined : FadeInDown.delay(520).duration(500)}
                  style={[styles.welcomeAccentLine, { backgroundColor: colors.buy }]}
                />
              </View>
            </Animated.View>
            {welcomeHeadlineComplete ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeInUp.duration(620)}
                style={[styles.welcomeFooter, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}
              >
                <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(80).duration(520)}>
                  <TouchableOpacity
                    onPress={() => { triggerCtaHaptic(); void signInExistingAccount(); }}
                    disabled={accountBusy || transitioning}
                    style={[styles.welcomeAccountButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    accessibilityRole="button"
                    accessibilityLabel="I have an account"
                  >
                    {accountBusy ? <ActivityIndicator color={colors.text} /> : (
                      <Text style={[styles.welcomeAccountText, { color: colors.text }]}>I have an account</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(210).duration(580)}>
                  <TouchableOpacity
                    onPress={() => { triggerCtaHaptic(); trackCtaTap(); void moveTo(1); }}
                    disabled={transitioning || accountBusy}
                    style={[styles.welcomeContinueButton, { backgroundColor: colors.primary }, (transitioning || accountBusy) && styles.welcomeButtonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Continue"
                  >
                    {transitioning ? <ActivityIndicator color={colors.primaryForeground} /> : (
                      <Text style={[styles.welcomeContinueText, { color: colors.primaryForeground }]}>Continue</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
                {error ? <Text style={[styles.welcomeError, { color: colors.destructive }]} accessibilityRole="alert">{error}</Text> : null}
                <View style={styles.welcomeLegalRow}>
                  <TouchableOpacity onPress={() => void openLegalDocument(PRIVACY_URL)} accessibilityRole="link">
                    <Text style={[styles.welcomeLegalLink, { color: colors.textSecondary }]}>Privacy Policy</Text>
                  </TouchableOpacity>
                  <Text style={[styles.welcomeLegalDivider, { color: colors.textSecondary }]}>|</Text>
                  <TouchableOpacity onPress={() => void openLegalDocument(TERMS_URL)} accessibilityRole="link">
                    <Text style={[styles.welcomeLegalLink, { color: colors.textSecondary }]}>Terms of Use</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <LinearGradient
            colors={[`${colors.buy}14`, `${colors.buy}05`, 'transparent']}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {step !== 1 ? (
            <ScreenHeader
              step={step}
              onBack={handleBack}
              mascotMood={mascotMood}
              interactionKey={screenName(step)}
            />
          ) : null}
          <Animated.View
        key={`onboarding-step-${step}`}
        entering={reduceMotion ? undefined : FadeInUp.duration(320)}
        style={styles.page}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { maxWidth: compact ? 520 : 620 },
            step === 1 && styles.productDemoContent,
            step === 2 && styles.insightDemoContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 ? (
            <>
              <Animated.Text
                accessibilityRole="header"
                entering={reduceMotion ? undefined : FadeInUp.delay(115).duration(340)}
                style={[styles.demoTitle, { color: colors.text }]}
              >
                Just snap a pic{'\n'}of your chart
              </Animated.Text>
              <OnboardingDemoVideo
                maxHeight={Math.min(windowHeight * 0.62, 520)}
                errorColor={colors.destructive}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Animated.Text
                accessibilityRole="header"
                entering={reduceMotion ? undefined : FadeInUp.delay(115).duration(340)}
                style={[styles.insightDemoTitle, { color: colors.text }]}
              >
                And get money{'\n'}making insights
              </Animated.Text>
              <Text style={[styles.insightDemoBody, { color: colors.textSecondary }]}>
                See chart context, potential levels, and reasoning in one view.
              </Text>
              <AnalysisInsightPreview maxHeight={Math.min(windowHeight * 0.53, 460)} />
            </>
          ) : null}

          {error ? (
            <View style={[styles.inlineError, { backgroundColor: `${colors.destructive}10` }]}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={[styles.inlineErrorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View
        style={[
          styles.footer,
          step === 1 && styles.demoFooter,
          { paddingBottom: Math.max(insets.bottom, 12) + 12 },
        ]}
      >
        {step === 1 ? (
          <View style={styles.demoNavigation}>
            <TouchableOpacity
              onPress={handleBack}
              disabled={transitioning}
              style={[styles.demoNavigationButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              accessibilityRole="button"
              accessibilityLabel="Go to previous onboarding screen"
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.demoNavigationHint, { color: colors.textSecondary }]}>Swipe to navigate</Text>
            <TouchableOpacity
              onPress={() => void moveTo(2)}
              disabled={transitioning}
              style={[styles.demoNavigationButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Continue to the next onboarding screen"
            >
              <Feather name="arrow-right" size={20} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        ) : null}
        {step === 2 ? (
          <PrimaryButton
            label={cta.label}
            onPress={() => { trackCtaTap(); void continueToPaywall(); }}
            disabled={transitioning}
            loading={transitioning}
          />
        ) : null}
      </View>
        </>
      )}
    </SafeAreaView>
  );
}

function OnboardingDemoVideo({
  maxHeight,
  errorColor,
}: {
  maxHeight: number;
  errorColor: string;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const player = useVideoPlayer(require('../assets/videos/fxsnap-demo.mov'), (videoPlayer) => {
    videoPlayer.muted = true;
    videoPlayer.loop = true;
  });
  const [playbackError, setPlaybackError] = useState('');

  useEffect(() => {
    const playWhenReady = () => {
      if (player.status === 'readyToPlay') player.play();
    };
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        player.play();
        setPlaybackError('');
        return;
      }
      if (status === 'error') {
        setPlaybackError(error?.message ?? 'The demo video could not be played on this device.');
      }
    });
    playWhenReady();
    return () => subscription.remove();
  }, [player]);

  const frameHeight = Math.min(maxHeight, (windowWidth - 44) * 19 / 9);
  const frameWidth = frameHeight * 9 / 19;

  return (
    <View style={[styles.demoPhoneFrame, { height: frameHeight, width: frameWidth }]}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={styles.demoPhoneVideo}
        accessibilityLabel="FXSnap product demonstration video"
      />
      {playbackError ? (
        <Text accessibilityRole="alert" style={[styles.demoVideoError, { color: errorColor }]}>
          {playbackError}
        </Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const buttonForeground = colors.primaryForeground;
  const buttonBackground = colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.primaryButton,
        {
          backgroundColor: buttonBackground,
          opacity: disabled || loading ? 0.5 : 1,
        },
      ]}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={buttonForeground} />
      ) : icon ? (
        <Feather name={icon} size={17} color={buttonForeground} />
      ) : null}
      <Animated.Text
        key={label}
        entering={reduceMotion ? undefined : FadeInUp.duration(150)}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.primaryButtonText,
          { color: buttonForeground },
        ]}
      >
        {label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  welcomeScreen: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    maxWidth: 620,
    paddingHorizontal: 30,
    justifyContent: 'space-between',
  },
  welcomeHero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
    gap: 34,
  },
  welcomeEmblem: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeEmblemHalo: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
  },
  welcomeEmblemCore: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeEmblemSpark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  welcomeEmblemSparkTop: { top: 11, right: 20 },
  welcomeEmblemSparkBottom: { bottom: 17, left: 12, width: 4, height: 4, borderRadius: 2 },
  welcomeCopy: {
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 2,
  },
  welcomeEyebrow: {
    fontSize: 10,
    letterSpacing: 2.2,
    fontFamily: 'Inter_700Bold',
  },
  welcomeAccentLine: {
    width: 42,
    height: 3,
    borderRadius: 2,
    marginTop: 1,
  },
  welcomeTitle: {
    fontSize: 34,
    lineHeight: 43,
    letterSpacing: -0.35,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
  welcomeFooter: {
    width: '100%',
    gap: 14,
  },
  welcomeAccountButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeAccountText: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Inter_600SemiBold',
  },
  welcomeContinueButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeButtonDisabled: { opacity: 0.65   },
  welcomeContinueText: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Inter_600SemiBold',
  },
  welcomeError: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
  },
  welcomeLegalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  welcomeLegalLink: {
    textDecorationLine: 'underline',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  welcomeLegalDivider: {
    fontSize: 12,
    lineHeight: 18,
  },
  header: { width: '100%', maxWidth: 1040, alignSelf: 'center', height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  headerLeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerSpacer: { flex: 1 },
  backButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandName: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: -0.2 },
  page: { flex: 1, width: '100%' },
  content: { width: '100%', alignSelf: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24, gap: 16 },
  productDemoContent: { flexGrow: 1, justifyContent: 'center', gap: 16, paddingTop: 18, paddingBottom: 18 },
  insightDemoContent: { gap: 10, paddingTop: 10, alignItems: 'center' },
  insightDemoTitle: { fontSize: 29, lineHeight: 35, letterSpacing: -0.4, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  insightDemoBody: { marginTop: -4, fontSize: 12, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  demoTitle: { marginBottom: 8, fontSize: 30, lineHeight: 36, letterSpacing: -0.35, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  insightPhoneFrame: { borderWidth: 3, borderColor: '#303438', borderRadius: 34, backgroundColor: '#080A0B', padding: 4, alignSelf: 'center', overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  insightPhoneScreen: { flex: 1, borderRadius: 27, backgroundColor: '#090B0A', paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, overflow: 'hidden', justifyContent: 'space-between' },
  insightStatusBar: { height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  insightStatusText: { color: '#F3F4F2', fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  insightStatusDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  insightStatusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D8DDD8' },
  insightTopBar: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  insightBrand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  insightBrandText: { fontSize: 11, letterSpacing: 0.4, fontFamily: 'Inter_700Bold' },
  insightTopActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  insightAssetRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightAssetCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  insightAssetName: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  insightTimeframe: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, fontSize: 7, fontFamily: 'Inter_600SemiBold' },
  insightSampleBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  insightSampleBadgeText: { fontSize: 7, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  insightReadCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 8, gap: 5 },
  insightSectionLabel: { fontSize: 7, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  insightReadTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightReadTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  insightReadBody: { fontSize: 8, lineHeight: 11, fontFamily: 'Inter_400Regular' },
  insightLevelsSection: { gap: 5 },
  insightLevelsTitle: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  insightLevelsCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5, gap: 5 },
  insightDivider: { height: StyleSheet.hairlineWidth, opacity: 0.8 },
  insightLevelRow: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  insightLevelCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  insightLevelDot: { width: 5, height: 5, borderRadius: 3 },
  insightLevelLabel: { fontSize: 8, fontFamily: 'Inter_500Medium' },
  insightLevelValue: { fontSize: 7, fontFamily: 'Inter_400Regular' },
  insightReasoningTitle: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  insightReasoning: { fontSize: 7, lineHeight: 10, fontFamily: 'Inter_400Regular' },
  insightTabBar: { minHeight: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 2 },
  demoPhoneFrame: { borderWidth: 3, borderColor: '#303438', borderRadius: 34, backgroundColor: '#080A0B', padding: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', alignSelf: 'center', shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  demoPhoneVideo: { width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden' },
  demoVideoError: { position: 'absolute', left: 16, right: 16, bottom: 28, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  inlineError: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, gap: 7 },
  inlineErrorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  footer: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 9 },
  demoFooter: { paddingHorizontal: 22, paddingTop: 0 },
  demoNavigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  demoNavigationButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  demoNavigationHint: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  primaryButton: { minHeight: 54, borderRadius: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorText: { maxWidth: 340, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_500Medium' },
});
