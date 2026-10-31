import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  type PurchasesPackage,
} from 'react-native-purchases';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { API_BASE_URL } from '@/services/apiAuth';
import { configureBilling } from '@/services/billing';
import { trackEvent } from '@/services/telemetry';
import { hasRevenueCatEntitlement } from '@/services/revenuecatEntitlements';
import { getPaywallRemoteConfig, type PaywallRemoteConfig } from '@/services/paywallConfig';
import { loadOnboardingState, saveOnboardingState } from '@/services/onboardingState';

type PaywallPlan = 'weekly' | 'monthly' | 'yearly';

type PaywallPackage = {
  plan: PaywallPlan;
  package: PurchasesPackage | null;
  price: string;
  priceAmount: number;
  priceAmountMicros: number;
  currencyCode: string;
  period: string;
  eligibleForFreeTrial: boolean;
};

const PACKAGE_IDS: Record<PaywallPlan, string> = {
  weekly: '$rc_weekly',
  monthly: '$rc_monthly',
  yearly: '$rc_annual',
};

const PLAN_LABELS: Record<PaywallPlan, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const PLAN_PERIODS: Record<PaywallPlan, string> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

const TERMS_URL = `${API_BASE_URL}/terms`;
const PRIVACY_URL = `${API_BASE_URL}/privacy`;

function isUserCancellation(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'userCancelled' in error
    && error.userCancelled,
  );
}

function getPackagePriceMicros(packageToPrice: PurchasesPackage) {
  const storePriceMicros = packageToPrice.product.defaultOption?.fullPricePhase?.price.amountMicros;
  if (typeof storePriceMicros === 'number' && Number.isFinite(storePriceMicros)) {
    return storePriceMicros;
  }
  return Math.round(packageToPrice.product.price * 1_000_000);
}

async function isFreeTrialEligible(packageToCheck: PurchasesPackage) {
  const product = packageToCheck.product;
  const androidFreeTrial = product.defaultOption?.freePhase?.price.amountMicros === 0;
  if (Platform.OS === 'android') return Boolean(androidFreeTrial);
  if (Platform.OS !== 'ios' || product.introPrice?.price !== 0) return false;

  try {
    const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([product.identifier]);
    return eligibility[product.identifier]?.status
      === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
  } catch (error) {
    console.error('[Paywall] Could not verify introductory offer eligibility.', error);
    return false;
  }
}

