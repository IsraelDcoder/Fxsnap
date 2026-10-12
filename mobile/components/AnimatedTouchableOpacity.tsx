import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import type { TouchableOpacityProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity) as React.ForwardRefExoticComponent<
  TouchableOpacityProps & React.RefAttributes<React.ComponentRef<typeof TouchableOpacity>>
>;

export const AnimatedTouchableOpacity = React.forwardRef<
  React.ComponentRef<typeof TouchableOpacity>,
  TouchableOpacityProps
>(function AnimatedTouchableOpacity({ onPressIn, onPressOut, style, ...props }, ref) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const transforms = StyleSheet.flatten(style)?.transform;
  const baseTransform = Array.isArray(transforms)
    ? transforms.filter((transform) => typeof transform !== 'string')
    : [];
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [...baseTransform, { scale: reduceMotion ? 1 : scale.value }],
  }), [baseTransform, reduceMotion]);

  return (
    <AnimatedTouchable
      ref={ref}
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        if (!reduceMotion && !props.disabled) scale.value = withTiming(0.985, { duration: 120 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduceMotion) scale.value = withTiming(1, { duration: 140 });
        onPressOut?.(event);
      }}
    />
  );
});

AnimatedTouchableOpacity.displayName = 'AnimatedTouchableOpacity';
