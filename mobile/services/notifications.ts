import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_BASE_URL, getDeviceId } from './apiAuth';
import { notifyAccountDataChanged } from './accountDataEvents';
import { getFxsnapAccountApiHeaders } from './account';
import { formatExpoPushTokenError } from './notificationErrors';
import type { EventSubscription, NotificationResponse } from 'expo-notifications';

export type NotificationRoute =
  | '/daily-brief'
  | '/analysis'
  | '/saved'
  | '/community'
  | '/events'
  | '/profile'
  | '/community-notifications'
  | '/support-admin'
  | '/support-chat'
  | '/system-announcement'
  | '/';
export type NotificationTarget = NotificationRoute | {
  pathname: '/system-announcement';
  params: { id: string };
} | {
  pathname: '/community';
  params: { postId: string };
};

export type PushNotificationPayload = {
  type: string;
  route: NotificationRoute;
  campaignId?: string;
};

const NOTIFICATION_SETTINGS_KEY = 'fxsnap:notificationSettings';
const PUSH_TOKEN_KEY = 'fxsnap_pushToken';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const showForegroundPush = data.type !== 'system_announcement' || data.inAppBanner !== true;
    return {
      shouldShowBanner: showForegroundPush,
      shouldShowList: showForegroundPush,
      shouldPlaySound: showForegroundPush,
      shouldSetBadge: false,
      shouldShowAlert: showForegroundPush,
    };
  },
});

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
  if (!stored) return { enabled: false, dailyBrief: true, inactivity: true, weekly: true, community: true, systemAnnouncements: true };
  try {
    const value = JSON.parse(stored);
    return {
      enabled: value.enabled === true,
      dailyBrief: value.dailyBrief !== false,
      inactivity: value.inactivity !== false,
      weekly: value.weekly !== false,
      community: value.community !== false,
      systemAnnouncements: value.systemAnnouncements !== false,
    };
  } catch {
    return { enabled: false, dailyBrief: true, inactivity: true, weekly: true, community: true, systemAnnouncements: true };
  }
}

export type NotificationPreferences = {
  enabled: boolean;
  dailyBrief: boolean;
  inactivity: boolean;
  weekly: boolean;
  community: boolean;
  systemAnnouncements: boolean;
};

export async function hasPushNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted;
}

export async function saveNotificationPreferences(preferences: {
  enabled: boolean;
  dailyBrief: boolean;
  inactivity: boolean;
  weekly: boolean;
  community: boolean;
  systemAnnouncements: boolean;
}) {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(preferences));
  notifyAccountDataChanged();
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
    await Notifications.setNotificationChannelAsync('fxsnap-community', {
      name: 'FXSnap Community',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('fxsnap-retention', {
      name: 'FXSnap updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('fxsnap-system', {
      name: 'System announcements',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('fxsnap-support', {
      name: 'Private support',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Expo project ID is missing from app configuration.');
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    const detail = formatExpoPushTokenError(error);
    if (__DEV__) console.error('[Notifications] Expo push-token request failed.', detail);
    throw new Error(`Expo push-token request failed: ${detail}`);
  }
  const deviceId = await getDeviceId();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/push-token`, {
      method: 'POST',
      headers: { ...(await getFxsnapAccountApiHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        deviceId,
        preferences: resolvedPreferences,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FXSnap push-registration request failed: ${detail}`);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload && typeof payload.error === 'string' ? payload.error : '';
    throw new Error(`Push token registration failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  return { granted: true, token };
}

export async function syncRegisteredPushNotifications() {
  const preferences = await getNotificationPreferences();
  if (!preferences.enabled) return;
  await requestAndRegisterPushNotifications(preferences, false);
}

export function registerForegroundNotificationHandler(
  onRoute?: (route: NotificationTarget, identifier: string, data: Record<string, unknown>) => void,
): EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const target = getNotificationTarget(data);
    if (!target) return;
    if (onRoute) onRoute(target, response.notification.request.identifier, data);
    else void import('expo-router').then(({ router }) => router.push(target));
  });
}

export function getNotificationResponseRoute(response: NotificationResponse | null): NotificationTarget | null {
  return response ? getNotificationTarget(response.notification.request.content.data) : null;
}

function getNotificationTarget(data: Record<string, unknown> | undefined): NotificationTarget | null {
  const route = getNotificationRoute(data);
  if (!route || !data) return null;
  if (route === '/system-announcement' && typeof data.announcementId === 'string') {
    return { pathname: route, params: { id: data.announcementId } };
  }
  const destinationParams = data.destinationParams;
  if (route === '/community' && destinationParams && typeof destinationParams === 'object'
    && !Array.isArray(destinationParams) && 'postId' in destinationParams) {
    const postId = destinationParams.postId;
    if (typeof postId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) {
      return { pathname: route, params: { postId } };
    }
  }
  return route;
}

export function getNotificationRoute(data: Record<string, unknown> | undefined): NotificationRoute | null {
  const route = data?.route;
  if (route === '/daily-brief' || route === '/analysis' || route === '/saved' || route === '/community'
    || route === '/events' || route === '/profile' || route === '/community-notifications' || route === '/support-admin'
    || route === '/support-chat'
    || route === '/system-announcement' || route === '/') return route;
  return null;
}

export async function registerPushToken(cluster: { token: string; platform: string; deviceId: string }) {
  const response = await fetch(`${API_BASE_URL}/api/push-token`, {
    method: 'POST',
    headers: { ...(await getFxsnapAccountApiHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify(cluster),
  });
  if (!response.ok) throw new Error('Unable to register push token');
}

export async function unregisterPushToken() {
  const response = await fetch(`${API_BASE_URL}/api/push-token`, {
    method: 'DELETE',
    headers: await getFxsnapAccountApiHeaders(),
  });
  if (!response.ok) throw new Error('Unable to unregister push token');
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

export async function clearNotificationPreferences() {
  await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_KEY);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
