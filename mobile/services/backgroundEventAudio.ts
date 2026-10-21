import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type BackgroundEventAudioModule = {
  start(title: string): Promise<void>;
  stop(): Promise<void>;
};

export async function startBackgroundEventAudio(title: string) {
  if (Platform.OS !== 'android') return;
  const audioModule = requireNativeModule<BackgroundEventAudioModule>('BackgroundEventAudio');
  await audioModule.start(title);
}

export async function stopBackgroundEventAudio() {
  if (Platform.OS !== 'android') return;
  const audioModule = requireNativeModule<BackgroundEventAudioModule>('BackgroundEventAudio');
  await audioModule.stop();
}
