import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { shouldGuardFeatureRoute } from '@/services/featureAccess';
import {
  calculateTradeRisk,
  getLocalRiskDateKey,
  getRiskRuleChecks,
  normalizeDailyRiskActivity,
  type OpenRiskPosition,
  type TradeDirection,
} from '@/services/risk';

const PAIR_PRESETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD'];

function parsePositive(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: number) {
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`;
}

export default function RiskManagementScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    settings,
    updateSettings,
    riskActivity,
    recordOpenRiskPosition,
    closeRiskPosition,
    isSubscribed,
    checkFeatureAccess,
  } = useApp();

  const [profileBalance, setProfileBalance] = useState(String(settings.accountBalance));
  const [riskPercent, setRiskPercent] = useState(String(settings.riskPercent));
  const [dailyLimit, setDailyLimit] = useState(String(settings.maxDailyLossPercent));
  const [openLimit, setOpenLimit] = useState(String(settings.maxOpenRiskPercent));
  const [tradeLimit, setTradeLimit] = useState(String(settings.maxTradesPerDay));
  const [lossStreakLimit, setLossStreakLimit] = useState(String(settings.maxConsecutiveLosses));
  const [profileSaved, setProfileSaved] = useState(false);

  const [checkVisible, setCheckVisible] = useState(false);
  const [pair, setPair] = useState('EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('BUY');
  const [tradeRiskPercent, setTradeRiskPercent] = useState(String(settings.riskPercent));
  const [entry, setEntry] = useState('1.0850');
  const [stopLoss, setStopLoss] = useState('1.0800');
  const [takeProfit, setTakeProfit] = useState('1.0950');

  const [closingPosition, setClosingPosition] = useState<OpenRiskPosition | null>(null);
  const [realizedPnlInput, setRealizedPnlInput] = useState('');

  useEffect(() => {
    setProfileBalance(String(settings.accountBalance));
    setRiskPercent(String(settings.riskPercent));
    setDailyLimit(String(settings.maxDailyLossPercent));
    setOpenLimit(String(settings.maxOpenRiskPercent));
    setTradeLimit(String(settings.maxTradesPerDay));
    setLossStreakLimit(String(settings.maxConsecutiveLosses));
  }, [settings.accountBalance, settings.riskPercent, settings.maxDailyLossPercent, settings.maxOpenRiskPercent, settings.maxTradesPerDay, settings.maxConsecutiveLosses]);

  const balanceValue = parsePositive(profileBalance);
  const riskValue = parsePositive(riskPercent);
  const dailyLimitValue = parsePositive(dailyLimit);
  const openLimitValue = parsePositive(openLimit);
  const tradeLimitValue = parsePositive(tradeLimit);
  const lossLimitValue = parsePositive(lossStreakLimit);

  const profileIsValid = Boolean(
    balanceValue && riskValue && riskValue <= 10 && dailyLimitValue && dailyLimitValue <= 100
    && openLimitValue && openLimitValue <= 100 && tradeLimitValue && tradeLimitValue <= 50
    && lossLimitValue && lossLimitValue <= 50,
  );

  const profile = useMemo(() => ({
    accountBalance: settings.accountBalance,
    riskPercent: settings.riskPercent,
    maxDailyLossPercent: settings.maxDailyLossPercent,
    maxOpenRiskPercent: settings.maxOpenRiskPercent,
    maxTradesPerDay: settings.maxTradesPerDay,
    maxConsecutiveLosses: settings.maxConsecutiveLosses,
  }), [settings.accountBalance, settings.riskPercent, settings.maxDailyLossPercent, settings.maxOpenRiskPercent, settings.maxTradesPerDay, settings.maxConsecutiveLosses]);

  const todayActivity = useMemo(() => normalizeDailyRiskActivity(riskActivity, getLocalRiskDateKey()), [riskActivity]);
  const openRiskAmount = todayActivity.openPositions.reduce((total, position) => total + position.riskAmount, 0);
  const maximumDailyLoss = profile.accountBalance * profile.maxDailyLossPercent / 100;
  const maximumOpenRisk = profile.accountBalance * profile.maxOpenRiskPercent / 100;
  const dailyLossUsed = Math.max(0, -todayActivity.dailyNetPnl);
  const dailyProgress = maximumDailyLoss > 0 ? Math.min(1, dailyLossUsed / maximumDailyLoss) : 0;
  const openRiskPercent = profile.accountBalance > 0 ? openRiskAmount / profile.accountBalance * 100 : 0;

  const entryValue = Number.parseFloat(entry);
  const stopValue = Number.parseFloat(stopLoss);
  const targetValue = Number.parseFloat(takeProfit);
  const tradeRiskValue = Number.parseFloat(tradeRiskPercent);
  const calculationProfile = { ...profile, riskPercent: tradeRiskValue };
  const trade = calculateTradeRisk(calculationProfile, {
    pair,
    direction,
    entry: entryValue,
    stopLoss: stopValue,
    takeProfit: targetValue,
  });
  const ruleChecks = trade.valid ? getRiskRuleChecks(profile, todayActivity, trade) : [];
  const allChecksPass = ruleChecks.length > 0 && ruleChecks.every((check) => check.passed);

  const saveProfile = async () => {
    if (!profileIsValid || !balanceValue || !riskValue || !dailyLimitValue || !openLimitValue || !tradeLimitValue || !lossLimitValue) {
      Alert.alert('Check your risk profile', 'Enter a positive account balance and valid limits. Percent values must be at most 100%.');
      return;
    }
    await updateSettings({
      accountBalance: balanceValue,
      balanceSet: true,
      riskPercent: riskValue,
      maxDailyLossPercent: dailyLimitValue,
      maxOpenRiskPercent: openLimitValue,
      maxTradesPerDay: Math.floor(tradeLimitValue),
      maxConsecutiveLosses: Math.floor(lossLimitValue),
    });
    setProfileSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addToExposure = async () => {
    if (!trade.valid) return;
    const position: OpenRiskPosition = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pair: pair.toUpperCase().replace('/', ''),
      direction,
      entry: entryValue,
      stopLoss: stopValue,
      takeProfit: targetValue,
      riskAmount: trade.riskAmount,
      lotSize: trade.lotSize,
      createdAt: new Date().toISOString(),
    };
    await recordOpenRiskPosition(position);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCheckVisible(false);
    Alert.alert('Added to exposure', `${position.pair} is now included in your open risk and trade count.`);
  };

  const finishPosition = async () => {
    const result = Number.parseFloat(realizedPnlInput);
    if (!closingPosition || !Number.isFinite(result)) {
      Alert.alert('Enter the result', 'Enter realized P&L in account currency. Use a minus sign for a loss.');
      return;
    }
    await closeRiskPosition(closingPosition.id, result);
    setClosingPosition(null);
    setRealizedPnlInput('');
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: topPad + 8, flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Back">
            <Feather name="arrow-left" size={21} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Risk Management</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Pre-trade risk check</Text>
          </View>
          <View style={[styles.headerShield, { backgroundColor: `${colors.buy}16` }]}><Feather name="shield" size={19} color={colors.buy} /></View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Risk Profile</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Rules are yours; FXSnap checks the numbers.</Text>
            </View>
            {profileSaved ? <Feather name="check-circle" size={17} color={colors.buy} /> : null}
          </View>

          <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <ProfileField label="Account balance" unit="USD" value={profileBalance} onChangeText={(value) => { setProfileBalance(value); setProfileSaved(false); }} colors={colors} />
            <View style={styles.profileGrid}>
              <ProfileField label="Risk per trade" unit="%" value={riskPercent} onChangeText={(value) => { setRiskPercent(value); setProfileSaved(false); }} colors={colors} />
              <ProfileField label="Daily loss limit" unit="%" value={dailyLimit} onChangeText={(value) => { setDailyLimit(value); setProfileSaved(false); }} colors={colors} />
              <ProfileField label="Max open risk" unit="%" value={openLimit} onChangeText={(value) => { setOpenLimit(value); setProfileSaved(false); }} colors={colors} />
              <ProfileField label="Max trades / day" unit="trades" value={tradeLimit} onChangeText={(value) => { setTradeLimit(value); setProfileSaved(false); }} colors={colors} />
              <ProfileField label="Max loss streak" unit="losses" value={lossStreakLimit} onChangeText={(value) => { setLossStreakLimit(value); setProfileSaved(false); }} colors={colors} />
            </View>
            <TouchableOpacity disabled={!profileIsValid} onPress={() => void saveProfile()} style={[styles.saveProfileButton, { backgroundColor: profileIsValid ? colors.buy : colors.surface, borderColor: profileIsValid ? colors.buy : colors.cardBorder }]}>
              <Feather name={profileSaved ? 'check' : 'save'} size={15} color={profileIsValid ? colors.primaryForeground : colors.textMuted} />
              <Text style={[styles.saveProfileText, { color: profileIsValid ? colors.primaryForeground : colors.textMuted }]}>{profileSaved ? 'Profile Saved' : 'Save Risk Profile'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Today</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Manually tracked activity; no broker connection.</Text>
            </View>
          </View>

          <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.todayTopRow}>
              <View>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Today's net P&L</Text>
                <Text style={[styles.pnlValue, { color: todayActivity.dailyNetPnl < 0 ? colors.sell : todayActivity.dailyNetPnl > 0 ? colors.buy : colors.text }]}>{money(todayActivity.dailyNetPnl)}</Text>
              </View>
              <View style={styles.metricRight}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Trades today</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{todayActivity.tradesToday}<Text style={[styles.metricDenominator, { color: colors.textMuted }]}> / {profile.maxTradesPerDay}</Text></Text>
              </View>
            </View>
            <View style={styles.dailyRiskLine}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Daily loss used</Text>
              <Text style={[styles.dailyRiskText, { color: colors.text }]}>{money(dailyLossUsed)} / {money(maximumDailyLoss)}</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
              <View style={[styles.progressFill, { width: `${dailyProgress * 100}%`, backgroundColor: dailyProgress >= 1 ? colors.sell : colors.buy }]} />
            </View>
            <View style={styles.todayBottomRow}>
              <Text style={[styles.smallMetric, { color: colors.textSecondary }]}>Open risk <Text style={{ color: colors.text }}>{money(openRiskAmount)} · {openRiskPercent.toFixed(2)}%</Text></Text>
              <Text style={[styles.smallMetric, { color: colors.textSecondary }]}>Loss streak <Text style={{ color: colors.text }}>{todayActivity.consecutiveLosses} / {profile.maxConsecutiveLosses}</Text></Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Exposure</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Manually added positions, stored on this device.</Text>
            </View>
            <Text style={[styles.exposureTotal, { color: colors.buy }]}>{money(openRiskAmount)}</Text>
          </View>

          {todayActivity.openPositions.length ? (
            <View style={[styles.exposureCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              {todayActivity.openPositions.map((position, index) => (
                <View key={position.id} style={[styles.positionRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder }]}>
                  <View style={[styles.positionIcon, { backgroundColor: `${colors.buy}15` }]}><Feather name="trending-up" size={15} color={colors.buy} /></View>
                  <View style={styles.positionCopy}>
                    <Text style={[styles.positionPair, { color: colors.text }]}>{position.pair} · {position.direction}</Text>
                    <Text style={[styles.positionMeta, { color: colors.textSecondary }]}>Risk {money(position.riskAmount)} · {position.lotSize.toFixed(3)} lots</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setClosingPosition(position); setRealizedPnlInput(''); }} style={[styles.closePositionButton, { borderColor: colors.cardBorder }]}>
                    <Text style={[styles.closePositionText, { color: colors.textSecondary }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={[styles.openRiskFooter, { borderTopColor: colors.cardBorder }]}>
                <Text style={[styles.openRiskFooterLabel, { color: colors.textSecondary }]}>Maximum open risk</Text>
                <Text style={[styles.openRiskFooterValue, { color: openRiskAmount > maximumOpenRisk ? colors.sell : colors.text }]}>{money(openRiskAmount)} / {money(maximumOpenRisk)}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.emptyExposure, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="layers" size={18} color={colors.textMuted} />
              <Text style={[styles.emptyExposureText, { color: colors.textSecondary }]}>No open positions recorded.</Text>
            </View>
          )}

          <TouchableOpacity onPress={() => setCheckVisible(true)} style={[styles.checkTradeButton, { backgroundColor: colors.buy }]}>
            <Feather name="plus-circle" size={18} color={colors.primaryForeground} />
            <Text style={[styles.checkTradeText, { color: colors.primaryForeground }]}>Check New Trade</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => {
            if (shouldGuardFeatureRoute('/lot-size-calculator', isSubscribed)) {
              checkFeatureAccess('/lot-size-calculator');
              return;
            }
            router.push('/lot-size-calculator');
          }} style={[styles.linkButton, { borderColor: colors.cardBorder }]}>
            <Feather name="grid" size={15} color={colors.textSecondary} />
            <Text style={[styles.linkButtonText, { color: colors.textSecondary }]}>Open Lot Size Calculator</Text>
            <Feather name="arrow-right" size={14} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Risk Check compares your inputs with your own saved rules. It does not recommend whether to enter a trade. Estimates use a standard $10 pip value and may differ from broker contract values.</Text>
        </ScrollView>
      </View>

      <Modal visible={checkVisible} animationType="slide" transparent onRequestClose={() => setCheckVisible(false)}>
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.cardBorder, paddingBottom: insets.bottom + 15 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Risk Check</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Compare this plan with your rules</Text>
              </View>
              <TouchableOpacity onPress={() => setCheckVisible(false)} style={[styles.modalClose, { backgroundColor: colors.card }]} accessibilityLabel="Close risk check"><Feather name="x" size={18} color={colors.text} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Pair</Text>
              <View style={styles.pairPresets}>
                {PAIR_PRESETS.map((preset) => {
                  const selected = pair.replace('/', '').toUpperCase() === preset;
                  return <TouchableOpacity key={preset} onPress={() => setPair(preset)} style={[styles.pairPreset, { backgroundColor: selected ? colors.buy : colors.card, borderColor: selected ? colors.buy : colors.cardBorder }]}><Text style={[styles.pairPresetText, { color: selected ? colors.primaryForeground : colors.textSecondary }]}>{preset}</Text></TouchableOpacity>;
                })}
              </View>
              <View style={styles.directionRow}>
                {(['BUY', 'SELL'] as const).map((value) => {
                  const selected = direction === value;
                  const accent = value === 'BUY' ? colors.buy : colors.sell;
                  return <TouchableOpacity key={value} onPress={() => setDirection(value)} style={[styles.directionButton, { backgroundColor: selected ? `${accent}1A` : colors.card, borderColor: selected ? accent : colors.cardBorder }]}><Text style={[styles.directionText, { color: selected ? accent : colors.textSecondary }]}>{value}</Text></TouchableOpacity>;
                })}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 10 }]}>Risk for this trade</Text>
              <View style={styles.directionRow}>
                {[0.5, 1, 1.5, 2, 3, 5].map((value) => {
                  const selected = tradeRiskValue === value;
                  return (
                    <TouchableOpacity key={value} onPress={() => setTradeRiskPercent(String(value))} style={[styles.tradeRiskChip, { backgroundColor: selected ? colors.buy : colors.card, borderColor: selected ? colors.buy : colors.cardBorder }]}>
                      <Text style={[styles.pairPresetText, { color: selected ? colors.primaryForeground : colors.textSecondary }]}>{value}%</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.priceFields}>
                <TradeField label="Entry" value={entry} onChangeText={setEntry} colors={colors} />
                <TradeField label="Stop Loss" value={stopLoss} onChangeText={setStopLoss} colors={colors} />
                <TradeField label="Take Profit" value={takeProfit} onChangeText={setTakeProfit} colors={colors} />
              </View>

              {!trade.valid ? (
                <View style={[styles.invalidTrade, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}><Feather name="info" size={16} color={colors.textMuted} /><Text style={[styles.invalidTradeText, { color: colors.textSecondary }]}>{trade.error}</Text></View>
              ) : (
                <>
                  <View style={[styles.tradeSummary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.summaryEyebrow, { color: colors.buy }]}>RISK OVERVIEW</Text>
                    <View style={styles.summaryGrid}>
                      <SummaryMetric label="Maximum Risk" value={money(trade.riskAmount)} detail={`${trade.riskPercent.toFixed(1)}%`} colors={colors} emphasis />
                      <SummaryMetric label="Stop Distance" value={`${trade.stopLossPips.toFixed(1)} pips`} colors={colors} />
                      <SummaryMetric label="Recommended Size" value={`${trade.lotSize.toFixed(3)} lots`} colors={colors} />
                      <SummaryMetric label="Potential Profit" value={money(trade.potentialProfit)} colors={colors} />
                    </View>
                    <TradeScenarioVisual trade={trade} direction={direction} entry={entryValue} stopLoss={stopValue} takeProfit={targetValue} colors={colors} />
                    <View style={[styles.outcomeBox, { backgroundColor: colors.surface }]}>
                      <OutcomeLine label="Potential profit" value={money(trade.potentialProfit)} colors={colors} positive />
                      <View style={[styles.outcomeDivider, { backgroundColor: colors.cardBorder }]} />
                      <OutcomeLine label="Risk : Reward" value={`1 : ${trade.rewardRisk.toFixed(2)}`} colors={colors} />
                      <View style={[styles.outcomeDivider, { backgroundColor: colors.cardBorder }]} />
                      <OutcomeLine label="Maximum loss at stop" value={`-${money(trade.riskAmount)}`} colors={colors} negative />
                    </View>
                  </View>

                  <View style={[styles.ruleChecks, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.ruleTitleRow}><Feather name="cpu" size={15} color={colors.buy} /><Text style={[styles.ruleTitle, { color: colors.text }]}>Risk Check</Text></View>
                    {ruleChecks.map((check) => (
                      <View key={check.id} style={[styles.ruleRow, { borderTopColor: colors.cardBorder }]}>
                        <Feather name={check.passed ? 'check-circle' : 'alert-triangle'} size={16} color={check.passed ? colors.buy : colors.gold} />
                        <View style={styles.ruleCopy}><Text style={[styles.ruleName, { color: colors.text }]}>{check.title}</Text><Text style={[styles.ruleDetail, { color: colors.textSecondary }]}>{check.detail}</Text></View>
                      </View>
                    ))}
                    <View style={[styles.ruleResult, { backgroundColor: allChecksPass ? `${colors.buy}14` : `${colors.gold}14` }]}>
                      <Text style={[styles.ruleResultTitle, { color: allChecksPass ? colors.buy : colors.gold }]}>{allChecksPass ? 'Within your configured limits' : 'One or more configured limits are exceeded'}</Text>
                      <Text style={[styles.ruleResultDetail, { color: colors.textSecondary }]}>{allChecksPass ? `This plan risks ${trade.riskPercent.toFixed(1)}% against your configured ${profile.riskPercent.toFixed(1)}% per-trade limit.` : 'Review the highlighted comparisons against the rules you configured. This is a comparison, not a trade recommendation.'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => void addToExposure()} style={[styles.addExposureButton, { backgroundColor: colors.buy }]}>
                    <Feather name="plus" size={17} color={colors.primaryForeground} />
                    <Text style={[styles.addExposureText, { color: colors.primaryForeground }]}>Add to Current Exposure</Text>
                  </TouchableOpacity>
                  <Text style={[styles.modalFootnote, { color: colors.textMuted }]}>Only add this trade if you actually opened it. FXSnap does not connect to your broker.</Text>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={Boolean(closingPosition)} animationType="fade" transparent onRequestClose={() => setClosingPosition(null)}>
        <View style={styles.modalScrim}>
          <View style={[styles.closeSheet, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record trade result</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{closingPosition?.pair} · enter realized P&L in account currency</Text>
            <View style={[styles.closePnlInputWrap, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.currencyPrefix, { color: colors.textMuted }]}>$</Text>
              <TextInput value={realizedPnlInput} onChangeText={(value) => setRealizedPnlInput(value.replace(/[^0-9.-]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. -10 or 20" placeholderTextColor={colors.textMuted} style={[styles.closePnlInput, { color: colors.text }]} />
            </View>
            <View style={styles.closeActions}>
              <TouchableOpacity onPress={() => setClosingPosition(null)} style={[styles.cancelButton, { borderColor: colors.cardBorder }]}><Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => void finishPosition()} style={[styles.confirmCloseButton, { backgroundColor: colors.buy }]}><Text style={[styles.confirmCloseText, { color: colors.primaryForeground }]}>Close Position</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ProfileField({ label, unit, value, onChangeText, colors }: { label: string; unit: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.profileField}>
      <Text style={[styles.profileFieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.profileInputWrap, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <TextInput value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={[styles.profileInput, { color: colors.text }]} />
        <Text style={[styles.profileUnit, { color: colors.textMuted }]}>{unit}</Text>
      </View>
    </View>
  );
}

function TradeField({ label, value, onChangeText, colors }: { label: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.tradeField}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={[styles.tradeInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
    </View>
  );
}

function SummaryMetric({ label, value, detail, colors, emphasis }: { label: string; value: string; detail?: string; colors: ReturnType<typeof useColors>; emphasis?: boolean }) {
  return <View style={styles.summaryMetric}><Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.summaryMetricValue, { color: emphasis ? colors.buy : colors.text }]}>{value}</Text>{detail ? <Text style={[styles.summaryMetricDetail, { color: colors.textMuted }]}>{detail}</Text> : null}</View>;
}

function OutcomeLine({ label, value, colors, positive, negative }: { label: string; value: string; colors: ReturnType<typeof useColors>; positive?: boolean; negative?: boolean }) {
  return <View style={styles.outcomeLine}><Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.outcomeValue, { color: positive ? colors.buy : negative ? colors.sell : colors.text }]}>{value}</Text></View>;
}

function TradeScenarioVisual({ trade, direction, entry, stopLoss, takeProfit, colors }: { trade: ReturnType<typeof calculateTradeRisk>; direction: TradeDirection; entry: number; stopLoss: number; takeProfit: number; colors: ReturnType<typeof useColors> }) {
  const levels = direction === 'BUY'
    ? [
      { label: 'TAKE PROFIT', price: takeProfit, value: `+${money(trade.potentialProfit)}`, positive: true },
      { label: 'ENTRY', price: entry, value: direction, positive: false },
      { label: 'STOP LOSS', price: stopLoss, value: `-${money(trade.riskAmount)}`, positive: false },
    ]
    : [
      { label: 'STOP LOSS', price: stopLoss, value: `-${money(trade.riskAmount)}`, positive: false },
      { label: 'ENTRY', price: entry, value: direction, positive: false },
      { label: 'TAKE PROFIT', price: takeProfit, value: `+${money(trade.potentialProfit)}`, positive: true },
    ];
  return (
    <View style={[styles.scenarioBox, { backgroundColor: colors.surface }]}>
      <Text style={[styles.scenarioHeading, { color: colors.textMuted }]}>TRADE SCENARIO</Text>
      {levels.map((level, index) => (
        <View key={level.label} style={styles.scenarioLevel}>
          <View style={styles.scenarioLabelColumn}>
            <View style={[styles.scenarioDot, { backgroundColor: level.positive ? colors.buy : level.label === 'STOP LOSS' ? colors.sell : colors.textMuted }]} />
            <Text style={[styles.scenarioLabel, { color: level.positive ? colors.buy : level.label === 'STOP LOSS' ? colors.sell : colors.textSecondary }]}>{level.label}</Text>
          </View>
          <View style={[styles.scenarioRule, { backgroundColor: index === 1 ? colors.textMuted : colors.cardBorder }]} />
          <Text style={[styles.scenarioPrice, { color: colors.text }]}>{level.price.toFixed(level.price < 10 ? 5 : 3)}</Text>
          <Text style={[styles.scenarioValue, { color: level.positive ? colors.buy : level.label === 'STOP LOSS' ? colors.sell : colors.textMuted }]}>{level.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17 },
  iconButton: { width: 43, height: 43, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  subtitle: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  headerShield: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 17, paddingTop: 13 },
  sectionHeader: { marginTop: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sectionSubtitle: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  profileCard: { borderWidth: 1, borderRadius: 16, padding: 12 },
  profileGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileField: { width: '48%', gap: 5 },
  profileFieldLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  profileInputWrap: { height: 38, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 4 },
  profileInput: { flex: 1, paddingVertical: 4, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  profileUnit: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  saveProfileButton: { minHeight: 38, marginTop: 11, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveProfileText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  todayCard: { borderWidth: 1, borderRadius: 16, padding: 13 },
  todayTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  pnlValue: { marginTop: 4, fontSize: 22, fontFamily: 'Inter_700Bold' },
  metricRight: { alignItems: 'flex-end' },
  metricValue: { marginTop: 4, fontSize: 19, fontFamily: 'Inter_700Bold' },
  metricDenominator: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  dailyRiskLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  dailyRiskText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 6, borderRadius: 4, marginTop: 7, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  todayBottomRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  smallMetric: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  exposureTotal: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  exposureCard: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 11 },
  positionRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  positionIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  positionCopy: { flex: 1 },
  positionPair: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  positionMeta: { marginTop: 3, fontSize: 9, fontFamily: 'Inter_400Regular' },
  closePositionButton: { minHeight: 31, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  closePositionText: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  openRiskFooter: { minHeight: 37, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openRiskFooterLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  openRiskFooterValue: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  emptyExposure: { minHeight: 58, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyExposureText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  checkTradeButton: { minHeight: 47, marginTop: 16, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkTradeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  linkButton: { minHeight: 39, marginTop: 8, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkButtonText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  disclaimer: { marginTop: 10, fontSize: 9, lineHeight: 14, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '94%', borderTopWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 17 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, paddingBottom: 13 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  modalSubtitle: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  modalClose: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  modalContent: { paddingHorizontal: 17, paddingBottom: 13 },
  fieldLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  pairPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  pairPreset: { minHeight: 31, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  pairPresetText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  directionRow: { flexDirection: 'row', gap: 7, marginTop: 11 },
  directionButton: { flex: 1, minHeight: 35, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  directionText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  tradeRiskChip: { minWidth: 42, height: 31, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  priceFields: { flexDirection: 'row', gap: 7, marginTop: 11 },
  tradeField: { flex: 1, gap: 5 },
  tradeInput: { minHeight: 39, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  invalidTrade: { minHeight: 40, marginTop: 11, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  invalidTradeText: { flex: 1, fontSize: 10, fontFamily: 'Inter_400Regular' },
  tradeSummary: { marginTop: 11, borderWidth: 1, borderRadius: 14, padding: 11 },
  summaryEyebrow: { fontSize: 9, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  summaryGrid: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  summaryMetric: { width: '48%', minHeight: 42 },
  summaryMetricValue: { marginTop: 3, fontSize: 12, fontFamily: 'Inter_700Bold' },
  summaryMetricDetail: { marginTop: 2, fontSize: 9, fontFamily: 'Inter_400Regular' },
  scenarioBox: { marginTop: 7, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  scenarioHeading: { marginBottom: 3, fontSize: 8, letterSpacing: 0.55, fontFamily: 'Inter_700Bold' },
  scenarioLevel: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 6 },
  scenarioLabelColumn: { width: 77, flexDirection: 'row', alignItems: 'center', gap: 5 },
  scenarioDot: { width: 5, height: 5, borderRadius: 3 },
  scenarioLabel: { fontSize: 7, fontFamily: 'Inter_700Bold' },
  scenarioRule: { flex: 1, height: StyleSheet.hairlineWidth },
  scenarioPrice: { width: 57, textAlign: 'right', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  scenarioValue: { width: 63, textAlign: 'right', fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  outcomeBox: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
  outcomeLine: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  outcomeLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  outcomeValue: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  outcomeDivider: { height: StyleSheet.hairlineWidth },
  ruleChecks: { marginTop: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingTop: 10 },
  ruleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 5 },
  ruleTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  ruleRow: { minHeight: 39, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleCopy: { flex: 1 },
  ruleName: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  ruleDetail: { marginTop: 2, fontSize: 8, fontFamily: 'Inter_400Regular' },
  ruleResult: { borderRadius: 9, padding: 8, marginTop: 5, marginBottom: 9 },
  ruleResultTitle: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  ruleResultDetail: { marginTop: 3, fontSize: 8, lineHeight: 12, fontFamily: 'Inter_400Regular' },
  addExposureButton: { minHeight: 41, marginTop: 9, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addExposureText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  modalFootnote: { marginTop: 7, fontSize: 8, lineHeight: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  closeSheet: { borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  closePnlInputWrap: { minHeight: 48, marginTop: 15, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  currencyPrefix: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  closePnlInput: { flex: 1, paddingHorizontal: 8, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  closeActions: { flexDirection: 'row', gap: 8, marginTop: 15 },
  cancelButton: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  confirmCloseButton: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  confirmCloseText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});