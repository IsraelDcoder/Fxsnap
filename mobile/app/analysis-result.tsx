import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  cancelAnimation,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import { useApp } from '@/context/AppContext';
import type { AnalysisResult } from '@/context/AppContext';
import AnalysisShareCard from '../components/AnalysisShareCard';
import { RatingPromptModal } from '@/components/RatingPromptModal';
import { consumeRatingPrompt } from '@/services/ratingPrompt';
import { useColors } from '@/hooks/useColors';
import Svg, { Defs, Line, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { trackEvent } from '@/services/telemetry';
import { canViewFullAnalysis } from '@/services/featureAccess';
import { getInstrument } from '@/services/instruments';
import { shareAnalysisCardOnWeb } from '@/services/shareAnalysisCard';
import { formatAnalysisDirection, resolveAnalysisDirection } from '@/services/analysisDirection';

type ResultTab = 'analysis' | 'insights';

function currencyFlag(currency: string) {
  const countryByCurrency: Record<string, string> = {
    EUR: 'EU', USD: 'US', GBP: 'GB', JPY: 'JP', CHF: 'CH', CAD: 'CA',
    AUD: 'AU', NZD: 'NZ', CNY: 'CN', HKD: 'HK', SGD: 'SG', SEK: 'SE',
    NOK: 'NO', MXN: 'MX', ZAR: 'ZA',
  };
  const country = countryByCurrency[currency] || '';
  return country
    ? String.fromCodePoint(...[...country].map((letter) => 127397 + letter.charCodeAt(0)))
    : currency.slice(0, 2);
}

function pairCurrencies(pair: string) {
  const currencies = pair.toUpperCase().match(/[A-Z]{3}/g) ?? [];
  return [currencies[0] ?? pair.slice(0, 3).toUpperCase(), currencies[1] ?? pair.slice(-3).toUpperCase()];
}

function formatLevelPrice(value: string | number | undefined, pair: string) {
  if (value == null || value === '') return '—';
  const text = String(value).trim();
  if (['none', 'not_clear', 'unknown'].includes(text.toLowerCase())) return '—';
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const [base, quote] = pairCurrencies(pair);
  const instrument = getInstrument(pair.replace(/[^A-Z0-9]/gi, ''));
  const decimals = instrument
    ? instrument.kind === 'forex' ? instrument.decimals + 1 : instrument.decimals
    : quote === 'JPY' || base === 'JPY' ? 3 : 5;
  return Number(text).toFixed(decimals);
}

function firstAvailableLevel(...values: (string | number | undefined)[]) {
  return values.find((value) => value != null
    && String(value).trim() !== ''
    && !['none', 'not_clear', 'unknown'].includes(String(value).trim().toLowerCase()));
}

function formatRiskReward(value: unknown) {
  if (typeof value === 'string' && ['none', 'unknown', 'not_clear'].includes(value.trim().toLowerCase())) return '—';
  if (typeof value === 'string' && value.includes(':')) return value;
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : String(value ?? '—');
}

function getPipDistance(entry: string, stop: string, pair: string) {
  const midpoint = (value: string) => {
    const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
    if (!numbers.length) return null;
    return numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
  };
  const entryPrice = midpoint(entry);
  const stopPrice = midpoint(stop);
  if (entryPrice == null || stopPrice == null) return null;
  const [, quote] = pairCurrencies(pair);
  const instrument = getInstrument(pair.replace(/[^A-Z0-9]/gi, ''));
  const pipSize = instrument?.pipSize ?? (quote === 'JPY' ? 0.01 : 0.0001);
  return Math.round(Math.abs(entryPrice - stopPrice) / pipSize);
}

function buildSmoothChartPaths(series: number[] = []) {
  const values = series.filter(Number.isFinite).slice(-80);
  if (values.length < 2) return { line: '', fill: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.001, 0.00001);
  const points = values.map((value, index) => ({
    x: 14 + (index / (values.length - 1)) * 332,
    y: 16 + ((max - value) / range) * 176,
  }));
  let line = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const midpoint = (previous.x + point.x) / 2;
    line += ` C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }
  return {
    line,
    fill: `${line} L 346 210 L 14 210 Z`,
  };
}

// ─── Floating toast ───────────────────────────────────────────────────────────
function Toast({ visible, message }: { visible: boolean; message: string }) {
  const translateY = useSharedValue(80);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 14, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 250 });
      const t = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 300 });
        translateY.value = withTiming(80, { duration: 300 });
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.toast, style]}>
      <Feather name="check-circle" size={16} color="#00E676" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

function TradeLevelRow({
  label,
  value,
  color = '#F5F5F5',
  locked = false,
  onPress,
}: {
  label: string;
  value: string;
  color?: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={styles.levelTableRow}>
      <Text style={styles.levelTableLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.levelTableValueWrap}
        onPress={onPress}
        disabled={!locked}
        accessibilityRole={locked ? 'button' : undefined}
        accessibilityLabel={locked ? `Unlock ${label}` : undefined}
      >
        <Text style={[styles.levelTableValue, { color }, locked && styles.lockedValue]}>{value}</Text>
        {locked ? <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      </TouchableOpacity>
    </View>
  );
}

function SkeletonBlock({ style }: { style: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.35);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.8, { duration: 750 }), -1, true);
    return () => cancelAnimation(opacity);
  }, []);
  return <Animated.View style={[style, shimmerStyle]} />;
}

export default function AnalysisResultScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { currentAnalysis, saveAnalysis, savedAnalyses, isSubscribed, isLoading } = useApp();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [shareDisabled, setShareDisabled] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [ratingPromptVisible, setRatingPromptVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>('analysis');
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const shareCardRef = useRef<View | null>(null);
  const shareReadyRef = React.useRef(false);

  useEffect(() => {
    shareReadyRef.current = false;
  }, [currentAnalysis?.id]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void consumeRatingPrompt().then((shouldShow) => {
        if (active && shouldShow) setRatingPromptVisible(true);
      });
    }, 1400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [currentAnalysis?.id]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isNoTrade = currentAnalysis?.status === 'no_trade';
  const isInvalid = currentAnalysis?.status === 'invalid_image';
  const isAnalysisUnavailable = isInvalid || currentAnalysis?.status === 'ai_unavailable' || currentAnalysis?.status === 'ai_invalid_response';
  const marketRead = currentAnalysis?.marketBias ?? currentAnalysis?.analysis?.trend;
  const displayDirection = resolveAnalysisDirection(
    currentAnalysis?.tradeSetup?.type,
    currentAnalysis?.direction,
    marketRead,
    currentAnalysis?.analysis?.sentiment,
  );
  const isBuy = displayDirection === 'BUY';
  const isSell = displayDirection === 'SELL';
  const marketReadLabel = marketRead === 'bullish' ? 'BULLISH BIAS'
    : marketRead === 'bearish' ? 'BEARISH BIAS'
      : marketRead === 'mixed' ? 'MIXED BIAS' : marketRead === 'neutral' ? 'NEUTRAL BIAS'
        : isAnalysisUnavailable ? 'NOT ASSESSED' : 'NEUTRAL BIAS';
  const directionLabel = formatAnalysisDirection(
    displayDirection,
    currentAnalysis?.status === 'success' && currentAnalysis.tradeStatus === 'actionable',
    marketReadLabel,
  );
  const hasFullAnalysisAccess = canViewFullAnalysis(isSubscribed, currentAnalysis?.freeAnalysisUsed === true);
  const directionColor = isBuy || (!isSell && marketRead === 'bullish') ? '#00E676'
    : isSell || marketRead === 'bearish' ? '#FF5252' : '#8E8E93';
  const alreadySaved = savedAnalyses.some((a) => a.id === currentAnalysis?.id);
  const pair = currentAnalysis?.pair ?? '';
  const [baseCurrency, quoteCurrency] = pairCurrencies(pair);
  const targetLevels = [
    ...(currentAnalysis?.takeProfitLevels ?? []),
    ...(currentAnalysis?.tradeSetup?.takeProfit ? [currentAnalysis.tradeSetup.takeProfit] : []),
    ...(currentAnalysis?.tp ? [currentAnalysis.tp] : []),
  ].filter((level, index, levels) => firstAvailableLevel(level) != null && levels.indexOf(level) === index).slice(0, 2);
  const usableTargetLevels = targetLevels;
  const entryLevel = formatLevelPrice(firstAvailableLevel(currentAnalysis?.entry, currentAnalysis?.tradeSetup?.entryZone), pair);
  const stopLevel = formatLevelPrice(firstAvailableLevel(currentAnalysis?.sl, currentAnalysis?.tradeSetup?.stopLoss), pair);
  const tp1Level = formatLevelPrice(usableTargetLevels[0], pair);
  const tp2Level = formatLevelPrice(usableTargetLevels[1], pair);
  const unavailableLevelLabel = isNoTrade ? 'Not established' : 'Not provided';
  const entryLevelText = entryLevel === '—' ? unavailableLevelLabel : entryLevel;
  const stopLevelText = stopLevel === '—' ? unavailableLevelLabel : stopLevel;
  const tp1LevelText = tp1Level === '—' ? unavailableLevelLabel : tp1Level;
  const shareAnalysis = currentAnalysis && !hasFullAnalysisAccess ? {
    ...currentAnalysis,
    entry: entryLevel,
    tp: tp1Level,
    takeProfitLevels: usableTargetLevels.slice(0, 1),
    tradeSetup: currentAnalysis.tradeSetup
      ? { ...currentAnalysis.tradeSetup, takeProfit: tp1Level, riskReward: '—' }
      : undefined,
  } : currentAnalysis;
  const stopDistance = currentAnalysis?.slPips ?? getPipDistance(entryLevel, stopLevel, pair);
  const currentPrice = currentAnalysis?.priceSeries?.at(-1);
  const entryPrice = entryLevel.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite)[0];
  const priceChangePercent = currentPrice != null && entryPrice != null && entryPrice !== 0
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : null;
  const priceChangeFavorable = priceChangePercent == null
    ? isBuy || isSell
    : isSell ? priceChangePercent < 0 : priceChangePercent > 0;
  const priceChangeColor = priceChangePercent == null
    ? directionColor
    : priceChangeFavorable ? '#39E58C' : '#FF6262';
  const riskReward = formatRiskReward(currentAnalysis?.tradeSetup?.riskReward);
  const riskRewardText = riskReward === '—'
    ? isNoTrade ? 'Not calculable' : 'Not provided'
    : riskReward.includes(':') ? riskReward : `1:${riskReward}`;
  const confidence = currentAnalysis?.marketConfidence ?? currentAnalysis?.confidence ?? 0;
  const entryReadiness = Math.round(Math.max(0, Math.min(100, currentAnalysis?.entryReadiness ?? 0)));
  const readinessLabel = currentAnalysis?.tradeStatus === 'actionable'
    ? 'Ready'
    : currentAnalysis?.tradeStatus?.startsWith('waiting')
      ? 'Waiting for confirmation'
      : 'Entry not identified';
  const readinessText = isAnalysisUnavailable ? 'Unavailable' : `${entryReadiness}% · ${readinessLabel}`;
  const chartPaths = buildSmoothChartPaths(currentAnalysis?.priceSeries);
  const confidenceLabel = confidence >= 70 ? 'High' : confidence >= 40 ? 'Medium' : 'Low';
  const reasoning = currentAnalysis ? currentAnalysis.reasoning?.length ? currentAnalysis.reasoning.slice(0, 5) : [
    currentAnalysis.analysis?.trend && currentAnalysis.analysis.trend !== 'neutral' ? `Trend: ${currentAnalysis.analysis.trend}.` : '',
    currentAnalysis.analysis?.structure ? `Structure: ${currentAnalysis.analysis.structure}.` : '',
    currentAnalysis.zones?.support && currentAnalysis.zones.support !== 'not_clear' ? `Support is near ${currentAnalysis.zones.support}.` : '',
    currentAnalysis.zones?.resistance && currentAnalysis.zones.resistance !== 'not_clear' ? `Resistance is near ${currentAnalysis.zones.resistance}.` : '',
    currentAnalysis.analysis?.notes || currentAnalysis.multiTimeframe?.summary || '',
  ].filter(Boolean).slice(0, 5) : [];
  const supportLevels = currentAnalysis?.supportResistance?.support?.length
    ? currentAnalysis.supportResistance.support.join(', ')
    : currentAnalysis?.zones?.support && currentAnalysis.zones.support !== 'not_clear'
      ? currentAnalysis.zones.support
      : 'Not identified';
  const resistanceLevels = currentAnalysis?.supportResistance?.resistance?.length
    ? currentAnalysis.supportResistance.resistance.join(', ')
    : currentAnalysis?.zones?.resistance && currentAnalysis.zones.resistance !== 'not_clear'
      ? currentAnalysis.zones.resistance
      : 'Not identified';

  useEffect(() => {
    if (!currentAnalysis) return;
    trackEvent('result_viewed', {
      pair: currentAnalysis.pair,
      timeframe: currentAnalysis.timeframe || 'unknown',
      direction: currentAnalysis.direction || 'NONE',
    });
  }, [currentAnalysis?.id]);

  // Legacy saved analyses store entry/sl/tp directly; new shape stores
  // tradeSetup + analysis + zones.
  const hasTradeSetup = Boolean(currentAnalysis?.tradeSetup?.type && currentAnalysis.tradeSetup.type !== 'none');

  const saveIconScale = useSharedValue(1);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const handleSave = () => {
    if (!currentAnalysis || alreadySaved) return;
    trackEvent('save_tapped', { pair: currentAnalysis.pair, timeframe: currentAnalysis.timeframe || 'unknown' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveAnalysis(currentAnalysis);
    saveIconScale.value = withSpring(1.3, { damping: 10, stiffness: 300 }, () => {
      saveIconScale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    showToast('Analysis saved successfully');
  };

  const handleShare = async () => {
    if (!currentAnalysis || !shareAnalysis) return;

    trackEvent('share_tapped', { pair: currentAnalysis.pair, timeframe: currentAnalysis.timeframe || 'unknown' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShareError(false);

    let capturedUri: string | undefined;
    try {
      setShareDisabled(true);
      if (Platform.OS === 'web') {
        const result = await shareAnalysisCardOnWeb(shareAnalysis, hasFullAnalysisAccess);
        if (result === 'shared') showToast('FXSnap analysis card shared');
        if (result === 'downloaded') showToast('FXSnap analysis card downloaded');
        return;
      }

      if (!shareCardRef.current) throw new Error('Share card is not available.');
      const waitForReady = async (timeout = 2000) => {
        const start = Date.now();
        while (!shareReadyRef.current && Date.now() - start < timeout) {
          // small sleep
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 50));
        }
        return shareReadyRef.current;
      };
      const ready = await waitForReady(5000);
      if (!ready) throw new Error('Share card did not finish layout.');

      capturedUri = await captureRef(shareCardRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      if (!capturedUri || typeof capturedUri !== 'string') throw new Error('Capture did not return a file URI.');

      const info = await FileSystem.getInfoAsync(capturedUri);
      if (!info.exists || !(info.size && info.size > 0)) throw new Error('Captured share file is missing or empty.');

      const shareUri = capturedUri.startsWith('file://') ? capturedUri : `file://${capturedUri}`;
      if (!(await Sharing.isAvailableAsync())) throw new Error('Native sharing is unavailable.');
      await Sharing.shareAsync(shareUri, { mimeType: 'image/png', dialogTitle: 'Share FXSnap analysis' });
      showToast('Share card ready to share');
    } catch (error) {
      console.error('[Share] Failed', error);
      setShareError(true);
      showToast("Couldn't create the share card. Try again.");
    } finally {
      if (capturedUri) {
        try { await FileSystem.deleteAsync(capturedUri, { idempotent: true }); } catch { /* cache cleanup is best effort */ }
      }
      setShareDisabled(false);
    }
  };

  const handleCopy = async () => {
    if (!currentAnalysis) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lines: string[] = [];
    if (isNoTrade) {
      lines.push('FXSnap — Market Read');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      lines.push(`Evidence score (not win probability): ${currentAnalysis.confidence}%`);
      lines.push(`Directional bias: ${directionLabel}`);
      lines.push(`Trade readiness: ${readinessText}`);
      if (!hasFullAnalysisAccess) lines.push('AI reasoning: Unlock full analysis in FXSnap.');
      if (hasFullAnalysisAccess && currentAnalysis.analysis?.notes) lines.push(`Notes: ${currentAnalysis.analysis.notes}`);
      if (hasFullAnalysisAccess && currentAnalysis.whyNotNow?.length) {
        lines.push('');
        lines.push('Why Not Now:');
        currentAnalysis.whyNotNow.forEach((reason) => lines.push(`- ${reason}`));
      }
    } else if (isInvalid) {
      lines.push('⚠️ FXSnap — Invalid Chart Image');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      if (hasFullAnalysisAccess && currentAnalysis.analysis?.notes) lines.push(`Notes: ${currentAnalysis.analysis.notes}`);
    } else {
      const dir = isBuy ? 'BUY ↑' : isSell ? 'SELL ↓' : '—';
      lines.push('🎯 FXSnap Signal');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      lines.push(`Direction: ${dir}`);
      lines.push(`Evidence score (not win probability): ${currentAnalysis.confidence}%`);
      lines.push(`Market Bias: ${currentAnalysis.marketBias || 'neutral'}`);
      lines.push(`Setup Status: ${currentAnalysis.setupStatus || 'NO_SETUP'}`);
      lines.push('');
      const formatRR = (v: any) => {
        const n = Number(v);
        if (!isFinite(n)) return String(v ?? '—');
        // round to 2 decimal places and trim trailing zeros
        return Number(Math.round(n * 100) / 100).toString();
      };

      if (hasTradeSetup && currentAnalysis.tradeSetup) {
        lines.push(`Entry:       ${currentAnalysis.tradeSetup.entryZone}`);
        lines.push(`Stop Loss:   ${currentAnalysis.tradeSetup.stopLoss}`);
        lines.push(`Take Profit 1: ${tp1Level}`);
        if (hasFullAnalysisAccess && usableTargetLevels.length > 1) lines.push(`Take Profit 2: ${tp2Level}`);
        if (hasFullAnalysisAccess) lines.push(`Risk/Reward: ${formatRR(currentAnalysis.tradeSetup.riskReward)}`);
      } else {
        lines.push(`Entry:       ${currentAnalysis.entry ?? '—'}`);
        lines.push(`Stop Loss:   ${currentAnalysis.sl ?? '—'}`);
        lines.push(`Take Profit: ${currentAnalysis.tp ?? '—'}`);
        lines.push(`Lot Size:    ${currentAnalysis.lotSize ? currentAnalysis.lotSize.toFixed(2) : 'n/a'}`);
        lines.push(`SL Distance: ${currentAnalysis.slPips ? `${currentAnalysis.slPips} pips` : '—'}`);
      }
      if (currentAnalysis.tradeTrigger) {
        lines.push('');
        lines.push(`Next Step: ${currentAnalysis.tradeTrigger}`);
      }
      lines.push('');
      lines.push('Generated by FXSnap');
    }
    await Clipboard.setStringAsync(lines.join('\n'));
    showToast('Analysis copied to clipboard');
  };

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveIconScale.value }],
  }));

  const chartLevelValues = [
    ['entry', entryLevel],
    ['sl', stopLevel],
    ['tp1', tp1Level],
    ['tp2', tp2Level],
  ] as const;
  const chartNumbers = chartLevelValues.flatMap(([, value]) => {
    const matches = value.match(/-?\d+(?:\.\d+)?/g);
    return matches ? matches.map(Number).filter(Number.isFinite) : [];
  });
  const chartMin = chartNumbers.length ? Math.min(...chartNumbers) : 0;
  const chartMax = chartNumbers.length ? Math.max(...chartNumbers) : 0;
  const levelY = (key: string, value: string) => {
    const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
    const price = numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
    if (Number.isFinite(price) && chartMax > chartMin) {
      return 16 + ((chartMax - price) / (chartMax - chartMin)) * 68;
    }
    const defaults: Record<string, number> = {
      entry: 52,
      sl: isSell ? 27 : 78,
      tp1: isSell ? 76 : 28,
      tp2: isSell ? 86 : 17,
    };
    return defaults[key] ?? 50;
  };
  const openLockedContent = (element: string) => {
    if (element === 'tp2') trackEvent('callout_tapped', { pair, level: element });
    trackEvent('locked_content_tapped', { pair, element, source: 'analysis-result-locked' });
    router.push({ pathname: '/paywall', params: { source: 'analysis-result-locked', element } });
  };
  const selectTab = (tab: ResultTab) => {
    setActiveTab(tab);
    trackEvent('tab_switched', { tab: tab === 'analysis' ? 'Our Analysis' : 'Insights' });
  };
  const highlightLevel = (level: string) => {
    setActiveLevel((active) => active === level ? null : level);
    trackEvent('callout_tapped', { pair, level });
  };

  if (!currentAnalysis) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: '#000000' }]}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#39E58C" />
            <SkeletonBlock style={styles.skeletonBlock} />
            <SkeletonBlock style={[styles.skeletonBlock, styles.skeletonChart]} />
            <SkeletonBlock style={[styles.skeletonBlock, styles.skeletonRow]} />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No analysis available.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/analysis')}>
              <Text style={styles.retryButtonText}>Retry analysis</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newBtn} onPress={() => router.replace('/home')}>
              <Text style={styles.newBtnText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (isAnalysisUnavailable) {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: '#000000' }]}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home')} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analysis Result</Text>
          <View style={styles.backBtn} />
        </Animated.View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.emptyState, styles.failedAnalysisState, { paddingBottom: botPad + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {currentAnalysis.imageUri ? (
            <Image source={{ uri: currentAnalysis.imageUri }} resizeMode="contain" style={styles.failedAnalysisImage} />
          ) : null}
          <View style={styles.failedAnalysisMessage}>
            <Feather name="alert-triangle" size={22} color="#FF7777" />
            <Text style={styles.resultErrorText}>
              {currentAnalysis.message || currentAnalysis.analysis?.notes || 'Analysis could not be completed.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.failedAnalysisRetry}
            onPress={() => router.replace({ pathname: '/analysis', params: { retry: '1' } })}
            accessibilityRole="button"
          >
            <Feather name="refresh-cw" size={16} color="#111111" />
            <Text style={styles.retryButtonText}>Retry Analysis</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newBtn} onPress={() => router.replace('/home')}>
            <Text style={styles.newBtnText}>Go Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: '#000000' }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home')} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analysis Result</Text>
        <Animated.View style={iconAnimStyle}>
          <TouchableOpacity
            style={[styles.saveIconBtn, alreadySaved && styles.saveIconBtnActive]}
            onPress={handleSave}
          >
            <Feather name="bookmark" size={20} color={alreadySaved ? '#FFD60A' : '#FFFFFF'} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.assetHeader}>
          <View style={styles.assetIdentity}>
            <View style={styles.flagStack}>
              <Text style={[styles.currencyFlag, styles.baseFlag]}>{currencyFlag(baseCurrency)}</Text>
              <Text style={[styles.currencyFlag, styles.quoteFlag]}>{currencyFlag(quoteCurrency)}</Text>
            </View>
            <View style={styles.assetNameWrap}>
              <Text style={styles.assetPair}>{currentAnalysis.pair}</Text>
              <Text style={styles.assetTimeframe}>{currentAnalysis.timeframe || '—'}</Text>
            </View>
          </View>
          <View style={styles.entrySummary}>
            <Text style={styles.entryCaption}>{currentPrice != null ? 'CURRENT' : 'ENTRY'}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.entryPrice}>{currentPrice != null ? formatLevelPrice(currentPrice, pair) : entryLevelText}</Text>
            <View style={[styles.directionPill, { backgroundColor: `${priceChangeColor}20` }]}>
              <Feather name={priceChangePercent == null ? (isSell || marketRead === 'bearish' ? 'trending-down' : 'trending-up') : priceChangePercent >= 0 ? 'trending-up' : 'trending-down'} size={13} color={priceChangeColor} />
              <Text style={[styles.directionPillText, { color: priceChangeColor }]}>{priceChangePercent == null ? directionLabel : `${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`}</Text>
            </View>
          </View>
        </Animated.View>

        {(isInvalid || currentAnalysis.status === 'ai_unavailable' || currentAnalysis.status === 'ai_invalid_response') ? (
          <View style={styles.resultError}>
            <Feather name="alert-triangle" size={18} color="#FF7777" />
            <Text style={styles.resultErrorText}>{currentAnalysis.analysis?.notes || currentAnalysis.message || 'Analysis could not be completed.'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/analysis')}>
              <Feather name="refresh-cw" size={15} color="#111111" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Animated.View entering={FadeIn.delay(120).duration(450)} style={styles.chartCard}>
          {currentAnalysis.imageUri ? <Image source={{ uri: currentAnalysis.imageUri }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
          <View style={[styles.chartTint, !currentAnalysis.imageUri && styles.chartEmpty]} />
          {!currentAnalysis.imageUri ? (
            <View style={styles.chartUnavailable}>
              <Feather name="image" size={20} color="#777777" />
              <Text style={styles.chartUnavailableText}>Uploaded chart preview unavailable</Text>
            </View>
          ) : null}
          <Animated.View entering={FadeInUp.delay(160).duration(500)} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg viewBox="0 0 360 220" preserveAspectRatio="none">
            {chartPaths.line ? (
              <Defs>
                <SvgLinearGradient id="analysisPriceFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={isSell ? '#FF6262' : '#39E58C'} stopOpacity="0.42" />
                  <Stop offset="1" stopColor={isSell ? '#FF6262' : '#39E58C'} stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
            ) : null}
            {chartPaths.fill ? <Path d={chartPaths.fill} fill="url(#analysisPriceFill)" /> : null}
            {chartPaths.line ? <Path d={chartPaths.line} fill="none" stroke={isSell ? '#FF6262' : '#39E58C'} strokeWidth="2.5" /> : null}
            {[35, 75, 115, 155, 195].map((y) => <Line key={`grid-${y}`} x1="0" y1={y} x2="360" y2={y} stroke="#FFFFFF" strokeOpacity="0.11" strokeDasharray="3 6" />)}
            {entryLevel !== '—' && tp1Level !== '—' ? <Rect x="0" y={Math.min(levelY('entry', entryLevel), levelY('tp1', tp1Level)) * 2.2} width="360" height={Math.abs(levelY('entry', entryLevel) - levelY('tp1', tp1Level)) * 2.2} fill="#39E58C" fillOpacity="0.08" /> : null}
            {entryLevel !== '—' && stopLevel !== '—' ? <Rect x="0" y={Math.min(levelY('entry', entryLevel), levelY('sl', stopLevel)) * 2.2} width="360" height={Math.abs(levelY('entry', entryLevel) - levelY('sl', stopLevel)) * 2.2} fill="#FF6262" fillOpacity="0.08" /> : null}
            {chartLevelValues.filter(([key, value]) => value !== '—' && (key !== 'tp2' || hasFullAnalysisAccess)).map(([key, value]) => {
              const y = levelY(key, value) * 2.2;
              const color = key === 'entry' ? '#DDEBFF' : key === 'sl' ? '#FF6262' : '#39E58C';
              return <Line key={key} x1="0" y1={y} x2="360" y2={y} stroke={color} strokeOpacity={activeLevel === key ? 1 : 0.82} strokeWidth={activeLevel === key ? 2.5 : 1.25} strokeDasharray={key === 'entry' ? undefined : '5 5'} />;
            })}
          </Svg>
          </Animated.View>
          {chartLevelValues.filter(([key, value]) => value !== '—' && (key !== 'tp2' || hasFullAnalysisAccess)).map(([key, value]) => {
            const color = key === 'entry' ? '#DDEBFF' : key === 'sl' ? '#FF6262' : '#39E58C';
            return <Animated.View key={`label-${key}`} entering={FadeInUp.delay(180).duration(350)} style={[styles.chartLevelLabel, { top: `${levelY(key, value)}%`, borderColor: `${color}80` }]}><Text numberOfLines={1} style={[styles.chartLevelText, { color }]}>{value}</Text></Animated.View>;
          })}
          <View style={styles.targetsCallout}>
            <View style={styles.calloutHeading}><Feather name="target" size={14} color="#39E58C" /><Text style={styles.targetsHeading}>TARGETS</Text></View>
            <TouchableOpacity style={styles.calloutLevelRow} onPress={() => highlightLevel('tp1')}>
            <View style={styles.targetTrack}><View style={styles.targetDot} /></View><Text style={styles.calloutLevelName}>TP1</Text><Text numberOfLines={1} style={styles.calloutLevelPrice}>{tp1LevelText}</Text>
            </TouchableOpacity>
            {usableTargetLevels.length > 1 ? (
              <TouchableOpacity style={styles.calloutLevelRow} onPress={() => hasFullAnalysisAccess ? highlightLevel('tp2') : openLockedContent('tp2')}>
                <View style={styles.targetTrack}><View style={styles.targetDot} /></View><Text style={styles.calloutLevelName}>TP2</Text><Text numberOfLines={1} style={styles.calloutLevelPrice}>{hasFullAnalysisAccess ? tp2Level : 'Unlock'}</Text>{!hasFullAnalysisAccess ? <Feather name="lock" size={10} color="#C6A94B" /> : null}
              </TouchableOpacity>
            ) : (
              <View style={styles.calloutLevelRow}><View style={styles.targetTrack}><View style={styles.targetDotMuted} /></View><Text style={styles.calloutLevelName}>TP2</Text><Text style={styles.calloutMissing}>Not provided</Text></View>
            )}
          </View>
          <TouchableOpacity style={styles.stopCallout} onPress={() => highlightLevel('sl')}>
            <View style={styles.calloutHeading}><Feather name="slash" size={14} color="#FF6262" /><Text style={styles.stopHeading}>STOP LOSS</Text></View>
            <View style={styles.calloutLevelRow}><View style={[styles.targetTrack, styles.stopTrack]}><View style={styles.stopDot} /></View><Text numberOfLines={1} style={styles.stopPrice}>{stopLevelText}</Text></View>
            <Text style={styles.stopDistance}>{stopDistance != null ? `${stopDistance} pips from entry` : 'Distance unavailable'}</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.segmentedControl}>
          <TouchableOpacity style={[styles.segment, activeTab === 'analysis' && styles.segmentSelected]} onPress={() => selectTab('analysis')}><Text style={[styles.segmentText, activeTab === 'analysis' && styles.segmentTextSelected]}>Our Analysis</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.segment, activeTab === 'insights' && styles.segmentSelected]} onPress={() => selectTab('insights')}><Text style={[styles.segmentText, activeTab === 'insights' && styles.segmentTextSelected]}>Insights</Text></TouchableOpacity>
        </View>

        {activeTab === 'analysis' ? (
          <>
            <Animated.View entering={FadeInUp.duration(350)} style={styles.verdictCard}>
              <View style={styles.verdictTop}><Text style={styles.sectionTitle}>MARKET READ</Text><View style={[styles.verdictBadge, { backgroundColor: `${directionColor}20` }]}><View style={[styles.verdictDot, { backgroundColor: directionColor }]} /><Text style={[styles.verdictText, { color: directionColor }]}>{directionLabel}</Text></View></View>
              <View style={styles.confidenceLine}><Text style={styles.bodyMuted}>Trade readiness</Text><Text style={styles.confidenceText}>{readinessText}</Text></View>
              <View style={styles.confidenceLine}><Text style={styles.bodyMuted}>Evidence score</Text><Text style={styles.confidenceText}>{confidenceLabel} · {confidence}%</Text></View>
              <View style={styles.confidenceTrack}><View style={[styles.confidenceProgress, { width: `${Math.max(0, Math.min(confidence, 100))}%`, backgroundColor: directionColor }]} /></View>
            </Animated.View>
            <View style={styles.levelsCard}>
              <Text style={styles.sectionTitle}>TRADE LEVELS</Text>
              <TradeLevelRow label="Entry" value={entryLevelText} /><View style={styles.tableDivider} />
              <TradeLevelRow label="Stop Loss" value={stopLevelText} color="#FF6262" /><View style={styles.tableDivider} />
              <TradeLevelRow label="Take Profit 1" value={tp1LevelText} color="#39E58C" /><View style={styles.tableDivider} />
              <TradeLevelRow label="Take Profit 2" value={usableTargetLevels.length > 1 ? (hasFullAnalysisAccess ? tp2Level : '••••••') : 'Not provided'} color="#39E58C" locked={!hasFullAnalysisAccess && usableTargetLevels.length > 1} onPress={() => openLockedContent('tp2')} /><View style={styles.tableDivider} />
                <TradeLevelRow label="Risk : Reward" value={hasFullAnalysisAccess ? riskRewardText : '••••'} color="#39E58C" locked={!hasFullAnalysisAccess} onPress={() => openLockedContent('risk-reward')} />
            </View>
            <View style={styles.levelsCard}>
              <TouchableOpacity style={styles.aiHeading} onPress={() => {
                if (!hasFullAnalysisAccess) { openLockedContent('ai-analysis'); return; }
                setAnalysisExpanded((expanded) => !expanded);
                trackEvent('analysis_expanded', { expanded: !analysisExpanded });
              }}>
                <View><Text style={styles.sectionTitle}>AI ANALYSIS</Text><Text style={styles.bodyMuted}>{hasFullAnalysisAccess ? (isNoTrade ? 'Reasoning behind this market read' : analysisExpanded ? 'Reasoning behind this setup' : 'Read more about this setup') : 'Premium insight · Tap to unlock'}</Text></View>
                <Feather name={hasFullAnalysisAccess && analysisExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#BDBDBD" />
              </TouchableOpacity>
              {hasFullAnalysisAccess && analysisExpanded ? (
                <View style={styles.reasoningList}>{(reasoning.length ? reasoning : ['No additional reasoning was provided for this setup.']).map((reason, index) => <View key={`${index}-${reason}`} style={styles.reasoningRow}><View style={styles.reasoningBullet} /><Text style={styles.reasoningText}>{reason}</Text></View>)}</View>
              ) : !hasFullAnalysisAccess ? (
                <View style={styles.lockedReasoning}><View pointerEvents="none" style={styles.lockedReasoningPreview}>{(reasoning.length ? reasoning.slice(0, 3) : ['Trend and structure analysis', 'Key levels and confluence']).map((reason, index) => <Text key={`${index}-${reason}`} numberOfLines={1} style={styles.reasoningText}>{`• ${reason}`}</Text>)}<BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} /></View><TouchableOpacity style={styles.unlockButton} onPress={() => openLockedContent('ai-analysis')}><Feather name="lock" size={14} color="#111111" /><Text style={styles.unlockButtonText}>Unlock full analysis</Text></TouchableOpacity></View>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.levelsCard}><Text style={styles.sectionTitle}>SUPPORT & RESISTANCE</Text><TradeLevelRow label="Support" value={supportLevels} color="#39E58C" /><View style={styles.tableDivider} /><TradeLevelRow label="Resistance" value={resistanceLevels} color="#FF7777" /></View>
            <View style={styles.levelsCard}><Text style={styles.sectionTitle}>TREND & PATTERN</Text><TradeLevelRow label="Trend" value={currentAnalysis.analysis?.trend || currentAnalysis.marketBias || 'Not identified'} /><View style={styles.tableDivider} /><TradeLevelRow label="Structure" value={currentAnalysis.analysis?.structure || 'Not identified'} />{currentAnalysis.multiTimeframe ? <><View style={styles.tableDivider} /><TradeLevelRow label="Timeframe alignment" value={currentAnalysis.multiTimeframe.alignment} color={currentAnalysis.multiTimeframe.alignment === 'aligned' ? '#39E58C' : '#FFC857'} /></> : null}</View>
            <View style={styles.levelsCard}>
              <Text style={styles.sectionTitle}>RISK NOTES</Text>
              {[...(currentAnalysis.whyNotNow ?? []), ...(currentAnalysis.dataLimitations ?? []), ...(currentAnalysis.rrIssues ?? [])].length
                ? [...(currentAnalysis.whyNotNow ?? []), ...(currentAnalysis.dataLimitations ?? []), ...(currentAnalysis.rrIssues ?? [])].map((note, index) => <View key={`${index}-${note}`} style={styles.reasoningRow}><Feather name="alert-circle" size={14} color="#FFC857" /><Text style={styles.reasoningText}>{note}</Text></View>)
                : <Text style={styles.reasoningText}>No additional risk notes provided.</Text>}
            </View>
          </>
        )}
        <Text style={styles.resultDisclaimer}>AI analysis, not financial advice. Always use appropriate risk management.</Text>
        <View style={styles.resultActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => void handleShare()} disabled={shareDisabled}>{shareDisabled ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="share-2" size={16} color="#FFFFFF" />}<Text style={styles.actionButtonText}>Share</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, alreadySaved && styles.actionButtonDisabled]} onPress={handleSave} disabled={alreadySaved}><Feather name="bookmark" size={16} color="#FFFFFF" /><Text style={styles.actionButtonText}>{alreadySaved ? 'Saved' : 'Save to History'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => void handleCopy()}><Feather name="copy" size={16} color="#FFFFFF" /><Text style={styles.actionButtonText}>Copy levels</Text></TouchableOpacity>
        </View>
        {shareError ? <View style={styles.shareErrorBox}><Text style={styles.shareErrorTitle}>Couldn't create the share card.</Text><TouchableOpacity style={styles.shareRetryBtn} onPress={() => void handleShare()}><Text style={styles.shareRetryText}>Try again</Text></TouchableOpacity></View> : null}
      </ScrollView>

      {/* Keep the card attached to the native view tree, behind the result screen, for capture. */}
      <View style={styles.hiddenShareContainer}>
        <AnalysisShareCard
          key={currentAnalysis.id}
          ref={shareCardRef}
          analysis={shareAnalysis}
          isPremium={hasFullAnalysisAccess}
          colors={colors}
          onReady={() => {
            console.log('[AnalysisShare] share card signalled ready');
            shareReadyRef.current = true;
          }}
        />
      </View>

      <Toast visible={toastVisible} message={toastMessage} />
      <RatingPromptModal visible={ratingPromptVisible} onDismiss={() => setRatingPromptVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  assetHeader: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 12,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 16,
  },
  assetIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 },
  flagStack: { width: 48, height: 36, justifyContent: 'center' },
  currencyFlag: {
    width: 30,
    height: 30,
    position: 'absolute',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 22,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#202020',
    borderWidth: 2,
    borderColor: '#151515',
  },
  baseFlag: { left: 0, zIndex: 1 },
  quoteFlag: { left: 17, zIndex: 2 },
  assetNameWrap: { flex: 1, minWidth: 0, gap: 5 },
  assetPair: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  assetTimeframe: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#282828',
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: '#CFCFCF',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  entrySummary: { maxWidth: '48%', alignItems: 'flex-end', gap: 2 },
  entryCaption: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: '#9A9A9A', letterSpacing: 1 },
  entryPrice: { maxWidth: '100%', fontSize: 21, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  directionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  directionPillText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  resultError: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#281717', borderWidth: 1, borderColor: '#633333' },
  resultErrorText: { flex: 1, minWidth: 0, color: '#F0DADA', fontSize: 12, lineHeight: 17 },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: '#F5F5F5' },
  retryButtonText: { color: '#111111', fontSize: 11, fontFamily: 'Inter_700Bold' },
  failedAnalysisState: { flexGrow: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 20 },
  failedAnalysisImage: { width: '100%', height: 300, borderRadius: 16, backgroundColor: '#151515' },
  failedAnalysisMessage: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#281717', borderWidth: 1, borderColor: '#633333' },
  failedAnalysisRetry: { minHeight: 46, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: '#39E58C' },
  chartCard: {
    height: 270,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#111713',
    borderWidth: 1,
    borderColor: '#303630',
  },
  chartTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.34)' },
  chartEmpty: { backgroundColor: '#111713' },
  chartUnavailable: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  chartUnavailableText: { color: '#777777', fontSize: 11, fontFamily: 'Inter_500Medium' },
  chartLevelLabel: {
    position: 'absolute',
    right: 5,
    maxWidth: 84,
    minWidth: 48,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: '#101010E8',
    zIndex: 2,
  },
  chartLevelText: { fontSize: 9, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  targetsCallout: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 143,
    padding: 9,
    gap: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(15,25,20,0.96)',
    borderWidth: 1,
    borderColor: '#28643F',
    elevation: 5,
  },
  calloutHeading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  targetsHeading: { color: '#39E58C', fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  stopHeading: { color: '#FF7777', fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  calloutLevelRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 5 },
  targetTrack: { width: 9, height: 18, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderStyle: 'dotted', borderColor: '#39E58C' },
  targetDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#39E58C' },
  targetDotMuted: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#737373' },
  calloutLevelName: { width: 24, color: '#B9C8BE', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  calloutLevelPrice: { flex: 1, minWidth: 0, color: '#FFFFFF', textAlign: 'right', fontSize: 10, fontFamily: 'Inter_700Bold' },
  calloutMissing: { flex: 1, minWidth: 0, color: '#929292', textAlign: 'right', fontSize: 8, fontFamily: 'Inter_500Medium' },
  stopCallout: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 143,
    padding: 9,
    gap: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(32,17,17,0.96)',
    borderWidth: 1,
    borderColor: '#6C3030',
    elevation: 5,
  },
  stopTrack: { borderColor: '#FF6262' },
  stopDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6262' },
  stopPrice: { flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold' },
  stopDistance: { paddingLeft: 14, color: '#B89191', fontSize: 9, fontFamily: 'Inter_500Medium' },
  segmentedControl: { width: '100%', flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: '#151515', borderWidth: 1, borderColor: '#292929' },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentSelected: { backgroundColor: '#2A2A2A' },
  segmentText: { color: '#939393', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  segmentTextSelected: { color: '#FFFFFF' },
  verdictCard: { gap: 12, padding: 15, borderRadius: 15, backgroundColor: '#161616', borderWidth: 1, borderColor: '#303030' },
  verdictTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: '#A2A2A2', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  verdictDot: { width: 7, height: 7, borderRadius: 4 },
  verdictText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  confidenceLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bodyMuted: { color: '#969696', fontSize: 12, fontFamily: 'Inter_400Regular' },
  confidenceText: { color: '#F1F1F1', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  confidenceTrack: { height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: '#303030' },
  confidenceProgress: { height: '100%', borderRadius: 2 },
  levelTableRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  levelTableLabel: { flex: 1, color: '#A6A6A6', fontSize: 12, fontFamily: 'Inter_500Medium' },
  levelTableValueWrap: { position: 'relative', maxWidth: '58%', minWidth: 50, minHeight: 22, alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' },
  levelTableValue: { fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  lockedValue: { color: '#8F8F8F' },
  tableDivider: { height: 1, backgroundColor: '#292929' },
  aiHeading: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  lockedReasoning: { gap: 10 },
  lockedReasoningPreview: { position: 'relative', overflow: 'hidden', gap: 8, paddingVertical: 4 },
  unlockButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: '#F2F2F2' },
  unlockButtonText: { color: '#111111', fontSize: 12, fontFamily: 'Inter_700Bold' },
  reasoningList: { gap: 11, paddingTop: 2 },
  reasoningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reasoningBullet: { width: 6, height: 6, marginTop: 5, borderRadius: 3, backgroundColor: '#39E58C' },
  reasoningText: { flex: 1, color: '#D0D0D0', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  resultDisclaimer: { color: '#777777', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionButton: { minHeight: 42, flex: 1, minWidth: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 7, borderRadius: 11, backgroundColor: '#202020', borderWidth: 1, borderColor: '#333333' },
  actionButtonText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actionButtonDisabled: { opacity: 0.55 },
  loadingState: { flex: 1, justifyContent: 'center', gap: 18, paddingHorizontal: 20 },
  skeletonBlock: { height: 70, borderRadius: 14, backgroundColor: '#1C1C1C' },
  skeletonChart: { height: 250 },
  skeletonRow: { height: 90 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  saveIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  saveIconBtnActive: { backgroundColor: '#1A1600', borderColor: '#3D3400' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  directionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    gap: 14,
  },
  directionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 50,
  },
  directionText: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  pairText: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  confidenceLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  confidenceValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  progressBar: {
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  levelsCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 14,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataLabel: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  dataValue: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  chartNotes: { color: '#C7C7CC', fontSize: 13, lineHeight: 19 },
  divider: { height: 1, backgroundColor: '#2A2A2A' },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    lineHeight: 18,
  },
  actions: { gap: 10 },
  shareErrorBox: { backgroundColor: '#241313', borderWidth: 1, borderColor: '#6E2B2B', borderRadius: 14, padding: 14, gap: 12 },
  shareErrorTitle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  shareErrorActions: { flexDirection: 'row', gap: 9 },
  shareRetryBtn: { minHeight: 38, flex: 1, borderRadius: 11, backgroundColor: '#00E676', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shareRetryText: { color: '#000000', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  shareCopyBtn: { minHeight: 38, flex: 1, borderRadius: 11, backgroundColor: '#2A2A2A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shareCopyText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  hiddenShareContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1080,
    height: 1400,
    zIndex: -1,
    pointerEvents: 'none',
    backgroundColor: '#000000',
  },
  shareCard: {
    width: 1080,
    minHeight: 1400,
    backgroundColor: '#000000',
    padding: 64,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    justifyContent: 'space-between',
  },
  shareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareLogo: {
    fontSize: 34,
    fontFamily: 'Inter_800ExtraBold',
    color: '#FFFFFF',
  },
  shareDirectionBadge: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  shareDirectionText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  sharePair: {
    marginTop: 32,
    fontSize: 88,
    fontFamily: 'Inter_800ExtraBold',
    color: '#FFFFFF',
  },
  shareConfidenceLabel: {
    marginTop: 48,
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
  },
  shareConfidenceRow: {
    marginTop: 12,
    gap: 18,
  },
  shareConfidenceValue: {
    fontSize: 70,
    fontFamily: 'Inter_800ExtraBold',
    color: '#FFFFFF',
  },
  shareProgressBar: {
    height: 16,
    backgroundColor: '#111111',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 16,
  },
  shareProgressFill: {
    height: '100%',
    borderRadius: 8,
  },
  shareDivider: {
    marginTop: 48,
    height: 1,
    backgroundColor: '#212121',
  },
  shareLevelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
  },
  shareLabel: {
    fontSize: 20,
    fontFamily: 'Inter_500Medium',
    color: '#8E8E93',
  },
  shareValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  shareFooter: {
    marginTop: 60,
  },
  shareFooterText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#8E8E93',
  },
  shareWatermark: {
    marginTop: 28,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
    opacity: 0.18,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  copyBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  actionRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  saveBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#000' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  newBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    marginBottom: 20,
  },
  toast: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A2A1A',
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#1A3D26',
  },
  toastText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
});
