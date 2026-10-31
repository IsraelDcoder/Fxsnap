import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
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
import { resolveAnalysisDirection } from '@/services/analysisDirection';

type Filter = 'all' | 'BUY' | 'SELL' | 'NO_TRADE';

const COLORS = {
  background: '#F6F6F7',
  card: '#FFFFFF',
  text: '#101114',
  secondary: '#81838A',
  muted: '#A8AAB0',
  border: '#ECEDEF',
  green: '#00A968',
  greenSoft: '#E4F8EF',
  red: '#F04444',
  redSoft: '#FDE9E9',
  blue: '#1677F9',
};

function isNoTrade(item: AnalysisResult) {
  return item.status === 'no_trade'
    || item.verdict === 'NO_TRADE'
    || item.tradeDecision === 'WAIT'
    || item.tradeDecision === 'NONE'
    || item.tradeSetup?.type === 'none';
}

function getDirection(item: AnalysisResult): 'BUY' | 'SELL' | 'NO_TRADE' {
  if (isNoTrade(item)) return 'NO_TRADE';
  return resolveAnalysisDirection(
    item.tradeSetup?.type,
    item.direction,
    item.marketBias,
    item.analysis?.trend,
    item.analysis?.sentiment,
  ) ?? 'NO_TRADE';
}

