import React, { useState } from 'react';
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

const RISK_OPTIONS = [0.5, 1, 1.5, 2, 3, 5];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { settings, updateSettings, isSubscribed, exportData, importData, deleteAccount } = useApp();

  const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || 'https://fxsnap.app/privacy';
  const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL || 'https://fxsnap.app/terms';
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app';
  const rateUrl = process.env.EXPO_PUBLIC_RATE_URL || 'https://play.google.com/store/apps/details?id=com.fxsnap';
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
  const openRateApp = async () => openUrl(rateUrl, 'Please visit the app store to rate FXSnap.');
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

  const [balanceInput, setBalanceInput] = useState(settings.accountBalance.toString());
  const [balanceSaved, setBalanceSaved] = useState(settings.balanceSet);

  // Lot calculator — pre-filled from user's saved settings
  const [calcBalance, setCalcBalance] = useState(settings.accountBalance.toString());
  const [calcRisk, setCalcRisk] = useState(settings.riskPercent.toString());
  const [calcSl, setCalcSl] = useState('20');

  const parsedBalance = parseFloat(calcBalance);
  const parsedRisk = parseFloat(calcRisk);
  const parsedSl = parseFloat(calcSl);
  const minimumLot = 0.01;
  const supportsNanoLot = true;
  const minimumSupportedLot = supportsNanoLot ? 0.001 : minimumLot;
  const riskAmount = parsedBalance * (parsedRisk / 100);
  const rawLot = parsedSl > 0 ? riskAmount / (parsedSl * 10) : 0;
  const roundedLot = rawLot > 0 ? Math.max(minimumSupportedLot, rawLot) : 0;
  const calcLotSize =
    parsedBalance >= 0 && parsedRisk >= 0 && parsedSl > 0
      ? roundedLot.toFixed(supportsNanoLot ? 3 : 2)
      : '—';
  const isSmallAccount = parsedBalance > 0 && parsedBalance < 100;
  const isVerySmallLot = rawLot > 0 && rawLot < minimumSupportedLot;

  const saveBalance = () => {
    const val = parseFloat(balanceInput);
    if (!isNaN(val) && val > 0) {
      updateSettings({ accountBalance: val, balanceSet: true });
      setCalcBalance(val.toString());
      setBalanceSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
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
      <Text style={styles.sectionHeader}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubheader}>{subtitle}</Text>}
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
        <View style={styles.rowIcon}>
          <Feather name={icon as any} size={16} color="#8E8E93" />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
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
              title="Account"
              subtitle="Used to calculate lot sizes automatically"
            />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Row icon="dollar-sign" label="Account Balance">
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={balanceInput}
                    onChangeText={(v) => {
                      setBalanceInput(v);
                      setBalanceSaved(false);
                    }}
                    keyboardType="decimal-pad"
                    onBlur={saveBalance}
                    onSubmitEditing={saveBalance}
                    returnKeyType="done"
                    placeholderTextColor="#48484A"
                  />
                  <Text style={styles.inputSuffix}>USD</Text>
                  {balanceSaved && (
                    <Feather name="check-circle" size={16} color="#00E676" style={{ marginLeft: 4 }} />
                  )}
                </View>
              </Row>

              {!settings.balanceSet && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.balanceTip}>
                  <Feather name="info" size={13} color="#FFD60A" />
                  <Text style={styles.balanceTipText}>
                    Save your balance for accurate lot size calculations in analysis.
                  </Text>
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {/* ── Risk Management ── */}
          <Animated.View entering={FadeInDown.delay(140).duration(500)}>
            <SectionHeader title="Risk Management" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={styles.riskLabel}>Risk per trade: <Text style={styles.riskValue}>{settings.riskPercent}%</Text></Text>
              <View style={styles.riskOptions}>
                {RISK_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.riskChip, settings.riskPercent === r && styles.riskChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateSettings({ riskPercent: r });
                      setCalcRisk(r.toString());
                    }}
                  >
                    <Text
                      style={[
                        styles.riskChipText,
                        settings.riskPercent === r && styles.riskChipTextActive,
                      ]}
                    >
                      {r}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.riskInfo}>
                <Feather name="shield" size={13} color="#8E8E93" />
                <Text style={styles.riskInfoText}>
                  At {settings.riskPercent}% risk on a ${settings.accountBalance.toLocaleString()} account = $
                  {(settings.accountBalance * settings.riskPercent / 100).toFixed(2)} per trade
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Lot Size Calculator ── */}
          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <SectionHeader title="Lot Size Calculator" />
            <View style={[styles.card, { gap: 14 }]}>
              <View style={styles.calcRow}>
                <View style={styles.calcField}>
                  <Text style={styles.calcLabel}>Balance ($)</Text>
                  <TextInput
                    style={styles.calcInput}
                    value={calcBalance}
                    onChangeText={setCalcBalance}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#48484A"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.calcField}>
                  <Text style={styles.calcLabel}>Risk (%)</Text>
                  <TextInput
                    style={styles.calcInput}
                    value={calcRisk}
                    onChangeText={setCalcRisk}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#48484A"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.calcField}>
                  <Text style={styles.calcLabel}>SL (pips)</Text>
                  <TextInput
                    style={styles.calcInput}
                    value={calcSl}
                    onChangeText={setCalcSl}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#48484A"
                    returnKeyType="done"
                  />
                </View>
              </View>
              <View style={styles.calcResult}>
                <Text style={styles.calcResultLabel}>Lot Size</Text>
                <Text style={styles.calcResultValue}>{calcLotSize}</Text>
              </View>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={() => {
                  setCalcBalance(settings.accountBalance.toString());
                  setCalcRisk(settings.riskPercent.toString());
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Feather name="refresh-cw" size={13} color="#8E8E93" />
                <Text style={styles.syncBtnText}>Sync from my account settings</Text>
              </TouchableOpacity>
              <Text style={styles.calcResultNote}>{
                isSmallAccount
                  ? 'Small Account Mode Enabled — optimized for low balances.'
                  : 'Forex estimate only. Quote-currency conversion and broker contract rules may change the result.'
              }</Text>
              {isVerySmallLot && (
                <Text style={styles.calcResultNote}>
                  Calculated lot size is very small; adjusted to minimum supported lot size.
                </Text>
              )}
              <Text style={styles.calcFormula}>
                Forex estimate only. Quote-currency conversion and broker contract rules may change the result.
              </Text>
            </View>
          </Animated.View>

          {/* ── Subscription ── */}
          <Animated.View entering={FadeInDown.delay(260).duration(500)}>
            <SectionHeader title="Subscription" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.subRow}>
                <View style={styles.subLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: isSubscribed ? '#0D1A12' : '#2A2A2A', borderColor: isSubscribed ? '#1A3D26' : '#3A3A3A', borderWidth: 1 }]}>
                    <Feather name="zap" size={16} color={isSubscribed ? '#00E676' : '#8E8E93'} />
                  </View>
                  <View>
                    <Text style={styles.rowLabel}>FXSnap Premium</Text>
                    <Text style={styles.subStatus}>
                      {isSubscribed ? 'Active' : 'Not subscribed'}
                    </Text>
                  </View>
                </View>
                {!isSubscribed && (
                  <TouchableOpacity
                    style={styles.upgradeBtn}
                    onPress={() => router.push('/paywall')}
                  >
                    <Text style={styles.upgradeBtnText}>Upgrade</Text>
                  </TouchableOpacity>
                )}
                {isSubscribed && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.navigationRow} onPress={openSubscriptionManager}>
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Feather name="settings" size={16} color="#8E8E93" />
                  </View>
                  <Text style={styles.rowLabel}>Manage subscription</Text>
                </View>
                <Feather name="external-link" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <Text style={styles.cardNote}>
                Subscription billing is handled through Google Play. Use the manage link above to update, cancel, or restore your subscription.
              </Text>
            </View>
          </Animated.View>

          {/* ── App Preferences ── */}
          <Animated.View entering={FadeInDown.delay(320).duration(500)}>
            <SectionHeader title="App Preferences" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Row icon="zap" label="Haptic Feedback">
                <Switch
                  value={settings.hapticsEnabled}
                  onValueChange={(v) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ hapticsEnabled: v });
                  }}
                  trackColor={{ false: '#2A2A2A', true: '#00E676' }}
                  thumbColor="#FFFFFF"
                />
              </Row>
              <View style={styles.rowDivider} />
              <Row icon="moon" label="Dark Mode">
                <Switch
                  value={settings.darkMode}
                  onValueChange={(v) => {
                    if (v === false) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      Alert.alert(
                        'Light mode coming soon',
                        'Light mode is not available yet. Dark mode remains enforced for this release.'
                      );
                      updateSettings({ darkMode: true });
                      return;
                    }
                    updateSettings({ darkMode: true });
                  }}
                  trackColor={{ false: '#2A2A2A', true: '#00E676' }}
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
                  <View style={styles.rowIcon}>
                    <Feather name="file-text" size={16} color="#8E8E93" />
                  </View>
                  <Text style={styles.rowLabel}>Terms of Use</Text>
                </View>
                <Feather name="external-link" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.navigationRow} onPress={openPrivacyPolicy}>
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Feather name="shield" size={16} color="#8E8E93" />
                  </View>
                  <Text style={styles.rowLabel}>Privacy policy</Text>
                </View>
                <Feather name="external-link" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <Text style={styles.cardNote}>
                FXSnap analyzes chart images you select. We do not provide financial advice and may not have access to your trading account.
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <SectionHeader title="Support" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <TouchableOpacity style={styles.navigationRow} onPress={openSupportEmail}>
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Feather name="mail" size={16} color="#8E8E93" />
                  </View>
                  <Text style={styles.rowLabel}>{supportEmail}</Text>
                </View>
                <Feather name="external-link" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.navigationRow} onPress={openRateApp}>
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Feather name="star" size={16} color="#8E8E93" />
                  </View>
                  <Text style={styles.rowLabel}>Rate FXSnap</Text>
                </View>
                <Feather name="external-link" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.destructiveRow} onPress={confirmDeleteAccount}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowIcon, { backgroundColor: '#2A0B0B' }]}> 
                    <Feather name="trash-2" size={16} color="#FF4D4F" />
                  </View>
                  <Text style={styles.destructiveText}>Delete Account</Text>
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
                <View style={styles.backupIcon}>
                  <Feather name="upload" size={17} color="#00E676" />
                </View>
                <View style={styles.backupCopy}>
                  <Text style={styles.rowLabel}>Export backup JSON</Text>
                  <Text style={styles.backupDescription}>Copy all account data to the clipboard</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#8E8E93" />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.backupRow} onPress={importBackup}>
                <View style={styles.backupIcon}>
                  <Feather name="download" size={17} color="#00E676" />
                </View>
                <View style={styles.backupCopy}>
                  <Text style={styles.rowLabel}>Import backup JSON</Text>
                  <Text style={styles.backupDescription}>Restore from copied backup data</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Text style={styles.versionText}>FXSnap v1.0.0</Text>
          <Text style={styles.disclaimer}>
            This app does not provide financial advice. Trade at your own risk.
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
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
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  rowDivider: { height: 1, backgroundColor: '#2A2A2A', marginVertical: 8 },
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
    backgroundColor: '#0D1A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupCopy: { flex: 1, gap: 3 },
  backupDescription: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
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
    backgroundColor: '#0D1A12',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A3D26',
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
    color: '#48484A',
    textAlign: 'center',
    lineHeight: 18,
  },
});
