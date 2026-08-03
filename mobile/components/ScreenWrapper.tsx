import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, StyleProp } from 'react-native';

type Props = {
  children: React.ReactNode;
  // Accept any style prop to avoid type incompatibilities (gap, filter, etc.)
  style?: StyleProp<any>;
  contentContainerStyle?: StyleProp<any>;
};

export const ScreenWrapper = ({ children, style, contentContainerStyle }: Props) => {
  return (
    <SafeAreaView style={[styles.safe, style]}>
      <ScrollView
        contentContainerStyle={[styles.container, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flexGrow: 1, padding: 20 },
});

export default ScreenWrapper;
