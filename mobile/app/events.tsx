import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function EventsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Events</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Learning and community sessions</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.comingSoonCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
            <Feather name="calendar" size={23} color={colors.buy} />
          </View>
          <View style={[styles.badge, { backgroundColor: colors.surface }]}>
            <View style={[styles.badgeDot, { backgroundColor: colors.buy }]} />
            <Text style={[styles.badgeText, { color: colors.buy }]}>COMING SOON</Text>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Something good is on the way</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            We’re working on events to help you learn, connect, and grow with the FXSnap community.
          </Text>
        </View>
      </View>

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
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 23, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 3, fontSize: 11, fontFamily: 'Inter_400Regular' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingBottom: 75 },
  comingSoonCard: { alignItems: 'center', paddingHorizontal: 23, paddingVertical: 28, borderWidth: 1, borderRadius: 22 },
  iconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  cardTitle: { marginTop: 15, textAlign: 'center', fontSize: 18, fontFamily: 'Inter_700Bold' },
  cardBody: { maxWidth: 285, marginTop: 7, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 7 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  centerNav: { width: 76, alignItems: 'center', justifyContent: 'center', marginTop: -19 },
  centerNavCircle: { width: 57, height: 57, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 7, shadowColor: '#087A68', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
});
