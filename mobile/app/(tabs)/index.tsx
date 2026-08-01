import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';

export default function Entry() {
  const { onboardingComplete, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading) {
      if (!onboardingComplete) {
        router.replace('/onboarding');
      } else {
        router.replace('/home');
      }
    }
  }, [isLoading, onboardingComplete]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
