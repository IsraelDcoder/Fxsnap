import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { DefaultNewsProvider, type UpcomingEvent } from '@/services/news';

const provider = new DefaultNewsProvider();

function dayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

export default function EconomicCalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setRefreshing(true);
      const result = await provider.getEconomicCalendar();
      if (!active) return;
      const sorted = [...result.events].filter((event) => Number.isFinite(Date.parse(event.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      setEvents(sorted);
      setLive(result.live);
      setUpdatedAt(new Date());
      setLoading(false);
      setRefreshing(false);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshToken]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, UpcomingEvent[]>();
    events.forEach((event) => {
      const label = dayLabel(event.date);
      groups.set(label, [...(groups.get(label) || []), event]);
    });
    return Array.from(groups.entries());
  }, [events]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Economic Calendar</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Upcoming forex market events</Text>
        </View>
        <TouchableOpacity onPress={() => setRefreshToken((value) => value + 1)} style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Refresh calendar">
          {refreshing ? <ActivityIndicator size="small" color={colors.buy} /> : <Feather name="refresh-cw" size={18} color={colors.buy} />}
        </TouchableOpacity>
      </View>

      <View style={[styles.feedStatus, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <View style={[styles.statusDot, { backgroundColor: live ? colors.buy : colors.textMuted }]} />
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {live ? 'Live provider calendar' : 'Live calendar feed unavailable'}
        </Text>
        <View style={{ flex: 1 }} />
        {updatedAt ? <Text style={[styles.updatedText, { color: colors.textMuted }]}>Updated {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(updatedAt)}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={colors.buy} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading calendar events</Text>
          </View>
        ) : !live ? (
          <View style={[styles.emptyState, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}><Feather name="calendar" size={22} color={colors.textMuted} /></View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Calendar feed not connected</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Connect a Twelve Data economic calendar key on the FXSnap server to load current event schedules.</Text>
          </View>
        ) : groupedEvents.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}><Feather name="check-circle" size={22} color={colors.buy} /></View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No upcoming events returned</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>The provider returned no scheduled events for the current calendar window.</Text>
          </View>
        ) : (
          groupedEvents.map(([day, dayEvents]) => (
            <View key={day} style={styles.dayGroup}>
              <Text style={[styles.dayTitle, { color: colors.textSecondary }]}>{day}</Text>
              {dayEvents.map((event) => {
                const impactColor = event.impact === 'HIGH' ? colors.sell : event.impact === 'MEDIUM' ? colors.buy : colors.textMuted;
                return (
                  <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={[styles.impactRail, { backgroundColor: impactColor }]} />
                    <View style={styles.eventContent}>
                      <View style={styles.eventTopline}>
                        <Text style={[styles.eventTime, { color: colors.buy }]}>{timeLabel(event.date)}</Text>
                        <View style={[styles.impactBadge, { backgroundColor: `${impactColor}1A` }]}>
                          <Text style={[styles.impactLabel, { color: impactColor }]}>{event.impact.toLowerCase()} impact</Text>
                        </View>
                      </View>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
                        {[event.currency, event.country].filter(Boolean).join(' · ') || 'Currency not specified'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
  headerButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  subtitle: { marginTop: 3, fontSize: 11, fontFamily: 'Inter_400Regular' },
  feedStatus: { minHeight: 38, marginHorizontal: 18, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  updatedText: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  content: { paddingHorizontal: 18, paddingTop: 22 },
  dayGroup: { marginBottom: 22 },
  dayTitle: { marginBottom: 9, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  eventCard: { minHeight: 92, flexDirection: 'row', borderWidth: 1, borderRadius: 15, overflow: 'hidden', marginBottom: 9 },
  impactRail: { width: 3 },
  eventContent: { flex: 1, padding: 12 },
  eventTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eventTime: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  impactBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  impactLabel: { textTransform: 'capitalize', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  eventTitle: { marginTop: 8, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  eventMeta: { marginTop: 4, fontSize: 10, fontFamily: 'Inter_400Regular' },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyState: { minHeight: 215, borderWidth: 1, borderRadius: 17, padding: 22, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emptyTitle: { fontSize: 15, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  emptyText: { marginTop: 7, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
});