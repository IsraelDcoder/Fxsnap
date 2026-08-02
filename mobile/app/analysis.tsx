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
import type { AnalysisResult } from '@/context/AppContext';
import { PairSelectionModal } from '@/components/PairSelectionModal';
import { useColors } from '@/hooks/useColors';
import { analyzeChartImage, type ChartAnalysisResult } from '../services/chartDetection';
import { trackEvent } from '@/services/telemetry';

type Stage = 'pick' | 'preview' | 'analyzing';

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

/** Convert the disciplined chart result into the app's AnalysisResult model. */
function buildAnalysisResult(chart: ChartAnalysisResult, pair: string, imageUri?: string): AnalysisResult {
  const isBuy = chart.trade_setup.type === 'buy';
  const isSell = chart.trade_setup.type === 'sell';
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    pair,
    status: chart.status,
    direction: isBuy ? 'BUY' : isSell ? 'SELL' : undefined,
    confidence: chart.confidence,
    confidenceType: 'composite_score',
    imageUri,
    createdAt: new Date().toISOString(),
    analysis: {
      trend: chart.analysis.trend,
      structure: chart.analysis.structure,
      volatility: chart.analysis.volatility,
      volume: chart.analysis.volume,
      sentiment: chart.analysis.sentiment,
      indicators: chart.analysis.indicators,
      notes: chart.analysis.notes,
    },
    zones: {
      support: chart.zones.support,
      resistance: chart.zones.resistance,
      liquidity: chart.zones.liquidity,
    },
    tradeSetup: {
      type: chart.trade_setup.type,
      entryZone: chart.trade_setup.entry_zone,
      stopLoss: chart.trade_setup.stop_loss,
      takeProfit: chart.trade_setup.take_profit,
      riskReward: chart.trade_setup.risk_reward,
    },
  };
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { setCurrentAnalysis } = useApp();
  const [stage, setStage] = useState<Stage>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { isSubscribed, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading && !isSubscribed) {
      router.replace('/paywall');
    }
  }, [isLoading, isSubscribed]);

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
    if (!imageUri) return;

    console.log('[Analysis] Preparing chart for AI analysis...');
    if (!imageBase64) {
      setAnalysisError('Unable to read the image for AI analysis. Please choose the chart again.');
      return;
    }

    setShowPairModal(true);
    setAnalysisError(null);
  };

  const handlePairSelected = async (pair: string) => {
    setSelectedPair(pair);
    setShowPairModal(false);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage('analyzing');
    setAnalysisError(null);
    const analysisStartedAt = Date.now();

    if (!imageBase64) {
      setAnalysisError('Chart image data is unavailable. Please upload it again.');
      setStage('preview');
      return;
    }

    // Single-pass disciplined AI analysis (server enforces the validation layer).
    const chart = await analyzeChartImage(imageBase64, imageMimeType, pair);

    const elapsed = Date.now() - analysisStartedAt;
    const remainingMinimumTime = Math.max(0, 10000 - elapsed);
    await new Promise((resolve) => setTimeout(resolve, remainingMinimumTime));

    // Handle clean states.
    if (chart.status === 'ai_unavailable') {
      trackEvent('analysis_ai_unavailable', { pair });
      setAnalysisError(chart.message || 'Chart AI is unavailable right now. Please try again shortly.');
      Alert.alert('AI Unavailable', chart.message || 'Chart AI is unavailable right now. Please try again shortly.');
      setStage('preview');
      return;
    }

    if (chart.status === 'invalid_image') {
      trackEvent('analysis_invalid_image', { pair });
      setAnalysisError(chart.analysis.notes || 'No valid trading chart detected. Please upload a clearer chart.');
      Alert.alert('Invalid Image', chart.analysis.notes || 'No valid trading chart detected. Please upload a clearer chart.');
      setStage('preview');
      return;
    }

    // success OR no_trade both land on the result screen with a disciplined state.
    const result = buildAnalysisResult(chart, pair, imageUri ?? undefined);
    setCurrentAnalysis(result);
    trackEvent('analysis_succeeded', { pair, status: chart.status, confidence: chart.confidence });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/analysis-result');
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
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Chart Analysis</Text>
          <View style={{ width: 44 }} />
        </Animated.View>
      )}

      {stage === 'pick' && (
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={[styles.content, { paddingBottom: botPad + 24 }]}>
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
            The AI analyzes only the uploaded chart image. This app does not provide financial advice. Trade at your own risk.
          </Text>
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
              <Text style={[styles.analyzeBtnText, { color: colors.primaryForeground }]}>Analyse Chart</Text>
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
