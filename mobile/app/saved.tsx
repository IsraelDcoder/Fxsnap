import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import type { AnalysisResult } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Filter = 'all' | 'BUY' | 'SELL';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatsHeader({ analyses }: { analyses: AnalysisResult[] }) {
  const colors = useColors();
  const buys = analyses.filter((a) => a.direction === 'BUY').length;
  const sells = analyses.filter((a) => a.direction === 'SELL').length;
  const avgConf =
    analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length)
      : 0;
  const buyPct = analyses.length > 0 ? Math.round((buys / analyses.length) * 100) : 0;

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(500)} style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: colors.text }]}>{analyses.length}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Saved</Text>
      </View>
      <View style={styles.statDiv} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: colors.buy }]}>{buys}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>BUY</Text>
      </View>
      <View style={styles.statDiv} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: colors.sell }]}>{sells}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>SELL</Text>
      </View>
      <View style={styles.statDiv} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: colors.text }]}>{avgConf}%</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg conf.</Text>
      </View>
    </Animated.View>
  );
}

function FilterChips({
  active,
  onChange,
  counts,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const colors = useColors();
  const chips: { key: Filter; label: string; color?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'BUY', label: 'BUY', color: colors.buy },
    { key: 'SELL', label: 'SELL', color: colors.sell },
  ];
  return (
    <Animated.View entering={FadeInDown.delay(140).duration(500)} style={styles.filterRow}>
      {chips.map((chip) => (
        <TouchableOpacity
          key={chip.key}
          style={[
            styles.filterChip,
            active === chip.key && styles.filterChipActive,
            {
              backgroundColor: active === chip.key ? colors.primary : colors.card,
              borderColor: active === chip.key ? colors.primary : colors.cardBorder,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(chip.key);
          }}
        >
          {chip.color && (
            <View style={[styles.filterDot, { backgroundColor: chip.color }]} />
          )}
          <Text
            style={[
              styles.filterChipText,
              active === chip.key && styles.filterChipTextActive,
              { color: active === chip.key ? colors.primaryForeground : colors.text },
            ]}
          >
            {chip.label}
          </Text>
          <Text
            style={[
              styles.filterCount,
              active === chip.key && styles.filterCountActive,
              { color: active === chip.key ? colors.primaryForeground : colors.textSecondary },
            ]}
          >
            {counts[chip.key]}
          </Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

function AnalysisCard({
  item,
  onDelete,
  onPress,
}: {
  item: AnalysisResult;
  onDelete: () => void;
  onPress: () => void;
}) {
  const colors = useColors();
  const isBuy = item.direction === 'BUY';
  const color = isBuy ? colors.buy : colors.sell;

  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={onPress} activeOpacity={0.85}>
        {/* Left content */}
        <View style={styles.cardLeft}>
          <View style={[styles.dirBadge, { backgroundColor: color + '20' }]}>
            <Feather name={isBuy ? 'trending-up' : 'trending-down'} size={13} color={color} />
            <Text style={[styles.dirText, { color }]}>{item.direction}</Text>
          </View>
          <Text style={[styles.pairText, { color: colors.text }]}>{item.pair}</Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.metaItem, { color: colors.textSecondary }]}>Entry: {item.entry}</Text>
            <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.metaItem, { color: colors.textSecondary }]}>SL: {item.sl}</Text>
            <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.metaItem, { color: colors.textSecondary }]}>TP: {item.tp}</Text>
          </View>
          <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Right content */}
        <View style={styles.cardRight}>
          <View style={styles.confidencePill}>
            <Text style={[styles.confidenceText, { color }]}>{item.confidence}%</Text>
          </View>
          <View style={styles.lotPill}>
            <Text style={[styles.lotText, { color: colors.textSecondary }]}>{item.lotSize > 0 ? `${item.lotSize.toFixed(2)} lot` : 'Size unavailable'}</Text>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Feather name="trash-2" size={15} color={colors.sell} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { savedAnalyses, deleteAnalysis, setCurrentAnalysis } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const filtered = useMemo(
    () => (filter === 'all' ? savedAnalyses : savedAnalyses.filter((a) => a.direction === filter)),
    [savedAnalyses, filter]
  );

  const counts: Record<Filter, number> = {
    all: savedAnalyses.length,
    BUY: savedAnalyses.filter((a) => a.direction === 'BUY').length,
    SELL: savedAnalyses.filter((a) => a.direction === 'SELL').length,
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Analysis', 'Remove this saved analysis?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteAnalysis(id);
        },
      },
    ]);
  };

  const handleView = (item: AnalysisResult) => {
    setCurrentAnalysis(item);
    router.push('/analysis-result');
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved Analyses</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.countText, { color: colors.text }]}>{savedAnalyses.length}</Text>
        </View>
      </Animated.View>

      {savedAnalyses.length === 0 ? (
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
            <Feather name="bookmark" size={40} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved analyses</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}> 
            After running a chart analysis, tap "Save Analysis" to keep it here for reference.
          </Text>
          <TouchableOpacity
            style={[styles.runBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/analysis')}
          >
            <Feather name="activity" size={16} color={colors.primaryForeground} />
            <Text style={[styles.runBtnText, { color: colors.primaryForeground }]}>Run Analysis</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <>
          <View style={styles.listHeader}>
            <StatsHeader analyses={savedAnalyses} />
            <FilterChips active={filter} onChange={setFilter} counts={counts} />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: botPad + 32 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Animated.View entering={FadeInUp.duration(400)} style={styles.filterEmpty}>
                <Text style={[styles.filterEmptyText, { color: colors.textSecondary }]}>No {filter} signals saved</Text>
              </Animated.View>
            }
            renderItem={({ item }) => (
              <AnalysisCard
                item={item}
                onDelete={() => handleDelete(item.id)}
                onPress={() => handleView(item)}
              />
            )}
          />
        </>
      )}
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
  countBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  countText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  listHeader: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  // Stats
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDiv: { width: 1, height: 32, backgroundColor: '#2A2A2A' },
  statNum: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  // Filters
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 50,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  filterChipActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  filterDot: { width: 7, height: 7, borderRadius: 3.5 },
  filterChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  filterChipTextActive: { color: '#000000' },
  filterCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  filterCountActive: { backgroundColor: '#00000015', color: '#00000080' },
  // List
  list: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  filterEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  filterEmptyText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
  },
  cardLeft: { flex: 1, gap: 5 },
  dirBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    alignSelf: 'flex-start',
  },
  dirText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  pairText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaItem: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#48484A' },
  dateText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#48484A' },
  cardRight: { alignItems: 'center', gap: 8 },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: '#2A2A2A',
  },
  confidenceText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  lotPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
  },
  lotText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#2A1010',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3D1A1A',
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  emptySubtext: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
    marginTop: 8,
  },
  runBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#000' },
});
