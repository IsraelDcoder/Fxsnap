import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
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
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import {
  registerForegroundNotificationHandler,
  getNotificationResponseRoute,
  syncRegisteredPushNotifications,
} from '@/services/notifications';
import { markSystemAnnouncementRead } from '@/services/community';
import { trackEvent } from '@/services/telemetry';
import { isCommunityFeatureRoute, shouldGuardFeatureRoute } from '@/services/featureAccess';
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
const STARTUP_REVEAL_SEEN_KEY = 'fxsnap:startupBrandRevealSeen:v1';

function StartupBrandReveal({ onComplete }: { onComplete: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: reduceMotion ? 450 : 3000, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
    return () => {
      progress.value = 0;
    };
  }, [onComplete, progress, reduceMotion]);

  const upperPanelStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(progress.value, [0.72, 1], [0, -windowHeight * 0.55]),
    }],
  }));
  const lowerPanelStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(progress.value, [0.72, 1], [0, windowHeight * 0.55]),
    }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : interpolate(progress.value, [0.04, 0.18, 0.65, 0.74], [0, 1, 1, 0]),
    transform: [{
      scale: reduceMotion ? 1 : interpolate(progress.value, [0, 0.18, 0.65, 0.74], [0.94, 1, 1, 0.98]),
    }],
  }), [reduceMotion]);
  const igniteStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(progress.value, [0, 0.08, 0.2, 0.26], [0, 0.8, 0.75, 0]),
    transform: [{
      scaleX: reduceMotion ? 0 : interpolate(progress.value, [0, 0.08, 0.2, 0.26], [0.04, 0.04, 1, 1]),
    }],
  }), [reduceMotion]);
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(progress.value, [0.22, 0.3, 0.55, 0.62], [0, 0.6, 0.6, 0]),
    transform: [{
      translateX: reduceMotion ? 0 : interpolate(progress.value, [0.22, 0.62], [-windowWidth * 0.35, windowWidth * 0.35]),
    }],
  }), [reduceMotion]);
  const sliceStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(progress.value, [0.70, 0.73, 0.78], [0, 0.85, 0]),
  }), [reduceMotion]);

  return (
    <View
      accessible={false}
      pointerEvents="auto"
      style={[styles.startupSplash, { backgroundColor: colors.background }]}
    >
      <Animated.View
        style={[styles.startupPanel, styles.startupUpperPanel, { backgroundColor: colors.background }, upperPanelStyle]}
      />
      <Animated.View
        style={[styles.startupPanel, styles.startupLowerPanel, { backgroundColor: colors.background }, lowerPanelStyle]}
      />
      <Animated.View style={[styles.startupIgnite, { backgroundColor: colors.buy }, igniteStyle]} />
      <Animated.View style={[styles.startupHighlight, { backgroundColor: colors.buy }, highlightStyle]} />
      <Animated.Text
        accessibilityLabel="FXSnap"
        accessibilityRole="text"
        style={[styles.startupWordmark, { color: colors.text }, markStyle]}
      >
        FXSnap
      </Animated.Text>
      <Animated.View style={[styles.startupSlice, { backgroundColor: colors.buy }, sliceStyle]} />
    </View>
  );
}

function RootLayoutNav({ fontsReady }: { fontsReady: boolean }) {
  const {
    onboardingComplete,
    paywallDismissed,
    isLoading,
    isSubscribed,
    billingAvailable,
    billingStatusReady,
    checkFeatureAccess,
  } = useApp();
  const colors = useColors();
  const pathname = usePathname();
  const handledNotificationResponse = useRef<string | null>(null);
  const [communityAccessVerifiedPath, setCommunityAccessVerifiedPath] = useState<string | null>(null);
  const [showStartupSplash, setShowStartupSplash] = useState<boolean | null>(null);
  const isCommunityPath = isCommunityFeatureRoute(pathname);
  const finishStartupSplash = useCallback(() => setShowStartupSplash(false), []);
  const startupReady = fontsReady
    && !isLoading
    && pathname !== '/'
    && !(billingAvailable && !billingStatusReady);

  useEffect(() => {
    if (!startupReady || showStartupSplash !== null) return;
    let active = true;
    const prepareStartupReveal = async () => {
      try {
        const alreadySeen = await AsyncStorage.getItem(STARTUP_REVEAL_SEEN_KEY);
        if (!active) return;
        if (alreadySeen === 'true') {
          setShowStartupSplash(false);
          return;
        }
        await AsyncStorage.setItem(STARTUP_REVEAL_SEEN_KEY, 'true');
        if (active) setShowStartupSplash(true);
      } catch (error) {
        console.error('[Startup] Could not persist first-launch reveal state.', error);
        if (active) setShowStartupSplash(true);
      }
    };
    void prepareStartupReveal();
    return () => { active = false; };
  }, [showStartupSplash, startupReady]);

  useEffect(() => {
    if (startupReady && showStartupSplash !== null) {
      void SplashScreen.hideAsync();
    }
  }, [showStartupSplash, startupReady]);

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
    if (isLoading || (billingAvailable && !billingStatusReady)) return;
    if (!onboardingComplete && !isSubscribed) {
      if (pathname === '/' || pathname === '/onboarding' || pathname === '/paywall' || pathname === '/auth/callback') return;
      router.replace('/onboarding');
      return;
    }
    if (!paywallDismissed || isSubscribed || !shouldGuardFeatureRoute(pathname, isSubscribed)) return;
    router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
  }, [billingAvailable, billingStatusReady, isLoading, isSubscribed, onboardingComplete, pathname, paywallDismissed]);

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
      {startupReady && showStartupSplash === true ? (
        <StartupBrandReveal onComplete={finishStartupSplash} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  startupSplash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  startupPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '50%',
    overflow: 'hidden',
  },
  startupUpperPanel: {
    top: 0,
  },
  startupLowerPanel: {
    bottom: 0,
  },
  startupIgnite: {
    position: 'absolute',
    width: '58%',
    height: 2,
    top: '50%',
    marginTop: -1,
  },
  startupHighlight: {
    position: 'absolute',
    width: 70,
    height: 2,
    top: '50%',
    marginTop: -1,
  },
  startupWordmark: {
    fontSize: 46,
    lineHeight: 56,
    letterSpacing: -1.2,
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
    zIndex: 2,
    includeFontPadding: false,
  },
  startupSlice: {
    position: 'absolute',
    width: '100%',
    height: 1,
    top: '50%',
    zIndex: 3,
  },
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
