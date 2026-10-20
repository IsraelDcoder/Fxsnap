import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function EventRoomWebScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 18 }]}>
      <View style={[styles.icon, { backgroundColor: colors.surface }]}>
        <Feather name="smartphone" size={24} color={colors.buy} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Open FXSnap on mobile</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        LiveKit audio uses native microphone and audio features. Join this space in the FXSnap iOS or Android app.
      </Text>
      <TouchableOpacity onPress={() => router.back()} style={[styles.button, { backgroundColor: colors.buy }]}>
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Back to Events</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: Platform.OS === 'web' ? 20 : 0 },
  icon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  title: { marginTop: 15, fontSize: 18, fontFamily: 'Inter_700Bold' },
  description: { maxWidth: 320, marginTop: 7, textAlign: 'center', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  button: { minHeight: 42, justifyContent: 'center', marginTop: 18, paddingHorizontal: 18, borderRadius: 12 },
  buttonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
