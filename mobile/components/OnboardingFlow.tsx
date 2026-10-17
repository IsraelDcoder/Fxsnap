import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOutLeft,
  FadeOutRight,
  Layout,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp, type AppSettings } from '@/context/AppContext';
import { saveNotificationPreferences, requestAndRegisterPushNotifications } from '@/services/notifications';
import { useColors } from '@/hooks/useColors';
import HomeDashboard from '@/components/HomeDashboard';
import DailyBriefExperience from '@/components/DailyBriefExperience';
import LearningHubScreen from '@/app/learning-hub';

type Experience = AppSettings['onboardingExperience'];
type Market = 'forex' | 'crypto' | 'stocks' | 'commodities' | 'indices';
type Challenge = 'complexity' | 'time' | 'confidence' | 'learning';
type Goal = 'income' | 'wealth' | 'freedom' | 'mastery';
type Phase = 'intro' | 'survey' | 'comparison' | 'notifications' | 'community' | 'finish';

const INTRO_SLIDES = [
  {
    title: 'AI Chart Analysis in Seconds',
    subtitle: 'Snap or screenshot a chart and get a clear technical read with an AI-generated trade plan.',
  },
  {
    title: 'Your Market Briefing, Every Morning',
    subtitle: 'Catch up on important market stories and context before you start your day.',
  },
  {
    title: 'Learn Trading, Step by Step',
    subtitle: 'Build your knowledge with short lessons, practical concepts, and risk-management tools.',
  },
];

const EXPERIENCE_OPTIONS: { value: Experience; label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { value: 'beginner', label: 'Beginner', detail: 'I’m still learning the basics', icon: 'feather' },
  { value: 'advanced', label: 'Advanced', detail: 'I have some trading experience', icon: 'user' },
  { value: 'expert', label: 'Expert', detail: 'I’ve traded for several years', icon: 'award' },
];

const MARKET_OPTIONS: { value: Market; label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { value: 'forex', label: 'Forex', detail: 'USD, EUR, GBP and more', icon: 'refresh-cw' },
  { value: 'crypto', label: 'Crypto', detail: 'BTC, ETH and digital assets', icon: 'hexagon' },
  { value: 'stocks', label: 'Stocks', detail: 'Companies and equity markets', icon: 'bar-chart-2' },
  { value: 'commodities', label: 'Commodities', detail: 'Gold, oil and other resources', icon: 'layers' },
  { value: 'indices', label: 'Indices', detail: 'Major market indices', icon: 'trending-up' },
];

const CHALLENGE_OPTIONS: { value: Challenge; label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { value: 'complexity', label: 'It feels too complex', detail: 'There is a lot to interpret on a chart.', icon: 'cpu' },
  { value: 'time', label: 'I don’t have enough time', detail: 'Research and chart review take a while.', icon: 'clock' },
  { value: 'confidence', label: 'I’m often unsure', detail: 'I want a more structured second look.', icon: 'help-circle' },
  { value: 'learning', label: 'I don’t know where to start', detail: 'I want a clearer path to learn.', icon: 'book-open' },
];

const GOAL_OPTIONS: { value: Goal; label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { value: 'income', label: 'Explore an additional income stream', detail: 'Learn to evaluate trading opportunities.', icon: 'dollar-sign' },
  { value: 'wealth', label: 'Make more informed decisions', detail: 'Add structure to my market research.', icon: 'trending-up' },
  { value: 'freedom', label: 'Build financial knowledge', detail: 'Understand markets and manage risk.', icon: 'compass' },
  { value: 'mastery', label: 'Master my trading process', detail: 'Practice analysis and refine my approach.', icon: 'target' },
];

const SURVEY_COUNT = 4;

