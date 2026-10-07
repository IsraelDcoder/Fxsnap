import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider } from '@/context/AppContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname } from 'expo-router';
import { useApp } from '@/context/AppContext';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { registerForegroundNotificationHandler, getNotificationResponseRoute, syncRegisteredPushNotifications } from '@/services/notifications';
import { trackEvent } from '@/services/telemetry';

SplashScreen.preventAutoHideAsync();
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const hasValidSentryDsn = Boolean(sentryDsn && !sentryDsn.startsWith('replace_') && /^https:\/\/[^@\s]+@[^\/\s]+\/[^\s]+$/i.test(sentryDsn));
if (hasValidSentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    sendDefaultPii: false,
  });
}
const queryClient = new QueryClient();

function RootLayoutNav({ fontsReady }: { fontsReady: boolean }) {
  const { onboardingComplete, isLoading } = useApp();
  const pathname = usePathname();
  const handledNotificationResponse = useRef<string | null>(null);

  useEffect(() => {
    if (fontsReady && !isLoading && pathname !== '/') {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, isLoading, pathname]);

  useEffect(() => {
    if (!isLoading && onboardingComplete) trackEvent('app_open');
  }, [isLoading, onboardingComplete]);

  useEffect(() => {
    if (!isLoading && onboardingComplete) {
      void syncRegisteredPushNotifications().catch(() => undefined);
    }
  }, [isLoading, onboardingComplete]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleResponse = async (response: Notifications.NotificationResponse | null) => {
      const route = getNotificationResponseRoute(response);
      if (!response || !route || handledNotificationResponse.current === response.notification.request.identifier) return;
      handledNotificationResponse.current = response.notification.request.identifier;
      const { router } = await import('expo-router');
      router.push(route);
      await Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = registerForegroundNotificationHandler((route, identifier) => {
      if (handledNotificationResponse.current === identifier) return;
      handledNotificationResponse.current = identifier;
      void import('expo-router').then(({ router }) => router.push(route));
      void Notifications.clearLastNotificationResponseAsync();
    });
    const openLastNotification = async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      await handleResponse(response);
    };
    void openLastNotification();
    return () => subscription.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="analysis" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="analysis-result" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="strategy" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="daily-brief" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="economic-calendar" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="lot-size-calculator" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="risk-management" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="saved" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="saved-briefs" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="my-strategies" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AppProvider>
                <RootLayoutNav fontsReady={fontsLoaded || Boolean(fontError)} />
              </AppProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
