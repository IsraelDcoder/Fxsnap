import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getSubscriptionDetails, type SubscriptionDetails } from '@/services/billing';
import { API_BASE_URL } from '@/services/apiAuth';
import {
  deleteFxsnapAccount,
  getAuthenticatedAccount,
  signInWithGoogle,
  signOutOfFxsnapAccount,
  type FxsnapAccount,
} from '@/services/account';
import {
  clearNotificationPreferences,
  getNotificationPreferences,
  hasPushNotificationPermission,
  requestAndRegisterPushNotifications,
  saveNotificationPreferences,
  unregisterPushToken,
  type NotificationPreferences,
} from '@/services/notifications';
import { getSystemAnnouncementAdminAccess } from '@/services/community';

type ThemeMode = 'light' | 'dark' | 'system';
type SettingsIcon = React.ComponentProps<typeof Feather>['name'];

function subscriptionPlanName(productIdentifier?: string | null) {
  if (!productIdentifier) return 'FXSnap Premium';
  const id = productIdentifier.toLowerCase();
  if (id.includes('week')) return 'FXSnap Premium · Weekly';
  if (id.includes('quarter') || id.includes('3month') || id.includes('three')) return 'FXSnap Premium · 3 months';
  if (id.includes('month')) return 'FXSnap Premium · Monthly';
  return 'FXSnap Premium';
}

function formatSubscriptionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'date unavailable'
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    settings,
    updateSettings,
    isSubscribed,
    billingAvailable,
    restorePurchases,
    deleteAccount,
    syncAccountData,
    stopAccountDataSync,
    accountSyncStatus,
  } = useApp();
  const [account, setAccount] = useState<FxsnapAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(Platform.OS !== 'web');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [systemAnnouncementAdmin, setSystemAnnouncementAdmin] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    enabled: false,
    dailyBrief: true,
    inactivity: true,
    weekly: true,
    community: true,
    systemAnnouncements: true,
  });
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationError, setNotificationError] = useState('');

  const themeMode: ThemeMode = settings.themeMode || (settings.darkMode ? 'dark' : 'light');

  useEffect(() => {
    let active = true;
    void getNotificationPreferences()
      .then(async (preferences) => {
        if (!active) return;
        if (preferences.enabled && Platform.OS !== 'web' && !(await hasPushNotificationPermission())) {
          const disabledPreferences = { ...preferences, enabled: false };
          await saveNotificationPreferences(disabledPreferences);
          if (active) {
            setNotificationPreferences(disabledPreferences);
            setNotificationMessage('Push notifications were turned off because device permission is disabled.');
          }
          try {
            await unregisterPushToken();
          } catch (error) {
            console.error('[Settings] Unable to unregister push token after permission was revoked.', error);
            if (active) {
              setNotificationError('Device permission is off, but the saved push registration could not be removed. Retry after reconnecting.');
            }
          }
          return;
        }
        if (active) setNotificationPreferences(preferences);
      })
      .catch((error: unknown) => {
        if (active) setNotificationError(error instanceof Error ? error.message : 'Unable to load notification preferences.');
      })
      .finally(() => {
        if (active) setNotificationsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!account) {
      setSystemAnnouncementAdmin(false);
      return () => { active = false; };
    }
    void getSystemAnnouncementAdminAccess()
      .then((access) => { if (active) setSystemAnnouncementAdmin(access.allowed); })
      .catch((error: unknown) => {
        console.error('[Settings] Could not check system announcement admin access.', error);
        if (active) setSystemAnnouncementAdmin(false);
      });
    return () => { active = false; };
  }, [account]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setSubscriptionLoading(true);
    setSubscriptionError(null);
    void getSubscriptionDetails()
      .then((details) => {
        if (active) setSubscriptionDetails(details);
      })
      .catch((error: unknown) => {
        if (active) setSubscriptionError(error instanceof Error ? error.message : 'Unable to load subscription details.');
      })
      .finally(() => {
        if (active) setSubscriptionLoading(false);
      });
    return () => { active = false; };
  }, []));

  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    setAccountLoading(true);
    void getAuthenticatedAccount()
      .then((profile) => {
        if (active) setAccount(profile);
      })
      .catch((error: unknown) => {
        if (active) setAccountError(error instanceof Error ? error.message : 'Unable to load your FXSnap account.');
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    return () => { active = false; };
  }, []));

  const continueWithGoogle = async () => {
    if (Platform.OS === 'web') {
      setAccountError('Google sign-in can only be tested in an installed FXSnap iOS or Android build. The web preview cannot handle the mobile OAuth callback.');
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const profile = await signInWithGoogle();
      if (profile) {
        setAccount(profile);
        try {
          await syncAccountData();
        } catch {
          setAccountError('You are signed in, but your app data could not sync. Check your connection and try again.');
        }
      }
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out of FXSnap?',
      'This signs you out of your FXSnap account on this device. It does not cancel your subscription or change your device identity.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          onPress: async () => {
            setAccountBusy(true);
            setAccountError(null);
            try {
              await signOutOfFxsnapAccount();
              stopAccountDataSync();
              setAccount(null);
            } catch (error) {
              setAccountError(error instanceof Error ? error.message : 'Unable to securely sign out.');
            } finally {
              setAccountBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your FXSnap account and this device’s saved FXSnap data. It does not cancel an App Store or Google Play subscription. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              if (notificationPreferences.enabled && Platform.OS !== 'web') {
                await unregisterPushToken();
              }
              if (account) await deleteFxsnapAccount();
              await clearNotificationPreferences();
              await deleteAccount();
              router.replace('/onboarding');
            } catch (error) {
              Alert.alert('Unable to delete account', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const setAppearance = (mode: ThemeMode) => {
    void updateSettings({
      themeMode: mode,
      darkMode: mode === 'dark',
    });
  };

  const openHelpAndSupport = () => Alert.alert('Coming soon', 'Help & Support will be available in a future update.');

  const openSubscriptionOptions = async () => {
    if (!isSubscribed && subscriptionDetails?.status !== 'active') {
      router.push('/paywall');
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Manage subscription', 'Subscription management is available in the app store where you purchased FXSnap Premium.');
      return;
    }
    const subscriptionManagerUrl = subscriptionDetails?.managementUrl
      || process.env.EXPO_PUBLIC_SUBSCRIPTION_URL
      || (Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions');
    try {
      await Linking.openURL(subscriptionManagerUrl);
    } catch {
      Alert.alert('Unable to open subscriptions', 'Use your app store account to manage your subscription.');
    }
  };

  const openScreenshotGuide = () => {
    Alert.alert(
      'Screenshot guide',
      'For the clearest analysis, capture the full chart with the instrument, timeframe, recent candles, and price scale visible. Include the newest candle and current price marker; avoid cropping or covering chart labels.',
      [{ text: 'Got it' }],
    );
  };

  const refreshSubscription = () => {
    setSubscriptionLoading(true);
    setSubscriptionError(null);
    void getSubscriptionDetails()
      .then(setSubscriptionDetails)
      .catch((error: unknown) => setSubscriptionError(error instanceof Error ? error.message : 'Unable to load subscription details.'))
      .finally(() => setSubscriptionLoading(false));
  };

  const changeNotificationPreferences = async (changes: Partial<NotificationPreferences>) => {
    if (notificationsBusy || notificationsLoading) return;
    const next = { ...notificationPreferences, ...changes };
    setNotificationsBusy(true);
    setNotificationError('');
    setNotificationMessage('');
    try {
      if (changes.enabled === true) {
        if (Platform.OS === 'web') {
          setNotificationMessage('Push notifications are available in the installed iOS and Android apps.');
          return;
        }
        const registration = await requestAndRegisterPushNotifications(next, true);
        if (!registration.granted) {
          const disabledPreferences = { ...next, enabled: false };
          await saveNotificationPreferences(disabledPreferences);
          setNotificationPreferences(disabledPreferences);
          setNotificationMessage('Notification permission was not granted. Enable it in device settings to receive updates.');
          return;
        }
      } else if (next.enabled && Platform.OS !== 'web') {
        const registration = await requestAndRegisterPushNotifications(next, false);
        if (!registration.granted) {
          await unregisterPushToken();
          next.enabled = false;
        }
      } else if (changes.enabled === false && notificationPreferences.enabled && Platform.OS !== 'web') {
        await unregisterPushToken();
      }

      await saveNotificationPreferences(next);
      setNotificationPreferences(next);
      setNotificationMessage('Notification preferences saved.');
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to save notification preferences.');
    } finally {
      setNotificationsBusy(false);
    }
  };

  const restoreSubscription = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        const details = await getSubscriptionDetails();
        setSubscriptionDetails(details);
        Alert.alert('Purchases restored', 'Your FXSnap subscription is active on this account.');
      } else {
        Alert.alert('No active subscription found', 'No active FXSnap subscription was found for this store account.');
      }
    } catch (error) {
      Alert.alert('Unable to restore purchases', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBillingBusy(false);
    }
  };

  const openLegalDocument = async (path: 'privacy' | 'terms') => {
    try {
      await Linking.openURL(`${API_BASE_URL}/${path}`);
    } catch {
      Alert.alert('Unable to open document', 'Please try again when you have an internet connection.');
    }
  };

  const topPadding = Platform.OS === 'web' ? 14 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 18 : Math.max(insets.bottom, 12);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage your account and preferences.</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 22 }]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title="Subscription" colors={colors}>
          {subscriptionLoading ? (
            <View style={styles.subscriptionState}>
              <ActivityIndicator size="small" color={colors.buy} />
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>Checking subscription…</Text>
            </View>
          ) : subscriptionError && !isSubscribed ? (
            <View style={styles.subscriptionState}>
              <Text style={[styles.stateText, { color: colors.sell }]}>{subscriptionError}</Text>
              <TouchableOpacity onPress={refreshSubscription} accessibilityRole="button">
                <Text style={[styles.retryLabel, { color: colors.buy }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.subscriptionCard, { borderBottomColor: colors.cardBorder }]}>
              <View style={styles.subscriptionHeading}>
                <View style={styles.subscriptionCopy}>
                  <Text style={[styles.subscriptionPlan, { color: colors.text }]}>
                    {isSubscribed || subscriptionDetails?.status === 'active'
                      ? subscriptionPlanName(subscriptionDetails?.productIdentifier)
                      : subscriptionDetails?.status === 'expired' ? 'FXSnap Premium'
                        : subscriptionDetails ? 'FXSnap Free' : 'Subscription unavailable'}
                  </Text>
                  <Text style={[styles.subscriptionDescription, { color: colors.textSecondary }]}>
                    {isSubscribed || subscriptionDetails?.status === 'active'
                      ? 'Premium access is active on this store account.'
                      : subscriptionDetails?.status === 'expired'
                        ? 'Your Premium access has expired.'
                        : subscriptionDetails
                          ? "You're currently using the free plan."
                          : 'Subscription status could not be verified on this build.'}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: `${(isSubscribed || subscriptionDetails?.status === 'active') ? colors.buy : colors.textMuted}18` },
                ]}>
                  <Text style={[
                    styles.statusLabel,
                    { color: (isSubscribed || subscriptionDetails?.status === 'active') ? colors.buy : colors.textSecondary },
                  ]}>
                    {isSubscribed || subscriptionDetails?.status === 'active'
                      ? subscriptionDetails?.willRenew === false ? 'Active · ending' : 'Active'
                      : subscriptionDetails?.status === 'expired' ? 'Expired'
                        : subscriptionDetails ? 'Free' : 'Unavailable'}
                  </Text>
                </View>
              </View>
              {subscriptionDetails?.expirationDate ? (
                <Text style={[styles.subscriptionDate, { color: colors.textSecondary }]}>
                  {subscriptionDetails.status === 'expired'
                    ? 'Expired'
                    : subscriptionDetails.willRenew === false ? 'Access until' : 'Next renewal'}
                  : {formatSubscriptionDate(subscriptionDetails.expirationDate)}
                  {subscriptionDetails.willRenew === false && subscriptionDetails.status === 'active' ? ' · will not renew' : ''}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => void openSubscriptionOptions()}
                style={[styles.subscriptionAction, { backgroundColor: colors.buy }]}
                accessibilityRole="button"
                disabled={billingBusy}
              >
                <Text style={[styles.subscriptionActionText, { color: colors.primaryForeground }]}>
                  {isSubscribed || subscriptionDetails?.status === 'active' ? 'Manage Subscription' : 'Explore Premium'}
                </Text>
                <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          )}
          {billingAvailable && Platform.OS !== 'web' ? (
            <SettingsRow
              icon="refresh-cw"
              label="Restore purchases"
              colors={colors}
              onPress={() => void restoreSubscription()}
              trailing={billingBusy ? <ActivityIndicator size="small" color={colors.buy} /> : undefined}
              last
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Account" colors={colors}>
          <View style={[styles.emailRow, { borderBottomColor: colors.cardBorder }]}>
            <View style={[styles.rowIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="mail" size={18} color={colors.buy} />
            </View>
            <View style={styles.emailDetails}>
              <Text style={[styles.emailLabel, { color: colors.textSecondary }]}>Email</Text>
              <Text style={[styles.emailValue, { color: colors.text }]} numberOfLines={1}>
                {accountLoading ? 'Loading account…' : account?.email || 'Guest account'}
              </Text>
            </View>
          </View>
          {account ? (
            <SettingsRow icon="user" label="Personal profile" colors={colors} onPress={() => router.push('/profile')} />
          ) : null}
          <SettingsRow
            icon={account ? 'check-circle' : 'log-in'}
            label={account ? 'Google account linked' : 'Continue with Google'}
            colors={colors}
            onPress={account ? undefined : () => void continueWithGoogle()}
            trailing={accountBusy || accountLoading
              ? <ActivityIndicator size="small" color={colors.textSecondary} />
              : account ? <Text style={[styles.accountProvider, { color: colors.buy }]}>Google</Text> : undefined}
            last
          />
          {account?.emailVerified ? (
            <Text style={[styles.accountSyncStatus, { color: colors.textSecondary }]}>Email address verified by Google.</Text>
          ) : null}
          {accountError ? (
            <Text style={[styles.accountError, { color: colors.sell }]}>{accountError}</Text>
          ) : null}
          {account ? (
            <Text style={[styles.accountSyncStatus, { color: accountSyncStatus === 'error' ? colors.sell : colors.textSecondary }]}>
              {accountSyncStatus === 'syncing'
                ? 'Syncing your FXSnap data…'
                : accountSyncStatus === 'synced'
                  ? 'Your app data is synced to your account.'
                  : accountSyncStatus === 'error'
                    ? 'Your app data could not sync. Check your connection.'
                    : ''}
            </Text>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Security" colors={colors}>
          <View style={styles.infoRow}>
            <View style={[styles.rowIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="shield" size={18} color={colors.buy} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Sign-in security</Text>
              <Text style={[styles.infoDescription, { color: colors.textSecondary }]}>
                {account ? 'Your account uses Google sign-in. Password changes and two-step verification are managed by Google.' : 'Sign in with Google to secure and sync your FXSnap account.'}
              </Text>
            </View>
          </View>
        </SettingsGroup>

        <SettingsGroup title="Notifications" colors={colors}>
          <SettingsRow
            icon="bell"
            label="Open notification center"
            colors={colors}
            onPress={() => router.push('/community-notifications')}
          />
          <NotificationToggle
            icon="bell"
            label="Push notifications"
            description={Platform.OS === 'web' ? 'Push notifications are available in the installed app.' : 'Allow FXSnap updates on this device.'}
            value={notificationPreferences.enabled}
            disabled={notificationsLoading || notificationsBusy || Platform.OS === 'web'}
            colors={colors}
            onValueChange={(enabled) => void changeNotificationPreferences({ enabled })}
            last={false}
          />
          <NotificationToggle
            icon="book-open"
            label="Daily Brief"
            description="New forex learning insights."
            value={notificationPreferences.dailyBrief}
            disabled={notificationsLoading || notificationsBusy || !notificationPreferences.enabled}
            colors={colors}
            onValueChange={(dailyBrief) => void changeNotificationPreferences({ dailyBrief })}
          />
          <NotificationToggle
            icon="activity"
            label="Trading reminders"
            description="A reminder after a period of inactivity."
            value={notificationPreferences.inactivity}
            disabled={notificationsLoading || notificationsBusy || !notificationPreferences.enabled}
            colors={colors}
            onValueChange={(inactivity) => void changeNotificationPreferences({ inactivity })}
          />
          <NotificationToggle
            icon="bar-chart-2"
            label="Weekly overview"
            description="A weekly summary when activity is available."
            value={notificationPreferences.weekly}
            disabled={notificationsLoading || notificationsBusy || !notificationPreferences.enabled}
            colors={colors}
            onValueChange={(weekly) => void changeNotificationPreferences({ weekly })}
          />
          <NotificationToggle
            icon="users"
            label="Community activity"
            description="New Community posts, replies, and reactions."
            value={notificationPreferences.community}
            disabled={notificationsLoading || notificationsBusy || !notificationPreferences.enabled}
            colors={colors}
            onValueChange={(community) => void changeNotificationPreferences({ community })}
          />
          <NotificationToggle
            icon="bell"
            label="System announcements"
            description="Important FXSnap product and service updates."
            value={notificationPreferences.systemAnnouncements}
            disabled={notificationsLoading || notificationsBusy || !notificationPreferences.enabled}
            colors={colors}
            onValueChange={(systemAnnouncements) => void changeNotificationPreferences({ systemAnnouncements })}
            last={!systemAnnouncementAdmin}
          />
          {notificationsLoading ? (
            <Text style={[styles.inlineMessage, { color: colors.textSecondary }]}>Loading notification preferences…</Text>
          ) : null}
          {notificationMessage ? (
            <Text style={[styles.inlineMessage, { color: colors.buy }]}>{notificationMessage}</Text>
          ) : null}
          {notificationError ? (
            <Text style={[styles.inlineMessage, { color: colors.sell }]}>{notificationError}</Text>
          ) : null}
          {systemAnnouncementAdmin ? (
            <SettingsRow
              icon="send"
              label="System announcement admin"
              colors={colors}
              onPress={() => router.push({ pathname: '/community-admin', params: { tab: 'announcements', systemOnly: 'true' } })}
              last
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Appearance" colors={colors}>
          <View style={[styles.appearanceSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.appearanceHeading, { color: colors.textSecondary }]}>App theme</Text>
            <View style={[styles.appearanceControl, { backgroundColor: colors.segmentBackground }]}>
              <AppearanceOption icon="sun" label="Light" value="light" selected={themeMode === 'light'} colors={colors} onPress={setAppearance} />
              <AppearanceOption icon="moon" label="Dark" value="dark" selected={themeMode === 'dark'} colors={colors} onPress={setAppearance} />
              <AppearanceOption icon="smartphone" label="System" value="system" selected={themeMode === 'system'} colors={colors} onPress={setAppearance} />
            </View>
          </View>
        </SettingsGroup>

        <SettingsGroup title="Your FXSnap" colors={colors}>
          <SettingsRow icon="archive" label="My saved setups" colors={colors} onPress={() => router.push('/saved')} />
          <SettingsRow icon="edit" label="Journal your trades" colors={colors} onPress={() => router.push('/risk-management')} />
          <SettingsRow icon="bar-chart-2" label="Screenshot guide" colors={colors} onPress={openScreenshotGuide} last />
        </SettingsGroup>

        <SettingsGroup title="Support" colors={colors}>
          <SettingsRow icon="message-circle" label="Help & contact support" colors={colors} onPress={() => void openHelpAndSupport()} last />
        </SettingsGroup>

        <SettingsGroup title="Privacy & legal" colors={colors}>
          <SettingsRow
            icon="shield"
            label="Privacy Policy"
            colors={colors}
            onPress={() => void openLegalDocument('privacy')}
          />
          <SettingsRow icon="file-text" label="Terms of Service" colors={colors} onPress={() => void openLegalDocument('terms')} last />
          <Text style={[styles.inlineMessage, { color: colors.textSecondary }]}>
            Community profile visibility controls are not currently supported. Your email is not shown in community posts.
          </Text>
        </SettingsGroup>

        {account ? (
          <SettingsGroup title="Account access" colors={colors}>
            <SettingsRow
              icon="log-out"
              label="Sign out"
              colors={colors}
              onPress={confirmSignOut}
              trailing={accountBusy ? <ActivityIndicator size="small" color={colors.textSecondary} /> : undefined}
              last
            />
          </SettingsGroup>
        ) : null}

        {account ? (
          <View style={[styles.deleteSection, { borderTopColor: colors.cardBorder }]}>
            <Text style={[styles.deleteExplanation, { color: colors.textSecondary }]}>
              Deleting your FXSnap account does not cancel subscriptions billed by an app store.
            </Text>
            <TouchableOpacity
              onPress={confirmDeleteAccount}
              style={styles.deleteAction}
              accessibilityRole="button"
              disabled={accountBusy}
            >
              <Feather name="trash-2" size={18} color={colors.destructive} />
              <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete account</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SettingsGroup({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.groupTitle, { color: colors.textSecondary, borderBottomColor: colors.cardBorder }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function NotificationToggle({
  icon,
  label,
  description,
  value,
  disabled,
  colors,
  onValueChange,
  last = false,
}: {
  icon: SettingsIcon;
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  colors: ReturnType<typeof useColors>;
  onValueChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[
      styles.notificationRow,
      !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder },
    ]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.buy}18` }]}>
        <Feather name={icon} size={17} color={colors.buy} />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={[styles.notificationTitle, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.notificationDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.cardBorder, true: `${colors.buy}88` }}
        thumbColor={value ? colors.buy : colors.surface}
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  colors,
  onPress,
  trailing,
  last,
}: {
  icon: SettingsIcon;
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.settingRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder },
      ]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? undefined : { disabled: true }}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.iconBackground }]}>
        <Feather name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      {trailing || (onPress ? <Feather name="chevron-right" size={20} color={colors.textMuted} /> : null)}
    </TouchableOpacity>
  );
}

function AppearanceOption({
  icon,
  label,
  value,
  selected,
  colors,
  onPress,
}: {
  icon: SettingsIcon;
  label: string;
  value: ThemeMode;
  selected: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: (mode: ThemeMode) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onPress(value)}
      style={[
        styles.appearanceOption,
        selected && { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Feather name={icon} size={16} color={selected ? colors.buy : colors.textMuted} />
      <Text style={[styles.appearanceLabel, { color: selected ? colors.text : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  headerCopy: { flex: 1, gap: 2 },
  headerSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  headerSpacer: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 26, gap: 14 },
  group: { overflow: 'hidden', borderWidth: 1, borderRadius: 15 },
  groupTitle: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
    borderBottomWidth: 1,
    textTransform: 'uppercase',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  emailRow: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emailDetails: { flex: 1, gap: 8 },
  emailLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  emailValue: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  subscriptionState: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 14 },
  stateText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  retryLabel: { padding: 8, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  subscriptionCard: { padding: 15, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  subscriptionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  subscriptionCopy: { flex: 1, gap: 5 },
  subscriptionPlan: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  subscriptionDescription: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  statusBadge: { borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9 },
  statusLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  subscriptionDate: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  subscriptionAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderRadius: 12 },
  subscriptionActionText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  infoRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  infoCopy: { flex: 1, gap: 5 },
  infoDescription: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  notificationRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10 },
  notificationCopy: { flex: 1, gap: 3 },
  notificationTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  notificationDescription: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  inlineMessage: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  accountProvider: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  appearanceSection: { minHeight: 99, justifyContent: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  appearanceHeading: { textTransform: 'uppercase', fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  appearanceControl: { minHeight: 42, flexDirection: 'row', alignItems: 'stretch', borderRadius: 14, padding: 3 },
  appearanceOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, borderColor: 'transparent' },
  appearanceLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  settingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  rowLabel: { flex: 1, fontSize: 16, fontFamily: 'Inter_500Medium' },
  accountError: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 13, fontFamily: 'Inter_500Medium' },
  accountSyncStatus: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  deleteSection: { minHeight: 76, marginTop: 8, borderTopWidth: 1, alignItems: 'center', paddingTop: 16, gap: 8 },
  deleteExplanation: { maxWidth: 340, paddingHorizontal: 16, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  deleteAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 },
  deleteText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
});
