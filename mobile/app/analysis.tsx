import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
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
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from '@/services/haptics';
import { useApp } from '@/context/AppContext';
import { PairSelectionModal } from '@/components/PairSelectionModal';
import type { AnalysisResult } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import * as MarketData from '@/services/marketData';
import * as ChartDetection from '../services/chartDetection';
import { trackEvent } from '@/services/telemetry';
import { recordGeneratedSignal } from '@/services/signalTracking';

type Stage = 'pick' | 'preview' | 'selectPair' | 'analyzing';

function chartDirection(value?: string | null): 'BUY' | 'SELL' | null {
  const text = String(value || '').toUpperCase();
  if (/BUY|BULL|UPTREND|UPWARD/.test(text)) return 'BUY';
  if (/SELL|BEAR|DOWNTREND|DOWNWARD/.test(text)) return 'SELL';
  return null;
}

/**
 * REAL DATA ANALYSIS FUNCTION (v2)
 * Replaces mocked generateAnalysis
 * Uses actual market API data + trend analysis
 */
async function generateAnalysisWithRealData(
  pair: string,
  settings: { accountBalance: number; riskPercent: number },
  chartAnalysis: NonNullable<AnalysisResult['chartAnalysis']>
): Promise<AnalysisResult | null> {
  try {
    // Step 1: Fetch real market data
    const candles = await MarketData.fetchCandleData(pair);
    if (!candles || candles.length < 2) {
      console.error('[Analysis] No market data available');
      return null;
    }

    // Step 2: Analyze trend from real data
    const trend = MarketData.analyzeTrend(candles, pair);
    if (!trend.direction || trend.isLowConfidence) {
      console.warn('[Analysis] Signal held back:', trend.confidenceReason);
      return null;
    }
    const visualDirection = chartDirection(chartAnalysis.trend);
    const normalizedDetectedPair = chartAnalysis.detectedPair?.replace('/', '').toUpperCase();
    if (normalizedDetectedPair && normalizedDetectedPair !== pair.replace('/', '').toUpperCase()) return null;
    if (visualDirection && visualDirection !== trend.direction) return null;
    const compositeScore = Math.round(trend.confidence * 0.65 + chartAnalysis.confidence * 0.35);

    // Step 3: Get current price
    const currentPrice = MarketData.getCurrentPrice(candles);
    if (!currentPrice) {
      console.error('[Analysis] No current price available');
      return null;
    }

    // Step 4: Calculate entry, SL, TP
    const levels = MarketData.calculateLevels(trend, currentPrice, pair);
    // Step 5: Calculate lot size
    const lotSize = MarketData.calculateLotSize(
      pair,
      settings.accountBalance,
      settings.riskPercent,
      levels.slPips,
      currentPrice
    );

    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      pair,
      direction: trend.direction,
      confidence: compositeScore,
      confidenceType: 'composite_score',
      entry: levels.entry,
      sl: levels.sl,
      tp: levels.tp,
      lotSize,
      slPips: levels.slPips,
      createdAt: new Date().toISOString(),
      dataSource: 'api',
      volatility: trend.volatility,
      apiDataTime: new Date().toISOString(),
      chartAnalysis,
    };
  } catch (error) {
    console.error('[Analysis] Error generating real data analysis:', error);
    return null;
  }
}

// ─── Step states ──────────────────────────────────────────────────────────────
type StepState = 'done' | 'active' | 'pending';

const STEPS = [
  { label: 'Reading price structure…', icon: 'bar-chart-2' },
  { label: 'Identifying market direction…', icon: 'trending-up' },
  { label: 'Mapping key levels…', icon: 'layers' },
  { label: 'Calculating risk & position size…', icon: 'percent' },
];

const AI_STATUS_MESSAGES = [
  'Analyzing volatility patterns…',
  'Cross-referencing historical data…',
  'Optimizing entry & exit zones…',
  'Validating market structure…',
  'Analyzing deeper for signal quality…',
  'Processing price action…',
];

function StepRow({ label, icon, state }: { label: string; icon: string; state: StepState }) {
  const colors = useColors();
  const pulse = useSharedValue(0.5);
  const scaleVal = useSharedValue(1);

  useEffect(() => {
    if (state === 'active') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      );
      scaleVal.value = withSpring(1.02, { damping: 2, mass: 0.5, overshootClamping: false });
    } else {
      pulse.value = 1;
      scaleVal.value = 1;
    }
  }, [state]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: state === 'active' ? pulse.value : 1,
    transform: [{ scale: state === 'active' ? 1.1 : 1 }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
  }));

  const bg =
    state === 'done' ? colors.surface : state === 'active' ? colors.surface : colors.card;
  const border =
    state === 'done' ? colors.buy : state === 'active' ? colors.buy : colors.cardBorder;
  const borderOpacity = state === 'active' ? 0.3 : 1;
  const iconColor =
    state === 'done' ? colors.buy : state === 'active' ? colors.buy : colors.textMuted;
  const textColor =
    state === 'done' ? colors.text : state === 'active' ? colors.text : colors.textSecondary;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={[
        styles.stepRow,
        cardStyle,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          opacity: borderOpacity === 0.3 ? 1 : 0.8,
        },
      ]}
    >
      <View style={[styles.stepIconBox, { borderColor: iconColor }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={[styles.stepText, { color: textColor }]}>{label}</Text>
      <Animated.View style={dotStyle}>
        {state === 'done' ? (
          <Feather name="check" size={16} color="#00E676" />
        ) : state === 'active' ? (
          <View style={[styles.activeDot]} />
        ) : (
          <View style={styles.pendingDot} />
        )}
      </Animated.View>
    </Animated.View>
  );
}

