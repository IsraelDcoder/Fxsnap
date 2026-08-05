import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import ScreenWrapper from '@/components/ScreenWrapper';
import { hp } from '@/styles/responsive';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';


type Screen = 'hook' | 'value' | 'trust' | 'social' | 'paywall';
const SCREENS: Screen[] = ['hook', 'value', 'trust', 'social', 'paywall'];
const PROGRESS_SCREENS: Screen[] = ['hook', 'value', 'trust', 'social'];

const OB_IMAGES: Record<string, any> = {
  hook:   require('@/assets/images/ob1.jpg'),
  value:  require('@/assets/images/ob2.jpg'),
  trust:  require('@/assets/images/ob3.jpg'),
  social: require('@/assets/images/ob4.jpg'),
};

const IMAGE_HEIGHTS: Record<string, number> = {
  hook: hp(50),
  value: hp(42),
  trust: hp(42),
  social: hp(38),
};

const BULLETS = [
  { icon: 'upload', text: 'Upload your chart' },
  { icon: 'zap', text: 'AI analyzes market structure' },
  { icon: 'arrow-right', text: 'Get instant BUY or SELL signal' },
];

const REVIEWS = [
  { initials: 'JK', name: 'James K.', role: 'Forex Trader', text: 'Helped me avoid 3 losing trades today' },
  { initials: 'AM', name: 'Ava M.', role: 'Swing Trader', text: 'My entries are way more accurate now' },
  { initials: 'DL', name: 'Dylan L.', role: 'Crypto Trader', text: 'Finally a tool that actually works' },
];

const PLANS = [
  { id: 'weekly',   label: 'Weekly',   price: '$7.99',  period: '/ week' },
  { id: 'quarterly', label: '3 Months', price: '$29.99', period: '/ 3 months',
    tag: 'MOST POPULAR', savings: undefined },
];

const APP_TOKENS = {
  bg: '#000000',
  surface: '#0E0E0E',
  border: '#1A1A1A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  accent: '#00FF9D',
};

const spacing = [8, 12, 16, 24, 32];

function Stars({ count = 5 }: { count?: number }) {
  const colors = useColors();
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <Feather key={i} name="star" size={13} color={colors.gold} />
      ))}
    </View>
  );
}

