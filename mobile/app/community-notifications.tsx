import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import CommunityPreviewNotice from '@/components/CommunityPreviewNotice';
import { useColors } from '@/hooks/useColors';
import {
  getCommunityNotifications,
  markCommunityNotificationRead,
  markSystemAnnouncementRead,
  subscribeToSystemAnnouncementChanges,
  subscribeToCommunityChanges,
  type CommunityNotification,
} from '@/services/community';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NotificationFilter = 'all' | 'mentions' | 'replies' | 'reactions' | 'updates';
const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'replies', label: 'Replies' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'updates', label: 'Updates' },
];

function ageLabel(value: string) {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Notifications could not be loaded.';
}

export default function CommunityNotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await getCommunityNotifications();
      setNotifications(response.notifications);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToCommunityChanges((eventType) => {
      if (eventType !== 'notification') return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void load(); }, 180);
    });
    const unsubscribeAnnouncements = subscribeToSystemAnnouncementChanges(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void load(); }, 180);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
      unsubscribeAnnouncements();
    };
  }, [load]);

  const visible = useMemo(() => notifications.filter((item) => {
    if (item.kind === 'system_announcement' && item.channels?.notification_center !== true) return false;
    if (filter === 'all') return true;
    if (filter === 'mentions') return item.kind === 'mention';
    if (filter === 'replies') return item.kind === 'reply';
    if (filter === 'updates') return item.kind === 'system_announcement';
    return item.kind === 'reaction';
  }), [filter, notifications]);

  const open = (item: CommunityNotification) => {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((previous) => previous.map((notification) => notification.id === item.id
        ? { ...notification, read_at: readAt }
        : notification));
      const markRead = item.kind === 'system_announcement'
        ? markSystemAnnouncementRead(item.id)
        : markCommunityNotificationRead(item.id);
      void markRead.catch((failure: unknown) => {
        setNotifications((previous) => previous.map((notification) => notification.id === item.id
          ? { ...notification, read_at: null }
          : notification));
        Alert.alert('Could not mark notification read', errorMessage(failure));
      });
    }
    if (item.kind === 'system_announcement') {
      router.push({ pathname: '/system-announcement', params: { id: item.id } });
    } else if (item.kind === 'support_reply') {
      router.push('/community-support');
    } else if (item.post_id) {
      router.push({ pathname: '/community', params: { postId: item.post_id } });
    } else if (item.object_id) {
      router.push({ pathname: '/community', params: { postId: item.object_id } });
    } else {
      setFilter('all');
    }
  };

  const iconFor = (kind: string): keyof typeof Feather.glyphMap => {
    if (kind === 'reply') return 'message-circle';
    if (kind === 'reaction') return 'heart';
    if (kind === 'support_reply') return 'headphones';
    if (kind === 'system_announcement') return 'bell';
    return 'bell';
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity onPress={() => void load()} style={styles.back} accessibilityLabel="Refresh notifications">
          <Feather name="refresh-cw" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.filters, { borderBottomColor: colors.cardBorder }]}>
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => setFilter(item.id)}
            style={[styles.filter, filter === item.id && { borderBottomColor: colors.buy }]}
          >
            <Text style={[styles.filterLabel, { color: filter === item.id ? colors.buy : colors.textSecondary }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <CommunityPreviewNotice />
      {loading ? <ActivityIndicator style={styles.loading} color={colors.buy} /> : null}
      {error ? (
        <View style={styles.feedback}>
          <Text style={[styles.feedbackText, { color: colors.sell }]}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }}>
            <Text style={[styles.retry, { color: colors.buy }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error ? (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => void open(item)}
              style={[styles.row, { borderBottomColor: colors.cardBorder }]}
              accessibilityRole="button"
            >
              <View style={[styles.icon, { backgroundColor: item.read_at ? colors.surface : `${colors.buy}18` }]}>
                <Feather name={iconFor(item.kind)} size={18} color={item.read_at ? colors.textMuted : colors.buy} />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.message, { color: colors.text }]}>
                  {item.kind === 'system_announcement' && item.title ? `${item.title} · ` : ''}{item.message}
                </Text>
                <Text style={[styles.time, { color: colors.textMuted }]}>{ageLabel(item.created_at)}</Text>
              </View>
              {!item.read_at ? <View style={[styles.unread, { backgroundColor: colors.buy }]} /> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={filter === 'mentions' ? 'at-sign' : 'bell'} size={24} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>You’re all caught up</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {filter === 'all' ? 'Community activity and FXSnap updates will show up here.' : `No ${filter} yet.`}
              </Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_700Bold' },
  filters: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  filter: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  loading: { marginTop: 28 },
  list: { paddingHorizontal: 16 },
  row: { minHeight: 76, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  message: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  unread: { width: 7, height: 7, borderRadius: 4 },
  feedback: { padding: 22, alignItems: 'center', gap: 10 },
  feedbackText: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },
  retry: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  empty: { paddingHorizontal: 32, paddingTop: 60, alignItems: 'center', gap: 9 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  emptyText: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
});
