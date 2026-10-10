import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
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

type Stage = 'pick' | 'preview' | 'analyzing';
type AnalysisMode = 'quick' | 'multiTimeframe';
type TimeframeChart = MultiTimeframeChartImage & { uri: string };

// ─── Step states ──────────────────────────────────────────────────────────────
type StepState = 'done' | 'active' | 'pending';

const STEPS = [
  { label: 'Reading price structure', icon: 'bar-chart-2' },
  { label: 'Identifying market direction', icon: 'trending-up' },
  { label: 'Mapping key levels', icon: 'layers' },
  { label: 'Risk evaluation', icon: 'shield' },
  { label: 'Filtering low-probability setups', icon: 'filter' },
];

const AI_STATUS_MESSAGES = [
  'Reading structure…',
  'Detecting trend…',
  'Marking key zones…',
  'Evaluating risk levels…',
  'Filtering low-probability setups…',
];

function StepRow({ label, icon, state }: { label: string; icon: string; state: StepState }) {
  const colors = useColors();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state === 'active') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      );
    } else {
      pulse.value = 1;
    }
  }, [state]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: state === 'active' ? pulse.value : 1 }],
  }));

  const backgroundColor =
    state === 'done' ? '#071A0D' : state === 'active' ? '#0E2619' : '#0A0A0A';
  const borderColor =
    state === 'done' ? '#00FF9C' : state === 'active' ? '#00FF9C' : '#222222';
  const opacity = state === 'pending' ? 0.55 : 1;
  const textColor = state === 'pending' ? '#8E8E93' : '#FFFFFF';
  const iconColor = state === 'pending' ? '#636366' : '#00FF9C';

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      style={[
        styles.stepRow,
        {
          backgroundColor,
          borderColor,
          opacity,
        },
      ]}
    >
      <View style={[styles.stepRowContent, { opacity }]}> 
        <Animated.View style={[styles.stepIconBox, { borderColor, backgroundColor: state === 'pending' ? '#121212' : '#071B0F' }, animatedIconStyle]}>
          <Feather name={icon as any} size={18} color={iconColor} />
        </Animated.View>
        <Text style={[styles.stepText, { color: textColor }]}>{label}</Text>
        <View style={styles.stepStatusIcon}>
          {state === 'done' ? (
            <Feather name="check" size={18} color="#00FF9C" />
          ) : state === 'active' ? (
            <View style={styles.activeDot} />
          ) : (
            <View style={styles.pendingDot} />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function AnalyzingView() {
  const insets = useSafeAreaInsets();
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);

  const progressValue = useSharedValue(0);
  const glowPulse = useSharedValue(0.12);

  useEffect(() => {
    const totalDuration = 12000 + Math.random() * 3000;
    const stepStarts = [0, totalDuration * 0.18, totalDuration * 0.38, totalDuration * 0.58, totalDuration * 0.78];

    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.08, { duration: 1100, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );

    progressValue.value = withTiming(96, {
      duration: totalDuration,
      easing: Easing.linear,
    });

    const progressInterval = setInterval(() => {
      setProgress((current) => Math.min(96, current + 1));
    }, totalDuration / 96);

    const stepTimers = stepStarts.map((startTime, stepIndex) =>
      setTimeout(() => {
        setActiveStep(stepIndex);
      }, startTime)
    );

    const finishTimer = setTimeout(() => {
      clearInterval(progressInterval);
      setProgress(100);
      progressValue.value = withTiming(100, { duration: 450 });
      setActiveStep(STEPS.length);
    }, totalDuration);

    return () => {
      clearInterval(progressInterval);
      stepTimers.forEach(clearTimeout);
      clearTimeout(finishTimer);
    };
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value}%` as any,
  }));

  const getStepState = (i: number): StepState => {
    if (i < activeStep) return 'done';
    if (i === activeStep) return 'active';
    return 'pending';
  };

  const currentStatus = AI_STATUS_MESSAGES[Math.min(activeStep, AI_STATUS_MESSAGES.length - 1)];

  return (
    <View style={[styles.analyzingContainer, { paddingTop: insets.top + 20 }]}> 
      <Animated.View style={[styles.analyzingGlow, glowStyle]} />

      <Animated.View entering={FadeIn.duration(500)} style={styles.analyzingIcon}>
        <Feather name="cpu" size={40} color="#00FF9C" />
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.delay(150).duration(500)}
        style={styles.analyzingTitle}
      >
        Analyzing Market Structure
      </Animated.Text>

      <Animated.Text
        entering={FadeInDown.delay(220).duration(500)}
        style={styles.analysisSubtext}
      >
        {currentStatus}
      </Animated.Text>

      <Animated.View
        entering={FadeInDown.delay(280).duration(500)}
        style={styles.progressSection}
      >
        <View style={styles.progressBarContainer}>
          <Animated.View style={[styles.progressBarFill, progressStyle]} />
        </View>
        <Text style={styles.progressPercent}>{progress}%</Text>
      </Animated.View>

      <View style={styles.stepsContainer}>
        {STEPS.map((step, i) => (
          <StepRow
            key={step.label}
            label={step.label}
            icon={step.icon}
            state={getStepState(i)}
          />
        ))}
      </View>
    </View>
  );
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
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

    const remainingMinimumTime = Math.max(0, 10000 - (Date.now() - analysisStartedAt));
    await new Promise((resolve) => setTimeout(resolve, remainingMinimumTime));

    if (chart.status === 'ai_unavailable' || chart.status === 'ai_invalid_response') {
      trackEvent('analysis_ai_unavailable', { pair });
      const unavailableMessage = chart.message || 'The analysis response was invalid. Please retry.';
      setAnalysisError(unavailableMessage);
      Alert.alert('Analysis unavailable', unavailableMessage);
      returnToInput();
      return;
    }

    if (chart.status === 'invalid_image') {
      clearAnalysisRetryRequest();
      trackEvent('analysis_invalid_image', { pair });
      setAnalysisError(chart.analysis.notes || 'No valid trading chart detected. Please upload a clearer chart.');
      Alert.alert('Invalid Image', chart.analysis.notes || 'No valid trading chart detected. Please upload a clearer chart.');
      returnToInput();
      return;
    }

    const result = buildAnalysisResult(chart, pair, sourceImageUri);
    if (chart.status === 'success' || chart.status === 'no_trade') {
      clearAnalysisRetryRequest();
      setRetryingExistingChart(false);
    }
    setCurrentAnalysis(result);
    trackEvent('analysis_succeeded', { pair, status: chart.status, confidence: chart.confidence });
    await recordRatingEligibleAnalysis();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    <Animated.View entering={FadeInDown.duration(400)} style={[styles.balanceBanner, { backgroundColor: colors.surface, borderColor: colors.gold }]}> 
      <Feather name="bar-chart-2" size={16} color="#FFD60A" />
      <Text style={[styles.balanceBannerText, { color: colors.text }]}>📊 For best results, upload a clear chart image showing price action, timeframe, and visible levels.{"\n"}Blurry, cropped, or cluttered charts may lead to inaccurate analysis.</Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      {stage !== 'analyzing' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.replace('/home')}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Chart Analysis</Text>
          <View style={{ width: 44 }} />
        </Animated.View>
      )}

      {stage === 'pick' && (
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
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
                  <Feather name="image" size={48} color="#8E8E93" />
                </View>
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Quick Analysis</Text>
                <Text style={[styles.uploadSubtext, { color: colors.textSecondary }]}>Upload one chart for a fast setup read.</Text>
              </View>

              <View style={styles.pickActions}>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromCamera}>
                  <View style={styles.pickBtnIcon}><Feather name="camera" size={28} color="#FFFFFF" /></View>
                  <Text style={[styles.pickBtnLabel, { color: colors.text }]}>Camera</Text>
                  <Text style={[styles.pickBtnSub, { color: colors.textSecondary }]}>Take a photo now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromGallery}>
                  <View style={styles.pickBtnIcon}><Feather name="image" size={28} color="#FFFFFF" /></View>
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
        <Animated.View entering={FadeIn.duration(400)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
          <NoticeBanner />
          <View style={[styles.previewContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity style={[styles.changeBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => setStage('pick')}>
              <Feather name="refresh-cw" size={16} color="#8E8E93" />
              <Text style={[styles.changeBtnText, { color: colors.textSecondary }]}>Change Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.analyzeBtn, { backgroundColor: colors.primary }]} onPress={handleImageSelected}>
              <Feather name="zap" size={18} color="#000" />
              <Text style={[styles.analyzeBtnText, { color: colors.primaryForeground }]}>{retryingExistingChart ? 'Retry Analysis' : 'Analyse Chart'}</Text>
            </TouchableOpacity>
          </View>
          {analysisError && (
            <Text style={styles.errorText}>{analysisError}</Text>
          )}
        </Animated.View>
      )}

      {stage === 'analyzing' && <AnalyzingView />}

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
    backgroundColor: '#000000',
    justifyContent: 'flex-start',
  },
  analyzingGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#00FF9C',
    top: 28,
    alignSelf: 'center',
    opacity: 0.14,
  },
  analyzingIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#071B0F',
    borderWidth: 1.5,
    borderColor: '#0A3F25',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    zIndex: 1,
  },
  analyzingTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  analysisSubtext: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#B3B3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00FF9C',
    borderRadius: 999,
    shadowColor: '#00FF9C',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  progressPercent: {
    minWidth: 48,
    textAlign: 'right',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#E5E5EA',
  },
  stepsContainer: {
    gap: 14,
    marginBottom: 16,
  },
  stepRow: {
    borderRadius: 16,
    borderWidth: 1.25,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderColor: '#161616',
    backgroundColor: '#070A0B',
  },
  stepRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  stepStatusIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00FF9C',
    shadowColor: '#00FF9C',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3C3C43',
  },
  aiStatusMessage: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    textAlign: 'center',
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
