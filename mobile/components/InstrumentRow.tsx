import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Instrument } from '@/types/instrument';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

export default function InstrumentRow({ instrument, onPress }: { instrument: Instrument; onPress: () => void }) {
  const colors = useColors();

  const isPositive = instrument.change != null && instrument.change > 0;
  const isNegative = instrument.change != null && instrument.change < 0;
  const marketDirection = isPositive ? 'Bullish' : isNegative ? 'Bearish' : 'Flat';
  const marketStatus = instrument.price != null ? 'Live' : 'Waiting';
  const directionColor = isPositive ? colors.buy : isNegative ? colors.sell : colors.textSecondary;
  const statusColor = instrument.price != null ? colors.buy : colors.textSecondary;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.left}>
        <Text style={[styles.symbol, { color: colors.text }]}>{instrument.symbol}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.status, { color: statusColor }]}>{marketStatus}</Text>
          <Text style={[styles.direction, { color: directionColor }]}>{marketDirection}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.price, { color: colors.text }]}>{instrument.price != null ? instrument.price.toLocaleString() : '—'}</Text>
        <View style={styles.changeRow}>
          {isPositive && <Feather name="trending-up" size={12} color={colors.buy} style={{ marginRight: 6 }} />}
          {isNegative && <Feather name="trending-down" size={12} color={colors.sell} style={{ marginRight: 6 }} />}
          {!isPositive && !isNegative && <View style={{ width: 12, marginRight: 6 }} />}
          <Text style={[styles.change, { color: directionColor }]}>
            {instrument.change != null ? `${instrument.change > 0 ? '+' : ''}${instrument.change.toFixed(4)}` : '—'}
            {instrument.changePercent != null ? ` (${instrument.changePercent > 0 ? '+' : ''}${instrument.changePercent.toFixed(2)}%)` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  left: { flexDirection: 'column', gap: 6 },
  symbol: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  direction: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' },
  right: { alignItems: 'flex-end' },
  price: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  change: { fontSize: 11, fontFamily: 'Inter_500Medium' },
});
