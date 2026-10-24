import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { DefaultNewsProvider, type UpcomingEvent } from '@/services/news';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const newsProvider = new DefaultNewsProvider();
type ImpactFilter = 'all' | 'high';

function eventDate(value: string) {
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function eventDayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'TODAY';
  if (date.toDateString() === tomorrow.toDateString()) return 'TOMORROW';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date).toUpperCase();
}

function eventTimeLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function updatedLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`;
}

function impactColor(impact: UpcomingEvent['impact'], colors: ReturnType<typeof useColors>) {
  if (impact === 'HIGH') return colors.sell;
  if (impact === 'MEDIUM') return colors.buy;
  return colors.textMuted;
}

function currencyFlag(currency?: string | null) {
  const flags: Record<string, string> = {
    AUD: '🇦🇺',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    CNY: '🇨🇳',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    NZD: '🇳🇿',
    USD: '🇺🇸',
  };
  return currency ? flags[currency.toUpperCase()] ?? null : null;
}

function eventCategoryIcon(title: string): React.ComponentProps<typeof Feather>['name'] {
  if (/rate|interest|central bank|monetary|policy/i.test(title)) return 'percent';
  if (/cpi|inflation|price/i.test(title)) return 'trending-up';
  if (/employment|job|unemployment|payroll|claimant/i.test(title)) return 'users';
  if (/gdp|growth|production|sales/i.test(title)) return 'bar-chart-2';
  if (/speech|speaks|testimony|meeting|conference/i.test(title)) return 'mic';
  if (/auction|bond|yield|debt/i.test(title)) return 'layers';
  if (/time|saving|clock/i.test(title)) return 'clock';
  return 'calendar';
}

function CalendarEventCard({ event }: { event: UpcomingEvent }) {
  const colors = useColors();
  const date = eventDate(event.date);
  const severity = impactColor(event.impact, colors);
  const flag = currencyFlag(event.currency);
  const categoryIcon = eventCategoryIcon(event.title);
  const resultValues = [
    event.actual ? { label: 'Actual', value: event.actual } : null,
    event.forecast ? { label: 'Forecast', value: event.forecast } : null,
    event.previous ? { label: 'Previous', value: event.previous } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  return (
    <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, borderLeftColor: severity }]}>
      <View style={styles.eventMain}>
        <View style={[styles.eventVisual, { backgroundColor: `${severity}14` }]}>
          {flag ? (
            <Text style={styles.currencyFlag} accessibilityLabel={`${event.currency} flag`}>{flag}</Text>
          ) : (
            <Feather name={categoryIcon} size={19} color={severity} />
          )}
          <View style={[styles.categoryIconBadge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name={categoryIcon} size={10} color={colors.textSecondary} />
          </View>
        </View>
        <View style={styles.eventCopy}>
          <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
          <View style={styles.eventMetaRow}>
            {event.currency ? (
              <View style={[styles.currencyBadge, { backgroundColor: colors.surface }]}>
                <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>{event.currency}</Text>
              </View>
            ) : null}
            {event.country ? <Text style={[styles.eventMeta, { color: colors.textSecondary }]} numberOfLines={1}>{event.country}</Text> : null}
            {!event.currency && !event.country ? <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>Global event</Text> : null}
          </View>
        </View>
        <View style={styles.eventTiming}>
          {date ? <Text style={[styles.eventTime, { color: colors.text }]}>{eventTimeLabel(date)}</Text> : null}
          <View style={[styles.impactBadge, { backgroundColor: `${severity}18` }]}>
            <View style={[styles.impactDot, { backgroundColor: severity }]} />
            <Text style={[styles.impactText, { color: severity }]}>{event.impact}</Text>
          </View>
        </View>
      </View>
      {resultValues.length > 0 ? (
        <View style={[styles.resultValues, { borderTopColor: colors.cardBorder }]}>
          {resultValues.map((item) => (
            <View key={item.label} style={styles.resultValue}>
              <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text style={[styles.resultText, { color: colors.text }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function EconomicCalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadCalendar = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError('');
    try {
      const result = await newsProvider.getEconomicCalendar(manual);
      const now = Date.now();
      const upcoming = result.events
        .filter((event) => typeof event.id === 'string' && typeof event.title === 'string' && typeof event.date === 'string')
        .filter((event) => {
          const date = eventDate(event.date);
          return date && date.getTime() >= now;
        })
        .sort((first, second) => (eventDate(first.date)?.getTime() ?? 0) - (eventDate(second.date)?.getTime() ?? 0));
      setEvents(upcoming);
      setLive(result.live);
      setSource(result.source);
      setUpdatedAt(result.updatedAt);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The economic calendar could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadCalendar();
    const interval = setInterval(() => void loadCalendar(), REFRESH_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadCalendar();
    });
    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [loadCalendar]));

  const visibleEvents = useMemo(
    () => impactFilter === 'high' ? events.filter((event) => event.impact === 'HIGH') : events,
    [events, impactFilter],
  );
  const liveLabel = source === 'forex_factory_weekly' ? 'WEEKLY FEED' : live ? 'LIVE FEED' : 'FEED UNAVAILABLE';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCalendar(true)} tintColor={colors.buy} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Economic Calendar</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Upcoming forex market events</Text>
          </View>
          <TouchableOpacity
            onPress={() => void loadCalendar(true)}
            disabled={refreshing}
            style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Refresh economic calendar"
          >
            <Feather name="refresh-cw" size={17} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.liveBadge, { backgroundColor: live ? `${colors.buy}16` : `${colors.textMuted}16` }]}>
            <View style={[styles.liveDot, { backgroundColor: live ? colors.buy : colors.textMuted }]} />
            <Text style={[styles.liveText, { color: live ? colors.buy : colors.textMuted }]}>{liveLabel}</Text>
          </View>
          <Text style={[styles.updatedText, { color: colors.textMuted }]}>{updatedLabel(updatedAt)}</Text>
        </View>
        {live ? (
          <View style={[styles.calendarSummary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.summaryIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="calendar" size={18} color={colors.buy} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>The week ahead</Text>
              <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>Track the releases that can move markets.</Text>
            </View>
            <View style={[styles.eventCountBadge, { backgroundColor: `${colors.buy}15` }]}>
              <Text style={[styles.eventCount, { color: colors.buy }]}>{events.length}</Text>
              <Text style={[styles.eventCountLabel, { color: colors.buy }]}>EVENTS</Text>
            </View>
          </View>
        ) : null}
        {source === 'forex_factory_weekly' ? (
          <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
            Public Forex Factory weekly feed · prototype only; verify redistribution permission before release.
          </Text>
        ) : null}

        <View style={styles.filterRow}>
          {([
            { key: 'all', label: 'All events' },
            { key: 'high', label: 'High impact' },
          ] as const).map((filter) => {
            const selected = impactFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                onPress={() => setImpactFilter(filter.key)}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor: selected ? `${colors.buy}18` : colors.card,
                    borderColor: selected ? colors.buy : colors.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, { color: selected ? colors.buy : colors.textSecondary }]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="alert-circle" size={20} color={colors.sell} />
            <Text style={[styles.messageTitle, { color: colors.text }]}>Calendar update failed</Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity onPress={() => void loadCalendar(true)} style={[styles.retryButton, { backgroundColor: colors.buy }]}>
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? <ActivityIndicator style={styles.loader} color={colors.buy} /> : null}

        {!loading && !error && !live ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="wifi-off" size={22} color={colors.textMuted} />
            <Text style={[styles.messageTitle, { color: colors.text }]}>Live calendar is not connected</Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              Market events will appear here when the calendar data provider is configured.
            </Text>
          </View>
        ) : null}

        {!loading && !error && live && visibleEvents.length === 0 ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="calendar" size={22} color={colors.buy} />
            <Text style={[styles.messageTitle, { color: colors.text }]}>
              {impactFilter === 'high' ? 'No upcoming high-impact events' : 'No upcoming events'}
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              {impactFilter === 'high'
                ? 'There are no high-impact events in the current calendar window.'
                : 'No upcoming events were returned by the calendar provider.'}
            </Text>
          </View>
        ) : null}

        {!loading && !error && visibleEvents.map((event, index) => {
          const date = eventDate(event.date);
          const previousDate = index > 0 ? eventDate(visibleEvents[index - 1].date) : null;
          const showDayHeading = Boolean(date && (!previousDate || date.toDateString() !== previousDate.toDateString()));
          return (
            <React.Fragment key={event.id}>
              {showDayHeading && date ? (
                <Text style={[styles.dayHeading, { color: colors.textMuted }]}>{eventDayLabel(date)}</Text>
              ) : null}
              <CalendarEventCard event={event} />
            </React.Fragment>
          );
        })}
        {live && !error && !loading ? (
          <Text style={[styles.refreshNote, { color: colors.textMuted }]}>
            Automatically refreshes every {REFRESH_INTERVAL_MS / 60000} minutes. Pull down to refresh now.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 15 },
  headerButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  subtitle: { marginTop: 3, fontSize: 11, fontFamily: 'Inter_400Regular' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, marginBottom: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  updatedText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  sourceNote: { fontSize: 10, lineHeight: 15, marginTop: -10, marginBottom: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterButton: { borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14 },
  filterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dayHeading: { fontSize: 11, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginTop: 19, marginBottom: 9 },
  calendarSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 14 },
  summaryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  summarySubtitle: { fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'Inter_400Regular' },
  eventCountBadge: { minWidth: 45, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 6, borderRadius: 11 },
  eventCount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  eventCountLabel: { fontSize: 7, letterSpacing: 0.5, fontFamily: 'Inter_700Bold', marginTop: 1 },
  eventCard: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 16, padding: 12, marginBottom: 9 },
  eventMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventVisual: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  currencyFlag: { fontSize: 23, lineHeight: 28 },
  categoryIconBadge: { position: 'absolute', width: 18, height: 18, right: -4, bottom: -4, borderWidth: 1, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  eventCopy: { flex: 1 },
  eventTitle: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  currencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  eventMeta: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  resultValues: { flexDirection: 'row', gap: 24, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10 },
  resultValue: { gap: 3 },
  resultLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  resultText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  eventTiming: { alignItems: 'flex-end', gap: 8 },
  eventTime: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  impactBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  impactDot: { width: 6, height: 6, borderRadius: 3 },
  impactText: { fontSize: 9, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  messageCard: { alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 22, paddingVertical: 26, marginTop: 14 },
  messageTitle: { marginTop: 12, fontSize: 15, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  messageBody: { maxWidth: 320, marginTop: 8, fontSize: 12, lineHeight: 19, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 17, borderRadius: 12, marginTop: 16 },
  retryText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loader: { marginTop: 42 },
  refreshNote: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 16 },
});