function AnalyzingView() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(AI_STATUS_MESSAGES[0]);
  
  const progressValue = useSharedValue(0);
  const glowPulse = useSharedValue(0.12);

  useEffect(() => {
    // Keep the experience deliberate: every session takes 10–15 seconds.
    const totalDuration = 10000 + Math.random() * 5000;
    const stepStarts = [0, totalDuration * 0.23, totalDuration * 0.49, totalDuration * 0.76];

    const statusInterval = setInterval(() => {
      setStatusMessage(
        AI_STATUS_MESSAGES[Math.floor(Math.random() * AI_STATUS_MESSAGES.length)]
      );
    }, 1800);

    // Subtle glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.08, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );

    // Progress advances continuously rather than jumping when a step changes.
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, startTime)
    );

    const finishTimer = setTimeout(() => {
      clearInterval(progressInterval);
      setProgress(100);
      progressValue.value = withTiming(100, { duration: 450 });
      setActiveStep(STEPS.length);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, totalDuration);

    return () => {
      clearInterval(statusInterval);
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

  return (
    <View style={[styles.analyzingContainer, { paddingTop: insets.top + 20, backgroundColor: colors.background }]}>
      {/* Subtle glow behind icon */}
      <Animated.View style={[styles.analyzingGlow, glowStyle]} />

      {/* Icon */}
      <Animated.View entering={FadeIn.duration(500)} style={[styles.analyzingIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Feather name="cpu" size={42} color="#00E676" />
      </Animated.View>

      {/* Title */}
      <Animated.Text
        entering={FadeInDown.delay(150).duration(500)}
        style={[styles.analyzingTitle, { color: colors.text }]}
      >
      apiDataTime: candles[candles.length - 1]?.timestamp,
      </Animated.Text>

      {/* Progress bar with percentage */}
      <Animated.View
        entering={FadeInDown.delay(250).duration(500)}
        style={styles.progressSection}
      >
        <View style={styles.progressBarContainer}>
          <Animated.View style={[styles.progressBarFill, progressStyle, { backgroundColor: colors.buy }]} />
        </View>
        <Text style={[styles.progressPercent, { color: colors.textSecondary }]}>{progress}%</Text>
      </Animated.View>

      {/* Steps */}
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

      {/* AI Status message */}
      <Animated.Text
        entering={FadeIn.duration(400)}
        style={[styles.aiStatusMessage, { color: colors.textMuted }]}
        key={statusMessage}
      >
        {statusMessage}
      </Animated.Text>
    </View>
  );
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { settings, setCurrentAnalysis } = useApp();
  const [stage, setStage] = useState<Stage>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const pickFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
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
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
      setImageMimeType(result.assets[0].mimeType || 'image/jpeg');
      setStage('preview');
    }
  };

  const handleImageSelected = async () => {
    trackEvent('analysis_started');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Step 1: Validate chart image
    if (!imageUri) return;
    
    console.log('[Analysis] Validating chart...');
    if (!imageBase64) {
      setAnalysisError('Unable to read the image for AI analysis. Please choose the chart again.');
      return;
    }
    const validation = await ChartDetection.validateChartImage(imageBase64, imageMimeType);
    
    if (!validation.isChart) {
      trackEvent('chart_validation_failed');
      setAnalysisError('❌ No chart detected. Please upload a valid trading chart.');
      Alert.alert('Invalid Image', validation.reason);
      return;
    }
    
    // Step 2: Show pair selection modal
    setShowPairModal(true);
    setAnalysisError(null);
  };

  const handlePairSelected = async (pair: string) => {
    setSelectedPair(pair);
    setShowPairModal(false);
    
    // Step 3: Start real data analysis
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage('analyzing');
    setAnalysisError(null);
    const analysisStartedAt = Date.now();
    
    // Step 4: Fetch and analyze real market data
    if (!imageBase64) {
      setAnalysisError('Chart image data is unavailable. Please upload it again.');
      setStage('preview');
      return;
    }
    const chart = await ChartDetection.validateChartImage(imageBase64, imageMimeType, pair);
    if (!chart.isChart || chart.confidence < 55) {
      setAnalysisError(`Chart AI could not validate this image: ${chart.reason}`);
      setStage('preview');
      return;
    }
    const result = await generateAnalysisWithRealData(pair, settings, {
      ...chart,
      marketAgreement: 'aligned',
      fusionReason: 'Chart direction and market-data direction aligned.',
    });
    
    // Step 5: Handle result or error
    if (!result) {
      trackEvent('analysis_failed', { pair });
      setAnalysisError('⚠️ Signal held back. Market data is unavailable or confidence is too low.');
      Alert.alert(
        'No High-Confidence Signal',
        'FXSnap only shows focused signals when the selected instrument has enough clean data. Try again later or choose another core pair.'
      );
      setStage('preview');
      return;
    }
    
    // Success!
    result.imageUri = imageUri ?? undefined;
    setCurrentAnalysis(result);
    void recordGeneratedSignal({ id: result.id, pair: result.pair, direction: result.direction, entry: Number(result.entry), sl: Number(result.sl), tp: Number(result.tp) });
    trackEvent('analysis_succeeded', { pair, chartConfidence: chart.confidence });
    
    // Never reveal a result before the minimum intelligence-building wait.
    const elapsed = Date.now() - analysisStartedAt;
    const remainingMinimumTime = Math.max(0, 10000 - elapsed);
    await new Promise((resolve) => setTimeout(resolve, remainingMinimumTime));
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/analysis-result');
  };

  const BalanceBanner = () => {
    if (settings.balanceSet) return null;
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={[styles.balanceBanner, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
        <Feather name="alert-circle" size={16} color="#FFD60A" />
        <Text style={[styles.balanceBannerText, { color: colors.text }]}>
          Set your account balance in{' '}
          <Text
            style={[styles.balanceBannerLink, { color: colors.gold }]}
            onPress={() => router.push('/settings')}
          >
            Settings
          </Text>{' '}
          for accurate lot size.
        </Text>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      {stage !== 'analyzing' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Chart Analysis</Text>
          <View style={{ width: 44 }} />
        </Animated.View>
      )}

      {stage === 'pick' && (
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
          <BalanceBanner />
          <View style={styles.uploadHero}>
            <View style={[styles.uploadIcon, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="image" size={48} color="#8E8E93" />
            </View>
            <Text style={[styles.uploadTitle, { color: colors.text }]}>Upload Your Chart</Text>
            <Text style={[styles.uploadSubtext, { color: colors.textSecondary }]}>
              Take a photo or choose from your library. Ensure the chart is clear and well-lit.
            </Text>
          </View>

          <View style={styles.pickActions}>
            <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromCamera}>
              <View style={styles.pickBtnIcon}>
                <Feather name="camera" size={28} color="#FFFFFF" />
              </View>
              <Text style={[styles.pickBtnLabel, { color: colors.text }]}>Camera</Text>
              <Text style={[styles.pickBtnSub, { color: colors.textSecondary }]}>Take a photo now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={pickFromGallery}>
              <View style={styles.pickBtnIcon}>
                <Feather name="image" size={28} color="#FFFFFF" />
              </View>
              <Text style={[styles.pickBtnLabel, { color: colors.text }]}>Gallery</Text>
              <Text style={[styles.pickBtnSub, { color: colors.textSecondary }]}>Choose existing chart</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.analysisDisclaimer, { color: colors.textMuted }]}>
            This app does not provide financial advice. Trade at your own risk.
          </Text>
        </Animated.View>
      )}

      {stage === 'preview' && imageUri && (
        <Animated.View entering={FadeIn.duration(400)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
          <BalanceBanner />
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
              <Text style={[styles.analyzeBtnText, { color: colors.primaryForeground }]}>Analyse Chart</Text>
            </TouchableOpacity>
            {analysisError && (
              <Text style={styles.errorText}>{analysisError}</Text>
            )}
          </View>
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
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
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
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 20,
  },
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
  balanceBannerLink: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFD60A',
  },
  uploadHero: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 28,
  },
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
  uploadTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  uploadSubtext: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  pickActions: {
    flexDirection: 'row',
    gap: 14,
  },
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
  pickBtnLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  pickBtnSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
  },
  analysisDisclaimer: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#48484A',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#FF5252',
    textAlign: 'center',
    marginTop: 12,
  },
  previewContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 300,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewActions: {
    gap: 12,
  },
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
  changeBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#8E8E93',
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  analyzeBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
  },
  // ── Analyzing stage ──
  analyzingContainer: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 4,
    backgroundColor: '#050806',
    justifyContent: 'flex-start',
  },
  analyzingGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#00E676',
    top: 28,
    alignSelf: 'center',
    opacity: 0.12,
  },
  analyzingIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#0D1A12',
    borderWidth: 1.5,
    borderColor: '#1A3D26',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    zIndex: 1,
  },
  analyzingTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginBottom: 18,
    letterSpacing: -0.5,
  },
  progressSection: {
    gap: 8,
    marginBottom: 24,
  },
  progressBarContainer: {
    height: 5,
    backgroundColor: '#1A1A1A',
    borderRadius: 2.5,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E676',
    borderRadius: 2.5,
    shadowColor: '#00E676',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  progressPercent: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#8E8E93',
    textAlign: 'right',
  },
  stepsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  stepIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    lineHeight: 18,
  },
  activeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#00E676',
  },
  pendingDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#3A3A3A',
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
