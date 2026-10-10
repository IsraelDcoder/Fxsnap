import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Linking, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import ScreenWrapper from '@/components/ScreenWrapper';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getAvailablePlans, type BillingPlan, type PlanOffering } from '@/services/billing';
import { getPaywallRemoteConfig, type PaywallRemoteConfig } from '@/services/paywallConfig';

export default function PaywallScreen() {
  // ScreenWrapper handles safe area and scrolling
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { source, used, limit } = useLocalSearchParams<{ source?: string; used?: string; limit?: string }>();
  const isFreeAnalysisOffer = source === 'free-analysis';
  const isAnalysisLimit = source === 'analysis-limit';
  const isAnalysisResultUnlock = source === 'analysis-result-locked';
  const isAnalysisOffer = isFreeAnalysisOffer || isAnalysisLimit;
  const returnRoute = isFreeAnalysisOffer || isAnalysisResultUnlock
    ? '/analysis-result'
    : isAnalysisLimit
      ? '/analysis'
      : '/(tabs)/home';
  const { currentAnalysis, purchasePlan, restorePurchases, billingAvailable, isSubscribed, isLoading, consumePendingFeatureRoute, clearPendingFeatureRoute } = useApp();
  const storeName = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL || 'https://fxsnap.app/terms';
  const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || 'https://fxsnapprivacy.netlify.app/';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 760 || screenWidth < 380;
  const isTiny = screenHeight < 600 || screenWidth < 340;

  const dismissPaywall = () => {
    clearPendingFeatureRoute();
    router.replace(returnRoute);
  };
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('monthly');
  const [plans, setPlans] = useState<PlanOffering[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState<PaywallRemoteConfig | null>(null);
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const usedCount = Math.max(0, Number.parseInt(String(used ?? '1'), 10) || 0);
  const freeLimit = Math.max(1, Number.parseInt(String(limit ?? '1'), 10) || 1);

  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void getPaywallRemoteConfig().then((config) => {
      if (active) setRemoteConfig(config);
    });
    return () => { active = false; };
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
      dismissPaywall();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [canDismiss]);

  if (isLoading || isSubscribed) return null;

  const selectedPlanMeta = plans.find((plan) => plan.plan === selectedPlan) ?? plans[0];
  const canPurchaseSelectedPlan = Boolean(selectedPlanMeta?.available);

  const getPlanDisplayPrice = (plan: PlanOffering) => plan.price || '—';
  const getPlanDisplayPeriod = (plan: PlanOffering) => {
    if (plan.plan === 'weekly') return '/ week';
    if (plan.plan === 'quarterly') return '/ 3 months';
    return '/ month';
  };
  const openLegalLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
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
            <TouchableOpacity style={[styles.closeBtn, isCompact && styles.compactCloseBtn]} onPress={dismissPaywall} accessibilityRole="button" accessibilityLabel="Close paywall">
              <Feather name="x" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        ) : <View style={[styles.closePlaceholder, isCompact && styles.compactClosePlaceholder]} />}
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(600)} style={[styles.hero, isCompact && styles.compactHero]}>
        <View style={[styles.logoBox, isCompact && styles.compactLogoBox]}>
          <Feather name="zap" size={32} color="#FFD60A" />
        </View>
        <Text style={[styles.title, isCompact && styles.compactTitle]}>{isAnalysisOffer ? 'That was your free analysis.' : 'FXSNAP PREMIUM'}</Text>
        <Text style={[styles.subtitle, isCompact && styles.compactSubtitle]}>{isAnalysisOffer ? 'Get Entry, SL & TP levels on every chart you trade.' : 'Your complete AI trading assistant.'}</Text>
      </Animated.View>

      {isAnalysisOffer && (
        <View style={[styles.usageBanner, isCompact && styles.compactUsageBanner]}>
          <Feather name="check-circle" size={16} color="#3CEB8C" />
          <Text style={[styles.usageText, isCompact && styles.compactUsageText]}>You’ve used {usedCount} of {freeLimit} free {freeLimit === 1 ? 'analysis' : 'analyses'}</Text>
        </View>
      )}

      <View style={[styles.previewCard, isCompact && styles.compactPreviewCard, isTiny && styles.tinyPreviewCard]}>
        <View style={styles.previewHeader}>
          <Text style={[styles.previewTitle, isCompact && styles.compactPreviewTitle]}>Your analysis preview</Text>
          {currentAnalysis && <Text style={styles.previewPair}>{currentAnalysis.pair}{currentAnalysis.direction ? ` · ${currentAnalysis.direction}` : ''}</Text>}
        </View>
        <View style={styles.previewMetricsRow}>
        {([
          ['Entry', currentAnalysis?.entry ?? currentAnalysis?.tradeSetup?.entryZone],
          ['Stop Loss', currentAnalysis?.sl ?? currentAnalysis?.tradeSetup?.stopLoss],
          ['Take Profit', currentAnalysis?.tp ?? currentAnalysis?.tradeSetup?.takeProfit],
          ['R:R', currentAnalysis?.tradeSetup?.riskReward],
        ] as const).map(([label, value]) => (
          <View key={label} style={styles.previewMetric}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.previewLabel, isCompact && styles.compactPreviewLabel]}>{label}</Text>
            <View style={[styles.previewValueWrap, isCompact && styles.compactPreviewValueWrap]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.previewValue, isCompact && styles.compactPreviewValue]}>{value == null || value === '' ? '••••' : String(value)}</Text>
              <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
            </View>
          </View>
        ))}
        </View>
        <View style={styles.previewLock}>
          <Feather name="lock" size={12} color="#FFD60A" />
          <Text style={styles.previewLockText}>Exact levels on every chart</Text>
        </View>
      </View>

      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={[styles.featuresList, isCompact && styles.compactFeaturesList]}>
        <View style={styles.featureRow}>
          <View style={[styles.featureIconWrap, isCompact && styles.compactFeatureIconWrap]}>
            <Feather name="bar-chart-2" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={[styles.featureTitle, isCompact && styles.compactFeatureTitle]}>Unlimited chart analysis.</Text>
            {!isTiny && <Text style={[styles.featureSubtitle, isCompact && styles.compactFeatureSubtitle]}>Upload any pair, any timeframe.</Text>}
          </View>
        </View>
        <View style={styles.featureRow}>
          <View style={[styles.featureIconWrap, isCompact && styles.compactFeatureIconWrap]}>
            <Feather name="target" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={[styles.featureTitle, isCompact && styles.compactFeatureTitle]}>Clear trade levels.</Text>
            {!isTiny && <Text style={[styles.featureSubtitle, isCompact && styles.compactFeatureSubtitle]}>Entry, Stop Loss and Take Profit, with R:R included.</Text>}
          </View>
        </View>
        <View style={styles.featureRow}>
          <View style={[styles.featureIconWrap, isCompact && styles.compactFeatureIconWrap]}>
            <Feather name="cpu" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={[styles.featureTitle, isCompact && styles.compactFeatureTitle]}>Know the why.</Text>
            {!isTiny && <Text style={[styles.featureSubtitle, isCompact && styles.compactFeatureSubtitle]}>The AI reasoning behind every setup.</Text>}
          </View>
        </View>
      </Animated.View>

      {remoteConfig?.traderCount != null && (
        <Text style={[styles.socialProof, isCompact && styles.compactSocialProof]}>Join {new Intl.NumberFormat('en-US').format(remoteConfig.traderCount)}+ traders using FXSnap</Text>
      )}
      {remoteConfig?.googlePlayRating != null && remoteConfig.googlePlayRatingCount != null && (
        <View style={styles.ratingRow}>
          <Feather name="star" size={15} color="#FFD60A" />
          <Text style={styles.ratingText}>{remoteConfig.googlePlayRating.toFixed(1)} on Google Play</Text>
          <Text style={styles.ratingCount}>({new Intl.NumberFormat('en-US').format(remoteConfig.googlePlayRatingCount)})</Text>
        </View>
      )}
      {remoteConfig?.testimonials.map((testimonial) => (
        <View key={`${testimonial.attribution}:${testimonial.quote}`} style={styles.testimonial}>
          <Text style={styles.testimonialQuote}>“{testimonial.quote}”</Text>
          <Text style={styles.testimonialAttribution}>{testimonial.attribution}</Text>
        </View>
      ))}

      <Animated.View entering={FadeInUp.delay(300).duration(600)} style={[styles.plans, isCompact && styles.compactPlans]}>
        {loadingPlans ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Loading subscription options…</Text>
          </View>
        ) : plans.length > 0 ? (
          plans.map((plan) => {
            const isSelected = isSelectedPlan(plan.plan);
            const isMonthly = plan.plan === 'monthly';

            return (
              <TouchableOpacity
                key={plan.plan}
                style={[
                  styles.planCard,
                  isCompact && styles.compactPlanCard,
                  isSelected && styles.planCardSelected,
                  !plan.available && styles.planCardUnavailable,
                  isMonthly && styles.monthlyPlanCard,
                ]}
                onPress={() => {
                  if (!plan.available) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlan(plan.plan);
                }}
                disabled={!plan.available}
                activeOpacity={0.95}
              >
                {isMonthly && <View style={styles.planTag}><Text style={styles.planTagText}>BEST VALUE</Text></View>}
                <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.plan === 'weekly' ? 'Weekly' : plan.plan === 'monthly' ? 'Monthly' : '3 Months'}</Text>
                <View style={styles.planRadioWrap}>
                  <View style={[styles.planRadio, isSelected && styles.planRadioSelected]}>
                    {isSelected && <View style={styles.planRadioDot} />}
                  </View>
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  style={[styles.planPrice, isSelected && styles.planPriceSelected]}
                >
                  {getPlanDisplayPrice(plan)}
                </Text>
                <Text style={[styles.planPeriod, isSelected && styles.planPeriodSelected]}>{getPlanDisplayPeriod(plan)}</Text>
              </TouchableOpacity>
            );
          })
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(400).duration(600)} style={[styles.actions, isCompact && styles.compactActions]}>
        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            isCompact && styles.compactSubscribeBtn,
            (loading || !billingAvailable || !canPurchaseSelectedPlan) && { opacity: 0.65 },
          ]}
          onPress={handleSubscribe}
          disabled={loading || !billingAvailable || !canPurchaseSelectedPlan}
        >
          <Text style={[styles.subscribeBtnText, isCompact && styles.compactSubscribeText]}>
            {loading ? 'Processing...' : billingAvailable ? 'Start plan' : 'Billing unavailable'}
          </Text>
          <Feather name="arrow-right" size={20} color="#000000" />
        </TouchableOpacity>

        <Text style={styles.cancellationNote}>Cancel anytime in {storeName}.</Text>
        <View style={styles.legalRow}>
          <TouchableOpacity style={styles.legalLink} onPress={() => void openLegalLink(termsUrl)}><Text style={styles.legalText}>Terms</Text></TouchableOpacity>
          <Text style={styles.legalDivider}>·</Text>
          <TouchableOpacity style={styles.legalLink} onPress={() => void openLegalLink(privacyPolicyUrl)}><Text style={styles.legalText}>Privacy</Text></TouchableOpacity>
          <Text style={styles.legalDivider}>·</Text>
          <TouchableOpacity style={styles.legalLink} onPress={() => void handleRestore()} disabled={loading}><Text style={styles.legalText}>Restore Purchases</Text></TouchableOpacity>
        </View>
        <Text style={styles.footerNote}>AI analysis, not financial advice.</Text>
      </Animated.View>
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
    alignItems: 'flex-end',
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
    paddingHorizontal: 20,
    gap: 6,
  },
  compactScrollContent: {
    gap: 4,
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
    gap: 5,
  },
  compactHero: {
    gap: 3,
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
    fontSize: 25,
    lineHeight: 29,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -1,
  },
  compactTitle: {
    fontSize: 21,
    lineHeight: 25,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    color: '#F4F4F4',
    textAlign: 'center',
  },
  compactSubtitle: {
    fontSize: 13,
    lineHeight: 17,
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
    gap: 6,
    backgroundColor: '#191919',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2B2B2B',
  },
  compactFeaturesList: {
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#132D20',
    borderWidth: 1,
    borderColor: '#2EDB82',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactFeatureIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  compactFeatureTitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  featureSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
    color: '#B9B9B9',
  },
  compactFeatureSubtitle: {
    fontSize: 10,
    lineHeight: 13,
  },
  socialProof: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    color: '#39D98A',
    marginTop: 0,
  },
  compactSocialProof: {
    fontSize: 11,
  },
  ratingRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#F0F0F0',
  },
  ratingCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999999',
  },
  testimonial: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#777777',
    backgroundColor: '#111111',
    gap: 3,
  },
  testimonialQuote: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    color: '#E0E0E0',
  },
  testimonialAttribution: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: '#929292',
  },
  plans: {
    width: '100%',
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  compactPlans: {
    gap: 6,
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
    minHeight: 104,
    backgroundColor: '#141414',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPlanCard: {
    minHeight: 76,
    paddingVertical: 6,
  },
  planCardUnavailable: {
    opacity: 0.45,
  },
  monthlyPlanCard: {
    borderColor: '#00FF9D',
    backgroundColor: '#111111',
    shadowColor: '#00FF9D',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  planCardSelected: {
    borderColor: '#00FF9D',
  },
  planTag: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -45 }],
    backgroundColor: '#FFD60A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  planTagText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#000000',
    textTransform: 'uppercase',
  },
  planName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  planNameSelected: {
    color: '#FFFFFF',
  },
  planRadioWrap: {
    position: 'absolute',
    right: 8,
    top: 10,
  },
  planRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#7E7E7E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioSelected: {
    borderColor: '#3CEB8C',
    backgroundColor: '#0D1E14',
  },
  planRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3CEB8C',
  },
  planPrice: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 19,
  },
  planPriceSelected: {
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: '#9A9A9A',
    marginTop: 4,
  },
  planPeriodSelected: {
    color: '#FFFFFF',
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
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  compactSubscribeBtn: {
    minHeight: 52,
    paddingVertical: 8,
    borderRadius: 12,
  },
  subscribeBtnText: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Inter_700Bold',
    color: '#000000',
  },
  compactSubscribeText: {
    fontSize: 18,
    lineHeight: 24,
  },
  cancellationNote: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#D1D1D1',
    textAlign: 'center',
  },
  footerNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#9A9A9A',
    textAlign: 'center',
    marginTop: 2,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 2,
  },
  legalText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#CFCFCF',
    textAlign: 'center',
  },
  legalLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  legalDivider: {
    fontSize: 14,
    color: '#7A7A7A',
  },
});
