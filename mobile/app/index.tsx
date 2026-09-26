import { useEffect } from 'react';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';

export default function StartupRoute() {
  const { onboardingComplete, isLoading } = useApp();

  useEffect(() => {
    if (isLoading) return;
    router.replace(onboardingComplete ? '/home' : '/onboarding');
  }, [isLoading, onboardingComplete]);

  return null;
}