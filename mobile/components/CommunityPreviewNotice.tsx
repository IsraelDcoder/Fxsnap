import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export default function CommunityPreviewNotice() {
  const colors = useColors();
  if (!__DEV__) return null;
  return (
    <View style={[styles.notice, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}35` }]}>
      <Feather name="smartphone" size={14} color={colors.primary} />
      <Text style={[styles.label, { color: colors.primary }]}>Demo mode</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>Preview data only · changes reset when the app reloads</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 2, marginTop: 2, marginBottom: 8, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  copy: { flex: 1, fontSize: 9, fontFamily: 'Inter_400Regular' },
});
