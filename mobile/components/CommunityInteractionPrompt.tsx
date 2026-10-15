import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuthenticatedAccount } from '@/services/account';
import {
  getCommunityNotifications,
  dismissSystemAnnouncementBanner,
  markCommunityNotificationRead,
  subscribeToSystemAnnouncementChanges,
  subscribeToCommunityChanges,
  type CommunityNotification,
} from '@/services/community';

const INTERACTION_KINDS = new Set(['reply', 'reaction']);

export default function CommunityInteractionPrompt({ enabled }: { enabled: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [notification, setNotification] = useState<CommunityNotification | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [additionalCount, setAdditionalCount] = useState(0);
  const checking = useRef(false);
  const promptOpen = useRef(false);
  const checkAgain = useRef(false);
  const handledNotificationIds = useRef(new Set<string>());

  const checkForInteractions = useCallback(async () => {
    if (!enabled || keyboardOpen.current || AppState.currentState !== 'active') return;
    if (checking.current) {
      checkAgain.current = true;
      return;
    }
    if (promptOpen.current) return;
    checking.current = true;
    try {
      const account = await getAuthenticatedAccount();
      if (!account) return;
      const response = await getCommunityNotifications();
      const unread = response.notifications.filter((item) => {
        if (item.kind === 'system_announcement') {
          return item.channels?.in_app_banner === true
            && !item.read_at
            && !item.banner_dismissed_at
            && !handledNotificationIds.current.has(item.id);
        }
        return INTERACTION_KINDS.has(item.kind)
          && !item.read_at
          && !handledNotificationIds.current.has(item.id);
      });
      if (!unread.length) return;
      const latest = unread[0];
      handledNotificationIds.current.add(latest.id);
      promptOpen.current = true;
      setAdditionalCount(unread.length - 1);
      setNotification(latest);
    } catch (error) {
      console.warn('[Community] Could not check for unread reply or reaction notifications.', error);
    } finally {
      checking.current = false;
      if (checkAgain.current) {
        checkAgain.current = false;
        void Promise.resolve().then(() => checkForInteractions());
      }
    }
  }, [enabled]);

  const keyboardOpen = useRef(false);
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
      setKeyboardVisible(false);
      void checkForInteractions();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [checkForInteractions]);

  useEffect(() => {
    if (!enabled) return;
    void checkForInteractions();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForInteractions();
    });
    const unsubscribe = subscribeToCommunityChanges((eventType) => {
      if (eventType === 'notification' && AppState.currentState === 'active') {
        void checkForInteractions();
      }
    });
    const unsubscribeAnnouncements = subscribeToSystemAnnouncementChanges(() => {
      if (AppState.currentState === 'active') void checkForInteractions();
    });
    const pushSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data.type === 'system_announcement') {
        void checkForInteractions();
      }
    });
    return () => {
      appStateSubscription.remove();
      unsubscribe();
      unsubscribeAnnouncements();
      pushSubscription.remove();
    };
  }, [checkForInteractions, enabled]);

  useEffect(() => {
    if (!notification || keyboardVisible) return undefined;
    const timeout = setTimeout(() => {
      promptOpen.current = false;
      setNotification(null);
      if (notification.kind === 'system_announcement') {
        void dismissSystemAnnouncementBanner(notification.id).catch((error: unknown) => {
          handledNotificationIds.current.delete(notification.id);
          console.error('[Notifications] Could not dismiss the system announcement banner.', error);
        });
      }
      void checkForInteractions();
    }, notification.kind === 'system_announcement' ? 3500 : 5000);
    return () => clearTimeout(timeout);
  }, [checkForInteractions, keyboardVisible, notification]);

  const closePrompt = () => {
    const current = notification;
    promptOpen.current = false;
    setNotification(null);
    if (current?.kind === 'system_announcement') {
      void dismissSystemAnnouncementBanner(current.id).catch((error: unknown) => {
        handledNotificationIds.current.delete(current.id);
        console.error('[Notifications] Could not dismiss the system announcement banner.', error);
      });
    } else if (current) {
      void markCommunityNotificationRead(current.id).catch((error: unknown) => {
        handledNotificationIds.current.delete(current.id);
        console.error('[Community] Could not mark the prompted notification as read.', error);
      });
    }
  };

  const openPost = () => {
    if (notification?.kind === 'system_announcement') {
      const id = notification.id;
      closePrompt();
      router.push({ pathname: '/system-announcement', params: { id } });
      return;
    }
    const postId = notification?.post_id;
    closePrompt();
    if (postId) router.push({ pathname: '/community', params: { postId } });
    else router.push('/community-notifications');
  };

  return (
    notification && !keyboardVisible ? (
      <View pointerEvents="box-none" style={styles.overlay}>
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(180)}
          style={[styles.bannerShadow, { top: insets.top + 8 }]}
        >
          <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              onPress={openPost}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={`${notification.kind === 'system_announcement' ? 'FXSnap announcement' : 'Community notification'}. ${notification.message}. Tap to view.`}
              style={styles.content}
            >
              <View style={[styles.icon, { backgroundColor: `${colors.buy}18` }]}>
                <Feather
                  name={notification.kind === 'system_announcement'
                    ? 'bell'
                    : notification.kind === 'reaction' ? 'heart' : 'message-circle'}
                  size={17}
                  color={colors.buy}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.heading}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {notification.kind === 'system_announcement' ? notification.title || 'FXSnap update' : 'Community'}
                  </Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>now</Text>
                </View>
                <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>
                  {notification.message}{additionalCount > 0 ? ` · +${additionalCount} more` : ''}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closePrompt}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    ) : null
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, alignItems: 'center' },
  bannerShadow: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  banner: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 17, paddingLeft: 12, paddingRight: 7, paddingVertical: 10 },
  content: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  copy: { flex: 1, gap: 3 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  message: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  closeButton: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
});
