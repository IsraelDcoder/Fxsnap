import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { trackEvent } from '@/services/telemetry';
import { isCompleteSetup } from '@/services/analysisResult';

function ValueRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.valueRow, { borderBottomColor: colors.cardBorder }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text selectable style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function AnalysisResultScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { currentAnalysis, saveAnalysis, savedAnalyses } = useApp();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const setup = currentAnalysis?.setup;
  const isComplete = currentAnalysis?.status === 'success' && isCompleteSetup(setup);
  const alreadySaved = savedAnalyses.some((item) => item.id === currentAnalysis?.id);
  const riskWidth: `${number}%` = setup ? `${100 / (1 + setup.risk_reward)}%` : '40%';
  const rewardWidth: `${number}%` = setup ? `${100 - (100 / (1 + setup.risk_reward))}%` : '60%';

  useEffect(() => {
    if (!currentAnalysis) return;
    trackEvent('result_viewed', {
      pair: currentAnalysis.pair,
      timeframe: currentAnalysis.timeframe || 'unknown',
      direction: currentAnalysis.direction || 'NONE',
    });
  }, [currentAnalysis?.id]);

  const handleSave = async () => {
    if (!currentAnalysis || !isComplete || alreadySaved || saving) return;
    setSaving(true);
    try {
      await saveAnalysis(currentAnalysis);
    } catch (error) {
      console.error('[Analysis] Could not save validated setup', error);
      Alert.alert('Unable to save', 'Your analysis could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!setup || !isComplete || sharing) return;
    setSharing(true);
    try {
      await Share.share({
        title: `${setup.pair} ${setup.timeframe} analysis`,
        message: `${JSON.stringify(setup, null, 2)}\n\nAI analysis, not financial advice.`,
      });
    } catch (error) {
      console.error('[Analysis] Could not share validated setup', error);
      Alert.alert('Unable to share', 'Your analysis could not be shared. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const pageTop = Math.max(insets.top, 16);
  const failed = currentAnalysis?.status !== 'success';

  return (
    <View style={[styles.container, { paddingTop: pageTop, backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => router.replace('/home')}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chart analysis</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
        {!currentAnalysis ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.title, { color: colors.text }]}>No analysis to display</Text>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.replace('/analysis')}>
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Start analysis</Text>
            </TouchableOpacity>
          </View>
        ) : failed ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {currentAnalysis.status === 'not_a_chart' ? 'This image is not a price chart' : 'Analysis could not be completed'}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {currentAnalysis.message || "Couldn't generate a valid setup, try again"}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={() => router.replace(currentAnalysis.status === 'not_a_chart'
                ? '/analysis'
                : { pathname: '/analysis', params: { retry: '1' } })}
            >
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : isComplete && setup ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.titleRow}>
                <View style={styles.titleCopy}>
                  <Text style={[styles.title, { color: colors.text }]}>{setup.pair}</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{setup.timeframe}</Text>
                </View>
                <Text style={[styles.direction, { color: setup.direction === 'BUY' ? colors.buy : colors.sell }]}>{setup.direction}</Text>
              </View>
              <View style={styles.badges}>
                {setup.levels_estimated ? <Text style={[styles.badge, { color: colors.text, borderColor: colors.cardBorder }]}>Estimated levels</Text> : null}
                {setup.confidence < 50 ? <Text style={[styles.badge, { color: colors.text, borderColor: colors.cardBorder }]}>Low confidence</Text> : null}
              </View>
              <ValueRow label="Entry" value={String(setup.entry)} />
              <ValueRow label="Stop loss" value={String(setup.stop_loss)} />
              <ValueRow label="Take profit 1" value={String(setup.take_profit_1)} />
              {setup.take_profit_2 !== undefined ? <ValueRow label="Take profit 2" value={String(setup.take_profit_2)} /> : null}
              <ValueRow label="Risk/reward" value={String(setup.risk_reward)} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Risk/reward</Text>
              <View style={[styles.rrBar, { backgroundColor: colors.surface }]}>
                <View style={{ width: riskWidth, backgroundColor: colors.sell }} />
                <View style={{ width: rewardWidth, backgroundColor: colors.buy }} />
              </View>
              <View style={styles.rrLegend}>
                <Text style={[styles.body, { color: colors.textSecondary }]}>Risk 1R</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>Reward {setup.risk_reward}R</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Support & resistance</Text>
              <ValueRow label="Support" value={setup.support.join(', ')} />
              <ValueRow label="Resistance" value={setup.resistance.join(', ')} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Market read</Text>
              <ValueRow label="Trend" value={setup.trend} />
              <ValueRow label="Structure" value={setup.structure} />
              <ValueRow label="Rightmost candle" value={`${setup.rightmost_candle.type} — ${setup.rightmost_candle.bias}`} />
              <ValueRow label="Next candle prediction" value={setup.next_candle_prediction} />
              <ValueRow label="Confidence" value={`${setup.confidence}%`} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Reasoning</Text>
              {setup.reasoning.map((line, index) => (
                <Text key={`${index}-${line}`} style={[styles.body, styles.reasoning, { color: colors.textSecondary }]}>{line}</Text>
              ))}
              <Text style={[styles.sectionTitle, styles.invalidationTitle, { color: colors.text }]}>Invalidation</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{setup.invalidation}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.title, { color: colors.text }]}>Couldn't generate a valid setup, try again</Text>
          </View>
        )}

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>AI analysis, not financial advice.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !isComplete || alreadySaved ? 0.5 : 1 }]}
          onPress={() => void handleSave()}
          disabled={!isComplete || alreadySaved || saving}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{alreadySaved ? 'Saved' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.cardBorder, opacity: !isComplete ? 0.5 : 1 }]}
          onPress={() => void handleShare()}
          disabled={!isComplete || sharing}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>{sharing ? 'Sharing…' : 'Share'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  content: { padding: 16, gap: 12 },
  card: { padding: 16, borderWidth: 1, borderRadius: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleCopy: { gap: 4 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  direction: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  value: { flex: 1.5, textAlign: 'right', fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { marginTop: 4, marginBottom: 8, fontSize: 15, fontFamily: 'Inter_700Bold' },
  rrBar: { height: 10, flexDirection: 'row', overflow: 'hidden', borderRadius: 5 },
  rrLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  reasoning: { marginTop: 8 },
  invalidationTitle: { marginTop: 16 },
  disclaimer: { marginTop: 2, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  primaryButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16 },
  secondaryButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
