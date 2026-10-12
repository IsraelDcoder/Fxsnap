import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useColors } from '@/hooks/useColors';

type AmbientBackdropProps = {
  variant?: 'soft' | 'home';
};

export function AmbientBackdrop({ variant = 'soft' }: AmbientBackdropProps) {
  const colors = useColors();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const drift = useSharedValue(0);
  const isActive = focused && appActive && !reduceMotion;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(drift);
    if (isActive) {
      drift.value = withRepeat(withTiming(1, { duration: 16000 }), -1, true);
    } else {
      drift.value = 0;
    }
    return () => cancelAnimation(drift);
  }, [drift, isActive]);

  const primaryDrift = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-18, 18]) },
      { translateY: interpolate(drift.value, [0, 1], [8, -10]) },
    ],
  }));
  const secondaryDrift = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [14, -14]) },
      { translateY: interpolate(drift.value, [0, 1], [-8, 12]) },
    ],
  }));

  const primaryTint = variant === 'home' ? 'rgba(35,129,95,0.075)' : 'rgba(35,129,95,0.045)';
  const secondaryTint = variant === 'home' ? 'rgba(214,184,61,0.045)' : 'rgba(35,129,95,0.025)';

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip, styles.nonInteractive]}
    >
      <Animated.View style={[styles.primaryMist, primaryDrift]}>
        <LinearGradient
          colors={[primaryTint, 'rgba(35,129,95,0.018)', 'rgba(35,129,95,0)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.secondaryMist, secondaryDrift]}>
        <LinearGradient
          colors={[secondaryTint, 'rgba(35,129,95,0.012)', 'rgba(35,129,95,0)']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {variant === 'home' ? (
        <View style={[styles.spark, styles.sparkOne, { backgroundColor: `${colors.buy}35` }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  nonInteractive: { pointerEvents: 'none' },
  primaryMist: {
    position: 'absolute',
    width: 370,
    height: 310,
    borderRadius: 190,
    top: -130,
    right: -150,
    opacity: 0.9,
  },
  secondaryMist: {
    position: 'absolute',
    width: 310,
    height: 280,
    borderRadius: 160,
    bottom: 90,
    left: -160,
    opacity: 0.8,
  },
  spark: { position: 'absolute', width: 3, height: 3, borderRadius: 2 },
  sparkOne: { top: '22%', right: '19%' },
});
