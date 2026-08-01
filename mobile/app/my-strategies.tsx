import React, { useState } from 'react';
import {
  Alert,
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
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import type { SavedStrategy } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function LevelBadge({ level }: { level: 'beginner' | 'advanced' | null }) {
  const colors = useColors();
  const color = level === 'advanced' ? colors.gold : colors.buy;
  const bg = level === 'advanced' ? colors.surface : colors.surface;
  const border = level === 'advanced' ? colors.cardBorder : colors.cardBorder;
  return (
    <View style={[styles.levelBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.levelBadgeText, { color }]}>
        {level === 'advanced' ? 'Advanced' : 'Beginner'}
      </Text>
    </View>
  );
}

function StrategyCard({
  strategy,
  onDelete,
  enterDelay,
}: {
  strategy: SavedStrategy;
  onDelete: () => void;
  enterDelay: number;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const contentHeight = useSharedValue(0);
  const arrowRotate = useSharedValue(0);

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((e) => !e);
    contentHeight.value = expanded ? 0 : 1;
    arrowRotate.value = withTiming(expanded ? 0 : 1, { duration: 250 });
  };

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotate.value * 180}deg` }],
  }));

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete Strategy', `Remove "${strategy.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Animated.View entering={FadeInDown.delay(enterDelay).duration(400)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      {/* Card header */}
      <TouchableOpacity style={styles.cardHeader} onPress={toggleExpand} activeOpacity={0.85}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardIconBox}>
            <Feather name="cpu" size={18} color={colors.buy} />
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{strategy.name}</Text>
            <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{formatDate(strategy.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <LevelBadge level={strategy.level} />
          <Animated.View style={arrowStyle}>
            <Feather name="chevron-down" size={18} color={colors.textSecondary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {expanded && (
        <Animated.View entering={FadeInUp.duration(300)} style={styles.expandedContent}>
          <View style={styles.expandDivider} />

          <Text style={[styles.expandDesc, { color: colors.textSecondary }]}>{strategy.description}</Text>

          <View style={styles.expandMetaRow}>
            <View style={styles.expandMetaItem}>
              <Feather name="clock" size={13} color={colors.textSecondary} />
              <Text style={[styles.expandMetaText, { color: colors.textSecondary }]}>{strategy.timeframe}</Text>
            </View>
          </View>

          {[
            { title: 'Entry Rules', items: strategy.rules.entry, color: colors.buy, icon: 'log-in' },
            { title: 'Exit Rules', items: strategy.rules.exit, color: colors.sell, icon: 'log-out' },
            { title: 'Risk Management', items: strategy.rules.risk, color: colors.gold, icon: 'shield' },
          ].map(({ title, items, color, icon }) => (
            <View key={title} style={styles.ruleSection}>
              <View style={styles.ruleSectionHeader}>
                <Feather name={icon as any} size={14} color={color} />
                <Text style={[styles.ruleSectionTitle, { color }]}>{title}</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={styles.ruleRow}>
                  <View style={[styles.ruleDot, { backgroundColor: color }]} />
                  <Text style={[styles.ruleText, { color: colors.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>
          ))}

          {strategy.bestPairs.length > 0 && (
            <View style={styles.pairsSection}>
              <Text style={[styles.pairsSectionTitle, { color: colors.textSecondary }]}>Best Pairs</Text>
              <View style={styles.pairsRow}>
                {strategy.bestPairs.map((p) => (
                  <View key={p} style={[styles.pairChip, { backgroundColor: colors.surface }]}> 
                    <Text style={[styles.pairChipText, { color: colors.text }]}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Feather name="trash-2" size={16} color={colors.sell} />
            <Text style={[styles.deleteBtnText, { color: colors.sell }]}>Delete Strategy</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export default function MyStrategiesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { savedStrategies, deleteStrategy } = useApp();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Strategies</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.countText, { color: colors.textSecondary }]}>{savedStrategies.length}</Text>
        </View>
      </Animated.View>

      {savedStrategies.length === 0 ? (
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
            <Feather name="cpu" size={40} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved strategies</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}> 
            Generate a strategy and tap "Save Strategy" to store it here.
          </Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/strategy')}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Generate Strategy</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {savedStrategies.map((s, i) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              onDelete={() => deleteStrategy(s.id)}
              enterDelay={i * 80}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
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
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#1A3D26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  cardDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  levelBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  expandedContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  expandDivider: { height: 1, backgroundColor: '#2A2A2A', marginBottom: 4 },
  expandDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    lineHeight: 21,
  },
  expandMetaRow: { flexDirection: 'row', gap: 10 },
  expandMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  expandMetaText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  ruleSection: { gap: 8 },
  ruleSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleSectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ruleDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7, flexShrink: 0 },
  ruleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#C7C7CC',
    lineHeight: 20,
  },
  pairsSection: { gap: 8 },
  pairsSectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pairsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pairChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#2A2A2A',
  },
  pairChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1A0A0A',
    borderWidth: 1,
    borderColor: '#3D1414',
    marginTop: 4,
  },
  deleteBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF5252' },
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
    borderRadius: 26,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#000' },
});
