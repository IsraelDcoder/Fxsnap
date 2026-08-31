import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { useColors } from '@/hooks/useColors';
import { Instrument } from '@/types/instrument';
import { getWatchlistInstruments } from '@/services/watchlist';
import InstrumentRow from '@/components/InstrumentRow';
import { router } from 'expo-router';

export default function WatchlistScreen() {
  const colors = useColors();
  const [items, setItems] = useState<Instrument[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getWatchlistInstruments().then((data) => {
      if (!mounted) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const renderItem = ({ item }: { item: Instrument }) => (
    <InstrumentRow
      instrument={item}
      onPress={() => (router as any).push({ pathname: '/instrument/[symbol]', params: { symbol: item.symbol } })}
    />
  );

  return (
    <ScreenWrapper
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      scrollable={false}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => (router as any).push('/daily-brief')}
        style={[styles.briefCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <Text style={[styles.briefLabel, { color: colors.textSecondary }]}>DAILY BRIEF</Text>
        <Text style={[styles.briefTitle, { color: colors.text }]}>Your daily market briefing is ready</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MARKETS</Text>

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.buy} />
        </View>
      )}

      {items && (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(i) => i.symbol}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!loading && items && items.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your watchlist is empty.</Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  briefCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
  },
  briefLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, marginBottom: 6 },
  briefTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', lineHeight: 24 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