function formatCurrency(amount: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const onboardingPaywall = source === 'onboarding';
  const returnRoute = source === 'analysis-result-locked' ? '/analysis-result' : '/(tabs)/home';
  const {
    billingAvailable,
    isSubscribed,
    isLoading: appLoading,
    completeOnboarding,
    markPaywallDismissed,
    consumePendingFeatureRoute,
    clearPendingFeatureRoute,
  } = useApp();
  const [packages, setPackages] = useState<PaywallPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [retryOfferings, setRetryOfferings] = useState(0);
  const [remoteConfig, setRemoteConfig] = useState<PaywallRemoteConfig | null>(null);
  const [closeButtonVisible, setCloseButtonVisible] = useState(false);
  const closeButtonProgress = useRef(new Animated.Value(0)).current;
  const onboardingCompletionStarted = useRef(false);
  const dismissInProgress = useRef(false);

  useEffect(() => {
    if (appLoading || isSubscribed) return;
    const revealTimeout = setTimeout(() => {
      setCloseButtonVisible(true);
      Animated.timing(closeButtonProgress, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }, 3000);

    return () => {
      clearTimeout(revealTimeout);
      closeButtonProgress.stopAnimation();
    };
  }, [appLoading, closeButtonProgress, isSubscribed]);

  const dismissPaywall = useCallback(() => {
    if (dismissInProgress.current) return;
    dismissInProgress.current = true;
    clearPendingFeatureRoute();
    void (async () => {
      try {
        if (onboardingPaywall) {
          try {
            const onboardingState = await loadOnboardingState();
            await saveOnboardingState({ ...onboardingState, completedAt: new Date().toISOString() });
          } catch (completionError) {
            console.error('[Onboarding] Could not persist completion after paywall dismissal.', completionError);
          }
        }
        await markPaywallDismissed();
        if (onboardingPaywall) {
          trackEvent('onboarding_completed', { version: 2, completion: 'dismissed' });
        }
        router.replace('/(tabs)/home?exitOffer=1');
      } catch (dismissError) {
        console.error('[Paywall] Could not dismiss the paywall.', dismissError);
        setError('Could not open Home. Please try again.');
      } finally {
        dismissInProgress.current = false;
      }
    })();
  }, [clearPendingFeatureRoute, markPaywallDismissed, onboardingPaywall]);

  const completeOnboardingAfterEntitlement = useCallback(async (completion: 'purchase' | 'restore' | 'existing_subscription') => {
    if (!onboardingPaywall || onboardingCompletionStarted.current) return;
    onboardingCompletionStarted.current = true;
    try {
      const onboardingState = await loadOnboardingState();
      await saveOnboardingState({ ...onboardingState, completedAt: new Date().toISOString() });
    } catch (completionError) {
      console.error('[Onboarding] Could not persist completion after entitlement verification.', completionError);
    }
    try {
      await completeOnboarding();
    } catch (completionError) {
      console.error('[Onboarding] Could not persist completion in app settings.', completionError);
    }
    trackEvent('onboarding_completed', { version: 2, completion });
  }, [completeOnboarding, onboardingPaywall]);

  useEffect(() => {
    trackEvent('paywall_view', { source: source ?? 'unknown' });
    trackEvent('paywall_viewed', { source: source ?? 'unknown' });
  }, [source]);

  useEffect(() => {
    if (appLoading || !isSubscribed) return;
    if (onboardingPaywall) {
      void completeOnboardingAfterEntitlement('existing_subscription');
      router.replace(returnRoute);
      return;
    }
    dismissPaywall();
  }, [appLoading, completeOnboardingAfterEntitlement, isSubscribed, onboardingPaywall, returnRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissPaywall();
      return true;
    });
    return () => subscription.remove();
  }, [dismissPaywall]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await configureBilling())) {
          if (active && Platform.OS === 'web' && __DEV__) {
            const placeholderPackages: PaywallPackage[] = [
              { plan: 'weekly', package: null, price: '$4.99', priceAmount: 4.99, priceAmountMicros: 4_990_000, currencyCode: 'USD', period: 'week', eligibleForFreeTrial: false },
              { plan: 'monthly', package: null, price: '$14.99', priceAmount: 14.99, priceAmountMicros: 14_990_000, currencyCode: 'USD', period: 'month', eligibleForFreeTrial: false },
              { plan: 'yearly', package: null, price: '$99.99', priceAmount: 99.99, priceAmountMicros: 99_990_000, currencyCode: 'USD', period: 'year', eligibleForFreeTrial: false },
            ];
            setPackages(placeholderPackages);
            setSelectedPackageId('yearly-placeholder');
            setError('');
          } else if (active) {
            setError('Subscription plans are unavailable on this device.');
          }
          return;
        }

        const offerings = await Purchases.getOfferings();
        const currentPackages = offerings.current?.availablePackages ?? [];
        const matchingPackages = (Object.entries(PACKAGE_IDS) as Array<[PaywallPlan, string]>)
          .flatMap(([plan, identifier]) => {
            const packageFromOffering = currentPackages.find((item) => item.identifier === identifier);
            if (!packageFromOffering) return [];
            const product = packageFromOffering.product;
            return [{
              plan,
              package: packageFromOffering,
              price: product.priceString,
              priceAmount: product.price,
              priceAmountMicros: getPackagePriceMicros(packageFromOffering),
              currencyCode: product.currencyCode,
              period: PLAN_PERIODS[plan],
              eligibleForFreeTrial: false,
            }];
          });

        const withTrialEligibility = await Promise.all(matchingPackages.map(async (item) => ({
          ...item,
          eligibleForFreeTrial: await isFreeTrialEligible(item.package),
        })));

        if (!active) return;
        setPackages(withTrialEligibility);
        const defaultPackage = withTrialEligibility.find((item) => item.plan === 'yearly')
          ?? withTrialEligibility[0];
        setSelectedPackageId(defaultPackage?.package?.identifier ?? null);
        if (withTrialEligibility.length === 0) setError('No subscription plans are available right now.');
      } catch (loadError) {
        console.error('[Paywall] Could not load the current RevenueCat offering.', loadError);
        if (active) setError('Could not load subscription plans. Please try again.');
      } finally {
        if (active) setLoadingPackages(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [retryOfferings]);

  useEffect(() => {
    let active = true;
    void getPaywallRemoteConfig().then((config) => {
      if (active) setRemoteConfig(config);
    });
    return () => { active = false; };
  }, []);

  const selectedPackage = packages.find((item) => (
    item.package?.identifier === selectedPackageId
    || (!item.package && `${item.plan}-placeholder` === selectedPackageId)
  )) ?? null;
  const yearlySavings = useMemo(() => {
    const weekly = packages.find((item) => item.plan === 'weekly');
    const monthly = packages.find((item) => item.plan === 'monthly');
    const annual = packages.find((item) => item.plan === 'yearly');
    if (!annual || annual.priceAmountMicros <= 0) return null;
    const savingsAgainstMonthly = monthly
      && monthly.currencyCode === annual.currencyCode
      && monthly.priceAmountMicros > 0
      ? Math.round(((monthly.priceAmountMicros * 12 - annual.priceAmountMicros) / (monthly.priceAmountMicros * 12)) * 100)
      : null;
    const savingsAgainstWeekly = weekly
      && weekly.currencyCode === annual.currencyCode
      && weekly.priceAmountMicros > 0
      ? Math.round(((weekly.priceAmountMicros * 52 - annual.priceAmountMicros) / (weekly.priceAmountMicros * 52)) * 100)
      : null;
    const savings = savingsAgainstMonthly ?? savingsAgainstWeekly;
    return savings !== null && savings > 0 ? savings : null;
  }, [packages]);

  const yearlyWeeklyPrice = useMemo(() => {
    const annual = packages.find((item) => item.plan === 'yearly');
    if (!annual) return '';
    return `${formatCurrency(annual.priceAmount / 52, annual.currencyCode)} / week`;
  }, [packages]);

  const reassuranceText = selectedPackage
    ? selectedPackage.eligibleForFreeTrial
      ? `Free trial, then ${selectedPackage.price} / ${selectedPackage.period} · Auto-renews, cancel anytime`
      : `Billed ${selectedPackage.price} / ${selectedPackage.period} · Auto-renews, cancel anytime`
    : 'Auto-renews, cancel anytime';

  const openUrl = async (url: string) => {
    try {
      await import('expo-linking').then(({ openURL }) => openURL(url));
    } catch (openError) {
      console.error('[Paywall] Could not open a legal document.', openError);
      setError('Could not open this link. Please try again.');
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage || processing) return;
    if (!selectedPackage.package) {
      setError('Purchases are unavailable in the web preview. Use a native app build to subscribe.');
      return;
    }
    setProcessing(true);
    setError('');
    const productProperties = { plan: selectedPackage.plan, product_id: selectedPackage.package.product.identifier };
    trackEvent('paywall_purchase_started', productProperties);
    trackEvent('purchase_started', productProperties);
    try {
      const purchase = await Purchases.purchasePackage(selectedPackage.package);
      if (hasRevenueCatEntitlement(purchase.customerInfo.entitlements.active)) {
        trackEvent('paywall_purchase_succeeded', productProperties);
        trackEvent('purchase_completed', productProperties);
        if (onboardingPaywall) {
          await completeOnboardingAfterEntitlement('purchase');
        }
        const nextRoute = (consumePendingFeatureRoute() || returnRoute) as Parameters<typeof router.replace>[0];
        router.replace(nextRoute);
        return;
      }
      setError('Your purchase could not be confirmed. Please try again.');
      trackEvent('purchase_failed', { ...productProperties, reason: 'entitlement_not_confirmed' });
    } catch (purchaseError) {
      if (isUserCancellation(purchaseError)) {
        trackEvent('purchase_cancelled', productProperties);
      } else {
        trackEvent('purchase_failed', productProperties);
        console.error('[Paywall] Purchase failed.', purchaseError);
        setError(purchaseError instanceof Error ? purchaseError.message : 'Purchase failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (processing) return;
    if (!billingAvailable) {
      setError('Purchases are not available on this device.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (hasRevenueCatEntitlement(customerInfo.entitlements.active)) {
        clearPendingFeatureRoute();
        if (onboardingPaywall) {
          await completeOnboardingAfterEntitlement('restore');
        }
        router.replace(returnRoute);
      } else {
        setError('No active FXSnap Pro subscription was found for this store account.');
      }
    } catch (restoreError) {
      console.error('[Paywall] Restore failed.', restoreError);
      setError(restoreError instanceof Error ? restoreError.message : 'Restore failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (appLoading || isSubscribed) return null;

  const theme = {
    background: colors.background,
    surface: colors.card,
    subtle: `${colors.text}14`,
    border: colors.cardBorder,
    strongBorder: `${colors.text}40`,
    textPrimary: colors.text,
    textMuted: colors.textSecondary,
    textFaint: colors.textSecondary,
    accent: colors.buy,
  };

  const orderedPackages = (['weekly', 'monthly', 'yearly'] as const)
    .map((plan) => packages.find((item) => item.plan === plan))
    .filter((item): item is PaywallPackage => Boolean(item));

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={[styles.content, { paddingBottom: 20 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.closeButtonSlot}>
            {closeButtonVisible ? (
              <Animated.View
                style={{
                  opacity: closeButtonProgress,
                  transform: [{
                    scale: closeButtonProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  }],
                }}
              >
                <TouchableOpacity
                  onPress={dismissPaywall}
                  style={[styles.closeButton, { backgroundColor: theme.subtle }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close paywall"
                >
                  <Feather name="x" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => void handleRestore()}
            style={styles.restoreButton}
            disabled={processing}
            accessibilityRole="button"
          >
            <Text style={[styles.restoreText, { color: theme.textMuted }]}>Restore</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={[styles.heroRing, styles.heroRingOuter, { borderColor: `${theme.accent}20` }]} />
          <View style={[styles.heroRing, styles.heroRingMiddle, { borderColor: `${theme.accent}35` }]} />
          <View style={[styles.heroRing, styles.heroRingInner, { borderColor: `${theme.accent}55` }]} />
          <View style={[styles.heroOrb, { backgroundColor: theme.accent }]}>
            <Feather name="activity" size={30} color={theme.background} />
          </View>
          <View style={[styles.heroSpark, styles.heroSparkTop, { backgroundColor: theme.accent }]} />
          <View style={[styles.heroSpark, styles.heroSparkSide, { backgroundColor: theme.accent }]} />
        </View>

        <View style={styles.headlineGroup}>
          <Text style={[styles.subscriptionEyebrow, { color: theme.accent }]}>FXSNAP PRO</Text>
          <Text style={[styles.headline, { color: theme.textPrimary }]}>GET PRO ACCESS</Text>
          <Text style={[styles.headlineAccent, { color: theme.accent }]}>TRADE WITH CLARITY</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Tools to help you analyze charts, plan trades, manage risk and learn.
          </Text>
        </View>

        <View style={styles.featureList}>
          {([
            { icon: 'bar-chart-2', label: 'AI chart analysis', color: theme.accent },
            { icon: 'target', label: 'Structured trade scenarios', color: '#4F8DFF' },
            { icon: 'shield', label: 'Risk management tools', color: '#E39A37' },
            { icon: 'book-open', label: 'Learning resources and community', color: '#B169DF' },
          ] as const).map((item) => (
            <View key={item.label} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: `${item.color}20` }]}>
                <Feather name={item.icon} size={17} color={item.color} />
              </View>
              <Text style={[styles.featureLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              <Feather name="check" size={17} color={theme.accent} />
            </View>
          ))}
        </View>

        {remoteConfig?.traderCount || remoteConfig?.googlePlayRating ? (
          <View style={styles.socialProof}>
            {remoteConfig.traderCount ? (
              <View style={styles.socialMetric}>
                <Feather name="users" size={14} color={theme.accent} />
                <Text style={[styles.socialCaption, { color: theme.textMuted }]}>
                  {remoteConfig.traderCount.toLocaleString()} traders
                </Text>
              </View>
            ) : null}
            {remoteConfig.googlePlayRating && remoteConfig.googlePlayRatingCount ? (
              <View style={styles.socialMetric}>
                <Feather name="star" size={14} color={theme.accent} />
                <Text style={[styles.socialCaption, { color: theme.textMuted }]}>
                  {remoteConfig.googlePlayRating.toFixed(1)} / 5 on Google Play · {remoteConfig.googlePlayRatingCount.toLocaleString()} ratings
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {loadingPackages ? (
          <View style={styles.loadingRow} accessibilityLiveRegion="polite">
            <Text style={[styles.errorText, { color: theme.textMuted }]}>Loading plans…</Text>
          </View>
        ) : (
          <>
            {selectedPackage?.eligibleForFreeTrial ? (
              <View style={[styles.trialNotice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Feather name="gift" size={19} color={theme.accent} />
                <View style={styles.trialCopy}>
                  <Text style={[styles.trialTitle, { color: theme.textPrimary }]}>Free trial available</Text>
                  <Text style={[styles.trialDescription, { color: theme.textMuted }]}>
                    {selectedPackage.price} per {selectedPackage.period} after the trial. Confirm the offer terms with your store before subscribing.
                  </Text>
                </View>
                <Feather name="check-circle" size={18} color={theme.accent} />
              </View>
            ) : null}
            <View style={styles.planList}>
              {orderedPackages.map((item) => {
                const packageId = item.package?.identifier ?? `${item.plan}-placeholder`;
                const selected = packageId === selectedPackageId;
                const showSavings = item.plan === 'yearly'
                  && yearlySavings !== null
                  && packages.some((candidate) => candidate.plan === 'weekly');
                return (
                  <TouchableOpacity
                    key={packageId}
                    onPress={() => {
                      setSelectedPackageId(packageId);
                      setError('');
                      if (item.package) {
                        trackEvent('subscription_plan_selected', {
                          plan: item.plan,
                          product_id: item.package.product.identifier,
                        });
                      }
                    }}
                    style={[
                      styles.planCard,
                      {
                        backgroundColor: selected ? `${theme.accent}1F` : theme.surface,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    disabled={processing}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${PLAN_LABELS[item.plan]}, ${item.price} per ${item.period}${showSavings ? `, best value, save ${yearlySavings}%` : ''}`}
                  >
                    {showSavings ? (
                      <View style={[styles.savingsBadge, { backgroundColor: theme.accent }]}>
                        <Feather name="zap" size={11} color={theme.background} />
                        <Text style={[styles.savingsText, { color: theme.background }]}>BEST VALUE · SAVE {yearlySavings}%</Text>
                      </View>
                    ) : null}
                    <View style={[styles.radio, {
                      borderColor: selected ? theme.accent : theme.strongBorder,
                      backgroundColor: selected ? theme.accent : 'transparent',
                    }]}>
                      {selected ? <Feather name="check" size={12} color={theme.background} /> : null}
                    </View>
                    <View style={styles.planDetails}>
                      <Text style={[styles.planName, { color: selected ? theme.accent : theme.textPrimary }]}>
                        {`FXSnap Pro ${PLAN_LABELS[item.plan]}`}
                      </Text>
                      <Text style={[styles.planPeriod, { color: theme.textMuted }]}>
                        {item.plan === 'yearly' ? 'Billed yearly' : `Billed ${item.period}`}
                      </Text>
                      {item.plan === 'yearly' ? (
                        <Text style={[styles.packageSubline, { color: theme.textMuted }]}>
                          ≈ {yearlyWeeklyPrice} equivalent
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.planPriceGroup}>
                      <Text style={[styles.planPrice, { color: theme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {item.price}
                      </Text>
                      <Text style={[styles.planPricePeriod, { color: theme.textMuted }]}>
                        per {item.period}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {error ? (
              <View style={styles.paywallError}>
                <Text style={[styles.errorText, { color: colors.sell }]} accessibilityLiveRegion="polite">{error}</Text>
                {!billingAvailable || orderedPackages.length === 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setError('');
                      setLoadingPackages(true);
                      setRetryOfferings((attempt) => attempt + 1);
                    }}
                    style={styles.retryButton}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.footerLink, { color: theme.accent }]}>Retry loading plans</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => void handlePurchase()}
              disabled={!selectedPackage || processing || !billingAvailable}
              style={[
                styles.purchaseButton,
                { backgroundColor: theme.textPrimary, opacity: !selectedPackage || processing || !billingAvailable ? 0.65 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Unlock unlimited analysis"
            >
              <Text style={[styles.purchaseText, { color: theme.background }]}>
                {processing ? 'Processing…' : 'Unlock unlimited analysis'}
              </Text>
              {!processing ? <Feather name="arrow-right" size={22} color={theme.background} /> : null}
            </TouchableOpacity>
            <View style={styles.reassuranceRow}>
              <Feather name="shield" size={13} color={theme.textMuted} />
              <Text style={[styles.reassurance, { color: theme.textMuted }]} numberOfLines={3}>
                {reassuranceText}
              </Text>
            </View>
            <View style={styles.benefitList}>
              {['Cancel anytime', 'No ads, ever', 'Custom AI routines'].map((benefit) => (
                <View key={benefit} style={styles.benefitItem}>
                  <Feather name="check" size={13} color={theme.accent} />
                  <Text style={[styles.benefitText, { color: theme.textMuted }]}>{benefit}</Text>
                </View>
              ))}
            </View>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => void openUrl(TERMS_URL)} style={styles.footerLinkButton}>
                <Text style={[styles.footerLink, { color: theme.textFaint }]}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: theme.textFaint }]}>·</Text>
              <TouchableOpacity onPress={() => void openUrl(PRIVACY_URL)} style={styles.footerLinkButton}>
                <Text style={[styles.footerLink, { color: theme.textFaint }]}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenScroll: { flex: 1 },
  content: {
    paddingTop: 4,
    paddingHorizontal: 20,
    gap: 14,
  },
  topBar: {
    width: '100%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButtonSlot: {
    width: 34,
    height: 34,
  },
  closeButton: {
    minWidth: 32,
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  restoreText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_500Medium',
  },
  hero: {
    height: 142,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
  },
  heroRing: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRingOuter: { width: 142, height: 142 },
  heroRingMiddle: { width: 108, height: 108 },
  heroRingInner: { width: 76, height: 76 },
  heroOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSpark: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroSparkTop: { top: 12, right: '31%' },
  heroSparkSide: { left: '25%', bottom: 30 },
  headlineGroup: {
    alignItems: 'center',
    gap: 2,
  },
  subscriptionEyebrow: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.8,
    fontFamily: 'Inter_700Bold',
  },
  headline: {
    width: '100%',
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
  },
  headlineAccent: {
    width: '100%',
    fontSize: 24,
    lineHeight: 31,
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
  },
  subtitle: {
    width: '92%',
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  featureList: {
    gap: 3,
    marginTop: 1,
  },
  featureRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 24,
  },
  socialMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socialCaption: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
  },
  trialNotice: {
    width: '100%',
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trialCopy: { flex: 1, gap: 2 },
  trialTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: 'Inter_700Bold',
  },
  trialDescription: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
  },
  planList: {
    width: '100%',
    gap: 12,
    paddingTop: 4,
  },
  planCard: {
    width: '100%',
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    position: 'relative',
  },
  planDetails: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  planName: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: 'Inter_700Bold',
  },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPeriod: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
  },
  packageSubline: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_500Medium',
  },
  planPriceGroup: {
    minWidth: 76,
    alignItems: 'flex-end',
    gap: 1,
  },
  planPrice: {
    maxWidth: '100%',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Inter_700Bold',
  },
  planPricePeriod: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
  },
  savingsBadge: {
    position: 'absolute',
    top: -12,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 16,
  },
  savingsText: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_800ExtraBold',
  },
  purchaseButton: {
    width: '100%',
    minHeight: 62,
    marginTop: 4,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  purchaseText: {
    flex: 1,
    fontSize: 19,
    lineHeight: 25,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginLeft: 22,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: -5,
  },
  reassurance: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  benefitList: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: -4,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  benefitText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_500Medium',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: -5,
  },
  footerLinkButton: {
    padding: 4,
  },
  footerLink: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
  },
  footerDot: {
    fontSize: 12,
    lineHeight: 16,
  },
  paywallError: {
    alignItems: 'center',
  },
  retryButton: {
    padding: 4,
  },
  loadingRow: {
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});
