import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

// ─── Market sessions ──────────────────────────────────────────────────────────
type Session = { name: string; color: string; open: boolean };

function getMarketSessions(): Session[] {
  const now = new Date();
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const inRange = (s: number, e: number) =>
    e >= s ? utcMins >= s && utcMins < e : utcMins >= s || utcMins < e;
  return [
    { name: 'London',   color: '#4FC3F7', open: inRange(480, 1020) },
    { name: 'New York', color: '#00E676', open: inRange(780, 1320) },
    { name: 'Tokyo',    color: '#FFD60A', open: inRange(0, 540) },
    { name: 'Sydney',   color: '#FF80AB', open: inRange(1320, 420) },
  ];
}

function SessionPill({ session }: { session: Session }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (session.open) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      );
    } else {
      pulse.value = 1;
    }
  }, [session.open]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: session.open ? 1 : 0.35,
  }));

  return (
    <View style={[styles.sessionPill, !session.open && styles.sessionPillClosed]}>
      <Animated.View style={[styles.sessionDot, { backgroundColor: session.open ? session.color : '#48484A' }, dotStyle]} />
      <Text style={[styles.sessionText, { color: session.open ? '#FFFFFF' : '#48484A' }]}>
        {session.name}
      </Text>
    </View>
  );
}

function MarketBar() {
  const [sessions, setSessions] = useState<Session[]>(getMarketSessions());

  useEffect(() => {
    const t = setInterval(() => setSessions(getMarketSessions()), 30000);
    return () => clearInterval(t);
  }, []);

  const openCount = sessions.filter((s) => s.open).length;

  return (
    <Animated.View entering={FadeInDown.delay(320).duration(600)} style={styles.marketBar}>
      <View style={styles.marketBarLeft}>
        <View style={[styles.liveDot, { backgroundColor: openCount > 0 ? '#00E676' : '#3A3A3A' }]} />
        <Text style={styles.marketBarLabel}>
          {openCount > 0 ? `${openCount} open` : 'Closed'}
        </Text>
      </View>
      <View style={styles.sessionRow}>
        {sessions.map((s) => (
          <SessionPill key={s.name} session={s} />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Rotating daily insights ──────────────────────────────────────────────────
const INSIGHTS = [
  { icon: 'trending-up',  text: 'Trade with the trend — the trend is your friend.' },
  { icon: 'shield',       text: 'Never risk more than 2% of your account on a single trade.' },
  { icon: 'clock',        text: 'The London/NY overlap (13:00–17:00 UTC) offers the highest liquidity.' },
  { icon: 'target',       text: 'A 1:2 risk/reward means you only need to be right 34% of the time to profit.' },
  { icon: 'bar-chart-2',  text: 'Higher timeframe direction should always guide your entries.' },
  { icon: 'alert-circle', text: 'Avoid trading 30 minutes before major news events — spreads widen.' },
];

function InsightCard() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rotate = () => {
    setVisible(false);
    setTimeout(() => {
      setIndex((i) => (i + 1) % INSIGHTS.length);
      setVisible(true);
    }, 300);
  };

  useEffect(() => {
    intervalRef.current = setInterval(rotate, 5000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
    rotate();
    intervalRef.current = setInterval(rotate, 5000);
  };

  const insight = INSIGHTS[index];

  return (
    <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.insightCard}>
      <TouchableOpacity style={styles.insightInner} onPress={handleTap} activeOpacity={0.85}>
        <View style={styles.insightIcon}>
          <Feather name={insight.icon as any} size={18} color="#00E676" />
        </View>
        <View style={styles.insightBody}>
          <Text style={styles.insightLabel}>Daily Insight</Text>
          {visible ? (
            <Animated.Text entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.insightText}>
              {insight.text}
            </Animated.Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={16} color="#48484A" />
      </TouchableOpacity>
      {/* Progress dots */}
      <View style={styles.insightDots}>
        {INSIGHTS.map((_, i) => (
          <View key={i} style={[styles.insightDot, i === index && styles.insightDotActive]} />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Account snapshot ─────────────────────────────────────────────────────────
function AccountSnapshot() {
  const { settings } = useApp();
  const estimatedLot = Math.max(
    0.01,
    (settings.accountBalance * (settings.riskPercent / 100)) / (20 * 10)
  ).toFixed(2);

  return (
    <Animated.View entering={FadeInUp.delay(460).duration(600)} style={styles.snapshotCard}>
      <View style={styles.snapItem}>
        <Text style={styles.snapLabel}>Balance</Text>
        <Text style={styles.snapValue}>${settings.accountBalance.toLocaleString()}</Text>
      </View>
      <View style={styles.snapDivider} />
      <View style={styles.snapItem}>
        <Text style={styles.snapLabel}>Risk / trade</Text>
        <Text style={styles.snapValue}>{settings.riskPercent}%</Text>
      </View>
      <View style={styles.snapDivider} />
      <View style={styles.snapItem}>
        <Text style={styles.snapLabel}>Est. lot (20 pip)</Text>
        <Text style={[styles.snapValue, { color: '#00E676' }]}>{estimatedLot}</Text>
      </View>
      <TouchableOpacity style={styles.snapEdit} onPress={() => router.push('/settings')}>
        <Feather name="edit-2" size={13} color="#8E8E93" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────
function ActionButton({
  icon,
  label,
  sublabel,
  onPress,
  primary,
  badge,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  primary?: boolean;
  badge?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[animStyle, { width: '100%' }]}>
      <TouchableOpacity
        style={[styles.actionBtn, primary && styles.actionBtnPrimary]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scale.value = withSpring(0.97, { damping: 12, stiffness: 400 }, () => {
            scale.value = withSpring(1, { damping: 12, stiffness: 400 });
          });
          onPress();
        }}
        activeOpacity={0.9}
      >
        <View style={[styles.actionIconBox, primary && styles.actionIconBoxPrimary]}>
          <Feather name={icon as any} size={20} color={primary ? '#000' : '#FFFFFF'} />
        </View>
        <View style={styles.actionLabels}>
          <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
          {sublabel && (
            <Text style={[styles.actionSub, primary && styles.actionSubPrimary]}>{sublabel}</Text>
          )}
        </View>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <Feather name="chevron-right" size={18} color={primary ? '#00000060' : '#48484A'} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isSubscribed, savedStrategies } = useApp();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}> 
      {/* Header */}
      <Animated.View entering={FadeIn.delay(100).duration(500)} style={styles.header}>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.push('/settings')}>
          <Feather name="settings" size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.push('/saved')}>
          <Feather name="bookmark" size={20} color={colors.text} />
        </TouchableOpacity>
      </Animated.View>

      {/* Center content */}
      <View style={styles.center}>
        <Animated.Text entering={FadeInDown.delay(160).duration(600)} style={[styles.appTitle, { color: colors.text }]}>
          FXSnap
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(240).duration(600)} style={[styles.appSubtitle, { color: colors.textSecondary }]}>
          AI-powered chart analysis{'\n'}for smarter trading decisions
        </Animated.Text>

        <MarketBar />
        <InsightCard />
        <AccountSnapshot />
      </View>

      {/* Bottom buttons */}
      <Animated.View
        entering={FadeInUp.delay(520).duration(600)}
        style={[styles.bottomSection, { paddingBottom: botPad + 20 }]}
      >
        <ActionButton
          icon="activity"
          label="Run Analysis"
          sublabel="Upload a chart to get signals"
          onPress={() => { if (!isSubscribed) router.push('/paywall'); else router.push('/analysis'); }}
          primary
        />
        <ActionButton
          icon="sliders"
          label="Strategy"
          sublabel="Generate a personalised trading plan"
          onPress={() => { if (!isSubscribed) router.push('/paywall'); else router.push('/strategy'); }}
        />
        <ActionButton
          icon="cpu"
          label="My Strategies"
          sublabel="View your saved strategies"
          onPress={() => { if (!isSubscribed) router.push('/paywall'); else router.push('/my-strategies'); }}
          badge={savedStrategies.length}
        />
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          Disclaimer: This app does not provide financial advice. Consult a licensed professional before making investment decisions.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  appTitle: {
    fontSize: 46,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  appSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Market bar
  marketBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  marketBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  marketBarLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
  },
  sessionPillClosed: { backgroundColor: '#1A1A1A' },
  sessionDot: { width: 6, height: 6, borderRadius: 3 },
  sessionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  // Insight card
  insightCard: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  insightInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#1A3D26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightBody: { flex: 1, gap: 3 },
  insightLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#00E676', textTransform: 'uppercase', letterSpacing: 0.5 },
  insightText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#C7C7CC', lineHeight: 19 },
  insightDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingBottom: 10,
  },
  insightDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#2A2A2A' },
  insightDotActive: { backgroundColor: '#00E676', width: 14 },
  // Account snapshot
  snapshotCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  snapItem: { flex: 1, alignItems: 'center', gap: 3 },
  snapDivider: { width: 1, height: 30, backgroundColor: '#2A2A2A' },
  snapLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  snapValue: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  snapEdit: {
    marginLeft: 6,
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Action buttons
  bottomSection: { paddingHorizontal: 20, gap: 8, paddingTop: 8 },
  actionBtn: {
    width: '100%',
    height: 62,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  actionBtnPrimary: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBoxPrimary: { backgroundColor: '#00000015' },
  actionLabels: { flex: 1 },
  actionLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  actionLabelPrimary: { color: '#000000' },
  actionSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#48484A', marginTop: 1 },
  actionSubPrimary: { color: '#00000060' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#1A3D26',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#00E676' },
  disclaimer: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },
});
