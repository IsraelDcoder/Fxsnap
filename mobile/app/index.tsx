import { useEffect } from 'react';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';

export default function StartupRoute() {
  const { onboardingComplete, isLoading, isSubscribed, billingAvailable, billingStatusReady } = useApp();

  useEffect(() => {
    if (isLoading || (billingAvailable && !billingStatusReady)) return;
    router.replace(onboardingComplete || isSubscribed ? '/home' : '/onboarding');
  }, [billingAvailable, billingStatusReady, isLoading, isSubscribed, onboardingComplete]);

  return null;
}