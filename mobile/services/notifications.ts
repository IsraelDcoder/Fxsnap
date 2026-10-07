import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_BASE_URL, getApiHeaders, getDeviceId } from './apiAuth';
import type { EventSubscription, NotificationResponse } from 'expo-notifications';

export type NotificationRoute = '/daily-brief' | '/analysis' | '/saved';

export type PushNotificationPayload = {
  type: string;
  route: NotificationRoute;
  campaignId?: string;
};

const NOTIFICATION_SETTINGS_KEY = 'fxsnap:notificationSettings';
const PUSH_TOKEN_KEY = 'fxsnap:pushToken';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  }),
});

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
  if (!stored) return { enabled: false, dailyBrief: true, inactivity: true, weekly: true };
  try {
    const value = JSON.parse(stored);
    return {
      enabled: value.enabled === true,
      dailyBrief: value.dailyBrief !== false,
      inactivity: value.inactivity !== false,
      weekly: value.weekly !== false,
    };
  } catch {
    return { enabled: false, dailyBrief: true, inactivity: true, weekly: true };
  }
}

export type NotificationPreferences = {
  enabled: boolean;
  dailyBrief: boolean;
  inactivity: boolean;
  weekly: boolean;
};

export async function saveNotificationPreferences(preferences: {
  enabled: boolean;
  dailyBrief: boolean;
  inactivity: boolean;
  weekly: boolean;
}) {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(preferences));
}

export async function requestAndRegisterPushNotifications(preferences?: NotificationPreferences, requestPermission = true) {
  const resolvedPreferences = preferences ?? await getNotificationPreferences();
  if (!resolvedPreferences.enabled || Platform.OS === 'web') {
    return { granted: false, token: null };
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = currentPermissions.granted || !requestPermission ? currentPermissions : await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (!permissions.granted) return { granted: false, token: null };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fxsnap-retention', {
      name: 'FXSnap updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Expo project ID is missing from app configuration.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const deviceId = await getDeviceId();
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

  const response = await fetch(`${API_BASE_URL}/api/push-token`, {
    method: 'POST',
    headers: { ...(await getApiHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      platform: Platform.OS,
      deviceId,
      preferences: resolvedPreferences,
    }),
  });

  if (!response.ok) {
    throw new Error(`Push token registration failed with ${response.status}`);
  }

  return { granted: true, token };
}

export async function syncRegisteredPushNotifications() {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled) return;
  await requestAndRegisterPushNotifications(preferences, false);
}

export function registerForegroundNotificationHandler(onRoute?: (route: NotificationRoute, identifier: string) => void): EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const route = getNotificationRoute(response.notification.request.content.data);
    if (route) {
      if (onRoute) onRoute(route, response.notification.request.identifier);
      else void import('expo-router').then(({ router }) => router.push(route));
    }
  });
}

export function getNotificationResponseRoute(response: NotificationResponse | null) {
  return response ? getNotificationRoute(response.notification.request.content.data) : null;
}

export function getNotificationRoute(data: Record<string, unknown> | undefined): NotificationRoute | null {
  const route = data?.route;
  if (route === '/daily-brief' || route === '/analysis' || route === '/saved') return route;
  return null;
}

export async function registerPushToken(cluster: { token: string; platform: string; deviceId: string }) {
  const response = await fetch(`${API_BASE_URL}/api/push-token`, {
    method: 'POST',
    headers: { ...(await getApiHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify(cluster),
  });
  if (!response.ok) throw new Error('Unable to register push token');
}

export async function unregisterPushToken() {
  const response = await fetch(`${API_BASE_URL}/api/push-token`, {
    method: 'DELETE',
    headers: await getApiHeaders(),
  });
  if (!response.ok) throw new Error('Unable to unregister push token');
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}

export async function clearNotificationPreferences() {
  await AsyncStorage.multiRemove([NOTIFICATION_SETTINGS_KEY, PUSH_TOKEN_KEY]);
}
