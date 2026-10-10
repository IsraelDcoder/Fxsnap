import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  ZoomIn,
} from 'react-native-reanimated';
import ScreenWrapper from '@/components/ScreenWrapper';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { getAvailablePlans, type BillingPlan, type PlanOffering } from '@/services/billing';

export default function PaywallScreen() {
  // ScreenWrapper handles safe area and scrolling
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isAnalysisLimit = source === 'analysis-limit';
  const isAnalysisResultUnlock = source === 'analysis-result-locked';
  const returnRoute = isAnalysisResultUnlock
    ? '/analysis-result'
    : '/(tabs)/home';
  const { purchasePlan, restorePurchases, billingAvailable, isSubscribed, isLoading, consumePendingFeatureRoute, clearPendingFeatureRoute } = useApp();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 760 || screenWidth < 380;

  const dismissPaywall = () => {
    clearPendingFeatureRoute();
    router.replace(returnRoute);
  };
  const handlePaywallDismiss = () => {
    if (exitOfferShown) {
      dismissPaywall();
      return;
    }
    setExitOfferShown(true);
    setExitOfferVisible(true);
  };
  const handleExitOfferUnlock = () => {
    setExitOfferVisible(false);
  };
  const handleExitOfferLater = () => {
    setExitOfferVisible(false);
    dismissPaywall();
  };
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('monthly');
  const [plans, setPlans] = useState<PlanOffering[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const [exitOfferVisible, setExitOfferVisible] = useState(false);
  const [exitOfferShown, setExitOfferShown] = useState(false);
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const availablePlans = await getAvailablePlans();
        if (!active) return;
        setPlans(availablePlans);

        if (availablePlans.length > 0) {
          const fallback = availablePlans.find((plan) => plan.plan === selectedPlan && plan.available)
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
      if (!canDismiss) return true;
      handlePaywallDismiss();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [canDismiss, exitOfferShown]);

  if (isLoading || isSubscribed) return null;

  const selectedPlanMeta = plans.find((plan) => plan.plan === selectedPlan) ?? plans[0];
  const canPurchaseSelectedPlan = Boolean(selectedPlanMeta?.available);

  const orderedPlans: PlanOffering[] = (['weekly', 'monthly', 'quarterly'] as const).map((planType) => {
    const configuredPlan = plans.find((plan) => plan.plan === planType);
    return configuredPlan ?? {
      plan: planType,
      title: planType === 'quarterly' ? '3 Months' : planType,
      price: '—',
      period: planType === 'weekly' ? 'week' : planType === 'quarterly' ? '3 months' : 'month',
      productId: '',
      available: false,
    };
  });
  const getPlanDisplayPrice = (plan: PlanOffering) => plan.price || '—';
  const getPlanDisplayPeriod = (plan: PlanOffering) => {
    if (plan.plan === 'weekly') return '/ week';
    if (plan.plan === 'quarterly') return '/ 3 months';
    return '/ month';
  };
  const handleRestore = async () => {
    if (!billingAvailable) {
      Alert.alert('Restore unavailable', 'Connect App Store or Google Play billing to restore purchases.');
      return;
    }
    setLoading(true);
    try {
      const restored = await restorePurchases();
      if (!restored) Alert.alert('No active purchase found', 'Check that you are signed in to the store account used for your subscription.');
      else router.replace(returnRoute);
    } catch {
      Alert.alert('Restore failed', 'Unable to restore purchases right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const purchased = await purchasePlan(selectedPlan);
      if (purchased) {
        const nextRoute = (consumePendingFeatureRoute() || returnRoute) as Parameters<typeof router.replace>[0];
        console.log('[PREMIUM GATE] Subscription successful; resuming route', { nextRoute });
        router.replace(nextRoute);
        return;
      }
      clearPendingFeatureRoute();
      Alert.alert('Subscription failed', 'Unable to confirm your premium subscription. Please try again.');
    } catch (error) {
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

  return (
    <ScreenWrapper
      style={[styles.container, { backgroundColor: '#000000' }]}
      contentContainerStyle={[styles.scrollContent, isCompact && styles.compactScrollContent, { paddingBottom: botPad + 16, alignItems: 'center' }]}
    >
      <View style={[styles.header, isCompact && styles.compactHeader]}>
        {canDismiss ? (
          <Animated.View entering={FadeIn.duration(350)}>
            <TouchableOpacity style={[styles.closeBtn, isCompact && styles.compactCloseBtn]} onPress={handlePaywallDismiss} accessibilityRole="button" accessibilityLabel="Close paywall">
              <Feather name="x" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        ) : <View style={[styles.closePlaceholder, isCompact && styles.compactClosePlaceholder]} />}
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(600)} style={[styles.hero, isCompact && styles.compactHero]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            {[10, 15, 21].map((height, index) => (
              <View key={height} style={[styles.candle, { height: height + 8 }]}>
                <View style={styles.candleWick} />
                <View style={[styles.candleBody, { height, bottom: index === 1 ? 5 : index === 2 ? 8 : 3 }]} />
              </View>
            ))}
          </View>
          <Text style={styles.brandName}>FXSnap <Text style={styles.brandAccent}>AI</Text></Text>
        </View>
        <Text style={[styles.title, isCompact && styles.compactTitle]}>Your free analysis{"\nis used up"}</Text>
        <Text style={[styles.subtitle, isCompact && styles.compactSubtitle]}>Unlock unlimited AI chart insights — cancel anytime</Text>
        <View style={styles.trustedRow}>
          <Feather name="users" size={20} color="#31D15B" />
          <Text style={styles.trustedText}>Trusted by <Text style={styles.trustedCount}>3,700+</Text> traders</Text>
        </View>
      </Animated.View>

      <View style={styles.sectionDivider} />

      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.featuresList}>
        {[
          'Unlimited screenshot analyses',
          'Clear Long/Short/Hold + entry SL & TP levels',
          'Support & resistance + pattern detection',
          'Works with TradingView, MT4, MT5 & any broker',
        ].map((benefit) => (
          <View key={benefit} style={styles.featureRow}>
            <View style={styles.featureCheck}><Feather name="check" size={12} color="#07130B" /></View>
            <Text style={styles.featureText}>{benefit}</Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(300).duration(600)} style={[styles.planSection, isCompact && styles.compactPlanSection]}>
        {loadingPlans ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Loading subscription options…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.planSectionTitle}>Choose Your Plan</Text>
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
                  plan.plan === 'monthly' && styles.monthlyPlanCard,
                ]}
                onPress={() => {
                  if (!plan.available) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlan(plan.plan);
                }}
                disabled={!plan.available}
                activeOpacity={0.95}
              >
                {plan.plan === 'monthly' && <View style={[styles.planTag, styles.popularTag]}><Text style={styles.planTagText}>Most Popular</Text></View>}
                {plan.plan === 'quarterly' && <View style={[styles.planTag, styles.bestValueTag]}><Text style={styles.planTagText}>Best Value - Save 22%</Text></View>}
                <View style={[styles.planTextColumn, plan.plan === 'monthly' && styles.monthlyPlanText]}>
                  <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.plan === 'quarterly' ? '3-Month' : plan.plan === 'weekly' ? 'Weekly' : 'Monthly'}</Text>
                  <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>{getPlanDisplayPrice(plan)}</Text>
                  <Text style={styles.planPeriod}>{getPlanDisplayPeriod(plan)}</Text>
                  {plan.plan === 'monthly' && <Text style={styles.dailyPrice}>Only $0.50/day</Text>}
                </View>
              </TouchableOpacity>
            );
              })}
            </View>
          </>
        )}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(400).duration(600)} style={[styles.actions, isCompact && styles.compactActions]}>
        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            isCompact && styles.compactSubscribeBtn,
          ]}
          onPress={handleSubscribe}
          disabled={loading || !billingAvailable || !canPurchaseSelectedPlan}
        >
          <Text style={[styles.subscribeBtnText, isCompact && styles.compactSubscribeText]}>
            {loading ? 'Processing...' : 'Unlock Unlimited Now'}
          </Text>
          <Feather name="arrow-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.restoreText}>
          <Text style={styles.restoreLink} onPress={() => void handleRestore()} accessibilityRole="link">Restore Purchases</Text>
        </Text>
        <View style={styles.securityNote}>
          <Feather name="lock" size={13} color="#31D15B" />
          <Text style={styles.securityNoteText}>Cancel anytime  •  Secure payment  •  No auto-renew if cancelled</Text>
        </View>
        <Text style={styles.trialNote}>You won't be charged until your free trial (if any) ends.</Text>
      </Animated.View>
      <Modal
        visible={exitOfferVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleExitOfferLater}
      >
        <View style={styles.exitOfferBackdrop} accessibilityViewIsModal>
          <Animated.View entering={FadeIn.duration(300)} style={styles.exitOfferScrim} />
          <View style={styles.exitOfferGlow} />
          <View style={styles.exitOfferGlowSecondary} />
          <ScrollView
            contentContainerStyle={[
              styles.exitOfferContent,
              { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={SlideInDown.delay(0).duration(320).springify().damping(20)}
              style={styles.exitOfferEyebrowRow}
            >
              <View style={styles.exitOfferIcon}>
                <Feather name="bar-chart-2" size={23} color="#31D15B" />
              </View>
              <Text style={styles.exitOfferEyebrow}>BEFORE YOU GO...</Text>
            </Animated.View>
            <Animated.Text
              entering={FadeInUp.delay(150).duration(330)}
              style={styles.exitOfferTitle}
              accessibilityRole="header"
            >
              Your Next Chart Deserves Better Analysis.
            </Animated.Text>
            <Animated.Text
              entering={FadeIn.delay(300).duration(320)}
              style={styles.exitOfferDescription}
            >
              You've used your free analysis. Unlock continued access to AI-powered chart insights with FXSnap.
            </Animated.Text>
            <View style={styles.exitOfferBenefits}>
              {[
                'More AI chart analyses',
                'Trading setup insights',
                'Access to subscription features',
              ].map((benefit, index) => (
                <Animated.View
                  key={benefit}
                  entering={FadeInUp.delay(440 + index * 130).duration(300)}
                  style={styles.exitOfferBenefit}
                >
                  <View style={styles.exitOfferBenefitIcon}>
                    <Feather name="check" size={14} color="#31D15B" />
                  </View>
                  <Text style={styles.exitOfferBenefitText}>{benefit}</Text>
                </Animated.View>
              ))}
            </View>
            <Animated.View
              entering={ZoomIn.delay(850).duration(300).springify().damping(16)}
              style={styles.exitOfferActions}
            >
              <TouchableOpacity
                style={styles.exitOfferPrimary}
                onPress={handleExitOfferUnlock}
                accessibilityRole="button"
                accessibilityLabel="Unlock Unlimited Analyses"
              >
                <Text style={styles.exitOfferPrimaryText}>Unlock Unlimited Analyses</Text>
                <Feather name="arrow-right" size={19} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
            <Animated.View entering={FadeIn.delay(1030).duration(280)}>
              <TouchableOpacity
                style={styles.exitOfferSecondary}
                onPress={handleExitOfferLater}
                accessibilityRole="button"
                accessibilityLabel="Maybe Later"
              >
                <Text style={styles.exitOfferSecondaryText}>Maybe Later</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenWrapper>
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
    fontFamily: 'Inter_700Bold',
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
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.7,
  },
  compactTitle: {
    fontSize: 27,
    lineHeight: 32,
  },
  subtitle: {
    maxWidth: 440,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#B9B9B9',
    textAlign: 'center',
  },
  compactSubtitle: {
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 17,
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
    minHeight: 132,
    backgroundColor: '#191A1E',
    borderRadius: 12,
    paddingTop: 27,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPlanCard: {
    minHeight: 122,
    paddingTop: 25,
    paddingBottom: 8,
    paddingHorizontal: 5,
  },
  planCardUnavailable: {
    opacity: 1,
  },
  monthlyPlanCard: {
    backgroundColor: '#111A15',
    borderColor: '#31D15B',
    borderWidth: 2,
    transform: [{ scaleY: 1.04 }],
  },
  planCardSelected: {
    borderColor: '#31D15B',
  },
  planTag: {
    position: 'absolute',
    top: 5,
    left: 3,
    right: 3,
    backgroundColor: '#31D15B',
    paddingHorizontal: 3,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  popularTag: {
    top: -13,
    left: '10%',
    right: '10%',
  },
  bestValueTag: {
    backgroundColor: '#102818',
  },
  planTagText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#D9F7E2',
    textAlign: 'center',
  },
  planTextColumn: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 2,
  },
  monthlyPlanText: {
    alignItems: 'center',
  },
  planName: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
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
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 28,
    paddingHorizontal: 1,
  },
  planPriceSelected: {
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#D5D7D9',
    paddingHorizontal: 2,
  },
  dailyPrice: {
    fontSize: 10,
    lineHeight: 14,
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
    fontSize: 17,
    lineHeight: 23,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  compactSubscribeText: {
    fontSize: 16,
    lineHeight: 22,
  },
  cancellationNote: {
    fontSize: 11,
    lineHeight: 16,
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
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    color: '#A9A9A9',
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
    backgroundColor: '#050806',
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
    paddingHorizontal: 28,
    gap: 20,
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
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(49, 209, 91, 0.42)',
    backgroundColor: 'rgba(49, 209, 91, 0.10)',
  },
  exitOfferEyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'Inter_700Bold',
    color: '#74E78F',
  },
  exitOfferTitle: {
    maxWidth: 440,
    fontSize: 34,
    lineHeight: 42,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  exitOfferDescription: {
    maxWidth: 420,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
    color: '#C0CAC3',
    textAlign: 'center',
  },
  exitOfferBenefits: {
    width: '100%',
    maxWidth: 360,
    gap: 15,
    marginTop: 2,
    marginBottom: 8,
  },
  exitOfferBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  exitOfferBenefitIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(49, 209, 91, 0.13)',
  },
  exitOfferBenefitText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Inter_500Medium',
    color: '#E5ECE7',
  },
  exitOfferActions: {
    width: '100%',
    maxWidth: 400,
    marginTop: 4,
  },
  exitOfferPrimary: {
    minHeight: 58,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    borderRadius: 15,
    backgroundColor: '#18BC43',
    shadowColor: '#31D15B',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  exitOfferPrimaryText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
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
    color: '#AAB5AD',
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
