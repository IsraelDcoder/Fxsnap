import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import SimpleChart from '@/components/SimpleChart';
import * as market from '@/services/market';
import { DefaultNewsProvider, NewsProvider } from '@/services/news';

const newsProvider: NewsProvider = new DefaultNewsProvider();

export default function InstrumentDetail() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const symbol = String(params.symbol || '').toUpperCase();
  const colors = useColors();

  const [activeTab, setActiveTab] = useState<'technical' | 'news'>('technical');
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [intervalKey, setIntervalKey] = useState<'15m' | '1H' | '4H' | '1D'>('15m');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const q = await market.fetchQuote(symbol);
        if (!mounted) return;
        setQuote(q);
        const interval = market.INTERVAL_MAP[intervalKey] || '15min';
        const c = await market.fetchCandles(symbol, interval, 200);
        if (!mounted) return;
        setCandles(c);
      } catch (e) {
        if (!mounted) return;
        // `e` can be unknown in TS; safely coerce to any to access message
        setError(String((e as any)?.message ?? e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [symbol, intervalKey]);

  useEffect(() => {
    if (activeTab !== 'news') return;

    let mounted = true;
    setNewsLoading(true);
    void Promise.all([
      newsProvider.getNewsForInstrument(symbol),
      newsProvider.getUpcomingEvents(symbol),
    ])
      .then(([items, events]) => {
        if (!mounted) return;
        setNewsItems(items);
        setUpcomingEvents(events);
      })
      .catch(() => {
        if (!mounted) return;
        setNewsItems([]);
        setUpcomingEvents([]);
      })
      .finally(() => {
        if (mounted) setNewsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, symbol]);

  const onAnalyze = async () => {
    if (!candles.length) {
      Alert.alert('Analyze Market', 'No candle history is available yet.');
      return;
    }

    setAnalyzing(true);
    try {
      const result = await market.analyzeMarket(symbol, intervalKey, candles);
      setAnalysis(result);
    } catch (e) {
      Alert.alert('Analyze Market', String((e as any)?.message ?? e));
    } finally {
      setAnalyzing(false);
    }
  };

  const tabOptions = useMemo(() => [
    { key: 'technical', label: 'TECHNICAL' },
    { key: 'news', label: 'NEWS' },
  ], []);

  const renderTechnicalTab = () => (
    <View>
      <View style={styles.chartBox}>
        {loading ? (
          <View style={{ paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={colors.buy} />
          </View>
        ) : error ? (
          <View style={{ paddingVertical: 20 }}>
            <Text style={{ color: colors.textSecondary }}>Error loading data: {error}</Text>
          </View>
        ) : candles && candles.length ? (
          <SimpleChart candles={candles.map((c: any) => ({ time: c.time || c.datetime || c.datetime, open: c.open != null ? Number(c.open) : null, high: c.high != null ? Number(c.high) : null, low: c.low != null ? Number(c.low) : null, close: c.close != null ? Number(c.close) : null }))} />
        ) : (
          <View style={{ paddingVertical: 20 }}>
            <Text style={{ color: colors.textSecondary }}>No market history available.</Text>
          </View>
        )}
      </View>

      <View style={styles.timeframeRow}>
        {(['15m', '1H', '4H', '1D'] as const).map((tf) => (
          <TouchableOpacity key={tf} onPress={() => setIntervalKey(tf)} style={[styles.tfButton, intervalKey === tf ? { borderColor: colors.buy, backgroundColor: colors.card } : { borderColor: colors.cardBorder, backgroundColor: colors.background }]}>
            <Text style={{ color: intervalKey === tf ? colors.buy : colors.text }}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginTop: 18 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onAnalyze} style={[styles.analyzeButton, { backgroundColor: colors.buy }]}>
          <Text style={[styles.analyzeText, { color: '#00110A' }]}>{analyzing ? 'Analyzing…' : 'Analyze Market'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.analysisCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        {analysis ? (
          <>
            <Text style={[styles.analysisTitle, { color: colors.text }]}>Latest FXSnap AI analysis</Text>
            <Text style={[styles.analysisMetric, { color: colors.textSecondary }]}>Bias: <Text style={{ color: colors.text, fontWeight: '700' }}>{analysis.marketBias ?? 'neutral'}</Text></Text>
            <Text style={[styles.analysisMetric, { color: colors.textSecondary }]}>Setup: <Text style={{ color: colors.text, fontWeight: '700' }}>{analysis.setupStatus ?? 'NO_SETUP'}</Text></Text>
            <Text style={[styles.analysisMetric, { color: colors.textSecondary }]}>Decision: <Text style={{ color: colors.text, fontWeight: '700' }}>{analysis.decision ?? analysis.tradeStatus ?? 'NO_TRADE'}</Text></Text>
            <Text style={[styles.analysisMetric, { color: colors.textSecondary }]}>Confidence: <Text style={{ color: colors.text, fontWeight: '700' }}>{analysis.marketConfidence ?? analysis.confidence ?? 0}%</Text></Text>
            <Text style={[styles.analysisNote, { color: colors.textSecondary }]}>{analysis.analysis?.notes || analysis.message || 'No strong setup is currently active.'}</Text>
          </>
        ) : (
          <Text style={[styles.analysisEmpty, { color: colors.textSecondary }]}>Run the structured market analysis to evaluate the current setup.</Text>
        )}
      </View>
    </View>
  );

  const renderNewsTab = () => (
    <View style={[styles.newsContainer, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      {newsLoading ? (
        <View style={styles.newsState}>
          <ActivityIndicator size="small" color={colors.buy} />
        </View>
      ) : (
        <View style={styles.newsList}>
          {upcomingEvents.length > 0 && (
            <View style={[styles.eventPanel, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}>
              <Text style={[styles.eventHeader, { color: colors.text }]}>Upcoming events</Text>
              {upcomingEvents.map((event) => (
                <View key={event.id} style={[styles.eventRow, { borderColor: colors.cardBorder }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                    <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>{event.date ? new Date(event.date).toLocaleString() : 'Date TBD'}</Text>
                  </View>
                  <View style={[styles.impactBadge, { backgroundColor: event.impact === 'HIGH' ? '#FF5252' : event.impact === 'MEDIUM' ? '#FFD60A' : '#2A2A2A' }]}>
                    <Text style={styles.impactText}>{event.impact}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {newsItems.length ? (
            newsItems.map((item) => (
              <View key={item.id} style={[styles.newsItem, { borderColor: colors.cardBorder }]}>
                <View style={styles.newsHeaderRow}>
                  <Text style={[styles.newsTitle, { color: colors.text }]}>{item.title}</Text>
                  {item.impact ? (
                    <View style={[styles.impactBadge, { backgroundColor: item.impact === 'HIGH' ? '#FF5252' : item.impact === 'MEDIUM' ? '#FFD60A' : '#2A2A2A' }]}>
                      <Text style={styles.impactText}>{item.impact}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.newsMeta, { color: colors.textSecondary }]}>{item.source} • {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Recent'}</Text>
                <Text style={[styles.newsSummary, { color: colors.textSecondary }]}>{item.summary}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.newsEmpty, { color: colors.textSecondary }]}>No market news available for this instrument yet.</Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <ScreenWrapper style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} scrollable={true}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.symbol, { color: colors.text }]}>{symbol}</Text>
          <Text style={[styles.session, { color: colors.textSecondary }]}>{quote && quote.raw && quote.raw.exchange ? String(quote.raw.exchange) : 'Market'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.price, { color: colors.text }]}>{quote && quote.price != null ? Number(quote.price).toLocaleString() : '—'}</Text>
          <Text style={[styles.change, { color: (quote && quote.price && quote.raw && quote.raw.previous_close && Number(quote.price) - Number(quote.raw.previous_close) > 0) ? colors.buy : colors.sell }]}>
            {quote && quote.raw && quote.raw.previous_close ? `${(Number(quote.price) - Number(quote.raw.previous_close)).toFixed(5)} (${quote.raw.percent_change ? quote.raw.percent_change : '—'})` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.segmentedControl}>
        {tabOptions.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.85}
              onPress={() => setActiveTab(tab.key as 'technical' | 'news')}
              style={[
                styles.segmentButton,
                {
                  backgroundColor: isActive ? colors.card : 'transparent',
                  borderColor: isActive ? colors.cardBorder : 'transparent',
                },
              ]}
            >
              <Text style={{ color: isActive ? colors.text : colors.textSecondary, fontSize: 12, letterSpacing: 0.8, fontWeight: '600' }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'technical' ? renderTechnicalTab() : renderNewsTab()}

      <View style={{ height: 30 }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  symbol: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  session: { fontSize: 12, marginTop: 2 },
  price: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  change: { fontSize: 12, marginTop: 4 },
  chartBox: { marginTop: 8 },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginTop: 10,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  timeframeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tfButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  analyzeButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  analyzeText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  analysisCard: { marginTop: 18, borderRadius: 12, borderWidth: 1, padding: 14 },
  analysisTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  analysisMetric: { fontSize: 13, marginBottom: 6 },
  analysisNote: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  analysisEmpty: { fontSize: 12, lineHeight: 18 },
  newsContainer: { borderRadius: 12, borderWidth: 1, padding: 12, minHeight: 180 },
  newsState: { alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  newsList: { gap: 10 },
  eventPanel: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10 },
  eventHeader: { fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.6 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  eventTitle: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  eventMeta: { fontSize: 11 },
  newsItem: { borderRadius: 10, borderWidth: 1, padding: 12 },
  newsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  newsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4, flex: 1 },
  newsMeta: { fontSize: 11, marginBottom: 6 },
  newsSummary: { fontSize: 12, lineHeight: 18 },
  newsEmpty: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 20 },
  impactBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  impactText: { color: '#05120D', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
