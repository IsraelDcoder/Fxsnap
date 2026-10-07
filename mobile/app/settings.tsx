import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { RatingPromptModal } from '@/components/RatingPromptModal';
import {
  getNotificationPreferences,
  clearNotificationPreferences,
  requestAndRegisterPushNotifications,
  saveNotificationPreferences,
  unregisterPushToken,
  type NotificationPreferences,
} from '@/services/notifications';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { settings, updateSettings, isSubscribed, exportData, importData, deleteAccount } = useApp();

  const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || 'https://fxsnap.app/privacy';
  const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL || 'https://fxsnap.app/terms';
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app';
  const subscriptionManagerUrl = process.env.EXPO_PUBLIC_SUBSCRIPTION_URL || 'https://play.google.com/store/account/subscriptions';

  const openUrl = async (url: string, fallbackMessage: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', fallbackMessage);
    }
  };

  const openPrivacyPolicy = async () => openUrl(privacyPolicyUrl, 'Please visit the privacy page in your browser.');
  const openTerms = async () => openUrl(termsUrl, 'Please visit the terms page in your browser.');
  const openSupportEmail = async () => openUrl(`mailto:${supportEmail}`, 'Please copy the support email address to contact us.');
  const openSubscriptionManager = async () => openUrl(subscriptionManagerUrl, 'Please use Google Play to manage your subscription.');

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This will remove all local data, saved analyses, strategies, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await unregisterPushToken().catch(() => undefined);
            await clearNotificationPreferences();
            await deleteAccount();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Account deleted', 'Your local FXSnap data has been removed.');
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [displayNameInput, setDisplayNameInput] = useState(settings.displayName);
  const [ratingPromptVisible, setRatingPromptVisible] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    enabled: false,
    dailyBrief: true,
    inactivity: true,
    weekly: true,
  });

  useEffect(() => {
    void getNotificationPreferences().then(setNotificationPreferences);
  }, []);

  const updateNotificationPreferences = async (next: NotificationPreferences) => {
    const previous = notificationPreferences;
    setNotificationPreferences(next);
    await saveNotificationPreferences(next);
    if (!next.enabled) {
      try {
        await unregisterPushToken();
      } catch {
        Alert.alert('Notifications not fully disabled', 'FXSnap could not update your notification settings on the server.');
      }
      return;
    }
    try {
      const result = await requestAndRegisterPushNotifications(next);
      if (!result.granted) {
        const disabled = { ...next, enabled: false };
        setNotificationPreferences(disabled);
        await saveNotificationPreferences(disabled);
        Alert.alert('Permission required', 'Allow notifications for FXSnap in your device settings to receive updates.');
      }
    } catch {
      setNotificationPreferences(previous);
      await saveNotificationPreferences(previous);
      Alert.alert('Unable to enable notifications', 'Please try again when you have a network connection.');
    }
  };

  const saveDisplayName = () => {
    updateSettings({ displayName: displayNameInput.trim().slice(0, 40) });
  };

  const exportBackup = async () => {
    try {
      const backupJson = await exportData();
      await Clipboard.setStringAsync(backupJson);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Backup copied',
        'Your FXSnap backup JSON is now on the clipboard. Paste it somewhere safe so you can restore it after an update or on another device.'
      );
    } catch {
      Alert.alert('Backup failed', 'FXSnap could not create a backup right now.');
    }
  };

  const importBackup = async () => {
    try {
      const backupJson = await Clipboard.getStringAsync();
      if (!backupJson.trim()) {
        Alert.alert('No backup found', 'Copy your FXSnap backup JSON to the clipboard first.');
        return;
      }

      Alert.alert(
        'Restore backup?',
        'This will replace your current settings, saved analyses, saved strategies, and subscription state with the backup.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                await importData(backupJson);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Backup restored', 'Your FXSnap data has been restored successfully.');
              } catch {
                Alert.alert('Restore failed', 'That clipboard content is not a valid FXSnap backup.');
              }
            },
          },
        ]
      );
    } catch {
      Alert.alert('Restore failed', 'FXSnap could not read the clipboard right now.');
    }
  };

  const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={styles.sectionHeaderBlock}>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle && <Text style={[styles.sectionSubheader, { color: colors.textMuted }]}>{subtitle}</Text>}
    </View>
  );

  const Row = ({
    icon,
    label,
    children,
  }: {
    icon: string;
    label: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
          <Feather name={icon as any} size={16} color={colors.textMuted} />
        </View>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}> 
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
          <View style={{ width: 44 }} />
        </Animated.View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Account ── */}
          <Animated.View entering={FadeInDown.delay(80).duration(500)}>
            <SectionHeader
              title="Profile"
              subtitle="Personalize your FXSnap profile"
            />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>  
              <Row icon="user" label="First name">
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }]}
                  value={displayNameInput}
                  onChangeText={setDisplayNameInput}
                  onBlur={saveDisplayName}
                  onSubmitEditing={saveDisplayName}
                  returnKeyType="done"
                  maxLength={40}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                />
              </Row>
              <TouchableOpacity style={[styles.navigationRow, { marginTop: 12 }]} onPress={() => router.push('/saved-briefs')}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="bookmark" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Saved Briefs</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Subscription ── */}
          <Animated.View entering={FadeInDown.delay(260).duration(500)}>
            <SectionHeader title="Subscription" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.subRow}>
                <View style={styles.subLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: isSubscribed ? colors.surface : colors.card, borderColor: isSubscribed ? colors.buy : colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="zap" size={16} color={isSubscribed ? colors.buy : colors.textMuted} />
                  </View>
                  <View>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>FXSnap Premium</Text>
                    <Text style={[styles.subStatus, { color: colors.textSecondary }]}>
                      {isSubscribed ? 'Active' : 'Not subscribed'}
                    </Text>
                  </View>
                </View>
                {!isSubscribed && (
                  <TouchableOpacity
                    style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/paywall')}
                  >
                    <Text style={[styles.upgradeBtnText, { color: colors.primaryForeground }]}>Upgrade</Text>
                  </TouchableOpacity>
                )}
                {isSubscribed && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.activeBadgeText, { color: colors.buy }]}>Active</Text>
                  </View>
                )}
              </View>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <TouchableOpacity style={styles.navigationRow} onPress={openSubscriptionManager}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="settings" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Manage subscription</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={[styles.cardNote, { color: colors.textSecondary }]}>
                Subscription billing is handled through Google Play. Use the manage link above to update, cancel, or restore your subscription.
              </Text>
            </View>
          </Animated.View>

          {/* ── App Preferences ── */}
          <Animated.View entering={FadeInDown.delay(320).duration(500)}>
            <SectionHeader title="App Preferences" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Row icon="bell" label="Push notifications">
                <Switch
                  value={notificationPreferences.enabled}
                  onValueChange={(enabled) => void updateNotificationPreferences({ ...notificationPreferences, enabled })}
                  trackColor={{ false: '#E6E8EC', true: '#FFD84D' }}
                  thumbColor="#FFFFFF"
                />
              </Row>
              {notificationPreferences.enabled && <>
                <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
                <Row icon="book-open" label="Daily Brief">
                  <Switch value={notificationPreferences.dailyBrief} onValueChange={(dailyBrief) => void updateNotificationPreferences({ ...notificationPreferences, dailyBrief })} trackColor={{ false: '#E6E8EC', true: '#FFD84D' }} thumbColor="#FFFFFF" />
                </Row>
                <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
                <Row icon="clock" label="Return reminders">
                  <Switch value={notificationPreferences.inactivity} onValueChange={(inactivity) => void updateNotificationPreferences({ ...notificationPreferences, inactivity })} trackColor={{ false: '#E6E8EC', true: '#FFD84D' }} thumbColor="#FFFFFF" />
                </Row>
                <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
                <Row icon="trending-up" label="Weekly activity">
                  <Switch value={notificationPreferences.weekly} onValueChange={(weekly) => void updateNotificationPreferences({ ...notificationPreferences, weekly })} trackColor={{ false: '#E6E8EC', true: '#FFD84D' }} thumbColor="#FFFFFF" />
                </Row>
              </>}
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <Row icon="zap" label="Haptic Feedback">
                <Switch
                  value={settings.hapticsEnabled}
                  onValueChange={(v) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ hapticsEnabled: v });
                  }}
                  trackColor={{ false: '#E6E8EC', true: '#FFD84D' }}
                  thumbColor="#FFFFFF"
                />
              </Row>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <Row icon="moon" label="Dark Mode">
                <Switch
                  value={settings.darkMode}
                  onValueChange={(v) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ darkMode: v });
                  }}
                  trackColor={{ false: '#E6E8EC', true: '#FFD84D' }}
                  thumbColor="#FFFFFF"
                />
              </Row>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(360).duration(500)}>
            <SectionHeader title="Legal" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <TouchableOpacity style={styles.navigationRow} onPress={openTerms}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="file-text" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Terms of Use</Text>
                </View>
                <Feather name="external-link" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <TouchableOpacity style={styles.navigationRow} onPress={openPrivacyPolicy}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="shield" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Privacy policy</Text>
                </View>
                <Feather name="external-link" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={[styles.cardNote, { color: colors.textSecondary }]}>
                FXSnap analyzes chart images you select. We do not provide financial advice and may not have access to your trading account.
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <SectionHeader title="Support" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <TouchableOpacity style={styles.navigationRow} onPress={openSupportEmail}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="mail" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{supportEmail}</Text>
                </View>
                <Feather name="external-link" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <TouchableOpacity style={styles.navigationRow} onPress={() => setRatingPromptVisible(true)}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                    <Feather name="star" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Rate FXSnap</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <TouchableOpacity style={styles.destructiveRow} onPress={confirmDeleteAccount}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.destructive, borderWidth: 1 }]}> 
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </View>
                  <Text style={[styles.destructiveText, { color: colors.destructive } ]}>Delete Account</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.cardNote}>
                Need help with billing, account data, or cancellation? Contact support using the email above.
              </Text>
            </View>
          </Animated.View>

          {/* ── Data Backup ── */}
          <Animated.View entering={FadeInDown.delay(380).duration(500)}>
            <SectionHeader
              title="Data Backup"
              subtitle="Protect your balance, risk settings, and saved data"
            />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <TouchableOpacity style={styles.backupRow} onPress={exportBackup}>
                <View style={[styles.backupIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }] }>
                  <Feather name="upload" size={17} color={colors.buy} />
                </View>
                <View style={styles.backupCopy}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Export backup JSON</Text>
                  <Text style={[styles.backupDescription, { color: colors.textMuted }]}>Copy all account data to the clipboard</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.rowDivider, { backgroundColor: colors.cardBorder }]} />
              <TouchableOpacity style={styles.backupRow} onPress={importBackup}>
                <View style={[styles.backupIcon, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }] }>
                  <Feather name="download" size={17} color={colors.buy} />
                </View>
                <View style={styles.backupCopy}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Import backup JSON</Text>
                  <Text style={[styles.backupDescription, { color: colors.textMuted }]}>Restore from copied backup data</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Text style={[styles.versionText, { color: colors.textSecondary }]}>FXSnap v1.0.0</Text>
          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}> 
            This app does not provide financial advice. Trade at your own risk.
          </Text>
        </ScrollView>
      </View>
      <RatingPromptModal visible={ratingPromptVisible} onDismiss={() => setRatingPromptVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  sectionHeaderBlock: { gap: 2, marginBottom: 8 },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionSubheader: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  rowDivider: { height: 1, marginVertical: 8 },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  backupIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupCopy: { flex: 1, gap: 3 },
  backupDescription: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
    minWidth: 70,
    textAlign: 'right',
  },
  inputSuffix: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  balanceTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1600',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#3D3400',
  },
  balanceTipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#C7C7CC',
    lineHeight: 18,
  },
  riskLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#8E8E93', marginBottom: 12 },
  riskValue: { fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  riskOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riskChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  riskChipActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  riskChipText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  riskChipTextActive: { color: '#000000' },
  riskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 10,
  },
  riskInfoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 18 },
  calcRow: { flexDirection: 'row', gap: 10 },
  calcField: { flex: 1, gap: 6 },
  calcLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  calcInput: {
    height: 44,
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    textAlign: 'center',
  },
  calcResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  calcResultLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  calcResultValue: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#00E676' },
  calcResultNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#A3E635',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  syncBtnText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  calcFormula: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#48484A', textAlign: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subInfo: { marginTop: 12, color: '#8E8E93', fontSize: 12, fontFamily: 'Inter_400Regular' },
  subLinkBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center' },
  subLinkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#00E676' },
  cardNote: { marginTop: 12, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 18 },
  destructiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  destructiveText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FF4D4F' },
  subStatus: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2 },
  upgradeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  upgradeBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#000' },
  activeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#1A3D26',
  },
  activeBadgeText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#00E676' },
  versionText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    textAlign: 'center',
    marginTop: 8,
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
});