function withOpacity(color: string, opacity: number) {
  const normalized = color.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function CinematicBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const colors = useColors();
  const drift = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 6200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [drift, reduceMotion]);
  const upperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * 35 }, { scale: 1 + drift.value * 0.08 }],
    opacity: 0.5 + drift.value * 0.18,
  }));
  const lowerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -drift.value * 28 }, { scale: 1.08 - drift.value * 0.08 }],
    opacity: 0.27 + drift.value * 0.14,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.glow, styles.glowUpper, { backgroundColor: withOpacity(colors.accent, 0.18) }, upperStyle]} />
      <Animated.View style={[styles.glow, styles.glowLower, { backgroundColor: withOpacity(colors.buy, 0.11) }, lowerStyle]} />
      <LinearGradient
        colors={['transparent', withOpacity(colors.background, 0.16), withOpacity(colors.background, 0.78)]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { settings, updateSettings, completeOnboarding } = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [comparisonReady, setComparisonReady] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>('forward');
  const handleComparisonComplete = useCallback(() => setComparisonReady(true), []);
  const [introIndex, setIntroIndex] = useState(0);
  const [surveyIndex, setSurveyIndex] = useState(0);
  const [experience, setExperience] = useState<Experience>(settings.onboardingExperience);
  const [markets, setMarkets] = useState<Market[]>(() => {
    const stored = settings.onboardingMarkets.filter((market): market is Market => MARKET_OPTIONS.some((option) => option.value === market));
    if (stored.length) return stored;
    return settings.preferredMarket === 'futures' ? ['commodities'] : [settings.preferredMarket];
  });
  const [challenges, setChallenges] = useState<Challenge[]>(
    () => settings.onboardingChallenges.filter((item): item is Challenge => CHALLENGE_OPTIONS.some((option) => option.value === item)),
  );
  const [goals, setGoals] = useState<Goal[]>(
    () => settings.onboardingGoals.filter((item): item is Goal => GOAL_OPTIONS.some((option) => option.value === item)),
  );
  const [saving, setSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 12) + 12;

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTransitionDirection('back');
    setSaveError(null);
    if (phase === 'intro') {
      setIntroIndex((index) => Math.max(0, index - 1));
    } else if (phase === 'survey') {
      if (surveyIndex === 0) {
        setPhase('intro');
        setIntroIndex(INTRO_SLIDES.length - 1);
      } else {
        setSurveyIndex((index) => index - 1);
      }
    } else if (phase === 'comparison') {
      setPhase('survey');
      setSurveyIndex(SURVEY_COUNT - 1);
    } else if (phase === 'notifications') {
      setComparisonReady(false);
      setPhase('comparison');
    } else if (phase === 'community') {
      setPhase('notifications');
    } else if (phase === 'finish') {
      setPhase('community');
    }
  };

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTransitionDirection('forward');
    setSaveError(null);
    if (phase === 'intro') {
      if (introIndex < INTRO_SLIDES.length - 1) setIntroIndex((index) => index + 1);
      else {
        setPhase('survey');
        setSurveyIndex(0);
      }
    } else if (phase === 'survey') {
      if (surveyIndex < SURVEY_COUNT - 1) setSurveyIndex((index) => index + 1);
      else {
        setComparisonReady(false);
        setPhase('comparison');
      }
    } else if (phase === 'comparison') {
      setPhase('notifications');
    } else if (phase === 'notifications') {
      setPhase('community');
    } else if (phase === 'community') {
      setPhase('finish');
    } else {
      void finish();
    }
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setSaveError(null);
      const preferredMarket = markets[0] === 'commodities' || markets[0] === 'indices'
        ? 'futures'
        : markets[0] || settings.preferredMarket;
      await updateSettings({
        onboardingExperience: experience,
        onboardingMarkets: markets,
        onboardingChallenges: challenges,
        onboardingGoals: goals,
        preferredMarket: preferredMarket as AppSettings['preferredMarket'],
      });
      await completeOnboarding();
      router.replace('/(tabs)/home');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your choices. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const enableNotifications = async () => {
    setNotificationError(null);
    try {
      const result = await requestAndRegisterPushNotifications({
        enabled: true,
        dailyBrief: true,
        inactivity: true,
        weekly: true,
        community: true,
        systemAnnouncements: true,
      });
      await saveNotificationPreferences({
        enabled: result.granted,
        dailyBrief: true,
        inactivity: true,
        weekly: true,
        community: true,
        systemAnnouncements: true,
      });
      if (result.granted) advance();
      else setNotificationError('Notifications were not enabled. You can change this later in Settings.');
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Notifications could not be enabled right now.');
    }
  };

  const toggle = <T extends string>(items: T[], value: T, setter: (items: T[]) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextItems = items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
    setter(nextItems);
  };

  const isSurvey = phase === 'survey';
  const surveyTitle = [
    'How much trading experience do you have?',
    'Which markets do you trade most often?',
    'What is your biggest challenge with trading?',
    'What would you like to achieve?',
  ][surveyIndex];
  const surveySubtitle = surveyIndex === 1
    ? 'Select all markets that apply to you.'
    : 'This helps us tailor your FXSnap experience.';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <LinearGradient
        colors={[withOpacity(colors.accent, 0.16), withOpacity(colors.accent, 0.045), 'transparent']}
        locations={[0, 0.36, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <CinematicBackdrop reduceMotion={Boolean(reduceMotion)} />
      <View style={[styles.topBar, { paddingTop: phase === 'intro' ? 10 : 5 }]}>
        {phase !== 'intro' ? (
          <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Feather name="chevron-left" size={27} color={colors.text} />
          </TouchableOpacity>
        ) : <View style={styles.backButton} />}
        {isSurvey ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
            <Animated.View layout={Layout.springify().damping(20)} style={[styles.progressFill, { width: `${((surveyIndex + 1) / SURVEY_COUNT) * 100}%`, backgroundColor: colors.accent }]} />
          </View>
        ) : <View style={styles.topBarSpacer} />}
        <View style={styles.skipPlaceholder} />
      </View>

      <Animated.View
        key={`${phase}-${phase === 'intro' ? introIndex : phase === 'survey' ? surveyIndex : 0}`}
        entering={reduceMotion ? undefined : (transitionDirection === 'forward' ? FadeInRight : FadeInLeft).duration(430).springify()}
        exiting={reduceMotion ? undefined : (transitionDirection === 'forward' ? FadeOutLeft : FadeOutRight).duration(230)}
        style={styles.page}
      >
        {phase === 'intro' ? (
          <IntroPage slideIndex={introIndex} />
        ) : isSurvey ? (
          <ScrollView
            key={`survey-${surveyIndex}`}
            style={styles.scroll}
            contentContainerStyle={styles.surveyContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.Text entering={reduceMotion ? undefined : FadeInDown.duration(450).springify()} style={[styles.surveyTitle, { color: colors.text }]}>
              {surveyTitle}
            </Animated.Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{surveySubtitle}</Text>
            {surveyIndex === 0 ? (
              <View style={styles.optionList}>
                {EXPERIENCE_OPTIONS.map((option, index) => (
                  <ChoiceCard key={option.value} {...option} selected={experience === option.value} index={index} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExperience(option.value);
                  }} />
                ))}
              </View>
            ) : surveyIndex === 1 ? (
              <View style={styles.optionList}>
                {MARKET_OPTIONS.map((option, index) => (
                  <ChoiceCard key={option.value} {...option} selected={markets.includes(option.value)} index={index} onPress={() => toggle(markets, option.value, setMarkets)} />
                ))}
              </View>
            ) : surveyIndex === 2 ? (
              <View style={styles.optionList}>
                {CHALLENGE_OPTIONS.map((option, index) => (
                  <ChoiceCard key={option.value} {...option} selected={challenges.includes(option.value)} index={index} onPress={() => toggle(challenges, option.value, setChallenges)} />
                ))}
              </View>
            ) : (
              <View style={styles.optionList}>
                {GOAL_OPTIONS.map((option, index) => (
                  <ChoiceCard key={option.value} {...option} selected={goals.includes(option.value)} index={index} onPress={() => toggle(goals, option.value, setGoals)} />
                ))}
              </View>
            )}
          </ScrollView>
        ) : phase === 'comparison' ? (
          <ScrollView contentContainerStyle={styles.educationContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionEyebrow, { color: colors.accent }]}>A MORE STRUCTURED REVIEW</Text>
            <Text style={[styles.largeTitle, { color: colors.text }]}>Bring more context to your chart routine</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Use AI analysis as a second perspective alongside your own research and risk plan.</Text>
            <ComparisonCard onAnimationComplete={handleComparisonComplete} />
            <Text style={[styles.smallPrint, { color: colors.textMuted }]}>Illustrative workflow only. AI analysis can be wrong and does not predict results.</Text>
          </ScrollView>
        ) : phase === 'notifications' ? (
          <View style={styles.centerContent}>
          <View style={[styles.heroIcon, { backgroundColor: withOpacity(colors.accent, 0.14), borderColor: withOpacity(colors.accent, 0.48) }]}><Feather name="bell" size={58} color={colors.accent} /></View>
          <Text style={[styles.largeTitle, { color: colors.text }]}>Stay up to date</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose to receive updates about your analyses and market briefings. You can change notification preferences anytime.</Text>
            <View style={styles.benefitList}>
              <Benefit icon="activity" text="See when your saved analysis changes" />
              <Benefit icon="bell" text="Receive selected market updates" />
              <Benefit icon="zap" text="Keep your learning routine on track" />
            </View>
            {notificationError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{notificationError}</Text> : null}
          </View>
        ) : phase === 'community' ? (
          <ScrollView contentContainerStyle={styles.educationContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.stars, { color: colors.gold }]}>✦  ✦  ✦</Text>
            <Text style={[styles.largeTitle, { color: colors.text }]}>A clearer trading workflow starts here</Text>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(80).duration(440).springify()} style={[styles.communityCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <View style={[styles.communityIcon, { backgroundColor: withOpacity(colors.accent, 0.14) }]}><Feather name="search" size={22} color={colors.accent} /></View>
              <View style={styles.communityCopy}><Text style={[styles.cardTitle, { color: colors.text }]}>Read the chart</Text><Text style={[styles.cardDetail, { color: colors.textSecondary }]}>Review trend, structure and key price levels.</Text></View>
            </Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(170).duration(440).springify()} style={[styles.communityCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <View style={[styles.communityIcon, { backgroundColor: withOpacity(colors.accent, 0.14) }]}><Feather name="target" size={22} color={colors.accent} /></View>
              <View style={styles.communityCopy}><Text style={[styles.cardTitle, { color: colors.text }]}>Review the plan</Text><Text style={[styles.cardDetail, { color: colors.textSecondary }]}>See entry, stop and targets in one place.</Text></View>
            </Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(260).duration(440).springify()} style={[styles.communityCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <View style={[styles.communityIcon, { backgroundColor: withOpacity(colors.accent, 0.14) }]}><Feather name="shield" size={22} color={colors.accent} /></View>
              <View style={styles.communityCopy}><Text style={[styles.cardTitle, { color: colors.text }]}>Keep risk in view</Text><Text style={[styles.cardDetail, { color: colors.textSecondary }]}>Use analysis as information, not a promise or instruction.</Text></View>
            </Animated.View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.educationContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.largeTitle, styles.finishTitle, { color: colors.text }]}>Trading research, made easier to navigate</Text>
            {[
              { icon: 'camera' as const, text: 'Analyze a chart screenshot in one place' },
              { icon: 'clock' as const, text: 'Spend less time organizing manual chart notes' },
              { icon: 'trending-up' as const, text: 'Review directional analysis and price levels' },
              { icon: 'book-open' as const, text: 'Explore lessons and market briefings' },
              { icon: 'shield' as const, text: 'Keep risk management part of your process' },
            ].map((item, index) => <Benefit key={item.text} icon={item.icon} text={item.text} index={index} large />)}
            <Text style={[styles.smallPrint, { color: colors.textMuted }]}>FXSnap provides educational information, not financial advice. Trading involves risk.</Text>
          </ScrollView>
        )}
      </Animated.View>

      {phase === 'intro' ? (
        <View style={[styles.introFooter, { paddingBottom: bottomPadding }]}>
          <View style={styles.dots}>
            {INTRO_SLIDES.map((_, index) => <View key={index} style={[styles.dot, { backgroundColor: index === introIndex ? colors.accent : colors.cardBorder }, index === introIndex && styles.activeDot]} />)}
          </View>
          <PrimaryButton label={introIndex === INTRO_SLIDES.length - 1 ? 'Get Started' : 'Continue'} onPress={advance} />
        </View>
      ) : phase !== 'comparison' || comparisonReady ? (
        <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
          {saveError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{saveError}</Text> : null}
          {phase === 'notifications' ? (
            <>
              <PrimaryButton label="Enable notifications" onPress={() => void enableNotifications()} />
              <TouchableOpacity style={styles.secondaryButton} onPress={advance} accessibilityRole="button">
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Not now</Text>
              </TouchableOpacity>
            </>
          ) : (
            <PrimaryButton
              label={phase === 'finish' ? saving ? 'Saving…' : 'Get Started' : 'Continue'}
              onPress={advance}
              disabled={saving}
              leading={saving ? <ActivityIndicator color={colors.primaryForeground} /> : undefined}
            />
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function IntroPage({ slideIndex }: { slideIndex: number }) {
  const slide = INTRO_SLIDES[slideIndex];
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) {
      float.value = 0;
      return;
    }
    float.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [float, reduceMotion]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value * 5 }] }));
  return (
    <View style={styles.introContent}>
      <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(80).duration(650).springify()} style={styles.phoneEntrance}>
       <Animated.View style={[styles.phoneShell, { borderColor: withOpacity(colors.textSecondary, 0.72), backgroundColor: colors.surface }, floatStyle]}>
        <View style={[styles.phoneScreen, { backgroundColor: colors.background }]}>
          <View style={styles.phoneHeader}>
            <Text style={[styles.phoneTime, { color: colors.text }]}>9:41</Text>
            <View style={styles.phoneIsland} />
            <Feather name="battery" size={15} color={colors.text} />
          </View>
          <View style={styles.phonePreview}>
            <View style={styles.actualPagePreview} pointerEvents="none">
              {slideIndex === 0 ? <HomeDashboard previewMode /> : slideIndex === 1 ? <DailyBriefExperience previewMode /> : <LearningHubScreen previewMode />}
            </View>
          </View>
        </View>
       </Animated.View>
      </Animated.View>
      <View style={styles.introCopy}>
        <Animated.Text entering={reduceMotion ? undefined : FadeInDown.delay(180).duration(530)} style={[styles.largeTitle, { color: colors.text }]}>{slide.title}</Animated.Text>
        <Animated.Text entering={reduceMotion ? undefined : FadeInDown.delay(300).duration(530)} style={[styles.subtitle, { color: colors.textSecondary }]}>{slide.subtitle}</Animated.Text>
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
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(index * 70).duration(380).springify()}>
      <Animated.View style={scaleStyle}>
        <TouchableOpacity
          onPress={() => {
            if (!reduceMotion) scale.value = withSequence(withTiming(0.985, { duration: 70 }), withSpring(1));
            onPress();
          }}
          style={[
            styles.choiceCard,
            { borderColor: selected ? colors.accent : colors.cardBorder, backgroundColor: selected ? withOpacity(colors.accent, 0.12) : colors.card },
          ]}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityState={{ selected }}
        >
          <View style={[styles.choiceIcon, { backgroundColor: withOpacity(colors.accent, selected ? 0.22 : 0.11), borderColor: withOpacity(colors.accent, selected ? 0.65 : 0.28) }]}><Feather name={icon} size={23} color={colors.accent} /></View>
          <View style={styles.choiceCopy}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>{detail}</Text>
          </View>
          <View style={[styles.checkBox, { borderColor: selected ? colors.accent : colors.textMuted, backgroundColor: selected ? colors.accent : 'transparent' }]}>
            {selected ? <Feather name="check" size={15} color={colors.primaryForeground} /> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

function ComparisonCard({ onAnimationComplete }: { onAnimationComplete: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const notesProgress = useSharedValue(reduceMotion ? 1 : 0);
  const analysisProgress = useSharedValue(reduceMotion ? 1 : 0);
  const ownNotesStyle = useAnimatedStyle(() => ({
    height: Math.max(4, notesProgress.value * 42),
    opacity: 0.65 + notesProgress.value * 0.35,
    transform: [{ scaleY: 0.96 + notesProgress.value * 0.04 }],
  }));
  const analysisStyle = useAnimatedStyle(() => ({
    height: Math.max(4, analysisProgress.value * 126),
    opacity: 0.65 + analysisProgress.value * 0.35,
    transform: [{ scale: 0.92 + analysisProgress.value * 0.08 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: analysisProgress.value * 0.52,
    transform: [{ scale: 0.72 + analysisProgress.value * 0.5 }],
  }));
  React.useEffect(() => {
    if (reduceMotion) {
      notesProgress.value = 1;
      analysisProgress.value = 1;
      onAnimationComplete();
      return;
    }
    notesProgress.value = withDelay(70, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    analysisProgress.value = withDelay(360, withTiming(1, { duration: 1450, easing: Easing.out(Easing.cubic) }));
    const revealTimer = setTimeout(onAnimationComplete, 1900);
    return () => clearTimeout(revealTimer);
  }, [analysisProgress, notesProgress, onAnimationComplete, reduceMotion]);
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(150).duration(550).springify()} style={[styles.comparisonCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      <Text style={[styles.comparisonTitle, { color: colors.text }]}>Two perspectives. One considered process.</Text>
      <View style={styles.comparisonHeaders}>
        <Text style={[styles.comparisonHeader, { color: colors.textSecondary }]}>YOUR CHART REVIEW</Text>
        <Text style={[styles.comparisonHeader, { color: colors.accent }]}>FXSNAP ANALYSIS</Text>
      </View>
      <View style={styles.comparisonBars}>
        <View style={styles.manualBarGroup}>
          <View style={styles.barWell}>
            <Animated.View style={[styles.manualBar, { backgroundColor: colors.cardBorder }, ownNotesStyle]} />
          </View>
          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>Your own notes</Text>
        </View>
        <View style={styles.aiBarGroup}>
          <View style={styles.barWell}>
            <Animated.View pointerEvents="none" style={[styles.analysisGlow, { backgroundColor: colors.accent }, glowStyle]} />
            <Animated.View style={[styles.aiBar, { shadowColor: colors.accent }, analysisStyle]}>
              <LinearGradient
                colors={[colors.accent, colors.buy]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.aiBarGradient}
              >
                <View style={[styles.aiBarShine, { backgroundColor: withOpacity('#FFFFFF', 0.24) }]} />
                <Feather name="check" size={24} color={colors.primaryForeground} />
              </LinearGradient>
            </Animated.View>
          </View>
          <Text style={[styles.barLabel, { color: colors.accent }]}>FXSNAP ANALYSIS</Text>
        </View>
      </View>
      <Text style={[styles.comparisonFoot, { color: colors.textSecondary }]}>Use the chart, the analysis, and your own risk rules together. No tool can guarantee a trading outcome.</Text>
    </Animated.View>
  );
}

function Benefit({ icon, text, index = 0, large = false }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  text: string;
  index?: number;
  large?: boolean;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(index * 85).duration(430).springify()} style={[styles.benefitCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }, large && styles.largeBenefitCard]}>
      <View style={[styles.benefitIcon, { backgroundColor: withOpacity(colors.accent, 0.14) }, large && styles.largeBenefitIcon]}><Feather name={icon} size={large ? 21 : 23} color={colors.accent} /></View>
      <Text style={[styles.benefitText, { color: colors.text }]}>{text}</Text>
    </Animated.View>
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
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(1);
  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));
  return (
    <Animated.View style={pressedStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { if (!reduceMotion) pressed.value = withSpring(0.98); }}
        onPressOut={() => { if (!reduceMotion) pressed.value = withSpring(1); }}
        disabled={disabled}
        style={[styles.primaryButton, { backgroundColor: colors.primary, shadowColor: colors.accent } , disabled && styles.buttonDisabled]}
        activeOpacity={1}
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
  topBar: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, gap: 15 },
  backButton: { width: 35, height: 40, justifyContent: 'center' },
  topBarSpacer: { flex: 1 },
  skipPlaceholder: { width: 35 },
  progressTrack: { height: 7, flex: 1, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  page: { flex: 1 },
  introContent: { flex: 1, paddingHorizontal: 12, paddingTop: 8, justifyContent: 'space-between' },
  phoneEntrance: { flex: 1, alignItems: 'center' },
  phoneShell: { flex: 1, maxHeight: 470, width: '100%', alignSelf: 'center', marginTop: 8, borderWidth: 2, borderRadius: 38, padding: 8 },
  phoneScreen: { flex: 1, borderRadius: 29, overflow: 'hidden', paddingHorizontal: 10, paddingTop: 7 },
  phoneHeader: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7 },
  phoneTime: { fontSize: 9, fontWeight: '700' },
  phoneIsland: { position: 'absolute', width: 65, height: 15, borderRadius: 10, backgroundColor: '#020306', left: '40%' },
  phonePreview: { flex: 1, paddingTop: 6, paddingBottom: 5 },
  actualPagePreview: { flex: 1, overflow: 'hidden', borderRadius: 22 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardDetail: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  introCopy: { paddingTop: 22, paddingBottom: 18, alignItems: 'center' },
  largeTitle: { fontSize: 29, lineHeight: 37, fontWeight: '800', textAlign: 'center', letterSpacing: -0.45 },
  subtitle: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 13, paddingHorizontal: 8 },
  introFooter: { paddingHorizontal: 26, paddingTop: 8, gap: 25 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  activeDot: { width: 35 },
  footer: { paddingHorizontal: 25, paddingTop: 10, gap: 9 },
  primaryButton: { minHeight: 64, borderRadius: 19, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 19, fontWeight: '800' },
  secondaryButton: { height: 42, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },
  scroll: { flex: 1 },
  surveyContent: { flexGrow: 1, paddingHorizontal: 25, paddingTop: 30, paddingBottom: 20 },
  surveyTitle: { fontSize: 30, lineHeight: 39, fontWeight: '800', textAlign: 'center', paddingHorizontal: 2 },
  optionList: { marginTop: 31, gap: 14 },
  choiceCard: { minHeight: 88, borderRadius: 19, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  choiceIcon: { width: 55, height: 55, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  choiceCopy: { flex: 1, gap: 3 },
  checkBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  educationContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 25, paddingTop: 22, paddingBottom: 24 },
  sectionEyebrow: { textAlign: 'center', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 14 },
  comparisonCard: { marginTop: 27, padding: 20, borderRadius: 22, borderWidth: 1, minHeight: 335, justifyContent: 'space-around' },
  comparisonTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  comparisonHeaders: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  comparisonHeader: { fontSize: 11, fontWeight: '700', width: '45%', textAlign: 'center' },
  comparisonBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', minHeight: 172 },
  manualBarGroup: { alignItems: 'center', gap: 10 },
  aiBarGroup: { alignItems: 'center', gap: 10 },
  barWell: { height: 132, width: 110, alignItems: 'center', justifyContent: 'flex-end' },
  manualBar: { width: 92, borderRadius: 12 },
  aiBar: { width: 104, borderRadius: 17, overflow: 'hidden', shadowOpacity: 0.3, shadowRadius: 18, elevation: 5 },
  aiBarGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  aiBarShine: { position: 'absolute', width: 32, height: '160%', top: '-30%', left: '17%', borderRadius: 20, transform: [{ rotate: '20deg' }] },
  analysisGlow: { position: 'absolute', width: 118, height: 138, bottom: -2, borderRadius: 30 },
  barLabel: { fontSize: 12, fontWeight: '600' },
  comparisonFoot: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  smallPrint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18, paddingHorizontal: 8 },
  centerContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 25, paddingBottom: 16 },
  heroIcon: { width: 138, height: 138, borderRadius: 72, alignSelf: 'center', borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  benefitList: { marginTop: 34, gap: 13 },
  benefitCard: { minHeight: 81, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 15 },
  benefitIcon: { width: 47, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  stars: { fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 19 },
  communityCard: { minHeight: 94, borderRadius: 18, borderWidth: 1, padding: 15, marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 14 },
  communityIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  communityCopy: { flex: 1 },
  errorText: { textAlign: 'center', fontSize: 13, lineHeight: 18, paddingHorizontal: 8, marginBottom: 7 },
  finishTitle: { marginBottom: 28 },
  largeBenefitCard: { minHeight: 67, marginBottom: 11, paddingVertical: 9 },
  largeBenefitIcon: { width: 46, height: 46, borderRadius: 13 },
  glow: { position: 'absolute', width: 310, height: 310, borderRadius: 160 },
  glowUpper: { top: -150, right: -125 },
  glowLower: { bottom: -195, left: -145 },
});
