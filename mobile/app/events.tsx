import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { hasSupabaseConfiguration } from '@/services/supabase';
import {
  getAdminEventSpaceAccess,
  getEventSpaces,
  isLocalEventsDemoEnabled,
  subscribeToEventSpaceChanges,
  type EventSpace,
} from '@/services/eventSpaces';

function dateLabel(value: string | null) {
  if (!value) return 'Date to be announced';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date to be announced';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function statusLabel(status: EventSpace['status']) {
  if (status === 'waiting_room_open') return 'WAITING ROOM OPEN';
  return status.toUpperCase();
}

export default function EventsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { demo: demoParam } = useLocalSearchParams<{ demo?: string }>();
  const isDemo = isLocalEventsDemoEnabled(demoParam);
  const [spaces, setSpaces] = useState<EventSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [adminAccess, setAdminAccess] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const result = await getEventSpaces(isDemo);
      setSpaces(result.spaces);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Events could not be loaded. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useFocusEffect(useCallback(() => {
    void load();
    void getAdminEventSpaceAccess(isDemo)
      .then((result) => setAdminAccess(result.allowed))
      .catch(() => setAdminAccess(false));
  }, [isDemo, load]));

  useEffect(() => {
    if (isDemo) return;
    if (!hasSupabaseConfiguration()) return;
    try {
      return subscribeToEventSpaceChanges(() => { void load(true); });
    } catch (subscriptionError) {
      console.error('[Events] Could not initialize realtime updates.', subscriptionError);
      return undefined;
    }
  }, [isDemo, load]);

  const liveSpaces = useMemo(() => spaces.filter((space) => space.status === 'live'), [spaces]);
  const upcomingSpaces = useMemo(
    () => spaces.filter((space) => ['scheduled', 'waiting_room_open'].includes(space.status)),
    [spaces],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 100 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.buy} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Events</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Join the conversation. Learn from the market.</Text>
          </View>
          {adminAccess ? (
            <TouchableOpacity
              onPress={() => router.push(isDemo
                ? { pathname: '/events-admin', params: { demo: '1' } }
                : '/events-admin')}
              style={[styles.adminButton, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel="Manage events"
            >
              <Feather name="settings" size={17} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        </View>

        {isDemo ? (
          <View style={[styles.demoNotice, { backgroundColor: `${colors.buy}12`, borderColor: `${colors.buy}35` }]}>
            <Feather name="eye" size={15} color={colors.buy} />
            <Text style={[styles.demoNoticeText, { color: colors.text }]}>
              LOCAL PREVIEW — Demo events stay in this browser only. No server, Supabase, or LiveKit changes are made.
            </Text>
          </View>
        ) : null}

        {liveSpaces.length > 0 ? (
          <View style={[styles.liveCount, { backgroundColor: `${colors.sell}10` }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.sell }]} />
            <Text style={[styles.liveCountText, { color: colors.sell }]}>{liveSpaces.length} LIVE NOW</Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.feedback, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="alert-circle" size={18} color={colors.sell} />
            <Text style={[styles.feedbackText, { color: colors.text }]}>{error}</Text>
            <TouchableOpacity onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel="Retry loading events">
              <Text style={[styles.retry, { color: colors.buy }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? <ActivityIndicator style={styles.loader} color={colors.buy} /> : null}

        {!loading && !error ? (
          <>
            <SectionTitle title="Live Now" subtitle="Join a conversation in progress" colors={colors} />
            {liveSpaces.length ? liveSpaces.map((space) => (
              <SpaceCard key={space.id} space={space} colors={colors} />
            )) : (
              <View style={[styles.emptyLive, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                  <Feather name="mic" size={18} color={colors.buy} />
                </View>
                <View style={styles.emptyCopy}>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No live conversations right now</Text>
                  <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Check back soon for a live market discussion.</Text>
                </View>
              </View>
            )}

            <SectionTitle title="Coming Up" subtitle="Scheduled sessions" colors={colors} />
            {upcomingSpaces.length ? upcomingSpaces.map((space) => (
              <SpaceCard key={space.id} space={space} colors={colors} />
            )) : !liveSpaces.length ? (
              <View style={styles.noUpcoming}>
                <Feather name="calendar" size={18} color={colors.textMuted} />
                <Text style={[styles.noUpcomingText, { color: colors.textSecondary }]}>No upcoming sessions have been published yet.</Text>
              </View>
            ) : null}

            <SectionTitle title="Explore Spaces" subtitle="Published by FXSnap hosts" colors={colors} />
            {spaces.length ? spaces.map((space) => (
              <SpaceCard key={`explore-${space.id}`} space={space} colors={colors} compact />
            )) : (
              <View style={[styles.emptyExplore, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="users" size={19} color={colors.buy} />
                <Text style={[styles.emptyExploreTitle, { color: colors.text }]}>Spaces are on the way</Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Published sessions will appear here when they are ready.</Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomNav, {
        backgroundColor: colors.background,
        borderTopColor: colors.cardBorder,
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6),
      }]}>
        <BottomItem icon="home" label="Home" colors={colors} onPress={() => router.replace('/(tabs)/home')} />
        <BottomItem icon="users" label="Community" colors={colors} onPress={() => router.push('/community')} />
        <TouchableOpacity onPress={() => router.push('/analysis')} style={styles.centerNav} accessibilityLabel="Open FXSnap AI analysis">
          <View style={[styles.centerNavCircle, { backgroundColor: colors.buy }]}>
            <Feather name="aperture" size={22} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>Analyze</Text>
        </TouchableOpacity>
        <BottomItem icon="calendar" label="Events" active colors={colors} onPress={() => {}} />
        <BottomItem icon="user" label="Profile" colors={colors} onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

function SectionTitle({ title, subtitle, colors }: { title: string; subtitle: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.sectionTitle}>
      <View>
        <Text style={[styles.sectionHeading, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function SpaceCard({ space, colors, compact = false }: { space: EventSpace; colors: ReturnType<typeof useColors>; compact?: boolean }) {
  const live = space.status === 'live';
  const waiting = space.status === 'waiting_room_open';
  return (
    <View style={[styles.spaceCard, compact && styles.compactSpaceCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.spaceTop}>
        <View style={[styles.topicPill, { backgroundColor: colors.surface }]}>
          <Text style={[styles.topicText, { color: colors.buy }]} numberOfLines={1}>{space.topic}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: live ? `${colors.sell}12` : `${colors.buy}12` }]}>
          {live ? <View style={[styles.liveDot, { backgroundColor: colors.sell }]} /> : null}
          <Text style={[styles.statusText, { color: live ? colors.sell : colors.buy }]}>{statusLabel(space.status)}</Text>
        </View>
      </View>
      <LinearGradient
        colors={live ? ['#082A25', '#0D5146', '#116C59'] : ['#102D29', '#16483F', '#1B5B4D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spaceHero}
      >
        <View style={styles.spaceHeroCopy}>
          <Text style={styles.spaceEyebrow}>{live ? 'LIVE AUDIO SPACE' : 'FXSNAP EVENT SPACE'}</Text>
          <Text style={styles.spaceTitle} numberOfLines={2}>{space.title}</Text>
        </View>
        <View style={styles.spaceHeroIcon}>
          <Feather name={live ? 'headphones' : 'radio'} size={21} color="#C5F5E9" />
        </View>
      </LinearGradient>
      {space.description ? <Text style={[styles.spaceDescription, { color: colors.textSecondary }]} numberOfLines={3}>{space.description}</Text> : null}
      <View style={styles.hostRow}>
        {space.host_picture_url ? (
          <Image source={{ uri: space.host_picture_url }} style={styles.hostAvatar} />
        ) : (
          <View style={[styles.hostAvatarFallback, { backgroundColor: colors.surface }]}>
            <Feather name="user" size={14} color={colors.textSecondary} />
          </View>
        )}
        <Text style={[styles.hostName, { color: colors.textSecondary }]} numberOfLines={1}>Hosted by {space.host_name}</Text>
      </View>
      {space.scheduled_at ? (
        <View style={styles.dateRow}>
          <Feather name="clock" size={14} color={colors.textMuted} />
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dateLabel(space.scheduled_at)}</Text>
          {space.duration_minutes ? <Text style={[styles.duration, { color: colors.textMuted }]}>{space.duration_minutes} min</Text> : null}
        </View>
      ) : null}
      {waiting ? (
        <>
          <View style={[styles.notice, { backgroundColor: colors.surface }]}>
            <Feather name="info" size={14} color={colors.textSecondary} />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>The host is preparing the room. Join the waiting room to be admitted.</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: './event-room', params: { id: space.id } })}
            style={[styles.waitingButton, { borderColor: colors.buy }]}
            accessibilityRole="button"
            accessibilityLabel={`Join waiting room: ${space.title}`}
          >
            <Feather name="users" size={14} color={colors.buy} />
            <Text style={[styles.waitingButtonText, { color: colors.buy }]}>Join waiting room</Text>
          </TouchableOpacity>
        </>
      ) : live ? (
        <TouchableOpacity
          onPress={() => router.push({ pathname: './event-room', params: { id: space.id } })}
          style={[styles.joinButton, { backgroundColor: colors.buy }]}
          accessibilityRole="button"
          accessibilityLabel={`Join live audio: ${space.title}`}
        >
          <Feather name="headphones" size={15} color={colors.primaryForeground} />
          <Text style={[styles.joinButtonText, { color: colors.primaryForeground }]}>Join live audio</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function BottomItem({
  icon, label, colors, onPress, active = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  active?: boolean;
}) {
  const color = active ? colors.buy : colors.textMuted;
  return (
    <TouchableOpacity onPress={onPress} style={styles.navItem}>
      <Feather name={icon} size={19} color={color} />
      <Text style={[styles.navLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 19 },
  demoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 18, marginBottom: 12, padding: 11, borderWidth: 1, borderRadius: 12 },
  demoNoticeText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
  headingCopy: { flex: 1, paddingRight: 12 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 4, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  adminButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  liveCount: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginHorizontal: 18, marginBottom: 8, gap: 7, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveCountText: { fontSize: 9, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  loader: { marginTop: 34 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18, marginTop: 10, padding: 13, borderWidth: 1, borderRadius: 14 },
  feedbackText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  retry: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  sectionTitle: { marginHorizontal: 20, marginTop: 17, marginBottom: 10 },
  sectionHeading: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sectionSubtitle: { marginTop: 2, fontSize: 10, fontFamily: 'Inter_400Regular' },
  emptyLive: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, padding: 14, borderWidth: 1, borderRadius: 17 },
  emptyIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { flex: 1 },
  emptyTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyBody: { marginTop: 4, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  noUpcoming: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 20, paddingVertical: 9 },
  noUpcomingText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  emptyExplore: { alignItems: 'center', marginHorizontal: 18, padding: 20, borderWidth: 1, borderRadius: 17 },
  emptyExploreTitle: { marginTop: 9, fontSize: 13, fontFamily: 'Inter_700Bold' },
  spaceCard: { marginHorizontal: 18, marginBottom: 12, padding: 12, borderWidth: 1, borderRadius: 21, shadowColor: '#041C18', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  compactSpaceCard: { paddingVertical: 13 },
  spaceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topicPill: { maxWidth: '58%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14 },
  topicText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 },
  statusText: { fontSize: 8, letterSpacing: 0.35, fontFamily: 'Inter_700Bold' },
  spaceHero: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  spaceHeroCopy: { flex: 1 },
  spaceEyebrow: { color: '#A9D8CC', fontSize: 8, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  spaceHeroIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: 'rgba(225,255,247,0.22)', backgroundColor: 'rgba(225,255,247,0.10)' },
  spaceTitle: { marginTop: 6, color: '#F5FFFC', fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  spaceDescription: { marginTop: 5, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  hostRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11, gap: 7 },
  hostAvatar: { width: 25, height: 25, borderRadius: 13 },
  hostAvatarFallback: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hostName: { flex: 1, fontSize: 10, fontFamily: 'Inter_500Medium' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9, gap: 6 },
  dateText: { flex: 1, fontSize: 10, fontFamily: 'Inter_500Medium' },
  duration: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12 },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  joinButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderRadius: 12 },
  joinButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  waitingButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 11, borderWidth: 1, borderRadius: 12 },
  waitingButtonText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 7 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  centerNav: { width: 76, alignItems: 'center', justifyContent: 'center', marginTop: -19 },
  centerNavCircle: { width: 57, height: 57, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 7, shadowColor: '#087A68', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
});
