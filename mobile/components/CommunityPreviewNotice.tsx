import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export default function CommunityPreviewNotice() {
  const colors = useColors();
  if (Platform.OS !== 'web' || !__DEV__) return null;
  return (
    <View style={[styles.notice, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}35` }]}>
      <Feather name="eye" size={14} color={colors.primary} />
      <Text style={[styles.label, { color: colors.primary }]}>Local preview</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>Demo data only · changes stay in this browser</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 14, marginTop: 10, marginBottom: 2, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  copy: { flex: 1, fontSize: 9, fontFamily: 'Inter_400Regular' },
});
