import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getSystemAnnouncements,
  markSystemAnnouncementRead,
  type SystemAnnouncement,
} from '@/services/community';

const DESTINATION_ROUTES: Record<SystemAnnouncement['destination'], Href> = {
  home: '/',
  community: '/community',
  analysis: '/analysis',
  events: '/events',
  profile: '/profile',
  notification_center: '/community-notifications',
};

export default function SystemAnnouncementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [announcement, setAnnouncement] = useState<SystemAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const openDestination = () => {
    if (announcement?.destination === 'community' && announcement.destination_params.postId) {
      router.push({ pathname: '/community', params: { postId: announcement.destination_params.postId } });
      return;
    }
    if (announcement) router.push(DESTINATION_ROUTES[announcement.destination]);
  };

  const load = useCallback(async () => {
    setError('');
    try {
      if (typeof id !== 'string') throw new Error('This announcement link is invalid.');
      const response = await getSystemAnnouncements();
      const item = response.announcements.find((entry) => entry.id === id);
      if (!item) throw new Error('This announcement is no longer available.');
      setAnnouncement(item);
      if (!item.read_at) await markSystemAnnouncementRead(item.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The announcement could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>FXSnap announcement</Text>
        <View style={styles.back} />
      </View>
      {loading ? <ActivityIndicator style={styles.loader} color={colors.buy} /> : null}
      {error ? (
        <View style={styles.feedback}>
          <Text style={[styles.error, { color: colors.sell }]}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }}>
            <Text style={[styles.retry, { color: colors.buy }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {announcement ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          <View style={[styles.badge, { backgroundColor: `${colors.buy}18` }]}>
            <Feather name="bell" size={14} color={colors.buy} />
            <Text style={[styles.badgeText, { color: colors.buy }]}>{announcement.type.replace('_', ' ')}</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{announcement.title}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {new Date(announcement.published_at).toLocaleString()}
          </Text>
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.message, { color: colors.text }]}>{announcement.message}</Text>
          </View>
          <TouchableOpacity
            onPress={openDestination}
            style={[styles.action, { backgroundColor: colors.buy }]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Open related section</Text>
            <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  loader: { marginTop: 28 },
  feedback: { padding: 20, alignItems: 'center', gap: 12 },
  error: { textAlign: 'center', fontSize: 14, fontFamily: 'Inter_500Medium' },
  retry: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  content: { padding: 20, gap: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  badgeText: { textTransform: 'capitalize', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 25, lineHeight: 32, fontFamily: 'Inter_700Bold' },
  time: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  messageCard: { borderWidth: 1, borderRadius: 18, padding: 17 },
  message: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  action: { minHeight: 48, borderRadius: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
