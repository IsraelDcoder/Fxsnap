import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import ScreenWrapper from '@/components/ScreenWrapper';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getAvailablePlans, type BillingPlan, type PlanOffering } from '@/services/billing';

const FEATURES = [
  'Unlimited chart breakdowns in seconds',
  'Exact Entry, SL & TP for every setup',
  'AI reasoning behind every trade setup',
  'Save & track your winning strategies',
];

export default function PaywallScreen() {
  // ScreenWrapper handles safe area and scrolling
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { purchasePlan, restorePurchases, billingAvailable, isSubscribed, isLoading, consumePendingFeatureRoute, clearPendingFeatureRoute } = useApp();
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 700 || screenWidth < 360;

  const dismissPaywall = () => {
    clearPendingFeatureRoute();
    router.replace('/(tabs)/home');
  };
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('monthly');
  const [plans, setPlans] = useState<PlanOffering[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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
    if (!isLoading && isSubscribed) router.replace('/home');
  }, [isLoading, isSubscribed]);

  useEffect(() => {
    const onBack = () => {
      dismissPaywall();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, []);

  if (isLoading || isSubscribed) return null;

  const selectedPlanMeta = plans.find((plan) => plan.plan === selectedPlan) ?? plans[0];
  const selectedPlanLabel = selectedPlan === 'quarterly' ? '3 Months' : selectedPlan === 'monthly' ? 'Monthly' : 'Weekly';
  const canPurchaseSelectedPlan = Boolean(selectedPlanMeta?.available);

  const getPlanDisplayPrice = (plan: PlanOffering) => plan.price || '—';
  const getPlanDisplayPeriod = (plan: PlanOffering) => {
    if (plan.plan === 'weekly') return '/ week';
    if (plan.plan === 'quarterly') return '/ 3 months';
    return '/ month';
  };
  const getPlanBadge = (plan: PlanOffering) => (
    plan.plan === 'monthly' ? '3 DAYS FREE' : 'NO TRIAL'
  );

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const purchased = await purchasePlan(selectedPlan);
      if (purchased) {
        const nextRoute = (consumePendingFeatureRoute() || '/home') as Parameters<typeof router.replace>[0];
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
      contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 24, alignItems: 'center' }]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={dismissPaywall}>
          <Feather name="x" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.hero}>
        <View style={styles.logoBox}>
          <Feather name="zap" size={52} color="#FFD60A" />
        </View>
        <Text style={[styles.title, isCompact && styles.compactTitle]}>FXSNAP PREMIUM</Text>
        <Text style={[styles.subtitle, isCompact && styles.compactSubtitle]}>Your complete AI trading assistant.</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.featuresList}>
        <View style={styles.featureRow}>
          <View style={styles.featureIconWrap}>
            <Feather name="bar-chart-2" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={styles.featureTitle}>Unlimited chart analysis</Text>
            <Text style={styles.featureSubtitle}>Get AI breakdowns in seconds.</Text>
          </View>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIconWrap}>
            <Feather name="target" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={styles.featureTitle}>Entry, SL & TP for every setup</Text>
            <Text style={styles.featureSubtitle}>Get clear trade levels with AI reasoning.</Text>
          </View>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIconWrap}>
            <Feather name="cpu" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={styles.featureTitle}>AI reasoning behind every trade</Text>
            <Text style={styles.featureSubtitle}>Understand why each setup works.</Text>
          </View>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIconWrap}>
            <Feather name="bookmark" size={24} color="#3CEB8C" />
          </View>
          <View style={styles.featureTextWrap}>
            <Text style={styles.featureTitle}>Save & track your strategies</Text>
            <Text style={styles.featureSubtitle}>Keep your best setups in one place.</Text>
          </View>
        </View>
      </Animated.View>

      <Text style={styles.socialProof}>Join 2,500+ traders today</Text>

      <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.plans}>
        {loadingPlans ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Loading subscription options…</Text>
          </View>
        ) : plans.length > 0 ? (
          plans.map((plan) => {
            const isSelected = isSelectedPlan(plan.plan);
            const isMonthly = plan.plan === 'monthly';
            const planBadge = getPlanBadge(plan);

            return (
              <TouchableOpacity
                key={plan.plan}
                style={[
                  styles.planCard,
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
                <Text style={styles.planBadge}>{planBadge}</Text>
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
        ) : (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Billing options are not available right now.</Text>
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            (loading || !billingAvailable || !canPurchaseSelectedPlan) && { opacity: 0.65 },
          ]}
          onPress={handleSubscribe}
          disabled={loading || !billingAvailable || !canPurchaseSelectedPlan}
        >
          <Text style={[styles.subscribeBtnText, isCompact && styles.compactSubscribeText]}>
            {loading ? 'Processing...' : billingAvailable ? `Start ${selectedPlanLabel} Plan` : 'Billing unavailable'}
          </Text>
          <Feather name="arrow-right" size={20} color="#000000" />
        </TouchableOpacity>

        <View style={styles.footerMeta}>
          <View style={styles.metaItem}>
            <Feather name="check-circle" size={18} color="#3CEB8C" />
            <Text style={styles.metaText}>Cancel anytime</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Feather name="users" size={18} color="#3CEB8C" />
            <Text style={styles.metaText}>Join 2,500+ traders</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Feather name="shield" size={18} color="#3CEB8C" />
            <Text style={styles.metaText}>Secure payment</Text>
          </View>
        </View>

        <Text style={styles.footerNote}>No risk. Let your first win decide.</Text>
        <View style={styles.legalRow}>
          <Text style={styles.legalText}>Terms of Service</Text>
          <Text style={styles.legalDivider}>|</Text>
          <Text style={styles.legalText}>Privacy Policy</Text>
        </View>
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
  scroll: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: '#2B2B2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -1,
  },
  compactTitle: {
    fontSize: 28,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
    color: '#F4F4F4',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  compactSubtitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  featuresList: {
    width: '100%',
    gap: 12,
    backgroundColor: '#191919',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2B2B2B',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#132D20',
    borderWidth: 2,
    borderColor: '#2EDB82',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  featureSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    color: '#B9B9B9',
  },
  socialProof: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    color: '#39D98A',
    marginTop: 4,
  },
  plans: {
    width: '100%',
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
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
    minHeight: 136,
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
  planBadge: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#9AE6B4',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  planName: {
    fontSize: 14,
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
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 19,
  },
  planPriceSelected: {
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#9A9A9A',
    marginTop: 4,
  },
  planPeriodSelected: {
    color: '#FFFFFF',
  },
  actions: {
    gap: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  subscribeBtn: {
    width: '100%',
    minHeight: 62,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  subscribeBtnText: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    color: '#000000',
  },
  compactSubscribeText: {
    fontSize: 18,
    lineHeight: 24,
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#F5F5F5',
  },
  metaDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#3A3A3A',
  },
  footerNote: {
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
    color: '#F5F5F5',
    textAlign: 'center',
    marginTop: 4,
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
    fontFamily: 'Inter_400Regular',
    color: '#CFCFCF',
    textAlign: 'center',
  },
  legalDivider: {
    fontSize: 14,
    color: '#7A7A7A',
  },
});