// ─── Supporting hero image block ────────────────────────────────────────────
function HeroImage({
  source,
  screenKey,
}: {
  source: any;
  screenKey: string;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    scale.value = 1;
    opacity.value = 0;
    translateY.value = 12;
    opacity.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 800, easing: Easing.out(Easing.ease) });
    scale.value = withTiming(1.03, {
      duration: 6000,
      easing: Easing.inOut(Easing.ease),
    });
  }, [screenKey]);

  const imgStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(350)}
      pointerEvents="box-none"
      style={[styles.imageContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
    >
      <Animated.Image
        source={source}
        style={[styles.heroImage, imgStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// ─── Pulsing next button ─────────────────────────────────────────────────────
function PulseButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  const pulse = useSharedValue(1);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * pressScale.value }],
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.95, { damping: 12, stiffness: 400 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 400 });
  };

  return (
    <Animated.View style={containerStyle}>
      <TouchableOpacity
        style={[styles.pulseBtn, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <Text style={[styles.pulseBtnText, { color: colors.primaryForeground }]}>{label}</Text>
        <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Regular next button ─────────────────────────────────────────────────────
function NextButton({ label, onPress, style: extraStyle }: { label: string; onPress: () => void; style?: any }) {
  const colors = useColors();
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  return (
    <Animated.View style={[animStyle, extraStyle]}>
      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        onPressIn={() => { pressScale.value = withSpring(0.96, { damping: 12, stiffness: 400 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 12, stiffness: 400 }); }}
        activeOpacity={1}
      >
        <Text style={[styles.nextBtnText, { color: colors.primaryForeground }]}>{label}</Text>
        <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState('quarterly');
  const [loading, setLoading] = useState(false);
  const { completeOnboarding, purchasePlan } = useApp();
  const insets = useSafeAreaInsets();

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const currentScreen = SCREENS[currentIndex];
  const progressIndex = PROGRESS_SCREENS.indexOf(currentScreen as any);
  const pageCtaLabel =
    currentScreen === 'hook'
      ? 'See How It Works'
      : currentScreen === 'value'
        ? 'Show Me Signals'
        : currentScreen === 'trust'
          ? 'I Want Better Trades'
          : 'Get Started';
  const progressLabel = `Step ${progressIndex + 1} of ${PROGRESS_SCREENS.length}`;

  const goNext = () => {
    setCurrentIndex((i) => Math.min(i + 1, SCREENS.length - 1));
  };

  const handleSubscribe = async () => {
    setLoading(true);
    const purchased = await purchasePlan(selectedPlan as 'weekly' | 'quarterly');
    if (!purchased) {
      setLoading(false);
      Alert.alert('Purchases unavailable', 'FXSnap billing is not connected yet. You can continue without subscribing.');
      return;
    }
    await completeOnboarding();
    router.replace('/home');
  };

  const handleClose = async () => {
    await completeOnboarding();
    router.replace('/home');
  };

  // ── SCREEN 0: Hook ──────────────────────────────────────────────────────────
  if (currentScreen === 'hook') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.logoText, { color: colors.text }]}>FXSnap</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentStack}>
          <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.textSection}>
            <Text style={[styles.title, { color: colors.text }]}>Stop Guessing Your Trades</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Let AI tell you exactly when to buy or sell.</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(220).duration(500)} style={styles.imageSection}>
            <HeroImage source={OB_IMAGES.hook} screenKey="hook" />
          </Animated.View>
        </View>

        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}> 
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressLabel}</Text>
          <View style={styles.pagination}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === progressIndex && styles.pageDotActive, { backgroundColor: i === progressIndex ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: colors.primary }]} onPress={goNext} activeOpacity={0.9}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>{pageCtaLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── SCREEN 1: Value ─────────────────────────────────────────────────────────
  if (currentScreen === 'value') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.logoText, { color: colors.text }]}>FXSnap</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentStack}>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.textSection}>
            <Text style={[styles.title, { color: colors.text }]}>Get Trade Signals in Seconds</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>No indicators. No confusion. Just clear decisions.</Text>
            <View style={styles.bulletList}>
              {BULLETS.map((b, i) => (
                <Animated.View
                  key={b.text}
                  entering={FadeInRight.delay(200 + i * 120).duration(450)}
                  style={[styles.bulletRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <View style={[styles.bulletIcon, { backgroundColor: colors.surface }]}> 
                    <Feather name={b.icon as any} size={18} color={colors.buy} />
                  </View>
                  <Text style={[styles.bulletText, { color: colors.text }]}>{b.text}</Text>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}> 
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressLabel}</Text>
          <View style={styles.pagination}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === progressIndex && styles.pageDotActive, { backgroundColor: i === progressIndex ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: colors.primary }]} onPress={goNext} activeOpacity={0.9}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>{pageCtaLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── SCREEN 2: Trust ─────────────────────────────────────────────────────────
  if (currentScreen === 'trust') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.logoText, { color: colors.text }]}>FXSnap</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentStack}>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.textSection}>
            <Text style={[styles.title, { color: colors.text }]}>Trade With Confidence</Text>
            <Animated.Text entering={FadeInDown.delay(200).duration(500)} style={[styles.subtitle, { color: colors.textSecondary }]}>Avoid bad trades and improve your entries instantly.</Animated.Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(220).duration(500)} style={styles.imageSection}>
            <HeroImage source={OB_IMAGES.trust} screenKey="trust" />
          </Animated.View>
        </View>

        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}> 
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressLabel}</Text>
          <View style={styles.pagination}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === progressIndex && styles.pageDotActive, { backgroundColor: i === progressIndex ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: colors.primary }]} onPress={goNext} activeOpacity={0.9}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>{pageCtaLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── SCREEN 3: Social proof ──────────────────────────────────────────────────
  if (currentScreen === 'social') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.logoText, { color: colors.text }]}>FXSnap</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentStack}>
          <Animated.View entering={FadeInDown.delay(120).duration(600)} style={styles.textSection}>
            <Animated.View entering={FadeInUp.delay(200).duration(600)} style={[styles.socialBadge, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}> 
              <Feather name="users" size={14} color={colors.buy} />
              <Text style={[styles.socialBadgeText, { color: colors.buy }]}>Try your first analysis for free</Text>
            </Animated.View>
            <Animated.Text entering={FadeInUp.delay(200).duration(600)} style={[styles.socialTitle, { color: colors.text }]}>Start Winning Smarter Trades</Animated.Text>
            <Animated.Text entering={FadeInUp.delay(350).duration(600)} style={[styles.subtitle, { color: colors.textSecondary }]}>Join traders using AI to improve every decision.</Animated.Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(220).duration(500)} style={styles.imageSection}>
            <HeroImage source={OB_IMAGES.social} screenKey="social" />
          </Animated.View>
        </View>

        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}> 
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressLabel}</Text>
          <View style={styles.pagination}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === progressIndex && styles.pageDotActive, { backgroundColor: i === progressIndex ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: colors.primary }]} onPress={goNext} activeOpacity={0.9}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>{pageCtaLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── SCREEN 4: Paywall ───────────────────────────────────────────────────────
  return (
    <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.paywallContent, { paddingBottom: botPad + 24 }]}>
      <View style={styles.paywallHeader}>
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.card }]} onPress={handleClose}>
          <Feather name="x" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.paywallHero}>
          <View style={[styles.crownBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Feather name="zap" size={34} color={colors.gold} />
          </View>
          <Text style={[styles.paywallTitle, { color: colors.text }]}>FXSnap Premium</Text>
          <Text style={[styles.paywallSub, { color: colors.textSecondary }]}>Unlock full access to all features</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={[styles.featureList, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {[
            'Unlimited chart analysis',
            'AI-powered trade insights',
            'Risk management tools',
            'Strategy generator',
            'Save & review all analyses',
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.checkCircle, { backgroundColor: colors.buy }]}>
                <Feather name="check" size={13} color={colors.primaryForeground} />
              </View>
              <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.planCards}>
          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selectedPlan === plan.id && styles.planCardSelected, { backgroundColor: colors.surface, borderColor: selectedPlan === plan.id ? colors.primary : colors.cardBorder }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan(plan.id);
              }}
              activeOpacity={0.9}
            >
              {plan.tag && (
                <View style={styles.planTag}>
                  <Text style={[styles.planTagText, { color: colors.primaryForeground }]}>{plan.tag}</Text>
                </View>
              )}
              <View>
                <Text style={[styles.planName, { color: colors.text }]}>{plan.label}</Text>
                {plan.savings && <Text style={[styles.planSavings, { color: colors.buy }]}>{plan.savings}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.planPrice, { color: colors.text }]}>{plan.price}</Text>
                <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>{plan.period}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(450).duration(600)} style={styles.paywallActions}>
          <TouchableOpacity
            style={[styles.subscribeBtn, loading && { opacity: 0.7 }, { backgroundColor: colors.primary }] }
            onPress={handleSubscribe}
            disabled={loading}
          >
            <Text style={[styles.subscribeBtnText, { color: colors.primaryForeground }]}>
              {loading ? 'Processing...' : 'Start Subscription'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert('Restore unavailable', 'Restore will be available after App Store and Google Play billing are connected.') }>
            <Text style={[styles.restoreText, { color: colors.textSecondary }]}>Restore Purchase</Text>
          </TouchableOpacity>
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            Cancel anytime. Prices in USD. No hidden fees.
          </Text>
        </Animated.View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 14,
    minHeight: 84,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  contentStack: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 20,
  },
  bottomSection: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 0,
  },
  imageContainer: {
    width: '100%',
    height: hp(40),
    overflow: 'hidden',
    backgroundColor: '#111111',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  textSection: {
    gap: 10,
    maxWidth: '90%',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 0,
    flexGrow: 1,
  },
  pageWrapper: {
    flex: 1,
    position: 'relative',
  },
  pageContent: {
    flex: 1,
    paddingTop: 22,
    paddingBottom: 120,
    zIndex: 1,
  },
  pageBody: {
    gap: 18,
  },
  skipRow: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
  },
  fixedCta: {
    position: 'absolute',
    left: 24,
    right: 24,
    gap: 10,
    zIndex: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: 2,
  },
  ctaBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  ctaText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
  },
  pageDotActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0D1A12',
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1A3D26',
  },
  brandBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#00E676',
  },
  title: {
    fontSize: 34,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    lineHeight: 23,
  },
  bulletList: {
    gap: 12,
    alignItems: 'stretch',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    position: 'relative',
  },
  bulletIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0D1A12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  connectorLine: {
    position: 'absolute',
    left: 18,
    top: 52,
    width: 1,
    height: 24,
    backgroundColor: '#1A1A1A',
  },
  bulletText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#FFFFFF',
    flex: 1,
  },
  reviewList: {
    gap: 10,
    paddingHorizontal: 0,
  },
  reviewRow: {
    paddingRight: 8,
    paddingHorizontal: 16,
  },
  reviewCard: {
    backgroundColor: '#111111',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    gap: 10,
    minWidth: 260,
    marginRight: 12,
    shadowColor: '#00FF9D',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  reviewMeta: {
    gap: 2,
  },
  reviewName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  reviewRole: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  reviewText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  reviewAuthor: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  socialSection: {
    justifyContent: 'center',
    paddingTop: 12,
  },
  socialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#0D1A12',
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1A3D26',
  },
  socialBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#00E676',
  },
  socialTitle: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 38,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2A2A2A',
  },
  statNum: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#00E676',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    marginTop: 3,
  },
  seeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  seeBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 24,
  },
  pulseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  pulseBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  nextBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  // ── Paywall ──
  paywallHeader: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  paywallContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    gap: 22,
  },
  paywallHero: {
    alignItems: 'center',
    gap: 10,
  },
  crownBox: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#1A1800',
    borderWidth: 1,
    borderColor: '#3D3400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallTitle: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  paywallSub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  featureList: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00E676',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#FFFFFF',
  },
  planCards: {
    gap: 12,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#FFFFFF',
  },
  planTag: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#FFD60A',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planTagText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  planName: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  planSavings: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#00E676',
    marginTop: 3,
  },
  planPrice: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  paywallActions: {
    alignItems: 'center',
    gap: 14,
  },
  subscribeBtn: {
    width: '100%',
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  restoreText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  legalText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    textAlign: 'center',
  },
});