function formatAge(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'Saved setup';
  const ageMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatPair(pair: string) {
  return /^[A-Z]{6}$/.test(pair) ? `${pair.slice(0, 3)}/${pair.slice(3)}` : pair;
}

function StatsHeader({ analyses }: { analyses: AnalysisResult[] }) {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const currentWeek = analyses.filter((item) => new Date(item.createdAt) >= weekStart);
  const previousWeek = analyses.filter((item) => {
    const date = new Date(item.createdAt);
    return date >= previousWeekStart && date < weekStart;
  });
  const change = previousWeek.length === 0
    ? currentWeek.length > 0 ? 100 : 0
    : Math.round(((currentWeek.length - previousWeek.length) / previousWeek.length) * 100);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      count: currentWeek.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt.getFullYear() === date.getFullYear()
          && createdAt.getMonth() === date.getMonth()
          && createdAt.getDate() === date.getDate();
      }).length,
      isToday: date.toDateString() === now.toDateString(),
    };
  });
  const maxCount = Math.max(1, ...weekDays.map((day) => day.count));

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(500)} style={styles.statsCard}>
      <View style={styles.statsCopy}>
        <Text style={styles.statLabel}>Analyses this week</Text>
        <Text style={styles.statNum}>{currentWeek.length}</Text>
        <View style={styles.weekChange}>
          <Feather name={change >= 0 ? 'trending-up' : 'trending-down'} size={15} color={COLORS.green} />
          <Text style={styles.weekChangeValue}>{change >= 0 ? '+' : ''}{change}%</Text>
          <Text style={styles.weekChangeLabel}>vs last week</Text>
        </View>
      </View>
      <View style={styles.weekChart}>
        {weekDays.map((day) => (
          <View key={day.label} style={styles.weekDay}>
            <View style={styles.weekBarTrack}>
              <View
                style={[
                  styles.weekBar,
                  {
                    height: `${Math.max(18, (day.count / maxCount) * 100)}%`,
                    backgroundColor: day.isToday ? COLORS.green : '#9ADFC2',
                  },
                ]}
              />
            </View>
            <Text style={styles.weekDayLabel}>{day.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function FilterChips({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
}) {
  const chips: { key: Filter; label: string; color?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'BUY', label: 'Long', color: COLORS.green },
    { key: 'SELL', label: 'Short', color: COLORS.red },
    { key: 'NO_TRADE', label: 'No-trade' },
  ];
  return (
    <Animated.View entering={FadeInDown.delay(140).duration(500)} style={styles.filterRow}>
      {chips.map((chip) => (
        <TouchableOpacity
          key={chip.key}
          style={[
            styles.filterChip,
            active === chip.key && styles.filterChipActive,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(chip.key);
          }}
        >
          {chip.color && active === chip.key ? <View style={[styles.filterDot, { backgroundColor: chip.color }]} /> : null}
          <Text style={[styles.filterChipText, active === chip.key && styles.filterChipTextActive]}>{chip.label}</Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

function AnalysisCard({
  item,
  isFirst,
  isLast,
  onDelete,
  onPress,
}: {
  item: AnalysisResult;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const direction = getDirection(item);
  const isBuy = direction === 'BUY';
  const isSell = direction === 'SELL';
  const directionLabel = direction === 'NO_TRADE' ? 'No-trade' : isBuy ? 'Long' : 'Short';
  const directionColor = isBuy ? COLORS.green : isSell ? COLORS.red : COLORS.secondary;
  const timeframe = item.timeframe || item.chartAnalysis?.timeframe || (item.multiTimeframe ? 'MTF' : '');
  const pairLabel = `${formatPair(item.pair)}${timeframe ? ` · ${timeframe}` : ''}`;

  return (
    <Animated.View
      entering={FadeInDown.duration(350)}
      style={[
        styles.rowShell,
        isFirst && styles.rowShellFirst,
        isLast && styles.rowShellLast,
      ]}
    >
      <TouchableOpacity
        style={styles.analysisRow}
        onPress={onPress}
        onLongPress={onDelete}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${pairLabel}, ${directionLabel}, score ${item.confidence} out of 100`}
        accessibilityHint="Open saved analysis. Press and hold to delete."
      >
        <View style={styles.thumbnail}>
          {item.imageUri && !imageFailed ? (
            <Image
              source={{ uri: item.imageUri }}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MiniCandles isSell={isSell} />
          )}
        </View>
        <View style={styles.analysisInfo}>
          <Text numberOfLines={1} style={styles.pairText}>{pairLabel}</Text>
          <Text style={styles.dateText}>{formatAge(item.createdAt)}</Text>
          <View style={[styles.dirBadge, { backgroundColor: isBuy ? COLORS.greenSoft : isSell ? COLORS.redSoft : '#F0F1F2' }]}>
            <Feather name={isBuy ? 'trending-up' : isSell ? 'trending-down' : 'minus'} size={13} color={directionColor} />
            <Text style={[styles.dirText, { color: directionColor }]}>{directionLabel}</Text>
          </View>
        </View>
        <View style={styles.scoreWrap}>
          <Text style={styles.scoreText}>{item.confidence}</Text>
          <Text style={styles.scoreCaption}>/ 100</Text>
        </View>
        <Feather name="chevron-right" size={23} color={COLORS.muted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function MiniCandles({ isSell }: { isSell: boolean }) {
  const candles = [14, 19, 16, 23, 21, 28, 25, 34, 29, 38];
  return (
    <View style={styles.miniChart}>
      {candles.map((height, index) => {
        const rising = (index % 4 !== 1) !== isSell;
        const color = rising ? COLORS.green : COLORS.red;
        return (
          <View key={index} style={styles.candleSlot}>
            <View style={[styles.candleWick, { height: height + 10, backgroundColor: color }]} />
            <View style={[styles.candleBody, { height, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const { savedAnalyses, deleteAnalysis, setCurrentAnalysis, checkFeatureAccess } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const topPad = Platform.OS === 'web' ? 24 : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 14 : 8);

  const filtered = useMemo(
    () => (filter === 'all' ? savedAnalyses : savedAnalyses.filter((item) => getDirection(item) === filter)),
    [savedAnalyses, filter]
  );

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

  const openTab = (tab: 'home' | 'strategy' | 'community') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === 'home') router.replace('/(tabs)/home');
    else if (tab === 'strategy') router.push('/strategy');
    else router.push('/community');
  };

  const listHeader = (
    <View style={[styles.listHeader, { paddingTop: topPad }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.brandHeader}>
        <View style={styles.brandCopy}>
          <Text style={styles.brandTitle}>FXSnap</Text>
          <Text style={styles.brandSubtitle}>Your trading journey</Text>
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.replace('/(tabs)/home')}
          accessibilityRole="button"
          accessibilityLabel="Close saved setups and return home"
        >
          <Feather name="x" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </Animated.View>
      <StatsHeader analyses={savedAnalyses} />
        <FilterChips active={filter} onChange={setFilter} />
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.list, { paddingBottom: 92 + bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <Animated.View entering={FadeInUp.delay(180).duration(400)} style={styles.emptyState}>
            <Feather name="bar-chart-2" size={32} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>{savedAnalyses.length ? 'No saved setups in this filter' : 'No saved setups yet'}</Text>
            <Text style={styles.emptySubtext}>
              {savedAnalyses.length
                ? 'Try another filter to see your saved analyses.'
                : 'Save a chart analysis and it will appear here.'}
            </Text>
            {savedAnalyses.length === 0 ? (
              <TouchableOpacity
                style={styles.runBtn}
                onPress={async () => {
                  const access = await checkFeatureAccess('AI_ANALYSIS', '/analysis', true);
                  if (access.error) {
                    Alert.alert('Unable to verify access', access.error);
                    return;
                  }
                  if (access.allowed) router.push('/analysis');
                }}
              >
                <Text style={styles.runBtnText}>Run Analysis</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        )}
        renderItem={({ item, index }) => (
          <AnalysisCard
            item={item}
            isFirst={index === 0}
            isLast={index === filtered.length - 1}
            onDelete={() => handleDelete(item.id)}
            onPress={() => handleView(item)}
          />
        )}
      />
      <View style={[styles.bottomNavWrap, { paddingBottom: bottomPad }]}>
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => openTab('home')} accessibilityRole="button" accessibilityLabel="Home">
            <Feather name="home" size={27} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Home</Text>
          </TouchableOpacity>
          <View style={[styles.navItem, styles.navItemActive]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
            <Feather name="clock" size={27} color={COLORS.blue} />
            <Text style={[styles.navLabel, styles.navLabelActive]}>History</Text>
          </View>
          <TouchableOpacity style={styles.navItem} onPress={() => openTab('strategy')} accessibilityRole="button" accessibilityLabel="Strategies">
            <Feather name="bar-chart-2" size={27} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Strategies</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => openTab('community')} accessibilityRole="button" accessibilityLabel="Community">
            <Feather name="users" size={27} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Community</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingBottom: 12 },
  listHeader: { paddingHorizontal: 18, gap: 16, paddingBottom: 16 },
  brandHeader: { paddingTop: 26, paddingBottom: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandCopy: { flex: 1 },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  brandTitle: { color: COLORS.text, fontSize: 31, lineHeight: 37, letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  brandSubtitle: { color: COLORS.secondary, fontSize: 16, lineHeight: 22, fontFamily: 'Inter_500Medium' },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 18,
    minHeight: 142,
    gap: 10,
    shadowColor: '#111827',
    shadowOpacity: 0.035,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  statsCopy: { flex: 1, minWidth: 0, gap: 1 },
  statLabel: { color: COLORS.secondary, fontSize: 14, fontFamily: 'Inter_500Medium' },
  statNum: { color: COLORS.text, fontSize: 58, lineHeight: 66, letterSpacing: -2, fontFamily: 'Inter_700Bold' },
  weekChange: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  weekChangeValue: { color: COLORS.green, fontSize: 13, fontFamily: 'Inter_700Bold' },
  weekChangeLabel: { color: COLORS.secondary, fontSize: 12, fontFamily: 'Inter_500Medium' },
  weekChart: { height: 92, flex: 1.1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  weekDay: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weekBarTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  weekBar: { width: '72%', maxWidth: 20, minHeight: 9, borderRadius: 6 },
  weekDayLabel: { color: COLORS.secondary, fontSize: 9, lineHeight: 12, fontFamily: 'Inter_500Medium' },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  filterChip: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: '#EEEEF0',
  },
  filterChipActive: { backgroundColor: COLORS.text },
  filterDot: { width: 7, height: 7, borderRadius: 4, position: 'absolute', left: 15 },
  filterChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: COLORS.text },
  filterChipTextActive: { color: COLORS.card },
  rowShell: {
    marginHorizontal: 18,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowShellFirst: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  rowShellLast: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderBottomWidth: 0 },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 112,
    gap: 14,
  },
  thumbnail: { width: 78, height: 78, overflow: 'hidden', borderRadius: 13, backgroundColor: '#F5F5F6', alignItems: 'center', justifyContent: 'center' },
  thumbnailImage: { width: '100%', height: '100%' },
  miniChart: { width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 6 },
  candleSlot: { width: 4, height: 56, alignItems: 'center', justifyContent: 'center' },
  candleWick: { width: 1, position: 'absolute' },
  candleBody: { width: 4, minHeight: 5 },
  analysisInfo: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  pairText: { maxWidth: '100%', color: COLORS.text, fontSize: 16, lineHeight: 21, fontFamily: 'Inter_600SemiBold' },
  dateText: { color: COLORS.secondary, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  dirBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 18, marginTop: 2 },
  dirText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  scoreWrap: { minWidth: 42, alignItems: 'center', justifyContent: 'center', gap: 0 },
  scoreText: { color: COLORS.text, fontSize: 27, lineHeight: 31, fontFamily: 'Inter_700Bold' },
  scoreCaption: { color: COLORS.secondary, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 12, marginHorizontal: 18, marginTop: 2, padding: 28, borderRadius: 22, backgroundColor: COLORS.card },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySubtext: { color: COLORS.secondary, fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  runBtn: { marginTop: 4, backgroundColor: COLORS.text, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
  runBtnText: { color: COLORS.card, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  bottomNavWrap: {
    paddingHorizontal: 18,
    paddingTop: 5,
    backgroundColor: COLORS.background,
  },
  bottomNav: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    borderRadius: 36,
    paddingHorizontal: 4,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  navItem: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: 30,
  },
  navItemActive: { backgroundColor: '#F7F8FA' },
  navLabel: { color: COLORS.secondary, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  navLabelActive: { color: COLORS.blue, fontFamily: 'Inter_600SemiBold' },
});
