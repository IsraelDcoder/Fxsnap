import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
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
import { trackError } from '@/services/telemetry';
import * as Sentry from '@sentry/react-native';
import { getCommunityNotificationDestination } from '@/services/communityNotificationNavigation';

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

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const isDark = useColorScheme() === 'dark';
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    trackError(error, { component: 'CommunityNotificationsScreen' });
    Sentry.captureException(error, { tags: { screen: 'CommunityNotifications' } });
  }, [error]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.errorBoundary, { backgroundColor: isDark ? '#111311' : '#F7F7F5' }]}>
      <Feather name="alert-circle" size={30} color={isDark ? '#E5C84B' : '#9A7B00'} />
      <Text style={[styles.errorBoundaryTitle, { color: isDark ? '#FFFFFF' : '#171A17' }]}>Notifications hit a snag</Text>
      <Text style={[styles.errorBoundaryBody, { color: isDark ? '#B9C0BA' : '#59615B' }]}>
        Retry notifications or return to the rest of the app.
      </Text>
      {__DEV__ ? <Text selectable style={[styles.errorBoundaryDetails, { color: isDark ? '#D5D5D5' : '#59615B' }]}>{error.message}</Text> : null}
      <TouchableOpacity onPress={() => void handleRetry()} disabled={retrying} style={styles.errorBoundaryPrimary} accessibilityRole="button">
        {retrying
          ? <ActivityIndicator color="#111311" />
          : <Text style={[styles.errorBoundaryPrimaryText, { color: isDark ? '#111311' : '#171A17' }]}>Try again</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/')} style={styles.errorBoundarySecondary} accessibilityRole="button">
        <Text style={[styles.errorBoundarySecondaryText, { color: isDark ? '#E5C84B' : '#806600' }]}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CommunityNotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);

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

  const open = async (item: CommunityNotification) => {
    if (openingNotificationId) return;
    setOpeningNotificationId(item.id);
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((previous) => previous.map((notification) => notification.id === item.id
        ? { ...notification, read_at: readAt }
        : notification));
      const markRead = item.kind === 'system_announcement'
        ? markSystemAnnouncementRead(item.id)
        : markCommunityNotificationRead(item.id);
      void markRead.catch((failure: unknown) => {
        console.warn('[Community notifications] Could not mark notification read.', {
          notificationId: item.id,
          error: errorMessage(failure),
        });
        setNotifications((previous) => previous.map((notification) => notification.id === item.id
          ? { ...notification, read_at: null }
          : notification));
      });
    }
    try {
      const destination = getCommunityNotificationDestination(item);
      if (!destination) {
        Alert.alert('Notification unavailable', 'This notification no longer has a link to its Community discussion.');
      } else if (destination.pathname === '/community-support') {
        router.push('/community-support');
      } else {
        router.push(destination);
      }
    } catch (failure) {
      Alert.alert('Could not open notification', errorMessage(failure));
    } finally {
      setOpeningNotificationId(null);
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
              disabled={openingNotificationId !== null}
              style={[styles.row, { borderBottomColor: colors.cardBorder }]}
              accessibilityRole="button"
            >
              <View style={[styles.icon, { backgroundColor: item.read_at ? colors.surface : `${colors.buy}18` }]}>
                {openingNotificationId === item.id
                  ? <ActivityIndicator size="small" color={colors.buy} />
                  : <Feather name={iconFor(item.kind)} size={18} color={item.read_at ? colors.textMuted : colors.buy} />}
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
  errorBoundary: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  errorBoundaryTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  errorBoundaryBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  errorBoundaryDetails: { fontSize: 12, lineHeight: 17, maxWidth: '100%' },
  errorBoundaryPrimary: { minHeight: 48, minWidth: 210, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 18, backgroundColor: '#E5C84B' },
  errorBoundaryPrimaryText: { fontSize: 14, fontWeight: '700' },
  errorBoundarySecondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  errorBoundarySecondaryText: { fontSize: 14, fontWeight: '600' },
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
