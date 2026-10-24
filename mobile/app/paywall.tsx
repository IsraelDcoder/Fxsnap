import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  type PurchasesPackage,
} from 'react-native-purchases';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { API_BASE_URL } from '@/services/apiAuth';
import { configureBilling } from '@/services/billing';
import { trackEvent } from '@/services/telemetry';

type PaywallPlan = 'weekly' | 'monthly' | 'yearly';

type PaywallPackage = {
  plan: PaywallPlan;
  package: PurchasesPackage;
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

function hasProEntitlement(customerInfo: { entitlements: { active: Record<string, unknown> } }) {
  return Object.prototype.hasOwnProperty.call(customerInfo.entitlements.active, 'Pro');
}

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

function Laurel({ mirrored, color, compact }: { mirrored?: boolean; color: string; compact: boolean }) {
  return (
    <Svg
      width={compact ? 24 : 28}
      height={compact ? 36 : 44}
      viewBox="0 0 28 44"
      style={mirrored ? styles.mirroredLaurel : undefined}
    >
      <Path d="M22 40C8 32 5 20 10 5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10 8C5 8 3 5 4 2C8 2 10 4 10 8Z" fill={color} />
      <Path d="M8 14C3 14 1 11 2 8C6 8 8 10 8 14Z" fill={color} />
      <Path d="M8 20C3 21 1 19 1 16C5 15 7 17 8 20Z" fill={color} />
      <Path d="M10 26C5 28 2 26 2 23C6 21 9 23 10 26Z" fill={color} />
      <Path d="M13 32C8 35 5 33 4 30C8 28 11 29 13 32Z" fill={color} />
      <Path d="M17 37C13 41 10 40 8 37C11 34 15 35 17 37Z" fill={color} />
      <Circle cx={22} cy={40} r={1.4} fill={color} />
    </Svg>
  );
}

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const compactLayout = screenHeight < 780;
  const tightLayout = screenHeight < 700;
  const { source } = useLocalSearchParams<{ source?: string }>();
  const returnRoute = source === 'analysis-result-locked' ? '/analysis-result' : '/(tabs)/home';
  const {
    billingAvailable,
    isSubscribed,
    isLoading: appLoading,
    consumePendingFeatureRoute,
    clearPendingFeatureRoute,
  } = useApp();
  const [packages, setPackages] = useState<PaywallPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const dismissPaywall = () => {
    clearPendingFeatureRoute();
    router.replace(returnRoute);
  };

  useEffect(() => {
    trackEvent('paywall_view', { source: source ?? 'unknown' });
  }, [source]);

  useEffect(() => {
    if (!appLoading && isSubscribed) dismissPaywall();
  }, [appLoading, isSubscribed]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissPaywall();
      return true;
    });
    return () => subscription.remove();
  }, [source]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await configureBilling())) {
          if (active) setError('Subscription plans are unavailable on this device.');
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
        setSelectedPackageId(defaultPackage?.package.identifier ?? null);
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
  }, []);

  const selectedPackage = packages.find((item) => item.package.identifier === selectedPackageId) ?? null;
  const yearlySavings = useMemo(() => {
    const weekly = packages.find((item) => item.plan === 'weekly');
    const annual = packages.find((item) => item.plan === 'yearly');
    if (
      !weekly
      || !annual
      || weekly.currencyCode !== annual.currencyCode
      || weekly.priceAmountMicros <= 0
      || annual.priceAmountMicros < 0
    ) return null;
    return Math.round(((weekly.priceAmountMicros * 52 - annual.priceAmountMicros) / (weekly.priceAmountMicros * 52)) * 100);
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
    setProcessing(true);
    setError('');
    trackEvent('paywall_purchase_started', { plan: selectedPackage.plan });
    try {
      const purchase = await Purchases.purchasePackage(selectedPackage.package);
      if (hasProEntitlement(purchase.customerInfo)) {
        trackEvent('paywall_purchase_succeeded', { plan: selectedPackage.plan });
        const nextRoute = (consumePendingFeatureRoute() || returnRoute) as Parameters<typeof router.replace>[0];
        router.replace(nextRoute);
        return;
      }
      setError('Your purchase could not be confirmed. Please try again.');
    } catch (purchaseError) {
      if (!isUserCancellation(purchaseError)) {
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
      if (hasProEntitlement(customerInfo)) {
        clearPendingFeatureRoute();
        router.replace(returnRoute);
      } else {
        setError('No active Pro subscription was found for this store account.');
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
    textSecondary: colors.textSecondary,
    textMuted: colors.textSecondary,
    textFaint: colors.textSecondary,
    accent: colors.buy,
    cta: colors.gold,
    ctaText: colors.primaryForeground,
  };

  const orderedPackages = (['weekly', 'monthly', 'yearly'] as const)
    .map((plan) => packages.find((item) => item.plan === plan))
    .filter((item): item is PaywallPackage => Boolean(item));

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={[styles.topContent, compactLayout && styles.compactTopContent, tightLayout && styles.tightTopContent]}>
        <View style={styles.closeRow}>
          <TouchableOpacity
            onPress={dismissPaywall}
            style={[styles.closeButton, { backgroundColor: theme.subtle }]}
            accessibilityRole="button"
            accessibilityLabel="Close paywall"
          >
            <Feather name="x" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.headlineGroup, compactLayout && styles.compactHeadlineGroup]}>
          <Text style={[styles.headline, compactLayout && styles.compactHeadline, tightLayout && styles.tightHeadline, { color: theme.textPrimary }]}>
            Your goal: trade with confidence
          </Text>
          <Text style={[styles.subtitle, compactLayout && styles.compactSubtitle, { color: theme.textMuted }]}>
            Spot setups faster with AI chart analysis
          </Text>
        </View>

        <View style={[styles.chart, compactLayout && styles.compactChart, tightLayout && styles.tightChart]}>
          <Svg width="100%" height="100%" viewBox="0 0 360 80" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="equityCurveFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.accent} stopOpacity="0.3" />
                <Stop offset="1" stopColor={theme.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d="M0 80 C44 74 65 52 103 51 S145 63 180 44 S226 12 256 22 S301 28 360 -10 L360 80 Z" fill="url(#equityCurveFill)" />
            <Path d="M0 80 C44 74 65 52 103 51 S145 63 180 44 S226 12 256 22 S301 28 360 -10" fill="none" stroke={theme.accent} strokeWidth="3" strokeLinecap="round" />
            <Circle cx="357" cy="0" r="4" fill={theme.accent} />
          </Svg>
        </View>

        <View style={[styles.toolkitCard, compactLayout && styles.compactToolkitCard, tightLayout && styles.tightToolkitCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.toolkitHeader, compactLayout && styles.compactToolkitHeader, tightLayout && styles.tightToolkitHeader, { borderBottomColor: theme.border }]}>
            <Feather name="lock" size={18} color={theme.accent} />
            <Text style={[styles.toolkitTitle, { color: theme.textPrimary }]}>Your AI trading toolkit</Text>
            <View style={[styles.lockedPill, { backgroundColor: theme.subtle }]}>
              <Text style={[styles.lockedText, { color: theme.textMuted }]}>Locked</Text>
            </View>
          </View>
          {[
            { label: 'AI chart analysis', width: 96 },
            { label: 'Entry & exit zones', width: 72 },
            { label: 'Risk calculator', width: 56 },
            { label: 'Trader community', width: 80 },
          ].map((item) => (
            <View key={item.label}>
              <View style={[styles.toolkitDivider, { backgroundColor: theme.border }]} />
              <View style={[styles.toolkitRow, compactLayout && styles.compactToolkitRow, tightLayout && styles.tightToolkitRow]}>
                <Text style={[styles.toolkitLabel, compactLayout && styles.compactToolkitLabel, tightLayout && styles.tightToolkitLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                <View style={[styles.valuePlaceholder, { width: item.width, backgroundColor: theme.subtle }]} />
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.socialProof, compactLayout && styles.compactSocialProof]}>
          <Laurel color={theme.accent} compact={compactLayout} />
          <View style={styles.socialCopy}>
            <Text style={[styles.socialCount, compactLayout && styles.compactSocialCount, { color: theme.textPrimary }]}>8,000+ traders</Text>
            <Text style={[styles.socialCaption, compactLayout && styles.compactSocialCaption, { color: theme.textMuted }]}>have started with FXSnap</Text>
          </View>
          <Laurel mirrored color={theme.accent} compact={compactLayout} />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: 8 + insets.bottom }]}>
        {loadingPackages ? (
          <View style={styles.loadingRow} accessibilityLiveRegion="polite">
            <Text style={[styles.errorText, { color: theme.textMuted }]}>Loading plans…</Text>
          </View>
        ) : (
          <>
            <View style={styles.packageRow}>
              {orderedPackages.map((item) => {
                const selected = item.package.identifier === selectedPackageId;
                const showSavings = item.plan === 'yearly'
                  && yearlySavings !== null
                  && packages.some((candidate) => candidate.plan === 'weekly');
                return (
                  <TouchableOpacity
                    key={item.package.identifier}
                    onPress={() => {
                      setSelectedPackageId(item.package.identifier);
                      setError('');
                    }}
                    style={[
                      styles.packageCard,
                      {
                        backgroundColor: selected ? `${theme.accent}1F` : theme.surface,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    disabled={processing}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${PLAN_LABELS[item.plan]}, ${item.price} per ${item.period}`}
                  >
                    {showSavings ? (
                      <View style={[styles.savingsBadge, { backgroundColor: theme.accent }]}>
                        <Text style={[styles.savingsText, { color: theme.background }]}>SAVE {yearlySavings}%</Text>
                      </View>
                    ) : null}
                    <View style={styles.packageNameRow}>
                      <Text style={[styles.packageName, { color: theme.textMuted }]}>{PLAN_LABELS[item.plan]}</Text>
                      <View style={[
                        styles.radio,
                        { borderColor: selected ? theme.accent : theme.strongBorder },
                        selected && { backgroundColor: theme.accent },
                      ]}>
                        {selected ? <Feather name="check" size={12} color={theme.background} /> : null}
                      </View>
                    </View>
                    <Text style={[styles.packagePrice, { color: theme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                      {item.price}
                    </Text>
                    {item.plan === 'yearly' ? (
                      <Text style={[styles.packageSubline, styles.yearlySubline, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit>
                        {yearlyWeeklyPrice}
                      </Text>
                    ) : (
                      <Text style={[styles.packageSubline, { color: theme.textMuted }]}>
                        per {item.period}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {error ? <Text style={[styles.errorText, { color: colors.sell }]} accessibilityLiveRegion="polite">{error}</Text> : null}
            <TouchableOpacity
              onPress={() => void handlePurchase()}
              disabled={!selectedPackage || processing || !billingAvailable}
              style={[
                styles.purchaseButton,
                { backgroundColor: theme.cta, opacity: !selectedPackage || processing || !billingAvailable ? 0.65 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={selectedPackage?.eligibleForFreeTrial ? 'Start trial' : 'Unlock my toolkit'}
            >
              <Text style={[styles.purchaseText, { color: theme.ctaText }]}>
                {processing ? 'Processing…' : selectedPackage?.eligibleForFreeTrial ? 'Startl' : 'Unlock my toolkit'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.reassurance, { color: theme.textMuted }]} numberOfLines={2}>
              {reassuranceText}
            </Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => void openUrl(TERMS_URL)} style={styles.footerLinkButton}>
                <Text style={[styles.footerLink, { color: theme.textFaint }]}>Terms of Use</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: theme.textFaint }]}>·</Text>
              <TouchableOpacity onPress={() => void openUrl(PRIVACY_URL)} style={styles.footerLinkButton}>
                <Text style={[styles.footerLink, { color: theme.textFaint }]}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: theme.textFaint }]}>·</Text>
              <TouchableOpacity onPress={() => void handleRestore()} style={styles.footerLinkButton} disabled={processing}>
                <Text style={[styles.footerLink, { color: theme.textFaint }]}>Restore purchases</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topContent: {
    flex: 1,
    paddingTop: 4,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    justifyContent: 'space-between',
  },
  compactTopContent: {
    paddingBottom: 8,
    gap: 8,
  },
  tightTopContent: {
    paddingTop: 2,
    paddingBottom: 4,
    gap: 4,
  },
  closeRow: {
    width: '100%',
    minHeight: 32,
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineGroup: {
    alignItems: 'center',
    gap: 8,
  },
  compactHeadlineGroup: {
    gap: 4,
  },
  headline: {
    width: '100%',
    fontSize: 26,
    lineHeight: 32,
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
  },
  compactHeadline: {
    fontSize: 23,
    lineHeight: 28,
  },
  tightHeadline: {
    fontSize: 21,
    lineHeight: 25,
  },
  subtitle: {
    width: '100%',
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  compactSubtitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  chart: {
    width: '100%',
    height: 80,
    overflow: 'hidden',
  },
  compactChart: {
    height: 58,
  },
  tightChart: {
    height: 42,
  },
  toolkitCard: {
    width: '100%',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  compactToolkitCard: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 5,
  },
  tightToolkitCard: {
    paddingTop: 6,
    paddingHorizontal: 10,
    paddingBottom: 3,
  },
  toolkitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactToolkitHeader: {
    paddingBottom: 6,
  },
  tightToolkitHeader: {
    paddingBottom: 4,
  },
  toolkitTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Inter_700Bold',
  },
  lockedPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  lockedText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  toolkitDivider: {
    height: StyleSheet.hairlineWidth,
  },
  toolkitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  compactToolkitRow: {
    paddingVertical: 5,
  },
  tightToolkitRow: {
    paddingVertical: 3,
  },
  toolkitLabel: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  compactToolkitLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  tightToolkitLabel: {
    fontSize: 13,
    lineHeight: 16,
  },
  valuePlaceholder: {
    height: 14,
    borderRadius: 10,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
  },
  compactSocialProof: {
    minHeight: 36,
  },
  mirroredLaurel: {
    transform: [{ scaleX: -1 }],
  },
  socialCopy: {
    alignItems: 'center',
    gap: 2,
  },
  socialCount: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Inter_800ExtraBold',
  },
  compactSocialCount: {
    fontSize: 18,
    lineHeight: 22,
  },
  socialCaption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  compactSocialCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    flexShrink: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 0,
  },
  packageRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  packageCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 98,
    paddingTop: 14,
    paddingLeft: 14,
    paddingRight: 12,
    paddingBottom: 12,
    borderRadius: 16,
    borderWidth: 2,
    gap: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  packageNameRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 3,
  },
  packageName: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packagePrice: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Inter_700Bold',
  },
  packageSubline: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  yearlySubline: {
    fontFamily: 'Inter_600SemiBold',
  },
  savingsBadge: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  savingsText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_800ExtraBold',
  },
  purchaseButton: {
    width: '100%',
    height: 56,
    marginTop: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseText: {
    fontSize: 17,
    lineHeight: 23,
    fontFamily: 'Inter_700Bold',
  },
  reassurance: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
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
