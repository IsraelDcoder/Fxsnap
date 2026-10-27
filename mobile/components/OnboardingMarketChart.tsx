import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const CANDLES = [
  { open: 62, close: 74, high: 54, low: 82 },
  { open: 76, close: 60, high: 52, low: 83 },
  { open: 61, close: 68, high: 54, low: 78 },
  { open: 69, close: 49, high: 43, low: 76 },
  { open: 48, close: 56, high: 41, low: 64 },
  { open: 57, close: 39, high: 33, low: 65 },
  { open: 40, close: 48, high: 34, low: 55 },
  { open: 47, close: 33, high: 27, low: 54 },
  { open: 34, close: 43, high: 28, low: 52 },
  { open: 44, close: 25, high: 20, low: 51 },
  { open: 26, close: 32, high: 19, low: 40 },
  { open: 33, close: 18, high: 12, low: 41 },
];

interface OnboardingMarketChartProps {
  compact?: boolean;
  focus?: 'clarity' | 'risk' | 'timing' | 'structure';
}

export function OnboardingMarketChart({
  compact = false,
  focus = 'structure',
}: OnboardingMarketChartProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const height = compact ? 166 : 206;
  const hint = focus === 'risk'
    ? 'Risk context'
    : focus === 'timing'
      ? 'Possible setup zones'
      : focus === 'clarity'
        ? 'Organized chart review'
        : 'Market structure';

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(320)}
      style={[
        styles.chart,
        { height, backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
      accessibilityLabel="Illustrative candlestick chart, not live market data"
    >
      <View style={styles.chartHeader}>
        <View>
          <Text style={[styles.chartEyebrow, { color: colors.textSecondary }]}>FXSNAP · CHART REVIEW</Text>
          <Text style={[styles.chartTitle, { color: colors.text }]}>{hint}</Text>
        </View>
        <View style={[styles.chartTag, { backgroundColor: `${colors.text}12` }]}>
          <View style={[styles.chartDot, { backgroundColor: colors.buy }]} />
          <Text style={[styles.chartTagText, { color: colors.textSecondary }]}>ILLUSTRATION</Text>
        </View>
      </View>
      <View style={styles.plot}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 120" preserveAspectRatio="none">
          {[20, 50, 80, 110].map((y) => (
            <Path key={`h-${y}`} d={`M0 ${y} H360`} stroke={colors.text} strokeOpacity="0.09" strokeWidth="1" />
          ))}
          {[45, 105, 165, 225, 285, 345].map((x) => (
            <Path key={`v-${x}`} d={`M${x} 0 V120`} stroke={colors.text} strokeOpacity="0.06" strokeWidth="1" />
          ))}
          <Path d="M0 79 C44 74 63 91 103 66 S157 57 190 44 S248 60 283 33 S326 27 360 14" fill="none" stroke={colors.buy} strokeOpacity="0.72" strokeWidth="2" strokeDasharray="4 5" />
          <Path d="M0 84 H360" fill="none" stroke={colors.gold} strokeOpacity="0.58" strokeWidth="1" strokeDasharray="3 5" />
        </Svg>
        {CANDLES.map((candle, index) => {
          const up = candle.close < candle.open;
          const top = Math.min(candle.open, candle.close);
          const bodyHeight = Math.max(5, Math.abs(candle.close - candle.open));
          const color = up ? colors.buy : colors.sell;
          return (
            <Animated.View
              key={`candle-${index}`}
              entering={reduceMotion ? undefined : FadeInUp.delay(index * 32).duration(260)}
              style={[styles.candle, { left: `${5 + index * 8}%`, top: 8 }]}
              accessible={false}
            >
              <View style={[styles.wick, { height: candle.low - candle.high, backgroundColor: color }]} />
              <View style={[styles.candleBody, { top: top, height: bodyHeight, backgroundColor: color }]} />
            </Animated.View>
          );
        })}
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.delay(420)}
          style={[styles.plotLabel, { backgroundColor: colors.card }]}
        >
          <Feather name="info" size={10} color={colors.textSecondary} />
          <Text style={[styles.plotLabelText, { color: colors.textSecondary }]}>Illustrative chart · not live data</Text>
        </Animated.View>
      </View>
      {!compact ? (
        <View style={styles.chartFooter}>
          <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: colors.buy }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Structure</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: colors.gold }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Reference level</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendCandle, { backgroundColor: colors.buy }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Up</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendCandle, { backgroundColor: colors.sell }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Down</Text></View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chart: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
    borderWidth: 1,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chartEyebrow: { fontSize: 9, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  chartTitle: { marginTop: 5, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  chartTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  chartDot: { width: 6, height: 6, borderRadius: 3 },
  chartTagText: { fontSize: 8, letterSpacing: 0.4, fontFamily: 'Inter_700Bold' },
  plot: { flex: 1, overflow: 'hidden', marginTop: 8, borderRadius: 10 },
  candle: { position: 'absolute', width: 7, height: 100, alignItems: 'center' },
  wick: { position: 'absolute', top: 0, left: 3, width: 1, opacity: 0.8 },
  candleBody: { position: 'absolute', left: 0, width: 7, borderRadius: 1 },
  plotLabel: { position: 'absolute', right: 3, bottom: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 },
  plotLabelText: { fontSize: 8, fontFamily: 'Inter_500Medium' },
  chartFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 7 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 9, height: 2, borderRadius: 2 },
  legendCandle: { width: 5, height: 9, borderRadius: 1 },
  legendText: { fontSize: 8, fontFamily: 'Inter_500Medium' },
});
