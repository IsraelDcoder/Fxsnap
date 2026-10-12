import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { PairSelectionModal } from '@/components/PairSelectionModal';
import { useColors } from '@/hooks/useColors';
import { analyzeChartImage, analyzeMultiTimeframeCharts, type ChartAnalysisResult, type MultiTimeframeChartImage } from '../services/chartDetection';
import { trackEvent } from '@/services/telemetry';
import { recordRatingEligibleAnalysis } from '@/services/ratingPrompt';
import { clearAnalysisRetryRequest, getAnalysisRetryRequest, storeAnalysisRetryRequest } from '@/services/analysisRetry';
import { buildAnalysisResult } from '@/services/analysisResult';

type Stage = 'pick' | 'preview' | 'analyzing' | 'ready';
type AnalysisMode = 'quick' | 'multiTimeframe';
type TimeframeChart = MultiTimeframeChartImage & { uri: string };

const ANALYSIS_STEPS = [
  { title: 'Cooking your analysis', detail: 'Reading the newest visible candles and current price action.' },
  { title: 'Mapping the market structure', detail: 'Checking nearby support, resistance, and momentum.' },
  { title: 'Checking setup quality and risk', detail: 'Looking for a high-probability setup without forcing a trade.' },
];

function AnalyzingView({ ready = false }: { ready?: boolean }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (ready || reduceMotion) return;
    const interval = setInterval(() => {
      setActiveStep((current) => (current + 1) % ANALYSIS_STEPS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [ready, reduceMotion]);

  const step = ANALYSIS_STEPS[activeStep];

  return (
    <View style={[styles.analyzingContainer, { paddingTop: insets.top + 20, backgroundColor: colors.background }]}>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} style={[styles.analyzingIcon, { backgroundColor: colors.card, borderColor: colors.buy }]}>
        <Feather name={ready ? 'check' : 'activity'} size={36} color={colors.buy} />
      </Animated.View>

      <Text style={[styles.analyzingTitle, { color: colors.text }]}>
        {ready ? 'Your analysis is ready' : 'Analyzing your chart'}
      </Text>
      <Text style={[styles.analysisSubtext, { color: colors.textSecondary }]}>
        {ready
          ? 'Opening your analysis outcome…'
          : 'We’re reviewing the chart so your result is based on the price action you shared.'}
      </Text>

      <View style={[styles.analysisProgressCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.analysisProgressHeading}>
          {ready
            ? <Feather name="check-circle" size={19} color={colors.buy} />
            : <ActivityIndicator size="small" color={colors.buy} />}
          <Animated.Text
            key={ready ? 'ready' : activeStep}
            entering={reduceMotion ? undefined : FadeIn.duration(250)}
            style={[styles.analysisProgressTitle, { color: colors.text }]}
          >
            {ready ? 'Review complete' : step.title}
          </Animated.Text>
        </View>
        <Text style={[styles.analysisProgressDetail, { color: colors.textSecondary }]}>
          {ready ? 'Your result is ready to view.' : step.detail}
        </Text>
        {!ready && (
          <View style={styles.analysisStepDots} accessibilityLabel={`Analysis step ${activeStep + 1} of ${ANALYSIS_STEPS.length}`}>
            {ANALYSIS_STEPS.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.analysisStepDot,
                  { backgroundColor: index === activeStep ? colors.buy : colors.border },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { retry } = useLocalSearchParams<{ retry?: string }>();
  const retryRequest = retry === '1' ? getAnalysisRetryRequest() : null;
  const { setCurrentAnalysis, isSubscribed, isLoading, billingAvailable, checkFeatureAccess, consumeAnalysisAccessGrant } = useApp();
  const [accessVerified, setAccessVerified] = useState(false);
  const [stage, setStage] = useState<Stage>(retryRequest ? 'preview' : 'pick');
  const [mode, setMode] = useState<AnalysisMode>('quick');
  const [imageUri, setImageUri] = useState<string | null>(retryRequest?.imageUri ?? null);
  const [imageBase64, setImageBase64] = useState<string | null>(retryRequest?.imageBase64 ?? null);
  const [imageMimeType, setImageMimeType] = useState(retryRequest?.imageMimeType ?? 'image/jpeg');
  const [selectedPair, setSelectedPair] = useState<string | null>(retryRequest?.pair ?? null);
  const [retryingExistingChart, setRetryingExistingChart] = useState(Boolean(retryRequest));
  const [timeframeCharts, setTimeframeCharts] = useState<{ h4: TimeframeChart | null; m15: TimeframeChart | null }>({ h4: null, m15: null });
  const [showPairModal, setShowPairModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const checkAccessBeforeAnalysis = async (feature: 'AI_ANALYSIS' | 'TRADE_SETUP' = 'AI_ANALYSIS'): Promise<boolean> => {
    if (isLoading) return false;
    const decision = await checkFeatureAccess(feature, '/analysis');
    if (decision.error) {
      setAnalysisError(decision.error);
      Alert.alert('Unable to start analysis', decision.error);
    }
    return decision.allowed;
  };

  useFocusEffect(
    React.useCallback(() => {
      if (isLoading) return;
      if (consumeAnalysisAccessGrant()) {
        setAccessVerified(true);
        return;
      }
      let active = true;
      setAccessVerified(false);
      void checkFeatureAccess('AI_ANALYSIS', '/analysis').then((decision) => {
        if (!active) return;
        if (decision.error) {
          setAccessVerified(true);
          return;
        }
        if (decision.allowed) setAccessVerified(true);
      }).catch((error: unknown) => {
        if (!active) return;
        console.warn('[ACCESS] Analysis route check failed; the analysis API will enforce free-analysis limits.', error);
        setAccessVerified(true);
      });
      return () => {
        active = false;
      };
    }, [checkFeatureAccess, consumeAnalysisAccessGrant, isLoading])
  );

  if (!accessVerified) return null;

  const pickFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'web') {
      // Use the platform photo picker where possible (Android 13+). Do not request
      // broad READ_MEDIA_* permissions; the system picker provides files without
      // requiring storage permissions and complies with Play policy.
    }
    // On Android 13+ the system photo picker is available; ensure we use the
    // non-legacy picker so broad storage permissions aren't required.
    const useLegacy = Platform.OS === 'android' && (Platform.Version as any) < 33;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      base64: true,
      // `legacy: false` uses the platform photo picker (when available) instead
      // of legacy storage access which may require READ_* permissions.
      legacy: useLegacy,
    });
    if (!result.canceled && result.assets[0]) {
      clearAnalysisRetryRequest();
      setRetryingExistingChart(false);
      setSelectedPair(null);
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
      setImageMimeType(result.assets[0].mimeType || 'image/jpeg');
      setStage('preview');
    }
  };

  const pickFromCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow camera access.');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      clearAnalysisRetryRequest();
      setRetryingExistingChart(false);
      setSelectedPair(null);
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
      setImageMimeType(result.assets[0].mimeType || 'image/jpeg');
      setStage('preview');
    }
  };

  const pickTimeframeChart = async (timeframe: 'h4' | 'm15') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      base64: true,
      legacy: Platform.OS === 'android' && (Platform.Version as any) < 33,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const imageBase64 = asset.base64 || '';
    if (imageBase64.length < 100 || imageBase64.length > 5_400_000) {
      setAnalysisError('Choose a smaller chart image (under about 4 MB) so both timeframes can be analyzed together.');
      return;
    }
    setTimeframeCharts((current) => ({
      ...current,
      [timeframe]: { uri: asset.uri, imageBase64, mimeType: asset.mimeType || 'image/jpeg' },
    }));
    setAnalysisError(null);
  };

  const startMultiTimeframeMode = async () => {
    if (!(await checkAccessBeforeAnalysis('TRADE_SETUP'))) return;
    setMode('multiTimeframe');
    setStage('pick');
    setSelectedPair(null);
    setTimeframeCharts({ h4: null, m15: null });
    setAnalysisError(null);
    setShowPairModal(false);
  };

  const startQuickMode = () => {
    setRetryingExistingChart(false);
    setSelectedPair(null);
    setMode('quick');
    setStage('pick');
    setShowPairModal(false);
    setAnalysisError(null);
  };

  const handleImageSelected = async () => {
    if (isLoading) return;
    trackEvent('analysis_started');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!imageUri) return;

    console.log('[Analysis] Preparing chart for AI analysis...');
    if (!imageBase64) {
      setAnalysisError('Unable to read the image for AI analysis. Please choose the chart again.');
      return;
    }

    if (retryingExistingChart && selectedPair) {
      await handlePairSelected(selectedPair);
      return;
    }
    setShowPairModal(true);
    setAnalysisError(null);
  };

  const finishAnalysis = async (chart: ChartAnalysisResult, pair: string, sourceImageUri: string, analysisStartedAt: number) => {
    const returnToInput = () => setStage(mode === 'quick' ? 'preview' : 'pick');
    console.log('[ANALYSIS] API response received', {
      status: chart.status,
      pair,
      message: chart.message,
      elapsedMs: Date.now() - analysisStartedAt,
      isSubscribed,
    });

    if (chart.status === 'premium_required') {
      setAnalysisError(chart.message || 'A Premium subscription is required for chart analysis.');
      returnToInput();
      router.replace({ pathname: '/paywall', params: { source: 'analysis-limit', used: '1', limit: '1' } });
      return;
    }

    const remainingMinimumTime = Math.max(0, 2500 - (Date.now() - analysisStartedAt));
    await new Promise((resolve) => setTimeout(resolve, remainingMinimumTime));

    if (chart.status === 'ai_unavailable' || chart.status === 'ai_invalid_response') {
      trackEvent('analysis_ai_unavailable', { pair });
    }

    if (chart.status === 'invalid_image') {
      trackEvent('analysis_invalid_image', { pair });
    }

    const result = buildAnalysisResult(chart, pair, sourceImageUri);
    if (chart.status === 'success' || chart.status === 'no_trade') {
      clearAnalysisRetryRequest();
      setRetryingExistingChart(false);
    }
    setCurrentAnalysis(result);
    if (chart.status === 'success' || chart.status === 'no_trade') {
      trackEvent('analysis_succeeded', { pair, status: chart.status, confidence: chart.confidence });
      await recordRatingEligibleAnalysis();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setStage('ready');
    await new Promise((resolve) => setTimeout(resolve, 900));
    router.replace('/analysis-result');
  };

  const handlePairSelected = async (pair: string) => {
    if (isLoading) return;
    const requiredFeature = mode === 'multiTimeframe' ? 'TRADE_SETUP' : 'AI_ANALYSIS';
    if (!(await checkAccessBeforeAnalysis(requiredFeature))) return;
    if (mode === 'quick' && (!imageBase64 || !imageUri)) return;
    const sourceImageUri = imageUri ?? '';
    if (mode === 'multiTimeframe' && selectedPair && selectedPair !== pair) {
      setTimeframeCharts({ h4: null, m15: null });
    }
    setSelectedPair(pair);
    setShowPairModal(false);
    if (mode === 'multiTimeframe') return;
    if (imageBase64 && imageUri) {
      storeAnalysisRetryRequest({
        imageBase64,
        imageMimeType,
        imageUri,
        pair,
      });
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage('analyzing');
    setAnalysisError(null);
    const analysisStartedAt = Date.now();

    console.log('[ANALYSIS] User started analysis', {
      pair,
      isSubscribed,
      billingAvailable,
      imagePresent: Boolean(imageBase64),
      mimeType: imageMimeType,
      timestamp: new Date().toISOString(),
    });

    if (!imageBase64) {
      console.error('[ANALYSIS ERROR] stage=prepare error=Missing chart image payload');
      setAnalysisError('Chart image data is unavailable. Please upload it again.');
      setStage('preview');
      return;
    }

    try {
      console.log('[ANALYSIS] Preparing request');
      const chart = await analyzeChartImage(imageBase64, imageMimeType, pair, isSubscribed);
      await finishAnalysis(chart, pair, sourceImageUri, analysisStartedAt);
      console.log('[ANALYSIS] Result received', {
        pair,
        status: chart.status,
        confidence: chart.confidence,
        renderStage: 'analysis-result',
      });
    } catch (error) {
      console.error('[ANALYSIS ERROR] stage=request error=', error);
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
      Alert.alert('Analysis failed', 'We couldn\'t complete your analysis. Please try again.');
      setStage('preview');
    }
  };

  const handleMultiTimeframeAnalysis = async () => {
    if (!selectedPair || !timeframeCharts.h4 || !timeframeCharts.m15 || isLoading) return;
    if (!(await checkAccessBeforeAnalysis('TRADE_SETUP'))) return;
    setStage('analyzing');
    setAnalysisError(null);
    trackEvent('analysis_started', { mode: 'multi_timeframe' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const analysisStartedAt = Date.now();
    try {
      const chart = await analyzeMultiTimeframeCharts(
        { imageBase64: timeframeCharts.h4.imageBase64, mimeType: timeframeCharts.h4.mimeType },
        { imageBase64: timeframeCharts.m15.imageBase64, mimeType: timeframeCharts.m15.mimeType },
        selectedPair,
        isSubscribed,
      );
      await finishAnalysis(chart, selectedPair, timeframeCharts.h4.uri, analysisStartedAt);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
      Alert.alert('Analysis failed', 'We couldn\'t complete your analysis. Please try again.');
      setStage('pick');
    }
  };



  const NoticeBanner = () => (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(400)} style={[styles.balanceBanner, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
      <Feather name="bar-chart-2" size={16} color="#FFD60A" />
      <Text style={[styles.balanceBannerText, { color: colors.text }]}>📊 For best results, upload a clear chart image showing price action, timeframe, and visible levels.{"\n"}Blurry, cropped, or cluttered charts may lead to inaccurate analysis.</Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      {stage !== 'analyzing' && stage !== 'ready' && (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} style={styles.header}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.replace('/home')}>
                  <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Chart Analysis</Text>
          <View style={{ width: 44 }} />
        </Animated.View>
      )}

      {stage === 'pick' && (
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(100).duration(500)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
          <View style={[styles.modeSwitcher, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'quick' }} onPress={startQuickMode} style={[styles.modeButton, mode === 'quick' && { backgroundColor: colors.card }]}>
              <Text style={[styles.modeButtonText, { color: mode === 'quick' ? colors.text : colors.textMuted }]}>Quick Analysis</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'multiTimeframe' }} onPress={startMultiTimeframeMode} style={[styles.modeButton, mode === 'multiTimeframe' && { backgroundColor: colors.card }]}>
              <Text style={[styles.modeButtonText, { color: mode === 'multiTimeframe' ? colors.text : colors.textMuted }]}>Multi-Timeframe</Text>
            </TouchableOpacity>
          </View>

          {mode === 'quick' ? (
            <>
              <View style={styles.uploadHero}>
                <View style={[styles.uploadIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Feather name="image" size={48} color={colors.textMuted} />
                </View>
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Quick Analysis</Text>
                <Text style={[styles.uploadSubtext, { color: colors.textSecondary }]}>Upload one chart for a fast setup read.</Text>
              </View>

              <View style={styles.pickActions}>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromCamera}>
                  <View style={[styles.pickBtnIcon, { backgroundColor: colors.surface }]}><Feather name="camera" size={28} color={colors.text} /></View>
                  <Text style={[styles.pickBtnLabel, { color: colors.text }]}>Camera</Text>
                  <Text style={[styles.pickBtnSub, { color: colors.textSecondary }]}>Take a photo now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromGallery}>
                  <View style={[styles.pickBtnIcon, { backgroundColor: colors.surface }]}><Feather name="image" size={28} color={colors.text} /></View>
                  <Text style={[styles.pickBtnLabel, { color: colors.text }]}>Gallery</Text>
                  <Text style={[styles.pickBtnSub, { color: colors.textSecondary }]}>Choose existing chart</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.analysisDisclaimer, { color: colors.textMuted }]}>The AI analyzes only the uploaded chart image. This app does not provide financial advice. Trade at your own risk.</Text>
            </>
          ) : (
            <View style={styles.multiWorkflow}>
              <View style={styles.multiIntro}>
                <Text style={[styles.multiTitle, { color: colors.text }]}>Multi-Timeframe Analysis</Text>
                <Text style={[styles.uploadSubtext, { color: colors.textSecondary }]}>Analyze your setup with 4H structure and 15M entry confirmation.</Text>
              </View>

              <TouchableOpacity style={[styles.pairSelector, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => setShowPairModal(true)}>
                <View>
                  <Text style={[styles.pairSelectorLabel, { color: colors.textMuted }]}>SELECT PAIR</Text>
                  <Text style={[styles.pairSelectorValue, { color: selectedPair ? colors.text : colors.textSecondary }]}>{selectedPair || 'Choose an instrument'}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              <ScrollView style={styles.multiUploadList} contentContainerStyle={styles.multiUploadContent} showsVerticalScrollIndicator={false}>
                {(['h4', 'm15'] as const).map((timeframe) => {
                  const chart = timeframeCharts[timeframe];
                  const label = timeframe === 'h4' ? '4H' : '15M';
                  return (
                    <TouchableOpacity
                      key={timeframe}
                      accessibilityRole="button"
                      accessibilityLabel={`${chart ? 'Replace' : 'Upload'} ${label} chart`}
                      onPress={() => void pickTimeframeChart(timeframe)}
                      style={[styles.timeframeCard, { backgroundColor: colors.card, borderColor: chart ? colors.buy : colors.cardBorder }]}
                    >
                      <View style={styles.timeframeCardTop}>
                        <View style={[styles.timeframeBadge, { backgroundColor: colors.surface }]}><Text style={[styles.timeframeBadgeText, { color: colors.text }]}>{label}</Text></View>
                        {chart ? <Image source={{ uri: chart.uri }} style={styles.timeframePreview} resizeMode="cover" /> : <Feather name="camera" size={19} color={colors.textSecondary} />}
                      </View>
                      <Text style={[styles.timeframeCardTitle, { color: colors.text }]}>{chart ? `${label} chart added` : `Upload ${label} chart`}</Text>
                      <Text style={[styles.timeframeCardSubtitle, { color: colors.textSecondary }]}>{chart ? 'Tap to replace image' : timeframe === 'h4' ? 'Higher-timeframe trend and structure' : 'Entry setup and confirmation'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={!selectedPair || !timeframeCharts.h4 || !timeframeCharts.m15}
                onPress={() => void handleMultiTimeframeAnalysis()}
                style={[styles.analyzeBtn, { backgroundColor: colors.primary, opacity: selectedPair && timeframeCharts.h4 && timeframeCharts.m15 ? 1 : 0.45 }]}
              >
                <Feather name="zap" size={18} color={colors.primaryForeground} />
                <Text style={[styles.analyzeBtnText, { color: colors.primaryForeground }]}>Analyze Setup</Text>
              </TouchableOpacity>
              {analysisError ? <Text style={styles.errorText}>{analysisError}</Text> : null}
            </View>
          )}
        </Animated.View>
      )}

      {stage === 'preview' && imageUri && (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(400)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
          <NoticeBanner />
          <View style={[styles.previewContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity style={[styles.changeBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => setStage('pick')}>
                      <Feather name="refresh-cw" size={16} color={colors.textSecondary} />
              <Text style={[styles.changeBtnText, { color: colors.textSecondary }]}>Change Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.analyzeBtn, { backgroundColor: colors.primary }]} onPress={handleImageSelected}>
              <Feather name="zap" size={18} color={colors.primaryForeground} />
              <Text style={[styles.analyzeBtnText, { color: colors.primaryForeground }]}>{retryingExistingChart ? 'Retry Analysis' : 'Analyse Chart'}</Text>
            </TouchableOpacity>
          </View>
          {analysisError && (
            <Text style={styles.errorText}>{analysisError}</Text>
          )}
        </Animated.View>
      )}

      {(stage === 'analyzing' || stage === 'ready') && <AnalyzingView ready={stage === 'ready'} />}

      <PairSelectionModal
        visible={showPairModal}
        onSelectPair={handlePairSelected}
        onCancel={() => setShowPairModal(false)}
      />
    </View>
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
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 20 },
  modeSwitcher: { flexDirection: 'row', minHeight: 46, padding: 4, borderWidth: 1, borderRadius: 11, gap: 4 },
  modeButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  multiWorkflow: { flex: 1, minHeight: 0, gap: 12 },
  multiIntro: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  multiTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  pairSelector: { minHeight: 58, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pairSelectorLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  pairSelectorValue: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  multiUploadList: { flex: 1, minHeight: 0 },
  multiUploadContent: { gap: 10, paddingBottom: 2 },
  timeframeCard: { minHeight: 126, borderWidth: 1, borderRadius: 11, padding: 14, justifyContent: 'center', gap: 9 },
  timeframeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeframeBadge: { minWidth: 46, height: 28, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  timeframeBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  timeframePreview: { width: 64, height: 44, borderRadius: 6 },
  timeframeCardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  timeframeCardSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1600',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3D3400',
  },
  balanceBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#C7C7CC',
    lineHeight: 19,
  },
  uploadHero: { alignItems: 'center', gap: 16, paddingVertical: 28 },
  uploadIcon: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  uploadSubtext: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  pickActions: { flexDirection: 'row', gap: 14 },
  pickBtn: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pickBtnIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBtnLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  pickBtnSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' },
  analysisDisclaimer: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#48484A', textAlign: 'center' },
  errorText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#FF5252', textAlign: 'center', marginTop: 12 },
  previewContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 300,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  previewImage: { width: '100%', height: '100%' },
  previewActions: { gap: 12 },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  changeBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  analyzeBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#000' },
  // ── Analyzing stage ──
  analyzingContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  analyzingTitle: {
    fontSize: 25,
    fontFamily: 'Inter_700Bold',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  analysisSubtext: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 21,
    maxWidth: 320,
  },
  analysisProgressCard: {
    width: '100%',
    maxWidth: 380,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  analysisProgressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 24,
  },
  analysisProgressTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  analysisProgressDetail: {
    marginTop: 9,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  analysisStepDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
  },
  analysisStepDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
});
