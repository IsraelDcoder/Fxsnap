import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getTradingSessionState, SESSION_DEFINITIONS } from '@/services/tradingSessions';
import { getDailyBriefState, type DailyBriefItem, type DailyBriefState } from '@/services/dailyBrief';
import { getDeviceId } from '@/services/apiAuth';
import type { ProtectedFeature } from '@/services/featureAccess';
function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export default function HomeDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, savedBriefs, saveBriefCard, deleteBriefCard, checkFeatureAccess } = useApp();
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [sessionState, setSessionState] = useState(getTradingSessionState());
  const [now, setNow] = useState(new Date());
  const [briefState, setBriefState] = useState<DailyBriefState | null>(null);
  const [briefSaveMessage, setBriefSaveMessage] = useState('');

  const firstName = settings.displayName.trim().split(/\s+/)[0] || 'Trader';

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNow(new Date());
      setSessionState(getTradingSessionState());
    }, 30000);
    return () => {
      clearInterval(clockTimer);
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDailyBriefState().then((briefState) => {
      if (active) {
        setBriefState(briefState);
      }
    });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    if (!briefSaveMessage) return;
    const timer = setTimeout(() => setBriefSaveMessage(''), 1800);
    return () => clearTimeout(timer);
  }, [briefSaveMessage]);

  const navigate = (path: '/analysis' | '/strategy' | '/settings' | '/daily-brief' | '/economic-calendar' | '/lot-size-calculator' | '/risk-management' | '/saved' | '/my-strategies') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  };

  const openProtectedFeature = async (feature: ProtectedFeature, route: '/analysis' | '/strategy') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const access = await checkFeatureAccess(feature, route, route === '/analysis');
      if (access.error) {
        if (route === '/analysis') {
          router.push(route);
          return;
        }
        Alert.alert('Unable to verify access', access.error);
        return;
      }
      if (!access.allowed) return;
      router.push(route);
    } catch (error) {
      Alert.alert('Unable to open feature', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const openAnalysis = () => openProtectedFeature('AI_ANALYSIS', '/analysis');
  const openStrategy = () => openProtectedFeature('STRATEGY_GENERATOR', '/strategy');

  const showSessions = () => setSessionModalVisible(true);
  const support = () => {
    void Linking.openURL(`mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app'}`).catch(() => {
      Alert.alert('Support', process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app');
    });
  };

  const activeSessionNames = sessionState.activeSessions.map((session) => session.name);
  const currentBrief = briefState?.briefs.find((brief) => !briefState.readIds.includes(brief.id)) || null;
  const currentBriefSaved = Boolean(currentBrief && savedBriefs.some((brief) => brief.brief_id === `daily-brief-${briefState?.dateKey}` && brief.card_id === currentBrief.id));

  const toggleBriefSave = async (brief: DailyBriefItem, event: any) => {
    event.stopPropagation?.();
    const briefId = `daily-brief-${briefState?.dateKey || 'today'}`;
    if (currentBriefSaved) {
      await deleteBriefCard(briefId, brief.id);
      setBriefSaveMessage('Removed from saved briefs');
      return;
    }
    const userId = await getDeviceId();
    await saveBriefCard({
      user_id: userId,
      brief_id: briefId,
      card_id: brief.id,
      instrument: brief.category,
      headline: brief.title,
      summary: `${brief.body}\n\nFXSnap Takeaway: ${brief.takeaway}`,
      created_at: new Date().toISOString(),
    });
    setBriefSaveMessage('Saved to your briefs');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 116 + insets.bottom }}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <Feather name="trending-up" size={24} color={colors.buy} />
            <Text style={[styles.brandName, { color: colors.text }]}>FX<Text style={{ color: colors.buy }}>Snap</Text></Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigate('/daily-brief')}
              style={[styles.headerIcon, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
              accessibilityLabel="Open Daily Brief"
            >
              <Feather name="bell" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigate('/settings')} style={[styles.headerIcon, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]} accessibilityLabel="Profile settings">
              <Feather name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greetingForHour(now.getHours())}</Text>
          <Text style={[styles.greetingName, { color: colors.text }]}>{firstName} <Text style={{ color: colors.buy }}>👋</Text></Text>
        </View>

        <View style={[styles.hero, { borderColor: `${colors.buy}55`, backgroundColor: colors.surface }]}>
          <View style={styles.heroCopy}>
            <View style={styles.aiBadge}>
              <View style={[styles.badgeDot, { backgroundColor: colors.buy }]} />
              <Text style={[styles.aiBadgeText, { color: colors.buy }]}>FXSNAP AI</Text>
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Smarter Analysis.</Text>
            <Text style={[styles.heroTitle, { color: colors.buy }]}>Better Trades.</Text>
            <Text style={[styles.heroDescription, { color: colors.textSecondary }]}>AI-powered chart analysis, trade setups, lot sizing and strategy tools, all in one place.</Text>
          </View>
          <View style={[styles.heroDivider, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.heroInsight}>
            <Text style={[styles.dailyBriefKicker, { color: colors.buy }]}>TODAY'S TRADING INSIGHT</Text>
          {!briefState ? (
            <Text style={[styles.dailyBriefBody, { color: colors.textSecondary }]}>Preparing today's trading insight…</Text>
          ) : currentBrief ? (
            <>
              <Text numberOfLines={2} style={[styles.dailyBriefTitle, { color: colors.text }]}>{currentBrief.title}</Text>
              <Text style={[styles.dailyBriefCategory, { color: colors.textMuted }]}>{currentBrief.category}</Text>
              <Text numberOfLines={2} style={[styles.dailyBriefBody, { color: colors.textSecondary }]}>{currentBrief.body}</Text>
              <View style={styles.dailyBriefBottom}>
                <TouchableOpacity onPress={() => navigate('/daily-brief')} style={styles.dailyBriefRead} accessibilityRole="button" accessibilityLabel="Read today's brief">
                  <Text style={[styles.dailyBriefReadText, { color: colors.buy }]}>Read today's brief</Text>
                  <Feather name="arrow-right" size={13} color={colors.buy} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(event) => void toggleBriefSave(currentBrief, event)}
                  style={[styles.dailyBriefSave, { backgroundColor: currentBriefSaved ? `${colors.buy}18` : colors.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel={currentBriefSaved ? 'Remove saved insight' : 'Save insight'}
                >
                  <Feather name="heart" size={16} color={currentBriefSaved ? colors.buy : colors.textMuted} />
                </TouchableOpacity>
              </View>
              {briefSaveMessage ? <Text style={[styles.dailyBriefToast, { color: colors.buy }]}>{briefSaveMessage}</Text> : null}
            </>
          ) : (
            <>
              <Text style={[styles.dailyBriefTitle, { color: colors.text }]}>Today's insight is complete.</Text>
              <Text style={[styles.dailyBriefBody, { color: colors.textSecondary }]}>Come back tomorrow for a new FX learning insight.</Text>
              <TouchableOpacity onPress={() => navigate('/daily-brief')} style={styles.dailyBriefRead} accessibilityRole="button" accessibilityLabel="Review Daily Brief">
                <Text style={[styles.dailyBriefReadText, { color: colors.buy }]}>Review Daily Brief</Text>
                <Feather name="arrow-right" size={13} color={colors.buy} />
              </TouchableOpacity>
            </>
          )}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void openAnalysis()}
          activeOpacity={0.9}
          style={[styles.primaryCard, { borderColor: `${colors.buy}55`, backgroundColor: colors.card }]}
        >
          <View style={[styles.primaryIcon, { backgroundColor: `${colors.buy}1A` }]}>
            <Feather name="aperture" size={22} color={colors.buy} />
          </View>
          <View style={styles.primaryCopy}>
            <Text style={[styles.primaryTitle, { color: colors.text }]}>AI Chart Analysis</Text>
            <Text style={[styles.primaryDescription, { color: colors.textSecondary }]}>Upload a chart for structured, AI-powered trading insights.</Text>
          </View>
          <View style={[styles.primaryCta, { backgroundColor: colors.buy }]}>
            <Text style={[styles.primaryCtaText, { color: colors.primaryForeground }]}>Analyze</Text>
            <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
          </View>
        </TouchableOpacity>

        <View style={styles.shortcutGrid}>
          <Shortcut icon="trending-up" label="Trade\nSetup" colors={colors} onPress={() => void openProtectedFeature('TRADE_SETUP', '/analysis')} />
          <Shortcut icon="grid" label="Lot Size\nCalculator" colors={colors} onPress={() => navigate('/lot-size-calculator')} />
          <Shortcut icon="sliders" label="Strategy\nGenerator" colors={colors} onPress={() => void openStrategy()} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Access</Text>
          </View>
          <View style={styles.quickAccessGrid}>
            <QuickAccess icon="calendar" label="Economic\nCalendar" colors={colors} onPress={() => navigate('/economic-calendar')} />
            <QuickAccess icon="clock" label="Trading\nSessions" colors={colors} onPress={showSessions} />
            <QuickAccess icon="shield" label="Risk\nManagement" colors={colors} onPress={() => navigate('/risk-management')} />
            <QuickAccess icon="headphones" label="Help &\nSupport" colors={colors} onPress={support} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <NavItem icon="home" label="Home" active colors={colors} onPress={() => {}} />
        <NavItem icon="bookmark" label="Analysis" colors={colors} onPress={() => navigate('/saved')} />
        <TouchableOpacity onPress={() => void openAnalysis()} style={styles.aiNavButton} accessibilityLabel="Open FXSnap AI analysis">
          <View style={[styles.aiNavCircle, { backgroundColor: colors.buy }]}><Feather name="aperture" size={24} color={colors.primaryForeground} /></View>
        </TouchableOpacity>
        <NavItem icon="layers" label="Strategies" colors={colors} onPress={() => navigate('/my-strategies')} />
        <NavItem icon="user" label="Profile" colors={colors} onPress={() => navigate('/settings')} />
      </View>

      <Modal visible={sessionModalVisible} transparent animationType="fade" onRequestClose={() => setSessionModalVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.sessionModal, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trading Sessions</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{sessionState.headline}</Text>
              </View>
              <TouchableOpacity onPress={() => setSessionModalVisible(false)} style={[styles.modalClose, { backgroundColor: colors.surface }]} accessibilityLabel="Close sessions">
                <Feather name="x" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {SESSION_DEFINITIONS.map((session) => {
              const active = activeSessionNames.includes(session.name);
              return (
                <View key={session.name} style={[styles.sessionRow, { borderTopColor: colors.cardBorder }]}>
                  <View style={[styles.badgeDot, { backgroundColor: active ? colors.buy : colors.textMuted }]} />
                  <Text style={[styles.sessionName, { color: colors.text }]}>{session.name}</Text>
                  <Text style={[styles.sessionOpen, { color: active ? colors.buy : colors.textMuted }]}>{active ? 'Open' : 'Closed'}</Text>
                </View>
              );
            })}
            <Text style={[styles.modalFootnote, { color: colors.textMuted }]}>Times are calculated from UTC market hours.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Shortcut({ icon, label, colors, onPress }: { icon: string; label: string; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.shortcut} activeOpacity={0.8}>
      <View style={[styles.shortcutIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Feather name={icon as any} size={20} color={colors.buy} />
      </View>
      <Text style={[styles.shortcutLabel, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAccess({ icon, label, colors, onPress }: { icon: string; label: string; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.quickAccess, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} activeOpacity={0.82}>
      <Feather name={icon as any} size={17} color={colors.textSecondary} />
      <Text style={[styles.quickAccessLabel, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function NavItem({ icon, label, active, colors, onPress }: { icon: string; label: string; active?: boolean; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.navItem} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon as any} size={20} color={active ? colors.buy : colors.textMuted} />
      <Text style={[styles.navLabel, { color: active ? colors.buy : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { fontSize: 25, fontFamily: 'Inter_700Bold' },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', right: -5, top: -4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#050505' },
  notificationBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  greetingBlock: { paddingHorizontal: 22, paddingTop: 25, paddingBottom: 15 },
  greeting: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  greetingName: { marginTop: 2, fontSize: 26, fontFamily: 'Inter_700Bold' },
  hero: { marginHorizontal: 18, borderWidth: 1, borderRadius: 22, padding: 18, overflow: 'hidden' },
  heroCopy: { paddingBottom: 0 },
  aiBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  aiBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  heroTitle: { fontSize: 27, lineHeight: 33, fontFamily: 'Inter_700Bold' },
  heroDescription: { maxWidth: 340, fontSize: 13, lineHeight: 19, marginTop: 9, fontFamily: 'Inter_400Regular' },
  heroDivider: { height: StyleSheet.hairlineWidth, marginTop: 18, marginBottom: 15 },
  heroInsight: { gap: 0 },
  dailyBriefCard: { marginTop: 13, marginHorizontal: 18, borderWidth: 1, borderRadius: 18, padding: 14, overflow: 'hidden' },
  dailyBriefHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dailyBriefBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dailyBriefIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dailyBriefEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  dailyBriefCount: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dailyBriefKicker: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  dailyBriefTitle: { marginTop: 5, fontSize: 17, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  dailyBriefBody: { marginTop: 5, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  dailyBriefCategory: { marginTop: 7, fontSize: 9, fontFamily: 'Inter_500Medium' },
  dailyBriefBottom: { marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dailyBriefRead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dailyBriefReadText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dailyBriefSave: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dailyBriefToast: { marginTop: 5, fontSize: 9, fontFamily: 'Inter_500Medium' },
  primaryCard: { marginTop: 14, marginHorizontal: 18, minHeight: 112, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 15, gap: 12 },
  primaryIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryCopy: { flex: 1, gap: 4 },
  primaryTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  primaryDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  primaryCta: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 12 },
  primaryCtaText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  shortcutGrid: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, paddingTop: 23, paddingBottom: 8 },
  shortcut: { width: '31%', minHeight: 86, alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  shortcutIcon: { width: 54, height: 54, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  section: { marginTop: 19 },
  sectionHeading: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  quickAccessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingHorizontal: 18 },
  quickAccess: { width: '48.5%', minHeight: 70, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'space-between' },
  quickAccessLabel: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  aiNavButton: { width: 58, alignItems: 'center', justifyContent: 'center', marginTop: -18 },
  aiNavCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#00E887', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end', padding: 16 },
  sessionModal: { borderWidth: 1, borderRadius: 20, padding: 18, paddingBottom: 23 },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalSubtitle: { marginTop: 4, fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalClose: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  sessionName: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sessionOpen: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  modalFootnote: { marginTop: 10, fontSize: 10, fontFamily: 'Inter_400Regular' },
});