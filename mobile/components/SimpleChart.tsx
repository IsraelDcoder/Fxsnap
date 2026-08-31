import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

type Candle = { time: string; open: number | null; high: number | null; low: number | null; close: number | null };

export default function SimpleChart({ candles }: { candles: Candle[] }) {
  if (!candles || candles.length === 0) return <View style={[styles.container]} />;

  // Use close prices for a simple line chart
  const points = candles.map((c) => (c && c.close != null ? Number(c.close) : NaN)).filter((n) => Number.isFinite(n));
  if (points.length === 0) return <View style={[styles.container]} />;

  const width = 800; // virtual viewport width
  const height = 200;
  const margin = 12;
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const stepX = innerW / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => {
    const x = margin + i * stepX;
    const y = margin + innerH - ((p - min) / range) * innerH;
    return { x, y };
  });

  const d = coords.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
  const areaD = `${d} L ${margin + innerW} ${margin + innerH} L ${margin} ${margin + innerH} Z`;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={width} height={height} fill="#0000" />
        <Path d={areaD} fill="#0b4120" opacity={0.18} />
        <Path d={d} stroke="#00FF9C" strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: 'transparent' },
});
