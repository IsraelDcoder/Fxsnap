import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';

// Minimal share card component used for off-screen capture.
// Calls onReady after the first layout + short delay to ensure fonts/assets have rendered.
type Props = {
  analysis: any;
  colors: any;
  isPremium?: boolean;
  onReady?: () => void;
};

const AnalysisShareCard = React.forwardRef(function AnalysisShareCard(props: Props, ref: any) {
  const { analysis, colors, isPremium = false, onReady } = props;
  const readyRef = React.useRef(false);

  const handleLayout = () => {
    if (!onReady || readyRef.current) return;
    readyRef.current = true;
    setTimeout(onReady, 180);
  };

  const isBuy = analysis?.direction === 'BUY';
  const isSell = analysis?.direction === 'SELL';
  const isNoTrade = analysis?.status === 'no_trade';
  const isInvalid = analysis?.status === 'invalid_image';
  const directionColor = isBuy ? '#00E676' : isSell ? '#FF5252' : '#8E8E93';
  const setup = analysis?.tradeSetup;
  const entry = setup?.entryZone || analysis?.entry;
  const stopLoss = setup?.stopLoss || analysis?.sl;
  const takeProfit = setup?.takeProfit || analysis?.tp;
  const riskReward = setup?.riskReward ?? analysis?.riskReward;
  const structure = analysis?.analysis?.structure;
  const insight = analysis?.analysis?.notes || analysis?.tradeTrigger;
  const whyNotNow = Array.isArray(analysis?.whyNotNow) ? analysis.whyNotNow.join(' ') : analysis?.whyNotNow;
  const timestamp = analysis?.createdAt ? new Date(analysis.createdAt).toLocaleDateString() : new Date().toLocaleDateString();

  return (
    <View ref={ref} collapsable={false} pointerEvents="none" onLayout={handleLayout} style={[styles.shareCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <View style={styles.shareHeaderRow}>
        <View>
          <Text style={[styles.shareLogo, { color: colors.text }]}>FXSNAP</Text>
          <Text style={[styles.shareEyebrow, { color: colors.buy }]}>AI CHART ANALYSIS</Text>
        </View>
        <View style={[styles.shareDirectionBadge, { backgroundColor: isBuy ? '#023315' : isSell ? '#3F0A0A' : '#1A1A1A' }]}>
          <Text style={[styles.shareDirectionText, { color: directionColor }]}>
            {isNoTrade ? 'NO TRADE' : isInvalid ? 'INVALID' : analysis.direction || '—'}
          </Text>
        </View>
      </View>

      <Text style={[styles.sharePair, { color: colors.text }]}>{analysis.pair}</Text>

      {analysis.imageUri ? <Image source={{ uri: analysis.imageUri }} style={styles.shareChart} resizeMode="cover" /> : null}

      <View style={styles.shareConfidenceRow}>
        <View>
          <Text style={[styles.shareConfidenceLabel, { color: colors.textSecondary }]}>CONFIDENCE</Text>
          <Text style={[styles.shareConfidenceValue, { color: directionColor }]}>{analysis.confidence != null ? `${analysis.confidence}%` : '—'}</Text>
        </View>
        <View style={styles.shareDateBlock}>
          <Text style={[styles.shareConfidenceLabel, { color: colors.textSecondary }]}>DATE</Text>
          <Text style={[styles.shareDate, { color: colors.text }]}>{timestamp}</Text>
        </View>
      </View>

      <View style={styles.shareDivider} />

      <Text style={[styles.shareSectionTitle, { color: colors.text }]}>TRADE SETUP</Text>
      <View style={styles.shareGrid}>
        {[["ENTRY", entry], ["STOP LOSS", stopLoss], ["TAKE PROFIT", takeProfit], ...(isPremium ? [["RISK / REWARD", riskReward]] : [])].filter(([, value]) => value != null && value !== '').map(([label, value]) => (
          <View key={String(label)} style={styles.shareMetric}>
            <Text style={styles.shareLabel}>{label}</Text>
            <Text numberOfLines={2} style={[styles.shareValue, { color: colors.text }]}>{String(value)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.shareDivider} />
      <Text style={[styles.shareSectionTitle, { color: colors.buy }]}>FXSNAP AI INSIGHT</Text>
      <Text numberOfLines={4} style={[styles.shareInsight, { color: colors.text }]}>{isPremium ? insight || structure || whyNotNow || 'Analysis generated from the submitted chart.' : 'Unlock full analysis in FXSnap to view the AI reasoning.'}</Text>

      <View style={styles.shareFooter}>
        <Text style={[styles.shareFooterText, { color: colors.textSecondary }]}>Smarter Analysis. Better Trades.</Text>
        <Text style={[styles.shareWatermark, { color: colors.textMuted }]}>FXSnap</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shareCard: {
    width: 1080,
    minHeight: 1400,
    padding: 64,
    borderRadius: 40,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  shareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareLogo: { fontSize: 34, fontFamily: 'Inter_700Bold' },
  shareEyebrow: { marginTop: 10, fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  shareDirectionBadge: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  shareDirectionText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sharePair: { marginTop: 32, fontSize: 88, fontFamily: 'Inter_700Bold' },
  shareChart: { width: '100%', height: 220, marginTop: 26, borderRadius: 24, backgroundColor: '#0D0D0D' },
  shareConfidenceLabel: { fontSize: 20, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  shareConfidenceRow: { marginTop: 34, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  shareConfidenceValue: { fontSize: 70, fontFamily: 'Inter_700Bold' },
  shareDateBlock: { alignItems: 'flex-end', paddingBottom: 8 },
  shareDate: { marginTop: 8, fontSize: 24, fontFamily: 'Inter_600SemiBold' },
  shareDivider: { marginTop: 48, height: 1, backgroundColor: '#2A2A2A' },
  shareSectionTitle: { marginTop: 32, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  shareGrid: { marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  shareMetric: { width: '45%', minHeight: 72 },
  shareLabel: { fontSize: 18, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  shareValue: { marginTop: 8, fontSize: 24, fontFamily: 'Inter_700Bold' },
  shareInsight: { marginTop: 18, fontSize: 24, lineHeight: 34, fontFamily: 'Inter_500Medium' },
  shareFooter: { marginTop: 60 },
  shareFooterText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  shareWatermark: { marginTop: 28, fontSize: 18, fontFamily: 'Inter_700Bold', opacity: 0.18 },
});

export default AnalysisShareCard;
