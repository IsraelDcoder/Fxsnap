import * as NativeHaptics from 'expo-haptics';

let enabled = true;

export const ImpactFeedbackStyle = NativeHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = NativeHaptics.NotificationFeedbackType;

export function setHapticsEnabled(value: boolean) { enabled = value; }
export function impactAsync(style: NativeHaptics.ImpactFeedbackStyle) {
  return enabled ? NativeHaptics.impactAsync(style) : Promise.resolve();
}
export function notificationAsync(type: NativeHaptics.NotificationFeedbackType) {
  return enabled ? NativeHaptics.notificationAsync(type) : Promise.resolve();
}
