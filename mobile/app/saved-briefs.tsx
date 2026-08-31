import React, { useMemo } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recent';
  }
}

export default function SavedBriefsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedBriefs, deleteBriefCard } = useApp();

  const sortedBriefs = useMemo(
    () => [...savedBriefs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [savedBriefs],
  );

  const handleDelete = (briefId: string, cardId: string) => {
    Alert.alert('Remove saved brief', 'Delete this saved brief card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteBriefCard(briefId, cardId) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Saved Briefs</Text>
        <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>{sortedBriefs.length}</Text>
        </View>
      </View>

      {sortedBriefs.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bookmark" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved brief cards</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Save any story card from your daily brief to keep it here.</Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/daily-brief')}>
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Open brief</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedBriefs}
          keyExtractor={(item) => `${item.brief_id}-${item.card_id}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.instrument, { color: colors.textSecondary }]}>{item.instrument}</Text>
                <TouchableOpacity onPress={() => handleDelete(item.brief_id, item.card_id)}>
                  <Feather name="trash-2" size={16} color={colors.sell} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.headline, { color: colors.text }]}>{item.headline}</Text>
              <Text style={[styles.summary, { color: colors.textSecondary }]}>{item.summary}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{formatDate(item.created_at)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  badge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 14, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 20 },
  primaryButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  listContent: { paddingHorizontal: 18, paddingBottom: 32 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  instrument: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' },
  headline: { fontSize: 20, fontFamily: 'Inter_700Bold', lineHeight: 28, marginBottom: 8 },
  summary: { fontSize: 14, lineHeight: 22, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  meta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
