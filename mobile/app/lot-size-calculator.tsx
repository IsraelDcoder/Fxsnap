import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { calculateLotSize } from '@/services/risk';

const RISK_OPTIONS = [0.5, 1, 1.5, 2, 3, 5];

export default function LotSizeCalculatorScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { settings, updateSettings } = useApp();
  const [balance, setBalance] = useState(String(settings.accountBalance));
  const [risk, setRisk] = useState(String(settings.riskPercent));
  const [stopLoss, setStopLoss] = useState('20');

  const balanceValue = Number.parseFloat(balance);
  const riskValue = Number.parseFloat(risk);
  const stopLossValue = Number.parseFloat(stopLoss);
  const valid = Number.isFinite(balanceValue) && balanceValue > 0
    && Number.isFinite(riskValue) && riskValue > 0 && riskValue <= 10
    && Number.isFinite(stopLossValue) && stopLossValue > 0;
  const { riskAmount, lotSize: rawLot } = valid ? calculateLotSize(balanceValue, riskValue, stopLossValue) : { riskAmount: 0, lotSize: 0 };
  const lotSize = valid ? rawLot.toFixed(3) : '—';

  const saveInputs = async () => {
    if (!valid) {
      Alert.alert('Check your inputs', 'Enter a positive account size, risk percentage up to 10%, and stop-loss distance.');
      return;
    }
    await updateSettings({ accountBalance: balanceValue, balanceSet: true, riskPercent: riskValue });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', 'Account size and risk preference are saved for future FXSnap calculations.');
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Back">
            <Feather name="arrow-left" size={21} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Lot Size Calculator</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Estimate position size from your risk</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Field label="Account size" unit="USD" value={balance} onChangeText={setBalance} colors={colors} />
            <Text style={[styles.label, { color: colors.textSecondary }]}>Risk per trade</Text>
            <View style={styles.riskOptions}>
              {RISK_OPTIONS.map((value) => {
                const selected = riskValue === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setRisk(String(value))}
                    style={[styles.riskOption, { backgroundColor: selected ? colors.buy : colors.surface, borderColor: selected ? colors.buy : colors.cardBorder }]}
                  >
                    <Text style={[styles.riskOptionText, { color: selected ? colors.primaryForeground : colors.textSecondary }]}>{value}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Field label="Stop-loss distance" unit="pips" value={stopLoss} onChangeText={setStopLoss} colors={colors} />
          </View>

          <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: `${colors.buy}55` }]}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Estimated position size</Text>
                <Text style={[styles.resultValue, { color: colors.buy }]}>{lotSize}<Text style={[styles.lotUnit, { color: colors.textSecondary }]}> lots</Text></Text>
              </View>
              <View style={[styles.resultIcon, { backgroundColor: `${colors.buy}18` }]}><Feather name="bar-chart-2" size={21} color={colors.buy} /></View>
            </View>
            <View style={[styles.resultDivider, { backgroundColor: colors.cardBorder }]} />
            <View style={styles.resultFoot}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Risk amount</Text>
              <Text style={[styles.riskAmount, { color: colors.text }]}>{valid ? `$${riskAmount.toFixed(2)}` : '—'}</Text>
            </View>
          </View>

          <Text style={[styles.note, { color: colors.textMuted }]}>Forex estimate based on a $10 pip value per standard lot. Quote-currency conversion and broker contract rules can change the actual position size.</Text>

          <TouchableOpacity onPress={() => void saveInputs()} style={[styles.saveButton, { backgroundColor: colors.buy }]}>
            <Feather name="save" size={17} color={colors.primaryForeground} />
            <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>Save account and risk inputs</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, unit, value, onChangeText, colors }: { label: string; unit: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <TextInput value={value} onChangeText={(text) => onChangeText(text.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={[styles.input, { color: colors.text }]} placeholderTextColor={colors.textMuted} />
        <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  subtitle: { marginTop: 3, fontSize: 11, fontFamily: 'Inter_400Regular' },
  content: { paddingHorizontal: 18, paddingTop: 22 },
  formCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  inputRow: { height: 50, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  input: { flex: 1, fontSize: 16, fontFamily: 'Inter_500Medium', paddingVertical: 8 },
  unit: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  riskOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riskOption: { minWidth: 48, height: 38, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  riskOptionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  resultCard: { marginTop: 14, borderWidth: 1, borderRadius: 18, padding: 18 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  resultValue: { marginTop: 7, fontSize: 34, fontFamily: 'Inter_700Bold' },
  lotUnit: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  resultIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resultDivider: { height: StyleSheet.hairlineWidth, marginVertical: 15 },
  resultFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  riskAmount: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  note: { marginTop: 13, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  saveButton: { minHeight: 48, marginTop: 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});