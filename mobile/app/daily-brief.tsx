import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { DefaultNewsProvider, DailyBriefResponse, DailyBriefCard } from '@/services/news';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { getDeviceId } from '@/services/apiAuth';

const provider = new DefaultNewsProvider();

function formatTimeLabel(value?: string) {
  if (!value) return 'Just now';
  try {
    const dt = new Date(value);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return 'Just now';
  }
}

export default function DailyBriefScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedBriefs, saveBriefCard, deleteBriefCard } = useApp();
  const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [index, setIndex] = useState(0);
  const offsetX = useRef(new Animated.Value(0)).current;
  const shareCardRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    provider
      .getDailyBrief()
      .then((response) => {
        if (!active) return;
        setBrief(response);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBrief({
          title: 'Your daily brief is ready',
          dateText: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
          updatesToday: 0,
          cards: [],
        });
        setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const cards = useMemo(() => brief?.cards ?? [], [brief]);
  const currentCard = cards[index] ?? null;
  const briefId = useMemo(() => {
    const dateKey = brief?.dateText ? brief.dateText.replace(/\s+/g, '-').toLowerCase() : new Date().toISOString().slice(0, 10);
    return `daily-brief-${dateKey}`;
  }, [brief]);
  const savedCardIds = useMemo(() => new Set(savedBriefs.filter((item) => item.brief_id === briefId).map((item) => item.card_id)), [savedBriefs, briefId]);

  const goToCard = (nextIndex: number) => {
    if (!cards.length) return;
    const safeIndex = (nextIndex + cards.length) % cards.length;
    Animated.sequence([
      Animated.timing(offsetX, { toValue: -28, duration: 120, useNativeDriver: true }),
      Animated.timing(offsetX, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    setIndex(safeIndex);
  };

  const next = () => goToCard(index + 1);
  const prev = () => goToCard(index - 1);

  const handleStoryTap = (event: any) => {
    if (!cards.length) return;
    const x = event?.nativeEvent?.locationX ?? 0;
    const screenX = 200;
    if (x < screenX / 2) {
      prev();
    } else {
      next();
    }
  };

  const handleBackdropPress = () => {
    if (showCover) setShowCover(false);
  };

  const renderIntro = () => (
    <Pressable onPress={handleBackdropPress} style={styles.cover}>
      <Text style={[styles.kicker, { color: colors.buy }]}>FXSnap</Text>
      <Text style={[styles.coverTitle, { color: colors.text }]}>Your daily brief is ready</Text>
      <Text style={[styles.coverDate, { color: colors.textSecondary }]}>{brief?.dateText || new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</Text>
      <Text style={[styles.coverCount, { color: colors.textSecondary }]}>{brief?.updatesToday ?? 0} updates today</Text>
      <Text style={[styles.coverHint, { color: colors.textMuted }]}>Tap to enter</Text>
    </Pressable>
  );

  const toggleSaveCard = async (card: DailyBriefCard) => {
    const deviceId = await getDeviceId();
    const record = {
      user_id: deviceId,
      brief_id: briefId,
      card_id: card.id,
      instrument: card.instrument,
      headline: card.headline,
      summary: card.explanation,
      created_at: new Date().toISOString(),
    };
    if (savedCardIds.has(card.id)) {
      await deleteBriefCard(briefId, card.id);
      return;
    }
    await saveBriefCard(record);
  };

  const handleShareCard = async (card: DailyBriefCard) => {
    const summary = card.explanation.trim();
    const shareText = `FXSnap Market Brief\n${card.instrument}\n${card.headline}\n${summary}\n${formatTimeLabel(card.timestamp)}`;

    try {
      if (!shareCardRef.current) {
        await Share.share({
          title: 'FXSnap Market Brief',
          message: shareText,
        });
        return;
      }

      const uri = await (shareCardRef.current as any).capture?.({
        format: 'png',
        quality: 0.92,
        result: 'tmpfile',
      });

      if (!uri) {
        await Share.share({ title: 'FXSnap Market Brief', message: shareText });
        return;
      }

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        await Share.share({ title: 'FXSnap Market Brief', message: shareText });
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share market brief',
      });
    } catch (_error) {
      await Share.share({ title: 'FXSnap Market Brief', message: shareText }).catch(() => undefined);
    }
  };

  const renderCard = (card: DailyBriefCard) => {
    const isSaved = savedCardIds.has(card.id);
    return (
      <View key={card.id} style={[styles.cardShell, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeader}>
          <View style={styles.badgeWrap}>
            <Text style={[styles.badge, { color: colors.buy, backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>{card.category}</Text>
            <Text style={[styles.instrument, { color: colors.textSecondary }]}>{card.instrument}</Text>
          </View>
          <Text style={[styles.cardImpact, { color: card.impact === 'HIGH' ? colors.sell : card.impact === 'MEDIUM' ? colors.buy : colors.textSecondary }]}>{card.impact} IMPACT</Text>
        </View>

        <Text style={[styles.cardHeadline, { color: colors.text }]}>{card.headline}</Text>
        <Text style={[styles.cardSubheading, { color: colors.buy }]}>{card.subheading}</Text>
        <Text style={[styles.cardExplanation, { color: colors.textSecondary }]}>{card.explanation}</Text>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{formatTimeLabel(card.timestamp)}</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{card.instrument}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => void toggleSaveCard(card)}
            style={[styles.saveButton, { backgroundColor: isSaved ? colors.primary : colors.surface, borderColor: colors.cardBorder }]}
            activeOpacity={0.86}
          >
            <Feather name="bookmark" size={14} color={isSaved ? colors.primaryForeground : colors.text} />
            <Text style={[styles.saveButtonText, { color: isSaved ? colors.primaryForeground : colors.text }]}>{isSaved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleShareCard(card)}
            style={[styles.saveButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
            activeOpacity={0.86}
          >
            <Feather name="share-2" size={14} color={colors.text} />
            <Text style={[styles.saveButtonText, { color: colors.text }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const shareCard = currentCard ? (() => {
    const summary = currentCard.explanation.trim();
    const compactSummary = summary.length > 140 ? `${summary.slice(0, 137).trim()}...` : summary;
    return (
      <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 0.92 }} style={styles.shareCardHost}>
        <View style={[styles.shareCard, { backgroundColor: '#0B0F18', borderColor: '#1F2B38' }]}>
          <View style={styles.shareTopBar}>
            <Text style={[styles.shareBrand, { color: '#7DD3FC' }]}>FXSnap</Text>
            <View style={styles.sharePill}>
              <Text style={[styles.sharePillText, { color: '#E0F2FE' }]}>MARKET BRIEF</Text>
            </View>
          </View>

          <View style={styles.shareBody}>
            <Text style={[styles.shareInstrument, { color: '#F5FAFF' }]}>{currentCard.instrument}</Text>
            <Text style={[styles.shareHeadline, { color: '#F5FAFF' }]}>{currentCard.headline}</Text>
            <Text style={[styles.shareSummary, { color: '#C7D2FE' }]}>{compactSummary}</Text>
          </View>

          <View style={styles.shareFooter}>
            <Text style={[styles.shareDate, { color: '#9AA7B5' }]}>{formatTimeLabel(currentCard.timestamp)}</Text>
            <Text style={[styles.shareLogo, { color: '#7DD3FC' }]}>FXSnap</Text>
          </View>
        </View>
      </ViewShot>
    );
  })() : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      {shareCard}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="x" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Daily Brief</Text>
        <TouchableOpacity onPress={() => router.push('/saved-briefs')} activeOpacity={0.8}>
          <Feather name="bookmark" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading briefing…</Text>
        </View>
      ) : null}

      {!loading && showCover && brief ? renderIntro() : null}

      {!loading && !showCover && currentCard ? (
        <>
          <Pressable onPress={handleStoryTap} style={styles.storyViewport}>
            <Animated.View style={[styles.storyInner, { transform: [{ translateX: offsetX }] }]}>
              {renderCard(currentCard)}
            </Animated.View>
          </Pressable>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.navButton} onPress={prev}>
              <Feather name="chevron-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.progressWrap}>
              {cards.map((card, itemIndex) => (
                <View
                  key={card.id}
                  style={[
                    styles.progressBar,
                    {
                      backgroundColor: itemIndex === index ? colors.buy : colors.cardBorder,
                      opacity: itemIndex === index ? 1 : 0.4,
                    },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.navButton} onPress={next}>
              <Feather name="chevron-right" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {!loading && !showCover && !currentCard ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No brief available</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Market updates are temporarily unavailable.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  topBarTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  cover: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  kicker: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
  coverTitle: { fontSize: 30, fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 10 },
  coverDate: { fontSize: 18, fontFamily: 'Inter_500Medium', marginBottom: 10 },
  coverCount: { fontSize: 16, fontFamily: 'Inter_500Medium', marginBottom: 24 },
  coverHint: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase' },
  storyViewport: { flex: 1, justifyContent: 'center', paddingHorizontal: 18 },
  storyInner: { flex: 1 },
  shareCardHost: { position: 'absolute', left: -10000, top: 0, width: 1080, height: 1920 },
  shareCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 40,
    padding: 46,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  shareTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 42 },
  shareBrand: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase' },
  sharePill: { borderWidth: 1, borderColor: '#243446', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#121A24' },
  sharePillText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  shareBody: { flex: 1, justifyContent: 'center' },
  shareInstrument: { fontSize: 30, fontFamily: 'Inter_700Bold', marginBottom: 14 },
  shareHeadline: { fontSize: 50, lineHeight: 58, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  shareSummary: { fontSize: 22, lineHeight: 31, fontFamily: 'Inter_500Medium' },
  shareFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 },
  shareDate: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  shareLogo: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  cardShell: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    minHeight: 420,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  badgeWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  instrument: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardImpact: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  cardHeadline: { fontSize: 30, lineHeight: 38, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  cardSubheading: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 18 },
  cardExplanation: { fontSize: 16, lineHeight: 25, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    flex: 1,
  },
  saveButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 8,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
