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
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getAvailablePlans, type PlanOffering } from '@/services/billing';

const FALLBACK_PLANS = [
  {
    plan: 'weekly' as const,
    title: 'Weekly',
    price: '$7.99',
    period: '/ week',
    productId: 'fxsnap_weekly',
    available: false,
  },
  {
    plan: 'quarterly' as const,
    title: '3 Months',
    price: '$29.99',
    period: '/ 3 months',
    productId: 'fxsnap_quarterly',
    available: false,
  },
];

const FEATURES = [
  'Unlimited chart analysis',
  'AI-powered trade insights',
  'Risk management tools',
  'Strategy generator',
  'Save & review analyses',
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { purchasePlan, restorePurchases, billingAvailable } = useApp();
  const [selectedPlan, setSelectedPlan] = useState('quarterly');
  const [plans, setPlans] = useState<PlanOffering[]>(FALLBACK_PLANS);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const availablePlans = await getAvailablePlans();
        if (!active) return;
        setPlans(availablePlans);
        if (!availablePlans.find((plan) => plan.plan === selectedPlan && plan.available)) {
          const fallback = availablePlans.find((plan) => plan.available);
          if (fallback) setSelectedPlan(fallback.plan);
        }
      } catch {
        // keep fallback plans and let billing availability determine messaging.
      } finally {
        if (active) setLoadingPlans(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.hero}>
          <View style={[styles.crownBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Feather name="zap" size={36} color="#FFD60A" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>FXSnap Premium</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Unlock full access to all features</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.featuresList}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.featureCheck, { backgroundColor: colors.buy }]}>
                <Feather name="check" size={14} color="#000" />
              </View>
              <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.plans}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.plan}
              style={[
                styles.planCard,
                selectedPlan === plan.plan && styles.planCardSelected,
                { backgroundColor: colors.card, borderColor: selectedPlan === plan.plan ? colors.text : colors.cardBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedPlan(plan.plan);
              }}
            >
              {plan.plan === 'quarterly' && (
                <View style={styles.planTag}>
                  <Text style={styles.planTagText}>MOST POPULAR</Text>
                </View>
              )}
              <View>
                <Text style={[styles.planName, { color: colors.text }]}>{plan.title}</Text>
                <Text style={[styles.planSavings, { color: colors.buy }]}>Powered by RevenueCat</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.planPrice, { color: colors.text }]}>{plan.price}</Text>
                <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>{plan.period}</Text>
              </View>
            </TouchableOpacity>
          ))}
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
              {loading ? 'Processing...' : billingAvailable ? 'Start Subscription' : 'Billing unavailable'}
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
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            Cancel anytime. No hidden fees. Prices in USD.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
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
    backgroundColor: '#1C1C1E',
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
    marginTop: 2,
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
  actions: {
    gap: 14,
    alignItems: 'center',
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
