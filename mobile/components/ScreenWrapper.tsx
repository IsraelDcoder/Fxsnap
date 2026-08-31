import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, StyleProp } from 'react-native';

type Props = {
  children: React.ReactNode;
  // Accept any style prop to avoid type incompatibilities (gap, filter, etc.)
  style?: StyleProp<any>;
  contentContainerStyle?: StyleProp<any>;
  // When false, do not render an outer ScrollView. Useful for screens that use
  // VirtualizedList-backed components (FlatList/SectionList) to avoid nesting warnings.
  scrollable?: boolean;
};

export const ScreenWrapper = ({ children, style, contentContainerStyle, scrollable = true }: Props) => {
  return (
    <SafeAreaView style={[styles.safe, style]}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[styles.container, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        // Use a plain View when the screen body is responsible for its own
        // scrolling (e.g. FlatList) to avoid nesting VirtualizedLists.
        <View style={[styles.container, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flexGrow: 1, padding: 20 },
});

export default ScreenWrapper;
