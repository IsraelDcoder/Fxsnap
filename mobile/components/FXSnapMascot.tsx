import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import type { OnboardingMascotMood } from '@/services/onboardingPersonalization';

interface FXSnapMascotProps {
  mood: OnboardingMascotMood;
  size?: number;
  interactionKey?: string;
}

function mouthPath(mood: OnboardingMascotMood) {
  if (mood === 'explaining') return 'M25 39 Q32 44 39 39';
  if (mood === 'demonstrating') return 'M25 40 Q32 41 39 39';
  return 'M24 39 Q32 45 40 39';
}

export function FXSnapMascot({ mood, size = 48, interactionKey }: FXSnapMascotProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);
  const tilt = useSharedValue(0);
  const reactionScale = useSharedValue(1);
  const previousInteractionKey = useRef(interactionKey);

  const startFloating = useCallback(() => {
    if (reduceMotion) return;
    float.value = withRepeat(
      withSequence(
        withTiming(-1.5, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.5, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [float, reduceMotion]);

  useEffect(() => {
    if (AppState.currentState === 'active') startFloating();
    const subscription = AppState.addEventListener('change', (state) => {
      cancelAnimation(float);
      if (state === 'active') startFloating();
    });
    return () => {
      subscription.remove();
      cancelAnimation(float);
    };
  }, [float, startFloating]);

  useEffect(() => {
    if (reduceMotion) {
      tilt.value = 0;
      return;
    }
    tilt.value = withSequence(
      withTiming(mood === 'curious' ? -0.035 : 0.035, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }),
    );
  }, [mood, reduceMotion, tilt]);

  useEffect(() => {
    if (
      reduceMotion
      || previousInteractionKey.current === undefined
      || previousInteractionKey.current === interactionKey
    ) {
      previousInteractionKey.current = interactionKey;
      return;
    }
    previousInteractionKey.current = interactionKey;
    reactionScale.value = withSequence(
      withTiming(1.045, { duration: 100, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 170, easing: Easing.out(Easing.quad) }),
    );
  }, [interactionKey, reactionScale, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : float.value },
      { rotate: reduceMotion ? '0deg' : `${tilt.value}rad` },
      { scale: reduceMotion ? 1 : reactionScale.value },
    ],
  }), [reduceMotion]);

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, { width: size, height: size }, animatedStyle]}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="30" fill={`${colors.buy}14`} />
        <Path d="M32 11V17" stroke={colors.buy} strokeWidth="2.5" strokeLinecap="round" />
        <Circle cx="32" cy="9" r="3" fill={colors.buy} />
        <Path d="M9 30H13M51 30H55" stroke={colors.buy} strokeWidth="2.5" strokeLinecap="round" />
        <Rect
          x="12"
          y="17"
          width="40"
          height="38"
          rx="13"
          fill={colors.card}
          stroke={colors.buy}
          strokeWidth="2"
        />
        <Rect x="17" y="23" width="30" height="23" rx="8" fill={colors.background} />
        <Circle cx="26" cy="32" r="2.4" fill={colors.buy} />
        <Circle cx={mood === 'demonstrating' ? 40 : 38} cy="32" r="2.4" fill={colors.buy} />
        <Path d={mouthPath(mood)} fill="none" stroke={colors.textSecondary} strokeWidth="1.8" strokeLinecap="round" />
        <Circle cx="20" cy="49" r="1.6" fill={colors.buy} opacity="0.8" />
        <Circle cx="44" cy="49" r="1.6" fill={colors.buy} opacity="0.8" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
