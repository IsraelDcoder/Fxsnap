import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function EconomicCalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
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
      </View>

      <View style={styles.content}>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(380)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${colors.buy}18` }]}>
            <Feather name="calendar" size={25} color={colors.buy} />
          </View>
          <View style={[styles.badge, { backgroundColor: `${colors.buy}15` }]}>
            <View style={[styles.badgeDot, { backgroundColor: colors.buy }]} />
            <Text style={[styles.badgeText, { color: colors.buy }]}>COMING SOON</Text>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>A clearer view of market events</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            We’re working on an economic calendar to help you follow upcoming forex events and plan around market-moving news.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home')}
            style={[styles.homeButton, { backgroundColor: colors.buy }]}
            accessibilityRole="button"
          >
            <Feather name="home" size={16} color={colors.primaryForeground} />
            <Text style={[styles.homeButtonText, { color: colors.primaryForeground }]}>Back to Home</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
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
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingBottom: Platform.OS === 'web' ? 24 : 12 },
  card: { alignItems: 'center', borderWidth: 1, borderRadius: 22, paddingHorizontal: 24, paddingVertical: 30 },
  iconWrap: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 19, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  cardTitle: { marginTop: 17, fontSize: 19, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  cardBody: { maxWidth: 300, marginTop: 9, fontSize: 13, lineHeight: 20, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  homeButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 23, paddingHorizontal: 17, borderRadius: 13 },
  homeButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
