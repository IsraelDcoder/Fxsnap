import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Purchases from 'react-native-purchases';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legalUrls';
import {
  getYearlyExitOfferForSession,
  type YearlyExitOffer,
} from '@/services/exitOffer';

function isUserCancellation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'userCancelled' in error
    && error.userCancelled,
  );
}

export default function ExitOfferScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { restorePurchases } = useApp();
  const [offer] = useState<YearlyExitOffer | null>(getYearlyExitOfferForSession);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const firstYearPrice = offer?.option.pricingPhases[0]?.price.formatted;

  useEffect(() => {
    if (!offer || !firstYearPrice) router.replace('/paywall');
  }, [firstYearPrice, offer]);

  const returnToPaywall = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/paywall');
  }, []);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => processing);
    return () => subscription.remove();
  }, [processing]));

  const purchaseOffer = async () => {
    if (!offer || processing) return;
    setProcessing(true);
    setError('');
    try {
      const { customerInfo } = await Purchases.purchaseSubscriptionOption(offer.option);
      if (customerInfo.entitlements.active.Pro) {
        returnToPaywall();
      } else {
        setError('The purchase completed, but Pro access could not be confirmed. Please restore purchases or contact support.');
      }
    } catch (purchaseError) {
      if (isUserCancellation(purchaseError)) return;
      console.error('[Exit offer] Discounted subscription purchase failed.', purchaseError);
      setError(purchaseError instanceof Error ? purchaseError.message : 'Purchase failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const restore = async () => {
    if (processing) return;
    setProcessing(true);
    setError('');
    try {
      if (await restorePurchases()) returnToPaywall();
      else setError('No active FXSnap Pro subscription was found for this store account.');
    } catch (restoreError) {
      console.error('[Exit offer] Could not restore purchases.', restoreError);
      setError(restoreError instanceof Error ? restoreError.message : 'Could not restore purchases. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const openUrl = async (url: string) => {
    try {
      await import('expo-linking').then(({ openURL }) => openURL(url));
    } catch (linkError) {
      console.error('[Exit offer] Could not open a legal document.', linkError);
      setError('Could not open this link. Please try again.');
    }
  };

  if (!offer || !firstYearPrice) {
    return (
      <SafeAreaView style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.buy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 18 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Feather name="activity" size={16} color={colors.buy} />
            <Text style={[styles.brandText, { color: colors.text }]}>FXSNAP PRO</Text>
          </View>
          <TouchableOpacity
            onPress={returnToPaywall}
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Close special offer and return to subscription plans"
            disabled={processing}
          >
            <Feather name="x" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.eyebrow, { color: colors.buy }]}>A SPECIAL OFFER FOR YOU</Text>
        <Text style={[styles.title, { color: colors.text }]}>Your next move starts with FXSnap Pro</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Get the tools to analyze charts, plan setups and manage risk.
        </Text>

        <View style={styles.giftStage}>
          <View style={[styles.giftGlow, { backgroundColor: `${colors.buy}18` }]} />
          <View style={[styles.giftBox, { backgroundColor: colors.sell }]}>
            <View style={[styles.giftBoxTop, { backgroundColor: colors.sell, borderColor: colors.background }]} />
            <View style={[styles.giftRibbonVertical, { backgroundColor: colors.gold }]} />
            <View style={[styles.giftRibbonHorizontal, { backgroundColor: colors.gold }]} />
            <View style={[styles.giftIcon, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Feather name="gift" size={43} color={colors.buy} />
            </View>
          </View>
          <Feather name="star" size={18} color={colors.gold} style={styles.giftSparkLeft} />
          <Feather name="star" size={14} color={colors.buy} style={styles.giftSparkRight} />
        </View>

        <View style={[styles.offerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.discountBadge, { backgroundColor: `${colors.buy}20` }]}>
            <Text style={[styles.discountBadgeText, { color: colors.buy }]}>20% OFF YOUR FIRST YEAR</Text>
          </View>
          <Text style={[styles.discountPrice, { color: colors.text }]}>{firstYearPrice}</Text>
          <Text style={[styles.regularPrice, { color: colors.textMuted }]}>
            Then {offer.package.product.priceString} per year
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => void purchaseOffer()}
          style={[styles.purchaseButton, { backgroundColor: colors.buy }]}
          accessibilityRole="button"
          accessibilityLabel={`Claim 20 percent off for ${firstYearPrice}`}
          accessibilityHint="Starts a Google Play subscription at the discounted first-year price"
          disabled={processing}
        >
          <Text style={[styles.purchaseButtonText, { color: colors.background }]}>
            {processing ? 'Processing…' : 'Claim my special offer'}
          </Text>
          {processing
            ? <ActivityIndicator color={colors.background} />
            : <Feather name="gift" size={21} color={colors.background} />}
        </TouchableOpacity>

        <Text style={[styles.renewalCopy, { color: colors.textSecondary }]}>
          20% off your first year, then {offer.package.product.priceString}/year. Cancel anytime in Google Play.
        </Text>
        <View style={styles.reassurance}>
          <Feather name="check" size={18} color={colors.buy} />
          <Text style={[styles.reassuranceText, { color: colors.text }]}>
            No commitment, cancel anytime
          </Text>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.sell }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.footerLinks}>
          <TouchableOpacity
            onPress={() => void openUrl(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
          >
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={[styles.footerSeparator, { color: colors.textMuted }]}>·</Text>
          <TouchableOpacity
            onPress={() => void openUrl(TERMS_OF_USE_URL)}
            accessibilityRole="link"
          >
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={[styles.footerSeparator, { color: colors.textMuted }]}>·</Text>
          <TouchableOpacity
            onPress={() => void restore()}
            accessibilityRole="button"
            disabled={processing}
          >
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>Restore Purchase</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 6,
    gap: 12,
  },
  topBar: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandText: { fontSize: 11, letterSpacing: 1.5, fontFamily: 'Inter_800ExtraBold' },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginTop: 2, fontSize: 11, lineHeight: 16, letterSpacing: 1.5, fontFamily: 'Inter_800ExtraBold', textAlign: 'center' },
  title: { maxWidth: 360, fontSize: 29, lineHeight: 36, fontFamily: 'Inter_800ExtraBold', textAlign: 'center' },
  subtitle: { maxWidth: 330, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  giftStage: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  giftGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 95 },
  giftBox: { width: 142, height: 116, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  giftBoxTop: { position: 'absolute', top: -15, width: 158, height: 29, borderWidth: 3, borderRadius: 10 },
  giftRibbonVertical: { position: 'absolute', width: 28, height: '100%', opacity: 0.96 },
  giftRibbonHorizontal: { position: 'absolute', top: 31, width: '100%', height: 15 },
  giftIcon: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#171B19' },
  giftSparkLeft: { position: 'absolute', left: '18%', top: 44 },
  giftSparkRight: { position: 'absolute', right: '17%', bottom: 42 },
  offerCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
  },
  discountBadge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5, marginBottom: 3 },
  discountBadgeText: { fontSize: 10, lineHeight: 14, letterSpacing: 0.8, fontFamily: 'Inter_800ExtraBold' },
  discountPrice: { fontSize: 25, lineHeight: 31, fontFamily: 'Inter_800ExtraBold' },
  regularPrice: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', textDecorationLine: 'line-through' },
  purchaseButton: {
    width: '100%',
    maxWidth: 390,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderRadius: 18,
    paddingHorizontal: 18,
    marginTop: 2,
  },
  purchaseButtonText: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  renewalCopy: { maxWidth: 380, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  reassurance: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  reassuranceText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  error: { width: '100%', fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 'auto',
    paddingTop: 9,
  },
  footerLink: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' },
  footerSeparator: { fontSize: 12, lineHeight: 16 },
});
