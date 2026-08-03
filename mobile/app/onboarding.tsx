import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
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
  hook:   hp(50),
  value:  hp(40),
  trust:  hp(42),
  social: hp(30),
};

const BULLETS = [
  { icon: 'trending-up',  text: 'Buy or Sell decision in seconds' },
  { icon: 'shield',       text: 'Smart Stop Loss & Take Profit' },
  { icon: 'percent',      text: 'Automatic lot size calculation' },
];

const REVIEWS = [
  { text: 'Educational tools for structured decision-making', author: 'FXSnap product principle' },
  { text: 'Review your process before risking capital', author: 'FXSnap product principle' },
];

const PLANS = [
  { id: 'weekly',   label: 'Weekly',   price: '$7.99',  period: '/ week' },
  { id: 'quarterly', label: '3 Months', price: '$29.99', period: '/ 3 months',
    tag: 'MOST POPULAR', savings: undefined },
];

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

// ─── Animated hero image with zoom-in effect ────────────────────────────────
function HeroImage({
  source,
  imgHeight,
  screenKey,
}: {
  source: any;
  imgHeight: number;
  screenKey: string;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) });
    scale.value = withTiming(1.06, {
      duration: 6000,
      easing: Easing.inOut(Easing.ease),
    });
  }, [screenKey]);

  const imgStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(350)}
      style={[styles.imageContainer, { height: imgHeight, backgroundColor: colors.surface }]}
    >
      <Animated.Image
        source={source}
        style={[styles.heroImage, imgStyle]}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.88)']}
        locations={[0.45, 0.72, 1]}
        style={styles.imageFade}
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

  const botPad = Platform.OS === 'web' ? 34 : 0;

  const currentScreen = SCREENS[currentIndex];
  const progressIndex = PROGRESS_SCREENS.indexOf(currentScreen as any);

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
      <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.textSection, { paddingBottom: botPad + 24 }]}>
        <HeroImage source={OB_IMAGES.hook} imgHeight={IMAGE_HEIGHTS.hook} screenKey="hook" />

        <Animated.View entering={FadeInUp.delay(200).duration(600)}>
          <View style={[styles.brandBadge, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Feather name="activity" size={14} color={colors.buy} />
            <Text style={[styles.brandBadgeText, { color: colors.buy }]}>FXSnap</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Analyse Any Chart{'\n'}in Seconds</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Snap your chart. Get instant Buy/Sell signals, Stop Loss, Take Profit and lot size — all in one tap.
          </Text>
          <PulseButton label="Get Started" onPress={goNext} />
          <View style={styles.dots}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.dot, i === 0 && styles.dotActive, { backgroundColor: i === 0 ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
        </Animated.View>
      </ScreenWrapper>
    );
  }

  // ── SCREEN 1: Value ─────────────────────────────────────────────────────────
  if (currentScreen === 'value') {
    return (
      <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.textSection, { paddingBottom: botPad + 24 }]}>
        <HeroImage source={OB_IMAGES.value} imgHeight={IMAGE_HEIGHTS.value} screenKey="value" />

          <View style={{ backgroundColor: colors.background }}>
          <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={[styles.title, { color: colors.text }]}> 
            Know What to Do —{'\n'}Instantly
          </Animated.Text>
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
          <Animated.View entering={FadeInUp.delay(600).duration(400)}>
            <NextButton label="Next" onPress={goNext} />
          </Animated.View>
          <View style={styles.dots}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.dot, i === 1 && styles.dotActive, { backgroundColor: i === 1 ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ── SCREEN 2: Trust ─────────────────────────────────────────────────────────
  if (currentScreen === 'trust') {
    return (
      <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.textSection, { paddingBottom: botPad + 24 }]}>
        <HeroImage source={OB_IMAGES.trust} imgHeight={IMAGE_HEIGHTS.trust} screenKey="trust" />

        <View>
          <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={[styles.title, { color: colors.text }]}> 
            Built for{'\n'}Real Traders
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(200).duration(500)} style={[styles.subtitle, { color: colors.textSecondary }]}>
            Built to help traders document decisions and apply consistent risk rules.
          </Animated.Text>
          <View style={styles.reviewList}>
            {REVIEWS.map((r, i) => (
              <Animated.View
                key={r.text}
                entering={FadeInUp.delay(300 + i * 150).duration(500)}
                style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Stars />
                <Text style={[styles.reviewText, { color: colors.text }]}>{r.text}</Text>
                <Text style={[styles.reviewAuthor, { color: colors.textSecondary }]}>{r.author}</Text>
              </Animated.View>
            ))}
          </View>
          <Animated.View entering={FadeInUp.delay(650).duration(400)}>
            <NextButton label="Next" onPress={goNext} />
          </Animated.View>
          <View style={styles.dots}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.dot, i === 2 && styles.dotActive, { backgroundColor: i === 2 ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ── SCREEN 3: Social proof ──────────────────────────────────────────────────
  if (currentScreen === 'social') {
    return (
      <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.textSection, styles.socialSection, { paddingBottom: botPad + 24 }]}>
        <HeroImage source={OB_IMAGES.social} imgHeight={IMAGE_HEIGHTS.social} screenKey="social" />

        <View>
          <Animated.View entering={FadeInDown.delay(100).duration(600)} style={[styles.socialBadge, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Feather name="users" size={14} color={colors.buy} />
            <Text style={[styles.socialBadgeText, { color: colors.buy }]}>Structured trading workflow</Text>
          </Animated.View>

          <Animated.Text entering={FadeInUp.delay(200).duration(600)} style={[styles.socialTitle, { color: colors.text }]}>
            Join thousands making smarter decisions daily
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(350).duration(600)} style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.buy }]}>AI</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Chart review</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.buy }]}>Risk</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>First workflow</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.buy }]}>You</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Your decisions</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(500).duration(500)}>
            <TouchableOpacity
              style={[styles.seeBtn, { backgroundColor: colors.primary }]}
              onPress={goNext}
              activeOpacity={0.9}
            >
              <Text style={[styles.seeBtnText, { color: colors.primaryForeground }]}>See Plans</Text>
              <Feather name="arrow-right" size={18} color="#000" />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.dots}>
            {PROGRESS_SCREENS.map((_, i) => (
              <View key={i} style={[styles.dot, i === 3 && styles.dotActive, { backgroundColor: i === 3 ? colors.primary : colors.cardBorder }]} />
            ))}
          </View>
        </View>
      </ScreenWrapper>
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

        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.featureList}>
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
              style={[styles.planCard, selectedPlan === plan.id && styles.planCardSelected, { backgroundColor: colors.card, borderColor: selectedPlan === plan.id ? colors.primary : colors.cardBorder }]}
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
  imageContainer: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#111111',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  imageFade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  textSection: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 18,
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
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  bulletIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0D1A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#FFFFFF',
    flex: 1,
  },
  reviewList: {
    gap: 10,
  },
  reviewCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 6,
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
