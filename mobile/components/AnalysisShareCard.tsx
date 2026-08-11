import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Minimal share card component used for off-screen capture.
// Calls onReady after the first layout + short delay to ensure fonts/assets have rendered.
type Props = {
  analysis: any;
  colors: any;
  onReady?: () => void;
};

const AnalysisShareCard = React.forwardRef(function AnalysisShareCard(props: Props, ref: any) {
  const { analysis, colors, onReady } = props;

  const handleLayout = () => {
    if (onReady) {
      // slight delay to allow fonts to finish rendering
      setTimeout(() => onReady(), 140);
    }
  };

  const isBuy = analysis?.direction === 'BUY';
  const isSell = analysis?.direction === 'SELL';
  const isNoTrade = analysis?.status === 'no_trade';
  const isInvalid = analysis?.status === 'invalid_image';
  const directionColor = isBuy ? '#00E676' : isSell ? '#FF5252' : '#8E8E93';

  return (
    <View ref={ref} onLayout={handleLayout} style={[styles.shareCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <View style={styles.shareHeaderRow}>
        <Text style={[styles.shareLogo, { color: colors.text }]}>FXSnap</Text>
        <View style={[styles.shareDirectionBadge, { backgroundColor: isBuy ? '#023315' : isSell ? '#3F0A0A' : '#1A1A1A' }]}>
          <Text style={[styles.shareDirectionText, { color: directionColor }]}>
            {isNoTrade ? 'NO TRADE' : isInvalid ? 'INVALID' : analysis.direction || '—'}
          </Text>
        </View>
      </View>

      <Text style={[styles.sharePair, { color: colors.text }]}>{analysis.pair}</Text>

      <Text style={[styles.shareConfidenceLabel, { color: colors.textSecondary }]}>Confidence</Text>
      <View style={styles.shareConfidenceRow}>
        <Text style={[styles.shareConfidenceValue, { color: colors.text }]}>{analysis.confidence}%</Text>
      </View>

      <View style={styles.shareDivider} />

      {/* Explainable fields */}
      <View style={styles.shareLevelRow}>
        <Text style={[styles.shareLabel]}>Setup Quality</Text>
        <Text style={[styles.shareValue]}>{analysis.setupQuality ?? '—'}</Text>
      </View>
      <View style={styles.shareLevelRow}>
        <Text style={[styles.shareLabel]}>Market Bias</Text>
        <Text style={[styles.shareValue]}>{analysis.marketBias ?? '—'}</Text>
      </View>
      <View style={styles.shareLevelRow}>
        <Text style={[styles.shareLabel]}>Momentum</Text>
        <Text style={[styles.shareValue]}>{analysis.shortTermMomentum ?? '—'}</Text>
      </View>
      <View style={styles.shareLevelRow}>
        <Text style={[styles.shareLabel]}>Price Location</Text>
        <Text style={[styles.shareValue]}>{analysis.priceLocation ?? '—'}</Text>
      </View>
      <View style={styles.shareLevelRow}>
        <Text style={[styles.shareLabel]}>Decision</Text>
        <Text style={[styles.shareValue]}>{analysis.decision ?? '—'}</Text>
      </View>
      {analysis.whyNotNow ? (
        <View style={[styles.shareLevelRow, { marginTop: 18 }]}> 
          <Text style={[styles.shareLabel]}>Why not now</Text>
          <Text style={[styles.shareValue]}>{analysis.whyNotNow}</Text>
        </View>
      ) : null}

      <View style={styles.shareFooter}>
        <Text style={[styles.shareFooterText, { color: colors.textSecondary }]}>Disciplined, rule-based chart analysis</Text>
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
  shareLogo: { fontSize: 34, fontFamily: 'Inter_800ExtraBold' },
  shareDirectionBadge: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  shareDirectionText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sharePair: { marginTop: 32, fontSize: 88, fontFamily: 'Inter_800ExtraBold' },
  shareConfidenceLabel: { marginTop: 48, fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  shareConfidenceRow: { marginTop: 12 },
  shareConfidenceValue: { fontSize: 70, fontFamily: 'Inter_800ExtraBold' },
  shareDivider: { marginTop: 48, height: 1 },
  shareLevelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  shareLabel: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  shareValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  shareFooter: { marginTop: 60 },
  shareFooterText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  shareWatermark: { marginTop: 28, fontSize: 18, fontFamily: 'Inter_700Bold', opacity: 0.18 },
});

export default AnalysisShareCard;
