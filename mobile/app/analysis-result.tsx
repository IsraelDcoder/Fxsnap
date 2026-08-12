import React, { useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import { shareAsync } from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
// Import expo-file-system dynamically to avoid static TS resolution errors in environments
// where the native module is not available (editor/tooling). Fall back to a no-op shim.
let FileSystem: any;
try {
  // @ts-ignore
  FileSystem = require('expo-file-system');
} catch (err) {
  // Fallback shim used in web/editor environments to avoid crashes while still
  // allowing development of the share flow. getInfoAsync returns a non-existing file.
  // Real devices with Expo will have the real module available at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  FileSystem = {
    getInfoAsync: async (_uri: string) => ({ exists: false, size: 0 }),
  };
}
import { useApp } from '@/context/AppContext';
import type { AnalysisResult } from '@/context/AppContext';
import AnalysisShareCard from '../components/AnalysisShareCard';
import { useColors } from '@/hooks/useColors';

// ─── Staggered data row ───────────────────────────────────────────────────────
function DataRow({
  label,
  value,
  valueColor,
  delay,
}: {
  label: string;
  value: string;
  valueColor?: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInLeft.delay(delay).duration(450)} style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </Animated.View>
  );
}

// Breakdown row with icon and animated bar
function BreakdownRow({ label, value, color, icon, delay }: { label: string; value: number | null | undefined; color?: string; icon?: string; delay: number }) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    const numericValue = typeof value === 'number' && !Number.isNaN(value) ? Math.max(0, Math.min(100, value)) : 0;
    const t = setTimeout(() => {
      progress.value = withTiming(numericValue, { duration: 800 });
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const displayText = typeof value === 'number' && !Number.isNaN(value) ? `${Math.round(value)}%` : 'N/A';

  return (
    <Animated.View entering={FadeInLeft.delay(delay).duration(450)} style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Feather name={icon as any} size={14} color={color || '#00E676'} /> : null}
          <Text style={[styles.dataLabel, { color: '#8E8E93' }]}>{label}</Text>
        </View>
        <Text style={[styles.dataValue, { color: color || '#00E676', fontSize: 13 }]}>{displayText}</Text>
      </View>
      <View style={[styles.progressBar, { marginTop: 8 }]}>
        <Animated.View style={[styles.progressFill, barStyle, { backgroundColor: color || '#00E676' }]} />
      </View>
    </Animated.View>
  );
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

export default function AnalysisResultScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { currentAnalysis, saveAnalysis, savedAnalyses } = useApp();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [shareDisabled, setShareDisabled] = useState(false);
  const shareCardRef = useRef<View | null>(null);
  const shareReadyRef = React.useRef(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isBuy = currentAnalysis?.direction === 'BUY';
  const isSell = currentAnalysis?.direction === 'SELL';
  const isNoTrade = currentAnalysis?.status === 'no_trade';
  const isInvalid = currentAnalysis?.status === 'invalid_image';
  const directionColor = isBuy ? '#00E676' : isSell ? '#FF5252' : '#8E8E93';
  const alreadySaved = savedAnalyses.some((a) => a.id === currentAnalysis?.id);

  // Legacy saved analyses store entry/sl/tp directly; new shape stores
  // tradeSetup + analysis + zones.
  const hasTradeLevels = Boolean(currentAnalysis?.entry && currentAnalysis?.sl && currentAnalysis?.tp);
  const hasTradeSetup = Boolean(currentAnalysis?.tradeSetup?.type && currentAnalysis.tradeSetup.type !== 'none');
  const hasPriceAction = Boolean(currentAnalysis?.analysis);
  const hasZones = Boolean(currentAnalysis?.zones);

  const saveIconScale = useSharedValue(1);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const handleSave = () => {
    if (!currentAnalysis || alreadySaved) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveAnalysis(currentAnalysis);
    saveIconScale.value = withSpring(1.3, { damping: 10, stiffness: 300 }, () => {
      saveIconScale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    showToast('Analysis saved successfully');
  };

  const handleShare = async () => {
    if (!currentAnalysis) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'web' || !shareCardRef.current) {
      await handleCopy();
      showToast('Analysis copied to clipboard for sharing');
      return;
    }

    try {
      setShareDisabled(true);
      // Ensure the share card has time to layout and fonts to load
      console.log('[AnalysisShare] Mounting share card and waiting for render');
      // Wait for the share card onReady signal (polled), timeout after 2s
      const waitForReady = async (timeout = 2000) => {
        const start = Date.now();
        while (!shareReadyRef.current && Date.now() - start < timeout) {
          // small sleep
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 50));
        }
        return shareReadyRef.current;
      };
      const ready = await waitForReady(2000);
      console.log('[AnalysisShare] share card ready flag:', ready);

      console.log('[AnalysisShare] Capturing share card via base64 fallback');
      // Use base64 capture as it is more reliable across platforms and avoids tmpfile path issues
      const base64 = await captureRef(shareCardRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'base64',
      });
      console.log('[AnalysisShare] capture base64 length:', base64 ? base64.length : 0);

      if (!base64) throw new Error('No base64 returned from captureRef');
      const tmpUri = FileSystem.cacheDirectory + `fxsnap-share-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(tmpUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      try {
        const info = await FileSystem.getInfoAsync(tmpUri);
        console.log('[AnalysisShare] written file info:', info);
        if (!info.exists || !(info.size && info.size > 0)) throw new Error('Written tmp file missing');
      } catch (fsErr) {
        console.error('[AnalysisShare] File verification failed after write', fsErr);
        throw fsErr;
      }

      let shareUri = tmpUri;
      if (Platform.OS === 'android' && typeof tmpUri === 'string' && !tmpUri.startsWith('file://')) {
        shareUri = `file://${tmpUri}`;
      }
      await shareAsync(shareUri, { mimeType: 'image/png' });
      showToast('Share card ready to share');
      try { await FileSystem.deleteAsync(tmpUri, { idempotent: true }); } catch (e) { /* ignore cleanup errors */ }
    } catch (error) {
      // Detailed logging for debugging
      console.error('[AnalysisShare] Image generation failed', error);
      try {
        // verify ref and presence
        console.error('[AnalysisShare] shareCardRef.current:', shareCardRef.current);
      } catch (inner) {
        console.error('[AnalysisShare] shareCardRef.inspect failed', inner);
      }

      // Fallback: copy to clipboard but inform user this is a fallback
      await handleCopy();
      showToast('Could not create share image. Analysis copied to clipboard as a fallback.');
    } finally {
      setShareDisabled(false);
    }
  };

  const handleCopy = async () => {
    if (!currentAnalysis) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lines: string[] = [];
    if (isNoTrade) {
      lines.push('🔒 FXSnap — No High-Confidence Setup');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      lines.push(`Confidence: ${currentAnalysis.confidence}%`);
      lines.push(`Market Bias: ${currentAnalysis.marketBias || 'neutral'}`);
      lines.push(`Setup Status: ${currentAnalysis.setupStatus || 'NO_SETUP'}`);
      if (currentAnalysis.analysis?.notes) lines.push(`Notes: ${currentAnalysis.analysis.notes}`);
      if (currentAnalysis.whyNotNow?.length) {
        lines.push('');
        lines.push('Why Not Now:');
        currentAnalysis.whyNotNow.forEach((reason) => lines.push(`- ${reason}`));
      }
    } else if (isInvalid) {
      lines.push('⚠️ FXSnap — Invalid Chart Image');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      if (currentAnalysis.analysis?.notes) lines.push(`Notes: ${currentAnalysis.analysis.notes}`);
    } else {
      const dir = isBuy ? 'BUY ↑' : isSell ? 'SELL ↓' : '—';
      lines.push('🎯 FXSnap Signal');
      lines.push('');
      lines.push(`Pair: ${currentAnalysis.pair}`);
      lines.push(`Direction: ${dir}`);
      lines.push(`Confidence: ${currentAnalysis.confidence}%`);
      lines.push(`Market Bias: ${currentAnalysis.marketBias || 'neutral'}`);
      lines.push(`Setup Status: ${currentAnalysis.setupStatus || 'NO_SETUP'}`);
      lines.push('');
      if (hasTradeSetup && currentAnalysis.tradeSetup) {
        lines.push(`Entry:       ${currentAnalysis.tradeSetup.entryZone}`);
        lines.push(`Stop Loss:   ${currentAnalysis.tradeSetup.stopLoss}`);
        lines.push(`Take Profit: ${currentAnalysis.tradeSetup.takeProfit}`);
        lines.push(`Risk/Reward: ${currentAnalysis.tradeSetup.riskReward}`);
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

  if (!currentAnalysis) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }]}>
        <Text style={styles.emptyText}>No analysis available.</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.replace('/home')}>
          <Text style={styles.newBtnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.replace('/home')}>
          <Feather name="x" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analysis Result</Text>
        <Animated.View style={iconAnimStyle}>
          <TouchableOpacity
            style={[styles.saveIconBtn, alreadySaved && styles.saveIconBtnActive, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
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
        {/* ── Status / direction card ── */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(500)}
          style={[styles.directionCard, { borderColor: directionColor + '40' }]}
        >
          <View style={styles.directionTop}>
            <Animated.View
              entering={FadeIn.delay(150).duration(400)}
              style={[styles.directionBadge, { backgroundColor: isBuy || isSell ? directionColor + '20' : '#1A1A1A' }]}
            >
              {isBuy || isSell ? (
                <Feather
                  name={isBuy ? 'trending-up' : 'trending-down'}
                  size={20}
                  color={directionColor}
                />
              ) : (
                <Feather name="shield" size={20} color="#8E8E93" />
              )}
              <Text style={[styles.directionText, { color: directionColor }]}>
                {isNoTrade ? 'NO TRADE' : isInvalid ? 'INVALID IMAGE' : currentAnalysis.direction || '—'}
              </Text>
            </Animated.View>
            <Animated.Text entering={FadeIn.delay(200).duration(400)} style={styles.pairText}>
              {currentAnalysis.pair}
            </Animated.Text>
          </View>

          <Animated.View entering={FadeInDown.delay(350).duration(500)}>
            <View style={styles.confidenceRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.confidenceLabel, { color: colors.textSecondary }]}>Market Confidence</Text>
                <Text style={[styles.confidenceValue, { color: directionColor }]}>
                  {typeof currentAnalysis.marketConfidence === 'number' ? `${currentAnalysis.marketConfidence}%` : `${currentAnalysis.confidence}%`}
                </Text>
                <View style={styles.progressBar}>
                  <Animated.View
                    entering={FadeIn.delay(500).duration(900)}
                    style={[
                      styles.progressFill,
                      { width: `${currentAnalysis.marketConfidence ?? currentAnalysis.confidence}%` as any, backgroundColor: directionColor },
                    ]}
                  />
                </View>
              </View>

              <View style={{ width: 140, marginLeft: 12 }}>
                <Text style={[styles.confidenceLabel, { color: colors.textSecondary }]}>Setup / Entry</Text>
                <Text style={[styles.confidenceValue, { color: directionColor }]}>
                  {currentAnalysis.setupConfidence ?? 0}% / {currentAnalysis.entryReadiness ?? 0}%
                </Text>
              </View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* ── Trade setup (new shape) ── */}
        {hasTradeSetup && currentAnalysis.tradeSetup && (
          <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Trade Setup</Text>
            <DataRow label="Type" value={currentAnalysis.tradeSetup.type.toUpperCase()} valueColor={currentAnalysis.tradeSetup.type === 'buy' ? '#00E676' : currentAnalysis.tradeSetup.type === 'sell' ? '#FF5252' : '#8E8E93'} delay={550} />
            <View style={styles.divider} />
            <DataRow label="Entry Zone" value={currentAnalysis.tradeSetup.entryZone} valueColor="#FFFFFF" delay={620} />
            <View style={styles.divider} />
            <DataRow label="Stop Loss" value={currentAnalysis.tradeSetup.stopLoss} valueColor="#FF5252" delay={690} />
            <View style={styles.divider} />
            <DataRow label="Take Profit" value={currentAnalysis.tradeSetup.takeProfit} valueColor="#00E676" delay={760} />
            <View style={styles.divider} />
            <DataRow label="Risk/Reward" value={String(currentAnalysis.tradeSetup.riskReward)} valueColor={Number(currentAnalysis.tradeSetup.riskReward) >= 1.5 ? '#00E676' : '#FF9F0A'} delay={830} />
          </Animated.View>
        )}

        {/* ── Price action analysis (new shape) ── */}
        {hasPriceAction && currentAnalysis.analysis && (
          <Animated.View entering={FadeInUp.delay(900).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Price Action</Text>
            <DataRow label="Trend" value={currentAnalysis.analysis.trend} delay={950} />
            <View style={styles.divider} />
            <DataRow label="Structure" value={currentAnalysis.analysis.structure || '—'} delay={1010} />
            <View style={styles.divider} />
            <DataRow label="Volatility" value={currentAnalysis.analysis.volatility} delay={1070} />
            <View style={styles.divider} />
            <DataRow label="Volume" value={currentAnalysis.analysis.volume} delay={1130} />
            <View style={styles.divider} />
            <DataRow label="Sentiment" value={currentAnalysis.analysis.sentiment} delay={1190} />
            <View style={styles.divider} />
            <DataRow label="Indicators" value={currentAnalysis.analysis.indicators || 'none'} delay={1250} />
            {currentAnalysis.analysis.notes ? (
              <>
                <View style={styles.divider} />
                <DataRow label="Notes" value={currentAnalysis.analysis.notes} delay={1310} />
              </>
            ) : null}
          </Animated.View>
        )}

        {/* ── Key zones (new shape) ── */}
        {hasZones && currentAnalysis.zones && (
          <Animated.View entering={FadeInUp.delay(950).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Key Zones</Text>
            <DataRow label="Support" value={currentAnalysis.zones.support} valueColor="#00E676" delay={1000} />
            <View style={styles.divider} />
            <DataRow label="Resistance" value={currentAnalysis.zones.resistance} valueColor="#FF5252" delay={1060} />
            <View style={styles.divider} />
            <DataRow label="Liquidity" value={currentAnalysis.zones.liquidity} delay={1120} />
          </Animated.View>
        )}

        {/* ── Legacy trade levels (old saved entries) ── */}
        {hasTradeLevels && !hasTradeSetup && (
          <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Trade Levels</Text>
            <DataRow label="Entry" value={currentAnalysis.entry ?? '—'} valueColor="#FFFFFF" delay={550} />
            <View style={styles.divider} />
            <DataRow label="Stop Loss" value={currentAnalysis.sl ?? '—'} valueColor="#FF5252" delay={680} />
            <View style={styles.divider} />
            <DataRow label="Take Profit" value={currentAnalysis.tp ?? '—'} valueColor="#00E676" delay={810} />
          </Animated.View>
        )}

        {/* ── Legacy risk management (old saved entries) ── */}
        {hasTradeLevels && !hasTradeSetup && (
          <Animated.View entering={FadeInUp.delay(900).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Risk Management</Text>
            <DataRow label="Lot Size" value={currentAnalysis.lotSize ? currentAnalysis.lotSize.toFixed(2) : '—'} delay={950} />
            <View style={styles.divider} />
            <DataRow label="SL Distance" value={currentAnalysis.slPips ? `${currentAnalysis.slPips} pips` : '—'} delay={1050} />
            <View style={styles.divider} />
            <DataRow label="Risk/Reward" value="1:2 (minimum)" delay={1150} />
          </Animated.View>
        )}

        {/* ── Chart observations (legacy) ── */}
        {currentAnalysis.chartAnalysis && (
          <Animated.View entering={FadeInUp.delay(1180).duration(500)} style={[styles.levelsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>AI chart observations</Text>
            <DataRow label="Chart confidence" value={`${currentAnalysis.chartAnalysis.confidence}%`} delay={1200} />
            {currentAnalysis.chartAnalysis.timeframe && <DataRow label="Timeframe" value={currentAnalysis.chartAnalysis.timeframe} delay={1250} />}
            {currentAnalysis.chartAnalysis.trend && <DataRow label="Visual trend" value={currentAnalysis.chartAnalysis.trend} delay={1300} />}
            {currentAnalysis.chartAnalysis.indicators?.length ? <Text style={styles.chartNotes}>Indicators: {currentAnalysis.chartAnalysis.indicators.join(', ')}</Text> : null}
            {currentAnalysis.chartAnalysis.chartNotes?.length ? <Text style={styles.chartNotes}>{currentAnalysis.chartAnalysis.chartNotes.join(' ')}</Text> : null}
            {currentAnalysis.chartAnalysis.fusionReason && <Text style={styles.chartNotes}>{currentAnalysis.chartAnalysis.fusionReason}</Text>}
          </Animated.View>
        )}

        {/* ── Explainable breakdown & diagnostics ── */}
        {(currentAnalysis.breakdown || (currentAnalysis.whyNotNow && currentAnalysis.whyNotNow.length) || (currentAnalysis.dataLimitations && currentAnalysis.dataLimitations.length)) && (
          <Animated.View entering={FadeInUp.delay(1220).duration(500)} style={styles.levelsCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Explainable Breakdown</Text>
            {/* Bars for each factor */}
            {currentAnalysis.breakdown ? (
              <>
                <View style={{ marginTop: 6 }} />
                {(() => {
                  const map = [
                    { key: 'trend', label: 'Trend', icon: 'trending-up', color: '#7C4DFF' },
                    { key: 'zone', label: 'Zone', icon: 'map-pin', color: '#00E676' },
                    { key: 'priceLocation', label: 'Price Location', icon: 'layers', color: '#FFD60A' },
                    { key: 'liquidity', label: 'Liquidity', icon: 'wind', color: '#00BCD4' },
                    { key: 'confirmation', label: 'Confirmation', icon: 'check-circle', color: '#4CAF50' },
                    { key: 'bos', label: 'Break of Structure', icon: 'zap', color: '#FF5252' },
                    { key: 'rsi', label: 'RSI', icon: 'bar-chart-2', color: '#FF9F0A' },
                  ];
                  return map.map((m, i) => {
                    const val = (currentAnalysis.breakdown as any)[m.key];
                    return <BreakdownRow key={m.key} label={m.label} value={val} color={m.color} icon={m.icon} delay={600 + i * 80} />;
                  });
                })()}
              </>
            ) : null}

            {/* Why not now */}
            {currentAnalysis.whyNotNow && currentAnalysis.whyNotNow.length ? (
              <>
                <View style={styles.divider} />
                <Text style={[styles.cardTitle, { color: colors.text, marginTop: 8 }]}>Why Not Now</Text>
                {currentAnalysis.whyNotNow.map((reason, idx) => (
                  <Text key={idx} style={[styles.chartNotes, { marginTop: 6 }]}>{`• ${reason}`}</Text>
                ))}
              </>
            ) : null}

            {/* Data limitations */}
            {currentAnalysis.dataLimitations && currentAnalysis.dataLimitations.length ? (
              <>
                <View style={styles.divider} />
                <Text style={[styles.cardTitle, { color: colors.text, marginTop: 8 }]}>Data Limitations</Text>
                {currentAnalysis.dataLimitations.map((d, i) => (
                  <Text key={i} style={[styles.chartNotes, { marginTop: 6 }]}>{`• ${d}`}</Text>
                ))}
              </>
            ) : null}
          </Animated.View>
        )}

        {/* ── Disclaimer ── */}
        <Animated.View entering={FadeInUp.delay(1200).duration(500)} style={[styles.disclaimerBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="alert-circle" size={14} color="#48484A" />
          <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
            This is not financial advice. Always use proper risk management and consult a professional before trading.
          </Text>
        </Animated.View>

        {/* ── Actions ── */}
        <Animated.View entering={FadeInUp.delay(1350).duration(500)} style={styles.actions}>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
            <Feather name="copy" size={17} color="#FFFFFF" />
            <Text style={styles.copyBtnText}>{isNoTrade || isInvalid ? 'Copy Analysis' : 'Copy Signal'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, shareDisabled && styles.disabledBtn]}
            onPress={handleShare}
            disabled={shareDisabled}
          >
            <Feather name="share-2" size={17} color="#FFFFFF" />
            <Text style={styles.copyBtnText}>Share</Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            {!alreadySaved && (
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleSave}>
                <Feather name="bookmark" size={17} color="#000" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.newBtn, { flex: 1 }]} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace('/analysis');
            }}>
              <Feather name="plus" size={17} color="#FFFFFF" />
              <Text style={styles.newBtnText}>New Analysis</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {/* RR Issues display for diagnostics */}
      {currentAnalysis.rrIssues && currentAnalysis.rrIssues.length ? (
        <Animated.View entering={FadeInUp.delay(1400).duration(400)} style={[styles.levelsCard, { margin: 16, backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>RR Diagnostics</Text>
          {currentAnalysis.rrIssues.map((ri: string, idx: number) => (
            <Text key={idx} style={[styles.chartNotes, { marginTop: 8, color: colors.textSecondary }]}>{`• ${ri}`}</Text>
          ))}
        </Animated.View>
      ) : null}

      {/* Share card is placed off-screen but visible to view-shot. We set opacity: 0 and position far off-screen to avoid capture of UI chrome. */}
      <View style={styles.hiddenShareContainer}>
        <AnalysisShareCard
          ref={shareCardRef}
          analysis={currentAnalysis}
          colors={colors}
          onReady={() => {
            console.log('[AnalysisShare] share card signalled ready');
            shareReadyRef.current = true;
          }}
        />
      </View>

      <Toast visible={toastVisible} message={toastMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
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
  hiddenShareContainer: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    opacity: 0,
    width: 1080,
    height: 1400,
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

