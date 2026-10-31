import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import Animated, {
  FadeIn,
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
  const { height: viewportHeight } = useWindowDimensions();
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
  const [activeTimeframe, setActiveTimeframe] = useState<'h4' | 'm15'>('m15');
  const [showPairModal, setShowPairModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 40 : insets.top;
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
          router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
          return;
        }
        if (decision.allowed) setAccessVerified(true);
      }).catch((error: unknown) => {
        if (!active) return;
        console.warn('[ACCESS] Subscription check failed; analysis requests remain blocked until access is verified.', error);
        router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
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

  const pickTimeframeCamera = async (timeframe: 'h4' | 'm15') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access.');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.85,
      base64: true,
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

  const openTimeframePicker = async (timeframe: 'h4' | 'm15') => {
    if (mode !== 'multiTimeframe') {
      if (!(await checkAccessBeforeAnalysis('TRADE_SETUP'))) return;
      setMode('multiTimeframe');
      setStage('pick');
      setSelectedPair(null);
      setTimeframeCharts({ h4: null, m15: null });
    }
    setActiveTimeframe(timeframe);
    await pickTimeframeChart(timeframe);
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
      router.replace({ pathname: '/paywall', params: { source: 'subscription-required' } });
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
      const chart = await analyzeChartImage(imageBase64, imageMimeType, pair);
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
      );
      await finishAnalysis(chart, selectedPair, timeframeCharts.h4.uri, analysisStartedAt);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
      Alert.alert('Analysis failed', 'We couldn\'t complete your analysis. Please try again.');
      setStage('pick');
    }
  };



  const activeTimeframeChart = timeframeCharts[activeTimeframe];
  const captureFrameHeight = Math.min(460, Math.max(300, viewportHeight * 0.4));
  const hasBothTimeframes = Boolean(timeframeCharts.h4 && timeframeCharts.m15);
  const handlePrimaryCaptureAction = () => {
    if (mode === 'multiTimeframe') {
      void pickTimeframeCamera(activeTimeframe);
      return;
    }
    if (imageUri) {
      void handleImageSelected();
      return;
    }
    void pickFromCamera();
  };
  const handleGalleryAction = () => {
    if (mode === 'multiTimeframe') {
      void pickTimeframeChart(activeTimeframe);
      return;
    }
    void pickFromGallery();
  };
  const openFramePicker = () => {
    if (mode === 'multiTimeframe') {
      void pickTimeframeChart(activeTimeframe);
      return;
    }
    void pickFromGallery();
  };

  return (
    <View style={[styles.container, { paddingTop: stage === 'analyzing' || stage === 'ready' ? topPad : Math.max(insets.top, Platform.OS === 'web' ? 38 : 0), backgroundColor: colors.background }]}>
      {stage !== 'analyzing' && stage !== 'ready' && (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} style={styles.analysisHeader}>
          <View style={styles.analysisHeaderCopy}>
            <Text style={[styles.analysisHeaderTitle, { color: colors.text }]}>New Analysis</Text>
            <Text style={[styles.analysisHeaderSubtitle, { color: colors.textSecondary }]}>Add a chart to get AI insights</Text>
          </View>
          <TouchableOpacity
            style={[styles.analysisCloseButton, { backgroundColor: colors.surface }]}
            onPress={() => router.replace('/(tabs)/home')}
            accessibilityRole="button"
            accessibilityLabel="Close analysis"
          >
            <Feather name="x" size={22} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {(stage === 'pick' || stage === 'preview') && (
        <Animated.ScrollView
          entering={reduceMotion ? undefined : FadeInUp.delay(100).duration(500)}
          style={styles.analysisComposerScroll}
          contentContainerStyle={[styles.analysisComposer, { paddingBottom: botPad + 8 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.modeSwitcher, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'quick' }} onPress={startQuickMode} style={[styles.modeButton, mode === 'quick' && { backgroundColor: colors.card }]}>
              <Text style={[styles.modeButtonText, { color: mode === 'quick' ? colors.text : colors.textMuted }]}>Quick</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'multiTimeframe' }} onPress={startMultiTimeframeMode} style={[styles.modeButton, mode === 'multiTimeframe' && { backgroundColor: colors.card }]}>
              <Text style={[styles.modeButtonText, { color: mode === 'multiTimeframe' ? colors.text : colors.textMuted }]}>Multi-Timeframe</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={mode === 'multiTimeframe' ? `Chart preview for ${activeTimeframe === 'h4' ? 'H4 context' : 'M15 entry'}. Tap to choose an image.` : imageUri ? 'Replace chart image' : 'Choose chart image'}
            onPress={openFramePicker}
            style={[
              styles.captureFrame,
              { height: captureFrameHeight, borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            {mode === 'multiTimeframe' && activeTimeframeChart ? (
              <Image source={{ uri: activeTimeframeChart.uri }} style={styles.captureImage} resizeMode="contain" />
            ) : mode === 'quick' && imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.captureImage} resizeMode="contain" />
            ) : (
              <View style={styles.framePlaceholder}>
                <Feather name="image" size={42} color={colors.textSecondary} />
                <Text style={[styles.framePlaceholderText, { color: colors.textSecondary }]}>Align your chart in frame</Text>
              </View>
            )}
            <View pointerEvents="none" style={[styles.frameCorner, styles.frameCornerTopLeft, { borderColor: colors.textSecondary }]} />
            <View pointerEvents="none" style={[styles.frameCorner, styles.frameCornerTopRight, { borderColor: colors.textSecondary }]} />
            <View pointerEvents="none" style={[styles.frameCorner, styles.frameCornerBottomLeft, { borderColor: colors.textSecondary }]} />
            <View pointerEvents="none" style={[styles.frameCorner, styles.frameCornerBottomRight, { borderColor: colors.textSecondary }]} />
          </TouchableOpacity>

          {mode === 'multiTimeframe' ? (
            <View style={styles.timeframeRow}>
              {(['h4', 'm15'] as const).map((timeframe) => {
                const chart = timeframeCharts[timeframe];
                const label = timeframe === 'h4' ? 'H4 context' : 'M15 entry';
                const selected = activeTimeframe === timeframe;
                return (
                  <TouchableOpacity
                    key={timeframe}
                    accessibilityRole="button"
                    accessibilityLabel={`${chart ? 'Replace' : 'Add'} ${label} chart`}
                    onPress={() => void openTimeframePicker(timeframe)}
                    style={[
                      styles.timeframeTile,
                      {
                        backgroundColor: colors.card,
                        borderColor: selected ? colors.buy : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.timeframeTileTitle, { color: colors.text }]}>{label}</Text>
                    <View style={[styles.timeframeTileDrop, { borderColor: colors.cardBorder }]}>
                      {chart ? (
                        <Image source={{ uri: chart.uri }} style={styles.timeframeTileImage} resizeMode="cover" />
                      ) : (
                        <>
                          <Feather name="plus" size={25} color={colors.textSecondary} />
                          <Text style={[styles.timeframeTilePrompt, { color: colors.textSecondary }]}>Add chart</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {mode === 'multiTimeframe' ? (
            <View style={styles.multiControls}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setShowPairModal(true)}
                style={[styles.pairSelectorCompact, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={[styles.pairSelectorCompactText, { color: selectedPair ? colors.text : colors.textSecondary }]}>
                  {selectedPair || 'Select pair'}
                </Text>
                <Feather name="chevron-down" size={17} color={colors.textSecondary} />
              </TouchableOpacity>
              {hasBothTimeframes ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={!selectedPair}
                  onPress={() => void handleMultiTimeframeAnalysis()}
                  style={[styles.multiAnalyzeButton, { backgroundColor: colors.primary, opacity: selectedPair ? 1 : 0.5 }]}
                >
                  <Feather name="zap" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.multiAnalyzeButtonText, { color: colors.primaryForeground }]}>Analyze setup</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.captureControls}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={mode === 'multiTimeframe' ? `Choose ${activeTimeframe === 'h4' ? 'H4' : 'M15'} chart from gallery` : 'Choose chart from gallery'}
              onPress={handleGalleryAction}
              style={styles.galleryButton}
            >
              <View style={[styles.galleryIconCircle, { backgroundColor: colors.surface }]}>
                <Feather name="image" size={25} color={colors.text} />
              </View>
              <Text style={[styles.galleryLabel, { color: colors.textSecondary }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={mode === 'multiTimeframe' ? `Take ${activeTimeframe === 'h4' ? 'H4' : 'M15'} chart photo` : imageUri ? 'Analyze chart' : 'Take chart photo'}
              onPress={handlePrimaryCaptureAction}
              style={[styles.shutterOuter, { borderColor: colors.text }]}
            >
              <View style={[styles.shutterInner, { backgroundColor: colors.text }]} />
            </TouchableOpacity>
            <View style={styles.captureControlSpacer} />
          </View>

          <Text style={[styles.analysisDisclaimer, { color: colors.textSecondary }]}>
            Educational analysis, not financial advice.
          </Text>
          {analysisError ? <Text style={styles.errorText}>{analysisError}</Text> : null}
        </Animated.ScrollView>
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
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  analysisHeaderCopy: { flex: 1, gap: 2 },
  analysisHeaderTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontFamily: 'Inter_700Bold' },
  analysisHeaderSubtitle: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  analysisCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  analysisComposerScroll: { flex: 1 },
  analysisComposer: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, gap: 10 },
  modeSwitcher: { flexDirection: 'row', minHeight: 44, padding: 4, borderWidth: 1, borderRadius: 22, gap: 3 },
  modeButton: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  modeButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  captureFrame: {
    width: '100%',
    minHeight: 280,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureImage: { width: '100%', height: '100%', position: 'absolute' },
  framePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  framePlaceholderText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  frameCorner: { position: 'absolute', width: 25, height: 25 },
  frameCornerTopLeft: { top: 20, left: 20, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  frameCornerTopRight: { top: 20, right: 20, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  frameCornerBottomLeft: { bottom: 20, left: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  frameCornerBottomRight: { bottom: 20, right: 20, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  timeframeRow: { flexDirection: 'row', gap: 10 },
  timeframeTile: { flex: 1, minWidth: 0, minHeight: 124, borderRadius: 18, padding: 12, borderWidth: 1, gap: 10 },
  timeframeTileTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  timeframeTileDrop: { flex: 1, minHeight: 68, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 1 },
  timeframeTilePrompt: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  timeframeTileImage: { width: '100%', height: '100%' },
  multiControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairSelectorCompact: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pairSelectorCompactText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  multiAnalyzeButton: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  multiAnalyzeButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  captureControls: { minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingTop: 2 },
  galleryButton: { width: 72, alignItems: 'center', gap: 4 },
  galleryIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  galleryLabel: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  shutterOuter: { width: 80, height: 80, borderWidth: 4, borderRadius: 40, alignItems: 'center', justifyContent: 'center', padding: 4 },
  shutterInner: { width: '100%', height: '100%', borderRadius: 36 },
  captureControlSpacer: { width: 72 },
  analysisDisclaimer: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', textAlign: 'center', marginBottom: 2 },
  errorText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#FF5252', textAlign: 'center', marginTop: 12 },
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
