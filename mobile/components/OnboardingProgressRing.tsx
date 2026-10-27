import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { getOnboardingProgress } from '@/services/onboardingProgress';

const SIZE = 42;
const STROKE_WIDTH = 2.5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function OnboardingProgressRing({ step }: { step: number }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const progress = getOnboardingProgress(step);
  const trackColor = colors.cardBorder;
  const progressColor = colors.buy;
  const animatedProgress = useSharedValue(progress.fraction);

  useEffect(() => {
    if (reduceMotion) {
      animatedProgress.value = progress.fraction;
      return;
    }
    animatedProgress.value = withTiming(progress.fraction, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [animatedProgress, progress.fraction, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - animatedProgress.value),
  }));

  return (
    <View
      accessible
      accessibilityLabel={progress.accessibleLabel}
      style={styles.container}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE_WIDTH}
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={progressColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
      <Text style={[styles.percentage, { color: colors.text }]} importantForAccessibility="no">
        {progress.percentage}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    position: 'absolute',
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Inter_700Bold',
  },
});
