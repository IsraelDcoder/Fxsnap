import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import CommunityInteractionPrompt from '@/components/CommunityInteractionPrompt';
import { AppProvider } from '@/context/AppContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack, usePathname } from 'expo-router';
import { useApp } from '@/context/AppContext';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { registerForegroundNotificationHandler, getNotificationResponseRoute, syncRegisteredPushNotifications } from '@/services/notifications';
import { markSystemAnnouncementRead } from '@/services/community';
import { trackEvent } from '@/services/telemetry';
import { isCommunityFeatureRoute } from '@/services/featureAccess';
import { useColors } from '@/hooks/useColors';

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
  const { onboardingComplete, isLoading, isSubscribed, checkFeatureAccess } = useApp();
  const colors = useColors();
  const pathname = usePathname();
  const handledNotificationResponse = useRef<string | null>(null);
  const [communityAccessVerifiedPath, setCommunityAccessVerifiedPath] = useState<string | null>(null);
  const isCommunityPath = isCommunityFeatureRoute(pathname);

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
    if (!isCommunityPath || isLoading) {
      if (!isCommunityPath) setCommunityAccessVerifiedPath(null);
      return;
    }
    let active = true;
    setCommunityAccessVerifiedPath(null);
    void checkFeatureAccess('COMMUNITY', pathname).then((access) => {
      if (!active) return;
      if (access.error) {
        console.error('[ACCESS] Community subscription check failed.', access.error);
        router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
        return;
      }
      if (access.allowed) setCommunityAccessVerifiedPath(pathname);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('[ACCESS] Could not verify Community subscription.', error);
      router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
    });
    return () => { active = false; };
  }, [checkFeatureAccess, isCommunityPath, isLoading, pathname]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleResponse = async (response: Notifications.NotificationResponse | null) => {
      const target = getNotificationResponseRoute(response);
      if (!response || !target || handledNotificationResponse.current === response.notification.request.identifier) return;
      handledNotificationResponse.current = response.notification.request.identifier;
      const data = response.notification.request.content.data;
      if (data.type === 'system_announcement' && typeof data.announcementId === 'string') {
        await markSystemAnnouncementRead(data.announcementId).catch((error: unknown) => {
          console.error('[Notifications] Could not mark the opened system announcement as read.', error);
        });
      }
      const { router } = await import('expo-router');
      router.push(target);
      await Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = registerForegroundNotificationHandler((target, identifier, data) => {
      if (handledNotificationResponse.current === identifier) return;
      handledNotificationResponse.current = identifier;
      if (data.type === 'system_announcement' && typeof data.announcementId === 'string') {
        void markSystemAnnouncementRead(data.announcementId).catch((error: unknown) => {
          console.error('[Notifications] Could not mark the opened system announcement as read.', error);
        });
      }
      void import('expo-router').then(({ router }) => router.push(target));
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
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="analysis" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="analysis-result" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="strategy" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="daily-brief" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="economic-calendar" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="events" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="events-admin" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="event-room" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="support-chat" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="support-admin" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community-search" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community-member" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community-notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="system-announcement" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community-support" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="community-admin" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="lot-size-calculator" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="risk-management" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="saved" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="saved-briefs" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="my-strategies" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
      {isCommunityPath && communityAccessVerifiedPath !== pathname ? (
        <View style={[StyleSheet.absoluteFillObject, styles.accessCheck, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.buy} />
        </View>
      ) : null}
      <CommunityInteractionPrompt enabled={!isLoading && onboardingComplete && isSubscribed && pathname !== '/onboarding' && (!isCommunityPath || communityAccessVerifiedPath === pathname)} />
    </>
  );
}

const styles = StyleSheet.create({
  accessCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
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
