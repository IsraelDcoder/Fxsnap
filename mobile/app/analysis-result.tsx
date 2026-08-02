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
import { useApp } from '@/context/AppContext';
import type { AnalysisResult } from '@/context/AppContext';
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
  const hasTradeSetup = Boolean(currentAnalysis?.tradeSetup);
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
      const uri = await captureRef(shareCardRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      await shareAsync(uri, { mimeType: 'image/png' });
      showToast('Share card ready to share');
    } catch (error) {
      console.warn('Share card failed', error);
      await handleCopy();
      showToast('Could not create image. Analysis copied instead.');
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
      if (currentAnalysis.analysis?.notes) lines.push(`Notes: ${currentAnalysis.analysis.notes}`);
      lines.push('');
      lines.push('The disciplined AI held back this setup.');
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
              <Text style={[styles.confidenceLabel, { color: colors.textSecondary }]}>Confidence</Text>
              <Text style={[styles.confidenceValue, { color: directionColor }]}>
                {currentAnalysis.confidence}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <Animated.View
                entering={FadeIn.delay(500).duration(900)}
                style={[
                  styles.progressFill,
                  { width: `${currentAnalysis.confidence}%` as any, backgroundColor: directionColor },
                ]}
              />
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

      <View ref={shareCardRef} collapsable={false} style={styles.hiddenShareContainer}>
        <View style={[styles.shareCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.shareHeaderRow}>
            <Text style={[styles.shareLogo, { color: colors.text }]}>FXSnap</Text>
            <View style={[styles.shareDirectionBadge, { backgroundColor: isBuy ? '#023315' : isSell ? '#3F0A0A' : '#1A1A1A' }]}>
              <Text style={[styles.shareDirectionText, { color: directionColor }]}>
                {isNoTrade ? 'NO TRADE' : isInvalid ? 'INVALID' : currentAnalysis.direction || '—'}
              </Text>
            </View>
          </View>
          <Text style={[styles.sharePair, { color: colors.text }]}>{currentAnalysis.pair}</Text>
          <Text style={[styles.shareConfidenceLabel, { color: colors.textSecondary }]}>Confidence</Text>
          <View style={styles.shareConfidenceRow}>
            <Text style={[styles.shareConfidenceValue, { color: colors.text }]}>{currentAnalysis.confidence}%</Text>
            <View style={styles.shareProgressBar}>
              <View style={[styles.shareProgressFill, { width: `${currentAnalysis.confidence}%`, backgroundColor: directionColor }]} />
            </View>
          </View>
          <View style={styles.shareDivider} />
          {hasTradeSetup && currentAnalysis.tradeSetup ? (
            <>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Entry</Text>
                <Text style={styles.shareValue}>{currentAnalysis.tradeSetup.entryZone}</Text>
              </View>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Stop Loss</Text>
                <Text style={[styles.shareValue, { color: '#FF5252' }]}>{currentAnalysis.tradeSetup.stopLoss}</Text>
              </View>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Take Profit</Text>
                <Text style={[styles.shareValue, { color: '#00E676' }]}>{currentAnalysis.tradeSetup.takeProfit}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Entry</Text>
                <Text style={styles.shareValue}>{currentAnalysis.entry ?? '—'}</Text>
              </View>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Stop Loss</Text>
                <Text style={[styles.shareValue, { color: '#FF5252' }]}>{currentAnalysis.sl ?? '—'}</Text>
              </View>
              <View style={styles.shareLevelRow}>
                <Text style={styles.shareLabel}>Take Profit</Text>
                <Text style={[styles.shareValue, { color: '#00E676' }]}>{currentAnalysis.tp ?? '—'}</Text>
              </View>
            </>
          )}
          <View style={styles.shareFooter}>
            <Text style={[styles.shareFooterText, { color: colors.textSecondary }]}>Disciplined, rule-based chart analysis</Text>
            <Text style={[styles.shareWatermark, { color: colors.textMuted }]}>FXSnap</Text>
          </View>
        </View>
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

