import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { getAvailablePlans, type PlanOffering } from '@/services/billing';

const FEATURES = [
  'Unlimited chart analysis',
  'AI-powered trade insights',
  'Risk management tools',
  'Strategy generator',
  'Save & review analyses',
];

export default function PaywallScreen() {
  // ScreenWrapper handles safe area and scrolling
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { purchasePlan, restorePurchases, billingAvailable } = useApp();
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app';
  const [selectedPlan, setSelectedPlan] = useState('quarterly');
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

  const selectedPlanMeta = plans.find((plan) => plan.plan === selectedPlan) ?? plans[0];
  const selectedPlanLabel = selectedPlan === 'quarterly' ? '3-Month' : 'Weekly';

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const purchased = await purchasePlan(selectedPlan as 'weekly' | 'quarterly');
      if (purchased) {
        router.back();
        return;
      }
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

  return (
    <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 24 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
          <Feather name="x" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.hero}>
          <View style={[styles.crownBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Feather name="zap" size={36} color="#FFD60A" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>FXSnap Premium</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Unlock full access to all features</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={[styles.featuresList, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.featureCheck, { backgroundColor: colors.buy }]}>
                <Feather name="check" size={14} color={colors.primaryForeground} />
              </View>
              <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.plans}>
          {loadingPlans ? (
            <View style={[styles.loadingState, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading subscription options…</Text>
            </View>
          ) : plans.length > 0 ? (
            plans.map((plan) => {
              const isSelected = selectedPlan === plan.plan;

              return (
                <TouchableOpacity
                  key={plan.plan}
                  style={[
                    styles.planCard,
                    isSelected && styles.planCardSelected,
                    {
                      backgroundColor: isSelected ? colors.surface : colors.card,
                      borderColor: isSelected ? colors.primary : colors.cardBorder,
                      transform: [{ scale: isSelected ? 1.02 : 1 }],
                      shadowColor: isSelected ? colors.primary : '#000000',
                      shadowOpacity: isSelected ? 0.25 : 0,
                      shadowRadius: isSelected ? 14 : 0,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: isSelected ? 6 : 0,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPlan(plan.plan);
                  }}
                  activeOpacity={0.95}
                >
                  {plan.plan === 'quarterly' && (
                    <View style={styles.planTag}>
                      <Text style={styles.planTagText}>MOST POPULAR</Text>
                    </View>
                  )}
                  <View style={styles.planInfo}>
                    <Text style={[styles.planName, { color: colors.textSecondary }]}>{plan.title}</Text>
                    <Text style={[styles.planPrice, { color: colors.text }]}>
                      {plan.price}
                      <Text style={[styles.planPeriod, { color: colors.textSecondary }]}> / {plan.period}</Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={[styles.loadingState, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Billing options are not available right now.</Text>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.subscribeBtn,
              (loading || !billingAvailable) && { opacity: 0.65 },
              { backgroundColor: colors.primary },
            ]}
            onPress={handleSubscribe}
            disabled={loading || !billingAvailable}
          >
            <Text style={[styles.subscribeBtnText, { color: colors.primaryForeground }]}>
              {loading ? 'Processing...' : billingAvailable ? `Start ${selectedPlanLabel} Plan` : 'Billing unavailable'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            setLoading(true);
            try {
              const restored = await restorePurchases();
              if (restored) router.back();
              else Alert.alert('No active subscription', 'No active FXSnap Premium entitlement was found.');
            } catch (error) {
              Alert.alert('Restore failed', error instanceof Error ? error.message : 'Unable to restore purchases.');
            } finally { setLoading(false); }
          }}>
            <Text style={[styles.restoreText, { color: colors.textSecondary }]}>Restore Purchase</Text>
          </TouchableOpacity>
          <Text style={[styles.legalText, { color: colors.textMuted }]}>If you need help, contact support@fxsnap.app with your app build information.</Text>
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            Cancel anytime. No hidden fees. Prices in USD.
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
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  crownBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#1A1800',
    borderWidth: 1,
    borderColor: '#3D3400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  featuresList: {
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureCheck: {
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
  plans: {
    gap: 12,
  },
  loadingState: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  planCard: {
    alignItems: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#00FF9D',
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
  planInfo: {
    gap: 6,
  },
  planName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  planPrice: {
    fontSize: 27,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 32,
  },
  planPeriod: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#8E8E93',
  },
  actions: {
    gap: 14,
    alignItems: 'center',
    marginTop: 'auto',
  },
  subscribeBtn: {
    width: '100%',
    minHeight: 56,
    paddingVertical: 12,
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
