import React, { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Modal, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';
import ScreenWrapper from '@/components/ScreenWrapper';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { getAvailablePlans, type BillingPlan, type PlanOffering } from '@/services/billing';
import { API_BASE_URL } from '@/services/apiAuth';
import { trackEvent } from '@/services/telemetry';
import { useColors } from '@/hooks/useColors';
import { typography } from '@/constants/typography';

export default function PaywallScreen() {
  // ScreenWrapper handles safe area and scrolling
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const isDarkTheme = colors.text === '#FFFFFF';
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isAnalysisResultUnlock = source === 'analysis-result-locked';
  const returnRoute = isAnalysisResultUnlock
    ? '/analysis-result'
    : '/(tabs)/home';
  const { purchasePlan, restorePurchases, billingAvailable, isSubscribed, isLoading, consumePendingFeatureRoute, clearPendingFeatureRoute } = useApp();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 760 || screenWidth < 380;

  const dismissPaywall = () => {
    trackEvent('paywall_dismissed', { source: source ?? 'unknown' });
    clearPendingFeatureRoute();
    router.replace(returnRoute);
  };
  const handlePaywallDismiss = () => {
    if (exitOfferShown) {
      dismissPaywall();
      return;
    }
    setExitOfferShown(true);
    setExitOfferHeadlineComplete(false);
    trackEvent('paywall_exit_offer_impression', { source: source ?? 'unknown' });
    setExitOfferVisible(true);
  };
  const handleExitOfferUnlock = () => {
    trackEvent('paywall_exit_offer_cta_clicked', { source: source ?? 'unknown' });
    setExitOfferVisible(false);
  };
  const handleExitOfferLater = () => {
    trackEvent('paywall_exit_offer_dismissed', { source: source ?? 'unknown' });
    setExitOfferVisible(false);
    dismissPaywall();
  };
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('quarterly');
  const [plans, setPlans] = useState<PlanOffering[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [exitOfferVisible, setExitOfferVisible] = useState(false);
  const [exitOfferShown, setExitOfferShown] = useState(false);
  const [exitOfferHeadlineComplete, setExitOfferHeadlineComplete] = useState(false);
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    trackEvent('paywall_view', { source: source ?? 'unknown' });
  }, [source]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const availablePlans = await getAvailablePlans();
        if (!active) return;
        setPlans(availablePlans);

        if (availablePlans.length > 0) {
          const fallback = availablePlans.find((plan) => plan.plan === 'quarterly' && plan.available)
            || availablePlans.find((plan) => plan.available);
          if (fallback) setSelectedPlan(fallback.plan);
        }
      } catch {
        setPlans([]);
      } finally {
        if (active) setLoadingPlans(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading && isSubscribed) router.replace(returnRoute);
  }, [isLoading, isSubscribed, returnRoute]);

  useEffect(() => {
    const onBack = () => {
      handlePaywallDismiss();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [exitOfferShown]);

  if (isLoading || isSubscribed) return null;

  const selectedPlanMeta = plans.find((plan) => plan.plan === selectedPlan) ?? plans[0];
  const canPurchaseSelectedPlan = Boolean(selectedPlanMeta?.available);

  const fallbackPlans: Record<BillingPlan, PlanOffering> = {
    weekly: {
      plan: 'weekly',
      title: 'Weekly',
      price: '—',
      priceAmount: null,
      currencyCode: null,
      period: 'week',
      productId: '',
      available: false,
    },
    monthly: {
      plan: 'monthly',
      title: 'Monthly',
      price: '—',
      priceAmount: null,
      currencyCode: null,
      period: 'month',
      productId: '',
      available: false,
    },
    quarterly: {
      plan: 'quarterly',
      title: '3 Months',
      price: '—',
      priceAmount: null,
      currencyCode: null,
      period: '3 months',
      productId: '',
      available: false,
    },
  };
  const orderedPlans: PlanOffering[] = (['weekly', 'monthly', 'quarterly'] as const).map((planType) => {
    const configuredPlan = plans.find((plan) => plan.plan === planType);
    if (!configuredPlan) return fallbackPlans[planType];
    return {
      ...configuredPlan,
      price: configuredPlan.price === '—' ? fallbackPlans[planType].price : configuredPlan.price,
      priceAmount: configuredPlan.priceAmount ?? fallbackPlans[planType].priceAmount,
      currencyCode: configuredPlan.currencyCode ?? fallbackPlans[planType].currencyCode,
    };
  });
  const getPlanDisplayPrice = (plan: PlanOffering) => plan.price || '—';
  const getPlanDisplayPeriod = (plan: PlanOffering) => {
    if (plan.plan === 'weekly') return '/ week';
    if (plan.plan === 'monthly') return '/ month';
    return '/ 3 months';
  };
  const quarterlyPlan = orderedPlans.find((plan) => plan.plan === 'quarterly');
  const formatCurrency = (amount: number, currencyCode: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
  const quarterlyRateSummary = quarterlyPlan?.priceAmount !== null
    && quarterlyPlan?.priceAmount !== undefined
    && quarterlyPlan.currencyCode
    ? `${formatCurrency(quarterlyPlan.priceAmount / 13, quarterlyPlan.currencyCode)}/week · ${formatCurrency(quarterlyPlan.priceAmount / 3, quarterlyPlan.currencyCode)}/month`
    : null;
  const handleRestore = async () => {
    trackEvent('paywall_restore_started');
    if (!billingAvailable) {
      Alert.alert('Restore unavailable', 'Connect App Store or Google Play billing to restore purchases.');
      return;
    }
    setLoading(true);
    try {
      const restored = await restorePurchases();
      if (!restored) Alert.alert('No active purchase found', 'Check that you are signed in to the store account used for your subscription.');
      if (restored) {
        trackEvent('paywall_restore_succeeded');
        router.replace(returnRoute);
      } else trackEvent('paywall_restore_empty');
    } catch {
      trackEvent('paywall_restore_failed');
      Alert.alert('Restore failed', 'Unable to restore purchases right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const handleSubscribe = async () => {
    setLoading(true);
    trackEvent('paywall_purchase_started', { plan: selectedPlan });
    try {
      const purchased = await purchasePlan(selectedPlan);
      if (purchased) {
        trackEvent('paywall_purchase_succeeded', { plan: selectedPlan });
        const nextRoute = (consumePendingFeatureRoute() || returnRoute) as Parameters<typeof router.replace>[0];
        console.log('[PREMIUM GATE] Subscription successful; resuming route', { nextRoute });
        router.replace(nextRoute);
        return;
      }
      trackEvent('paywall_purchase_unconfirmed', { plan: selectedPlan });
      clearPendingFeatureRoute();
      Alert.alert('Subscription failed', 'Unable to confirm your premium subscription. Please try again.');
    } catch (error) {
      trackEvent('paywall_purchase_failed', { plan: selectedPlan });
      Alert.alert(
        'Purchase failed',
        error instanceof Error
          ? error.message
          : billingAvailable
          ? 'This plan is not configured in RevenueCat yet.'
          : 'RevenueCat billing is not configured for this build.'
      );
    } finally {
      setLoading(false);
    }
  };

  const isSelectedPlan = (plan: BillingPlan) => selectedPlan === plan;
  const openLegalDocument = async (path: 'privacy' | 'terms') => {
    try {
      await Linking.openURL(`${API_BASE_URL}/${path}`);
    } catch {
      Alert.alert('Unable to open document', 'Please try again when you have an internet connection.');
    }
  };

  return (
    <ScreenWrapper
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, isCompact && styles.compactScrollContent, { paddingBottom: botPad + 16, alignItems: 'center' }]}
    >
      <View style={[styles.header, isCompact && styles.compactHeader]}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(350)}>
          <TouchableOpacity style={[styles.closeBtn, isCompact && styles.compactCloseBtn]} onPress={handlePaywallDismiss} accessibilityRole="button" accessibilityLabel="Close paywall">
            <Feather name="x" size={26} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(100).duration(600)} style={[styles.hero, isCompact && styles.compactHero]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            {[10, 15, 21].map((height, index) => (
              <View key={height} style={[styles.candle, { height: height + 8 }]}>
                <View style={styles.candleWick} />
                <View style={[styles.candleBody, { height, bottom: index === 1 ? 5 : index === 2 ? 8 : 3 }]} />
              </View>
            ))}
          </View>
          <Text style={[styles.brandName, { color: colors.text }]}>FXSnap <Text style={[styles.brandAccent, { color: colors.primary }]}>AI</Text></Text>
        </View>
        <Text style={[typography.heroHeading, styles.title, isCompact && styles.compactTitle, { color: colors.text }]} accessibilityRole="header">Unlock FXSnap{"\n"}Premium</Text>
        <Text style={[typography.body, styles.subtitle, isCompact && typography.compactBody, { color: colors.textSecondary }]}>Subscribe for AI chart analysis, strategy tools and full access to the FXSnap Community — cancel anytime</Text>
        <View style={styles.trustedRow}>
          <Feather name="users" size={20} color={colors.primary} />
          <Text style={[styles.trustedText, { color: colors.textSecondary }]}>Trusted by <Text style={[styles.trustedCount, { color: colors.primary }]}>6,000+</Text> traders</Text>
        </View>
      </Animated.View>

      <View style={[styles.sectionDivider, { backgroundColor: colors.cardBorder }]} />

      <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(200).duration(600)} style={styles.featuresList}>
        {[
          'Unlimited screenshot analyses',
          'Structured chart reviews with entry, stop and target levels',
          'Support & resistance + pattern detection',
          'Works with TradingView, MT4, MT5 & any broker',
          'Full access to the FXSnap Premium Community',
        ].map((benefit) => (
          <View key={benefit} style={styles.featureRow}>
            <View style={[styles.featureCheck, { backgroundColor: colors.primary }]}><Feather name="check" size={12} color={colors.primaryForeground} /></View>
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{benefit}</Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(300).duration(600)} style={[styles.planSection, isCompact && styles.compactPlanSection]}>
        {loadingPlans ? (
          <View style={[styles.loadingState, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading subscription options…</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.planSectionTitle, { color: colors.text }]}>Choose Your Plan</Text>
            <View style={styles.plansRow}>
              {orderedPlans.map((plan) => {
            const isSelected = isSelectedPlan(plan.plan);

            return (
              <TouchableOpacity
                key={plan.plan}
                style={[
                  styles.planCard,
                  isCompact && styles.compactPlanCard,
                  isSelected && styles.planCardSelected,
                  !plan.available && styles.planCardUnavailable,
                  plan.plan === 'weekly' && styles.weeklyPlanCard,
                  plan.plan === 'monthly' && styles.monthlyPlanCard,
                  plan.plan === 'quarterly' && styles.heroPlanCard,
                  { backgroundColor: isSelected ? `${colors.primary}18` : colors.card, borderColor: isSelected ? colors.primary : colors.cardBorder, shadowColor: colors.primary },
                ]}
                onPress={() => {
                  if (!plan.available) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlan(plan.plan);
                  trackEvent('paywall_plan_selected', { plan: plan.plan });
                }}
                disabled={!plan.available}
                activeOpacity={0.95}
              >
                {plan.plan === 'monthly' && (
                  <View style={[styles.planTag, styles.popularTag, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.planTagText, { color: colors.primaryForeground }]}>MOST POPULAR</Text>
                  </View>
                )}
                {plan.plan === 'quarterly' && (
                  <View style={[styles.planTag, styles.popularTag, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.planTagText, { color: colors.primaryForeground }]}>SAVE 33%</Text>
                  </View>
                )}
                <View style={[styles.planTextColumn, plan.plan === 'quarterly' && styles.heroPlanText]}>
                <Text style={[typography.optionTitle, styles.planName, plan.plan === 'quarterly' && styles.heroPlanName, { color: colors.text }]}>{plan.title}</Text>
                <Text style={[typography.planPrice, styles.planPrice, plan.plan === 'quarterly' && styles.heroPlanPrice, { color: colors.text }]}>{getPlanDisplayPrice(plan)}</Text>
                <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>{getPlanDisplayPeriod(plan)}</Text>
                {plan.plan === 'quarterly' && quarterlyRateSummary && <Text style={[styles.dailyPrice, { color: colors.primary }]}>{quarterlyRateSummary}</Text>}
                </View>
              </TouchableOpacity>
            );
              })}
            </View>
          </>
        )}
      </Animated.View>

      <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(400).duration(600)} style={[styles.actions, isCompact && styles.compactActions]}>
        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            isCompact && styles.compactSubscribeBtn,
            { backgroundColor: colors.primary },
          ]}
          onPress={handleSubscribe}
          disabled={loading || !billingAvailable || !canPurchaseSelectedPlan}
        >
          <Text style={[typography.button, styles.subscribeBtnText, isCompact && styles.compactSubscribeText, { color: colors.primaryForeground }]}>
            {loading ? 'Processing...' : 'Unlock Unlimited Now'}
          </Text>
          <Feather name="arrow-right" size={20} color={colors.primaryForeground} />
        </TouchableOpacity>

        <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
          <Text style={[styles.restoreLink, { color: colors.text }]} onPress={() => void handleRestore()} accessibilityRole="link">Restore Purchases</Text>
        </Text>
        <View style={styles.securityNote}>
          <Feather name="lock" size={13} color={colors.primary} />
          <Text style={[styles.securityNoteText, { color: colors.textSecondary }]}>Cancel anytime  •  Secure payment  •  No auto-renew if cancelled</Text>
        </View>
        <View style={styles.legalLinks}>
          <Text style={[styles.legalFooterLink, { color: colors.textSecondary }]} onPress={() => void openLegalDocument('terms')} accessibilityRole="link">Terms of Use</Text>
          <Text style={[styles.legalSeparator, { color: colors.textMuted }]}>·</Text>
          <Text style={[styles.legalFooterLink, { color: colors.textSecondary }]} onPress={() => void openLegalDocument('privacy')} accessibilityRole="link">Privacy Policy</Text>
        </View>
      </Animated.View>
      <Modal
        visible={exitOfferVisible}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        statusBarTranslucent
        onRequestClose={handleExitOfferLater}
      >
        <View style={styles.exitOfferBackdrop} accessibilityViewIsModal>
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(300)}
            pointerEvents="none"
            style={[
              styles.exitOfferScrim,
              { backgroundColor: isDarkTheme ? 'rgba(0, 0, 0, 0.68)' : 'rgba(23, 32, 26, 0.42)' },
            ]}
          />
          <View style={[styles.exitOfferGlow, { backgroundColor: `${colors.primary}18` }]} />
          <View style={[styles.exitOfferGlowSecondary, { backgroundColor: `${colors.accent}12` }]} />
          <ScrollView
            contentContainerStyle={[
              styles.exitOfferContent,
              { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, zIndex: 1 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.exitOfferCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(260)}
              style={styles.exitOfferEyebrowRow}
            >
              <View style={[styles.exitOfferIcon, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}55` }]}>
                <Feather name="bar-chart-2" size={23} color={colors.primary} />
              </View>
              <Text style={[styles.exitOfferEyebrow, { color: colors.primary }]}>WAIT! YOUR NEXT CHART 👀</Text>
            </Animated.View>
            <ExitOfferTypewriter
              text="Don't Just See It. Understand It."
              reduceMotion={Boolean(reduceMotion)}
              onComplete={() => setExitOfferHeadlineComplete(true)}
              style={[typography.heroHeading, styles.exitOfferTitle, { color: colors.text }]}
            />
            {exitOfferHeadlineComplete ? (
              <Animated.Text
                entering={reduceMotion ? undefined : FadeInUp.duration(260)}
                style={[typography.body, styles.exitOfferDescription, { color: colors.textSecondary }]}
              >
                Unlock AI chart analysis and discover potential trading setups with FXSnap.
              </Animated.Text>
            ) : null}
            {exitOfferHeadlineComplete ? (
              <View style={styles.exitOfferBenefits}>
                {[
                  { title: 'AI-Powered Chart Analysis', icon: 'bar-chart-2' as const },
                  { title: 'Smarter Setup Insights', icon: 'trending-up' as const },
                  { title: 'Unlock All Premium Features', icon: 'star' as const },
                ].map((benefit, index) => (
                  <Animated.View
                    key={benefit.title}
                    entering={reduceMotion ? undefined : FadeInUp.delay(index * 90).duration(260)}
                    style={[styles.exitOfferBenefit, { backgroundColor: `${colors.background}A6` }]}
                  >
                    <View style={[styles.exitOfferBenefitIcon, { backgroundColor: `${colors.primary}18` }]}>
                      <Feather name={benefit.icon} size={16} color={colors.primary} />
                    </View>
                    <Text style={[typography.optionTitle, styles.exitOfferBenefitTitle, { color: colors.text }]}>{benefit.title}</Text>
                  </Animated.View>
                ))}
              </View>
            ) : null}
            {exitOfferHeadlineComplete ? (
              <>
                <Animated.View
                  entering={reduceMotion ? undefined : ZoomIn.delay(420).duration(280).springify().damping(17)}
                  style={styles.exitOfferActions}
                >
                  <TouchableOpacity
                    style={[styles.exitOfferPrimary, { backgroundColor: colors.primary }]}
                    onPress={handleExitOfferUnlock}
                    accessibilityRole="button"
                    accessibilityLabel="Unlock FXSnap Premium"
                  >
                    <Text style={[typography.button, styles.exitOfferPrimaryText, { color: colors.primaryForeground }]}>Unlock FXSnap Premium</Text>
                    <Feather name="arrow-right" size={19} color={colors.primaryForeground} />
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(500).duration(220)}>
                  <TouchableOpacity
                    style={styles.exitOfferSecondary}
                    onPress={handleExitOfferLater}
                    accessibilityRole="button"
                    accessibilityLabel="Maybe later"
                  >
                    <Text style={[styles.exitOfferSecondaryText, { color: colors.textSecondary }]}>Maybe later</Text>
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : null}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

function ExitOfferTypewriter({
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
  const [visibleLength, setVisibleLength] = useState(reduceMotion ? text.length : 0);
  const onCompleteRef = useRef(onComplete);
  const completionSent = useRef(false);
  const isTyping = visibleLength < text.length;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    completionSent.current = false;
    if (reduceMotion) {
      setVisibleLength(text.length);
      onCompleteRef.current();
      return;
    }

    let characterIndex = 0;
    let timer: ReturnType<typeof setTimeout>;
    const typeNextCharacter = () => {
      characterIndex += 1;
      setVisibleLength(characterIndex);
      if (characterIndex < text.length) {
        timer = setTimeout(typeNextCharacter, 30);
      } else if (!completionSent.current) {
        completionSent.current = true;
        onCompleteRef.current();
      }
    };
    timer = setTimeout(typeNextCharacter, 100);
    return () => clearTimeout(timer);
  }, [reduceMotion, text]);

  return (
    <View style={styles.exitOfferTypewriterFrame}>
      <Text accessible={false} style={[style, styles.exitOfferTitleReserve]}>{text}</Text>
      <Animated.Text
        accessibilityRole="header"
        accessibilityLabel={text}
        style={[style, styles.exitOfferTitleOverlay]}
      >
        {text.slice(0, visibleLength)}
        {isTyping ? <Text style={styles.exitOfferCursor}>|</Text> : null}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    width: '100%',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  closeBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closePlaceholder: {
    width: 48,
    height: 48,
  },
  scroll: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  compactScrollContent: {
    gap: 6,
  },
  compactHeader: {
    paddingVertical: 0,
  },
  compactCloseBtn: {
    width: 36,
    height: 36,
  },
  compactClosePlaceholder: {
    width: 36,
    height: 36,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  compactHero: {
    gap: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 31,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  candle: {
    width: 7,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  candleWick: {
    width: 2,
    height: '100%',
    backgroundColor: '#31D15B',
  },
  candleBody: {
    position: 'absolute',
    width: 6,
    backgroundColor: '#31D15B',
  },
  brandName: {
    fontSize: 23,
    lineHeight: 29,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  brandAccent: {
    color: '#31D15B',
  },
  trustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 3,
  },
  trustedText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#BFC2C5',
  },
  trustedCount: {
    color: '#31D15B',
    fontFamily: 'Inter_600SemiBold',
  },
  sectionDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#34363A',
    marginVertical: 1,
  },
  logoBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: '#2B2B2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    maxWidth: 400,
  },
  compactTitle: {
    fontSize: 27,
    lineHeight: 32,
  },
  subtitle: {
    maxWidth: 440,
    color: '#B9B9B9',
    textAlign: 'center',
  },
  usageBanner: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#10251A',
  },
  usageText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#D9F7E5',
  },
  compactUsageBanner: {
    minHeight: 28,
  },
  compactUsageText: {
    fontSize: 12,
  },
  previewCard: {
    width: '100%',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#151515',
    gap: 4,
  },
  compactPreviewCard: {
    padding: 6,
    gap: 1,
  },
  tinyPreviewCard: {
    padding: 5,
  },
  previewHeader: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  previewTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  compactPreviewTitle: {
    fontSize: 12,
  },
  previewPair: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#9A9A9A',
  },
  previewMetricsRow: {
    flexDirection: 'column',
    gap: 6,
  },
  previewMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: '#B7B7B7',
    flexShrink: 0,
  },
  compactPreviewLabel: {
    fontSize: 9,
  },
  previewValueWrap: {
    minWidth: 64,
    minHeight: 18,
    flex: 1,
    overflow: 'hidden',
    alignItems: 'flex-end',
    justifyContent: 'center',
    position: 'relative',
  },
  compactPreviewValueWrap: {
    minHeight: 16,
  },
  previewValue: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  compactPreviewValue: {
    fontSize: 12,
  },
  previewLock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  previewLockText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#C6A94B',
  },
  featuresList: {
    width: '100%',
    gap: 9,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  compactFeaturesList: {
    gap: 7,
    paddingVertical: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#31D15B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Inter_400Regular',
    color: '#D5D7D9',
  },
  planSection: {
    width: '100%',
    gap: 10,
  },
  compactPlanSection: {
    gap: 8,
  },
  planSectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginBottom: 1,
  },
  plansRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  loadingState: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderColor: '#2A2A2A',
    width: '100%',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    color: '#8E8E93',
  },
  planCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 138,
    backgroundColor: '#191A1E',
    borderRadius: 12,
    paddingTop: 27,
    paddingBottom: 10,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyPlanCard: {
    flex: 1,
  },
  monthlyPlanCard: {
    flex: 1,
  },
  compactPlanCard: {
    minHeight: 138,
    paddingTop: 28,
    paddingBottom: 8,
    paddingHorizontal: 3,
  },
  planCardUnavailable: {
    opacity: 1,
  },
  heroPlanCard: {
    flex: 1.1,
    minHeight: 154,
    backgroundColor: '#111A15',
    borderColor: '#31D15B',
    borderWidth: 2,
    shadowColor: '#31D15B',
    shadowOpacity: 0.2,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  heroPlanName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  heroPlanPrice: {
    fontSize: 22,
    lineHeight: 27,
  },
  savingsDetail: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  planCardSelected: {
    borderColor: '#31D15B',
  },
  planTag: {
    position: 'absolute',
    top: 5,
    left: 3,
    right: 3,
    flexDirection: 'row',
    backgroundColor: '#31D15B',
    paddingHorizontal: 3,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bestValueTag: {
    backgroundColor: '#102818',
  },
  popularTag: {
    left: 3,
    right: 3,
  },
  planTagText: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontFamily: 'Inter_700Bold',
    color: '#D9F7E2',
    textAlign: 'center',
  },
  planTextColumn: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  heroPlanText: {
    alignItems: 'center',
    gap: 3,
  },
  planName: {
    fontSize: 13,
    lineHeight: 20,
    color: '#FFFFFF',
    marginBottom: 3,
    paddingHorizontal: 2,
  },
  planNameSelected: {
    color: '#FFFFFF',
  },
  planDescription: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
  },
  planPrice: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 25,
    paddingHorizontal: 1,
  },
  planPriceSelected: {
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_500Medium',
    color: '#D5D7D9',
    paddingHorizontal: 2,
  },
  dailyPrice: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Inter_500Medium',
    color: '#31D15B',
    paddingHorizontal: 2,
  },
  actions: {
    gap: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  compactActions: {
    gap: 4,
    marginTop: 0,
  },
  subscribeBtn: {
    width: '100%',
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#19B941',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  compactSubscribeBtn: {
    minHeight: 50,
    paddingVertical: 8,
    borderRadius: 10,
  },
  subscribeBtnText: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  compactSubscribeText: {
    fontSize: 16,
  },
  cancellationNote: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
    textAlign: 'center',
    maxWidth: 420,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
    textAlign: 'center',
    marginTop: 0,
  },
  restoreLink: {
    color: '#D5D7D9',
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  securityNote: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  securityNoteText: {
    flex: 1,
    maxWidth: 350,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  legalFooterLink: {
    fontSize: 12,
    lineHeight: 17,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
  },
  trialNote: {
    maxWidth: 360,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
    textAlign: 'right',
  },
  exitOfferBackdrop: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  exitOfferScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  exitOfferContent: {
    width: '100%',
    maxWidth: 500,
    minHeight: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  exitOfferCard: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
    borderWidth: 1,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  exitOfferGlow: {
    position: 'absolute',
    top: '13%',
    right: '-20%',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(49, 209, 91, 0.08)',
    transform: [{ scaleX: 1.3 }],
  },
  exitOfferGlowSecondary: {
    position: 'absolute',
    bottom: '-12%',
    left: '-28%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(49, 209, 91, 0.055)',
  },
  exitOfferEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    marginBottom: 4,
  },
  exitOfferIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  exitOfferEyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: 'Inter_700Bold',
  },
  exitOfferTitle: {
    maxWidth: 420,
    textAlign: 'center',
  },
  exitOfferTypewriterFrame: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  exitOfferTitleReserve: {
    opacity: 0,
  },
  exitOfferTitleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  exitOfferCursor: {
    color: '#C9AA35',
    fontFamily: 'Inter_400Regular',
    fontWeight: '400',
  },
  exitOfferDescription: {
    maxWidth: 400,
    textAlign: 'center',
  },
  exitOfferBenefits: {
    width: '100%',
    maxWidth: 380,
    gap: 9,
    marginTop: 0,
  },
  exitOfferBenefit: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  exitOfferBenefitIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  exitOfferBenefitTitle: {
    flex: 1,
    lineHeight: 20,
  },
  exitOfferActions: {
    width: '100%',
    maxWidth: 400,
    marginTop: 4,
  },
  exitOfferPrimary: {
    minHeight: 64,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 18,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  exitOfferPrimaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  exitOfferSecondary: {
    minHeight: 48,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  exitOfferSecondaryText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 2,
  },
  legalText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#858585',
    textAlign: 'center',
  },
  legalLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});
