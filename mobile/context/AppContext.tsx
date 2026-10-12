import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { addBillingListener, billingIsConfigured, configureBilling, getPremiumStatus, purchasePlan, restorePurchases, type BillingPlan } from '@/services/billing';
import { getServerAnalysisAccess, type ServerAnalysisAccess } from '@/services/apiAuth';
import { getFeatureAccessDecision, isFreeAnalysisExhausted, type FeatureAccessDecision, type ProtectedFeature } from '@/services/featureAccess';
import { setHapticsEnabled } from '@/services/haptics';
import { createDailyRiskActivity, getLocalRiskDateKey, normalizeDailyRiskActivity, type DailyRiskActivity, type OpenRiskPosition } from '@/services/risk';
import {
  getAuthenticatedAccount,
  getFxsnapAccountData,
  saveFxsnapAccountData,
} from '@/services/account';
import { subscribeToAccountDataChanges } from '@/services/accountDataEvents';

export const APP_DATA_VERSION = 3;
const DATA_VERSION_KEY = 'fxsnap:dataVersion';
const BACKUP_VERSION = 1;
const RISK_ACTIVITY_KEY = 'fxsnap:riskActivity';

export type AnalysisStatus = 'success' | 'no_trade' | 'invalid_image' | 'ai_unavailable' | 'ai_invalid_response' | 'premium_required';

export interface AnalysisResult {
  id: string;
  pair: string;
  status?: AnalysisStatus;
  message?: string;
  freeAnalysisUsed?: boolean;
  direction?: 'BUY' | 'SELL';
  timeframe?: string;
  takeProfitLevels?: string[];
  latestVisiblePrice?: number;
  priceSeries?: number[];
  reasoning?: string[];
  supportResistance?: {
    support: string[];
    resistance: string[];
  };
  confidence: number;
  confidenceType?: 'composite_score';
  // Legacy live-data fields (kept optional for old saved entries)
  entry?: string;
  sl?: string;
  tp?: string;
  lotSize?: number;
  slPips?: number;
  imageUri?: string;
  createdAt: string;
  // Disciplined price-action analysis (new shape)
  analysis?: {
    trend: 'bullish' | 'bearish' | 'neutral';
    structure: string;
    volatility: 'low' | 'moderate' | 'high';
    volume: 'low' | 'moderate' | 'high' | 'visible' | 'not_visible';
    sentiment: 'bullish' | 'bearish' | 'neutral';
    indicators: string;
    notes: string;
  };
  zones?: {
    support: string;
    resistance: string;
    liquidity: string;
  };
  tradeSetup?: {
    type: 'buy' | 'sell' | 'none';
    entryZone: string;
    stopLoss: string;
    takeProfit: string;
    riskReward: number | string;
  };
  marketBias?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  marketBiasConfidence?: number;
  // Canonical analysis scores exposed by the server
  marketConfidence?: number;
  entryReadiness?: number;
  tradeDecision?: 'BUY' | 'SELL' | 'WAIT' | 'NONE';
  tradeStatus?: string;
  setupStatus?: string;
  setupConfidence?: number;
  setupQuality?: number;
  entryQuality?: number;
  breakdown?: {
    trend?: number;
    zone?: number;
    priceLocation?: number;
    liquidity?: number;
    confirmation?: number;
    bos?: number;
    rsi?: number;
    rawScore?: number;
  };
  shortTermMomentum?: string;
  priceLocation?: string;
  decision?: string;
  tradeTrigger?: string;
  whyNotNow?: string[];
  dataLimitations?: string[];
  rrIssues?: string[];
  multiTimeframe?: {
    alignment: 'aligned' | 'conflicting' | 'unclear';
    summary: string;
    h4: { trend: 'bullish' | 'bearish' | 'neutral'; structure: string };
    m15: { trend: 'bullish' | 'bearish' | 'neutral'; structure: string; confirmation: string };
  };
  // Legacy chart validation fields (kept for backward compatibility)
  chartAnalysis?: {
    confidence: number;
    detectedPair?: string | null;
    timeframe?: string | null;
    trend?: string | null;
    indicators?: string[];
    support?: string[];
    resistance?: string[];
    chartNotes?: string[];
    marketAgreement?: 'aligned' | 'not_available';
    fusionReason?: string;
  };
}

export interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  level: 'beginner' | 'advanced' | null;
  rules: {
    entry: string[];
    exit: string[];
    risk: string[];
  };
  bestPairs: string[];
  timeframe: string;
  riskTolerance: string | null;
  tradingStyle: string | null;
  createdAt: string;
}

export interface SavedBrief {
  user_id: string;
  brief_id: string;
  card_id: string;
  instrument: string;
  headline: string;
  summary: string;
  created_at: string;
}

export interface AppSettings {
  displayName: string;
  themeMode: 'light' | 'dark' | 'system';
  preferredMarket: 'crypto' | 'stocks' | 'forex' | 'futures';
  onboardingRiskTolerance: 'low' | 'medium' | 'high';
  preferredTradingStyle: 'scalping' | 'day_trading' | 'swing';
  analysisDetail: 'basic' | 'standard' | 'advanced';
  accountBalance: number;
  balanceSet: boolean;
  riskPercent: number;
  maxDailyLossPercent: number;
  maxOpenRiskPercent: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  hapticsEnabled: boolean;
  darkMode: boolean;
}

interface AppContextValue {
  onboardingComplete: boolean;
  isSubscribed: boolean;
  settings: AppSettings;
  savedAnalyses: AnalysisResult[];
  savedStrategies: SavedStrategy[];
  savedBriefs: SavedBrief[];
  riskActivity: DailyRiskActivity;
  currentAnalysis: AnalysisResult | null;
  isLoading: boolean;
  completeOnboarding: () => void;
  billingAvailable: boolean;
  pendingFeatureRoute: string | null;
  checkFeatureAccess: (feature: ProtectedFeature, route: string, grantAnalysisRoute?: boolean) => Promise<FeatureAccessDecision & { error?: string }>;
  consumeAnalysisAccessGrant: () => boolean;
  consumePendingFeatureRoute: () => string | null;
  clearPendingFeatureRoute: () => void;
  purchasePlan: (plan: BillingPlan) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  updateSettings: (s: Partial<AppSettings>) => void;
  saveAnalysis: (a: AnalysisResult) => void;
  deleteAnalysis: (id: string) => void;
  setCurrentAnalysis: (a: AnalysisResult | null) => void;
  saveStrategy: (s: SavedStrategy) => Promise<void>;
  deleteStrategy: (id: string) => Promise<void>;
  saveBriefCard: (brief: SavedBrief) => Promise<void>;
  deleteBriefCard: (briefId: string, cardId: string) => Promise<void>;
  recordOpenRiskPosition: (position: OpenRiskPosition) => Promise<void>;
  closeRiskPosition: (positionId: string, realizedPnl: number) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (backupJson: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  syncAccountData: () => Promise<void>;
  stopAccountDataSync: () => void;
  accountSyncStatus: 'signed_out' | 'syncing' | 'synced' | 'error';
}

const defaultSettings: AppSettings = {
  displayName: '',
  themeMode: 'light',
  preferredMarket: 'forex',
  onboardingRiskTolerance: 'low',
  preferredTradingStyle: 'day_trading',
  analysisDetail: 'basic',
  accountBalance: 1000,
  balanceSet: false,
  riskPercent: 1,
  maxDailyLossPercent: 3,
  maxOpenRiskPercent: 3,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 3,
  hapticsEnabled: true,
  darkMode: false,
};

export interface AppBackup {
  backupVersion: number;
  appDataVersion: number;
  exportedAt: string;
  onboardingComplete: boolean;
  isSubscribed?: boolean;
  settings: AppSettings;
  savedAnalyses: AnalysisResult[];
  savedStrategies: SavedStrategy[];
  savedBriefs: SavedBrief[];
  riskActivity?: DailyRiskActivity;
  localPreferences?: Record<string, string | null>;
}

const SYNCED_LOCAL_PREFERENCE_KEYS = [
  'fxsnap:notificationSettings',
  'fxsnap:dailyBrief:assignments:v1',
  'fxsnap:dailyBrief:reads:v1',
  'fxsnap:profilePhoto:v1',
  'fxsnap:traderProfile:v1',
  'fxsnap:learningHub:v1',
];

function isPreferredMarket(value: unknown): value is AppSettings['preferredMarket'] {
  return value === 'crypto' || value === 'stocks' || value === 'forex' || value === 'futures';
}

function isRiskTolerance(value: unknown): value is AppSettings['onboardingRiskTolerance'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isTradingStyle(value: unknown): value is AppSettings['preferredTradingStyle'] {
  return value === 'scalping' || value === 'day_trading' || value === 'swing';
}

function isAnalysisDetail(value: unknown): value is AppSettings['analysisDetail'] {
  return value === 'basic' || value === 'standard' || value === 'advanced';
}

function migrateSettings(value: unknown): AppSettings {
  const stored = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
  const themeMode = stored.themeMode === 'light' || stored.themeMode === 'dark' || stored.themeMode === 'system'
    ? stored.themeMode
    : stored.darkMode === false
      ? 'light'
      : defaultSettings.themeMode;
  return {
    ...defaultSettings,
    ...stored,
    themeMode,
    darkMode: themeMode === 'dark',
    displayName: typeof stored.displayName === 'string' ? stored.displayName : '',
    preferredMarket: isPreferredMarket(stored.preferredMarket)
      ? stored.preferredMarket
      : defaultSettings.preferredMarket,
    onboardingRiskTolerance: isRiskTolerance(stored.onboardingRiskTolerance)
      ? stored.onboardingRiskTolerance
      : defaultSettings.onboardingRiskTolerance,
    preferredTradingStyle: isTradingStyle(stored.preferredTradingStyle)
      ? stored.preferredTradingStyle
      : defaultSettings.preferredTradingStyle,
    analysisDetail: isAnalysisDetail(stored.analysisDetail)
      ? stored.analysisDetail
      : defaultSettings.analysisDetail,
    maxDailyLossPercent: Number.isFinite(Number(stored.maxDailyLossPercent)) ? Number(stored.maxDailyLossPercent) : defaultSettings.maxDailyLossPercent,
    maxOpenRiskPercent: Number.isFinite(Number(stored.maxOpenRiskPercent)) ? Number(stored.maxOpenRiskPercent) : defaultSettings.maxOpenRiskPercent,
    maxTradesPerDay: Number.isFinite(Number(stored.maxTradesPerDay)) ? Number(stored.maxTradesPerDay) : defaultSettings.maxTradesPerDay,
    maxConsecutiveLosses: Number.isFinite(Number(stored.maxConsecutiveLosses)) ? Number(stored.maxConsecutiveLosses) : defaultSettings.maxConsecutiveLosses,
    // Older versions did not store this field. Do not treat the default
    // balance as user-confirmed unless the user explicitly saved it.
    balanceSet: typeof stored.balanceSet === 'boolean' ? stored.balanceSet : false,
  };
}

function migrateStrategy(value: unknown): SavedStrategy | null {
  if (!value || typeof value !== 'object') return null;
  const stored = value as Partial<SavedStrategy>;
  if (typeof stored.id !== 'string' || typeof stored.name !== 'string') return null;
  return {
    id: stored.id,
    name: stored.name,
    description: typeof stored.description === 'string' ? stored.description : '',
    level: stored.level === 'beginner' || stored.level === 'advanced' ? stored.level : null,
    rules: {
      entry: Array.isArray(stored.rules?.entry) ? stored.rules.entry : [],
      exit: Array.isArray(stored.rules?.exit) ? stored.rules.exit : [],
      risk: Array.isArray(stored.rules?.risk) ? stored.rules.risk : [],
    },
    bestPairs: Array.isArray(stored.bestPairs) ? stored.bestPairs : [],
    timeframe: typeof stored.timeframe === 'string' ? stored.timeframe : '',
    // Added after the first strategy schema; null is the safe legacy value.
    riskTolerance: typeof stored.riskTolerance === 'string' ? stored.riskTolerance : null,
    tradingStyle: typeof stored.tradingStyle === 'string' ? stored.tradingStyle : null,
    createdAt: typeof stored.createdAt === 'string' ? stored.createdAt : new Date().toISOString(),
  };
}

function migrateAnalyses(value: unknown): AnalysisResult[] {
  return Array.isArray(value) ? value.filter((item): item is AnalysisResult => (
    Boolean(item) && typeof item === 'object' && typeof (item as AnalysisResult).id === 'string'
  )) : [];
}

function migrateSavedBrief(value: unknown): SavedBrief | null {
  if (!value || typeof value !== 'object') return null;
  const stored = value as Partial<SavedBrief>;
  if (
    typeof stored.user_id !== 'string' ||
    typeof stored.brief_id !== 'string' ||
    typeof stored.card_id !== 'string' ||
    typeof stored.instrument !== 'string' ||
    typeof stored.headline !== 'string' ||
    typeof stored.summary !== 'string' ||
    typeof stored.created_at !== 'string'
  ) {
    return null;
  }
  return {
    user_id: stored.user_id,
    brief_id: stored.brief_id,
    card_id: stored.card_id,
    instrument: stored.instrument,
    headline: stored.headline,
    summary: stored.summary,
    created_at: stored.created_at,
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const AppContext = createContext<AppContextValue>({} as AppContextValue);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [savedAnalyses, setSavedAnalyses] = useState<AnalysisResult[]>([]);
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [riskActivity, setRiskActivity] = useState<DailyRiskActivity>(() => createDailyRiskActivity(getLocalRiskDateKey()));
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [billingStatusReady, setBillingStatusReady] = useState(!billingIsConfigured());
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [accountDataRevision, setAccountDataRevision] = useState(0);
  const [accountSyncStatus, setAccountSyncStatus] = useState<AppContextValue['accountSyncStatus']>('signed_out');
  const [pendingFeatureRoute, setPendingFeatureRoute] = useState<string | null>(null);
  const analysisAccessGrant = useRef(false);
  const accountSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const billingStatusPromise = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ob, sett, saved, strats, briefData, riskData, versionValue] = await Promise.all([
          AsyncStorage.getItem('onboardingComplete'),
          AsyncStorage.getItem('settings'),
          AsyncStorage.getItem('savedAnalyses'),
          AsyncStorage.getItem('savedStrategies'),
          AsyncStorage.getItem('savedBriefs'),
          AsyncStorage.getItem(RISK_ACTIVITY_KEY),
          AsyncStorage.getItem(DATA_VERSION_KEY),
        ]);

        const storedSettings = migrateSettings(parseJson(sett, {}));
        const storedAnalyses = migrateAnalyses(parseJson(saved, []));
        const storedStrategies = parseJson<unknown[]>(strats, [])
          .map(migrateStrategy)
          .filter((strategy): strategy is SavedStrategy => strategy !== null);
        const storedBriefs = parseJson<unknown[]>(briefData, [])
          .map(migrateSavedBrief)
          .filter((brief): brief is SavedBrief => brief !== null);
        const storedRiskActivity = normalizeDailyRiskActivity(
          parseJson<Partial<DailyRiskActivity> | null>(riskData, null),
          getLocalRiskDateKey(),
        );

        setOnboardingComplete(ob === 'true');
        setSettings(storedSettings);
        setHapticsEnabled(storedSettings.hapticsEnabled);
        setSavedAnalyses(storedAnalyses);
        setSavedStrategies(storedStrategies);
        setSavedBriefs(storedBriefs);
        setRiskActivity(storedRiskActivity);
        await AsyncStorage.setItem(RISK_ACTIVITY_KEY, JSON.stringify(storedRiskActivity));

        // A missing version means legacy data. Normalize it immediately so
        // future app updates always start from a known schema.
        const storedVersion = Number(versionValue || 0);
        if (storedVersion < APP_DATA_VERSION) {
          await AsyncStorage.multiSet([
            ['settings', JSON.stringify(storedSettings)],
            ['savedAnalyses', JSON.stringify(storedAnalyses)],
            ['savedStrategies', JSON.stringify(storedStrategies)],
            ['savedBriefs', JSON.stringify(storedBriefs)],
            [DATA_VERSION_KEY, String(APP_DATA_VERSION)],
          ]);
        }
      } catch (_) {}
      setIsLoading(false);
    };
    load();
  }, []);

  const completeOnboarding = async () => {
    setOnboardingComplete(true);
    await AsyncStorage.setItem('onboardingComplete', 'true');
  };

  const billingAvailable = billingIsConfigured();

  useEffect(() => {
    let cleanup: () => void = () => undefined;
    const statusPromise = configureBilling()
      .then((available) => available ? getPremiumStatus() : false)
      .catch((error: unknown) => {
        console.warn('[Billing] Could not load subscription status during startup.', error);
        return false;
      });
    billingStatusPromise.current = statusPromise;
    void statusPromise.then((active) => {
      setIsSubscribed(active);
      setBillingStatusReady(true);
      if (billingIsConfigured()) cleanup = addBillingListener(setIsSubscribed);
    });
    return () => cleanup();
  }, []);

  const buyPlan = async (plan: BillingPlan) => {
    const active = await purchasePlan(plan);
    setIsSubscribed(active);
    return active;
  };

  const restore = async () => {
    const active = await restorePurchases();
    setIsSubscribed(active);
    return active;
  };

  const checkFeatureAccess = useCallback(async (feature: ProtectedFeature, route: string, grantAnalysisRoute = false): Promise<FeatureAccessDecision & { error?: string }> => {
    if (isLoading) {
      return { allowed: false, requiresPaywall: false, error: 'Account access is still loading. Please try again.' };
    }

    const subscriptionActive = billingAvailable && !billingStatusReady
      ? await (billingStatusPromise.current ?? Promise.resolve(false))
      : isSubscribed;
    let analysisAccess: ServerAnalysisAccess | null = null;
    let accessCheckError: unknown;
    if (!subscriptionActive && (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP')) {
      try {
        analysisAccess = await getServerAnalysisAccess();
      } catch (error) {
        accessCheckError = error;
      }
    }

    if (!analysisAccess && !subscriptionActive && (feature === 'AI_ANALYSIS' || feature === 'TRADE_SETUP')) {
      console.warn(
        '[ACCESS] Free-analysis access response unavailable; allowing analysis entry for backend enforcement.',
        accessCheckError ?? 'The response was unavailable or invalid.'
      );
    }

    if (analysisAccess && isFreeAnalysisExhausted(
      analysisAccess.freeAnalysesUsed,
      analysisAccess.freeAnalysisLimit,
      subscriptionActive,
    )) {
      setPendingFeatureRoute(route);
      const openPaywall = () => router.replace({
        pathname: '/paywall',
        params: { source: 'analysis-limit', used: String(analysisAccess.freeAnalysesUsed), limit: String(analysisAccess.freeAnalysisLimit) },
      });
      const message = 'Subscribe to unlock unlimited analysis.';
      if (Platform.OS === 'web') {
        globalThis.alert(`You have used your free analysis. ${message}`);
        openPaywall();
      } else {
        Alert.alert('You have used your free analysis', message, [{ text: 'Continue', onPress: openPaywall }]);
      }
      return { allowed: false, requiresPaywall: true };
    }

    if (analysisAccess?.analysisInProgress) {
      return {
        allowed: false,
        requiresPaywall: false,
        error: 'Your free analysis is already running. Please wait for it to finish.',
      };
    }

    const decision = getFeatureAccessDecision(feature, subscriptionActive);
    if (grantAnalysisRoute && decision.allowed && route === '/analysis') {
      analysisAccessGrant.current = true;
    }
    console.log(`[ACCESS] Feature: ${feature}`);
    console.log(`[ACCESS] Subscription status: ${subscriptionActive}`);
    console.log(`[ACCESS] Result: ${decision.allowed ? 'ALLOWED' : 'PAYWALL'}`);
    console.log(`[ACCESS] Navigation: ${decision.allowed ? route : '/paywall'}`);

    if (decision.requiresPaywall) {
      setPendingFeatureRoute(route);
      router.replace('/paywall');
    }
    return decision;
  }, [billingAvailable, billingStatusReady, isLoading, isSubscribed]);

  const consumeAnalysisAccessGrant = useCallback(() => {
    const granted = analysisAccessGrant.current;
    analysisAccessGrant.current = false;
    return granted;
  }, []);

  const consumePendingFeatureRoute = () => {
    const queuedRoute = pendingFeatureRoute;
    setPendingFeatureRoute(null);
    return queuedRoute;
  };

  const clearPendingFeatureRoute = () => {
    setPendingFeatureRoute(null);
  };

  const updateSettings = async (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    setHapticsEnabled(updated.hapticsEnabled);
    await AsyncStorage.setItem('settings', JSON.stringify(updated));
  };

  const saveAnalysis = async (analysis: AnalysisResult) => {
    const updated = [analysis, ...savedAnalyses];
    setSavedAnalyses(updated);
    await AsyncStorage.setItem('savedAnalyses', JSON.stringify(updated));
  };

  const deleteAnalysis = async (id: string) => {
    const updated = savedAnalyses.filter((a) => a.id !== id);
    setSavedAnalyses(updated);
    await AsyncStorage.setItem('savedAnalyses', JSON.stringify(updated));
  };

  const saveStrategy = async (strategy: SavedStrategy) => {
    const updated = [strategy, ...savedStrategies];
    setSavedStrategies(updated);
    await AsyncStorage.setItem('savedStrategies', JSON.stringify(updated));
  };

  const deleteStrategy = async (id: string) => {
    const updated = savedStrategies.filter((s) => s.id !== id);
    setSavedStrategies(updated);
    await AsyncStorage.setItem('savedStrategies', JSON.stringify(updated));
  };

  const saveBriefCard = async (brief: SavedBrief) => {
    const updated = [brief, ...savedBriefs.filter((item) => !(item.brief_id === brief.brief_id && item.card_id === brief.card_id))];
    setSavedBriefs(updated);
    await AsyncStorage.setItem('savedBriefs', JSON.stringify(updated));
  };

  const deleteBriefCard = async (briefId: string, cardId: string) => {
    const updated = savedBriefs.filter((item) => !(item.brief_id === briefId && item.card_id === cardId));
    setSavedBriefs(updated);
    await AsyncStorage.setItem('savedBriefs', JSON.stringify(updated));
  };

  const recordOpenRiskPosition = async (position: OpenRiskPosition) => {
    const current = normalizeDailyRiskActivity(riskActivity, getLocalRiskDateKey());
    const updated: DailyRiskActivity = {
      ...current,
      tradesToday: current.tradesToday + 1,
      openPositions: [position, ...current.openPositions.filter((item) => item.id !== position.id)],
    };
    setRiskActivity(updated);
    await AsyncStorage.setItem(RISK_ACTIVITY_KEY, JSON.stringify(updated));
  };

  const closeRiskPosition = async (positionId: string, realizedPnl: number) => {
    const current = normalizeDailyRiskActivity(riskActivity, getLocalRiskDateKey());
    if (!current.openPositions.some((position) => position.id === positionId)) return;
    const updated: DailyRiskActivity = {
      ...current,
      dailyNetPnl: current.dailyNetPnl + realizedPnl,
      consecutiveLosses: realizedPnl < 0 ? current.consecutiveLosses + 1 : realizedPnl > 0 ? 0 : current.consecutiveLosses,
      openPositions: current.openPositions.filter((position) => position.id !== positionId),
    };
    setRiskActivity(updated);
    await AsyncStorage.setItem(RISK_ACTIVITY_KEY, JSON.stringify(updated));
  };

  const exportData = async (): Promise<string> => {
    const localPreferenceEntries = await AsyncStorage.multiGet(SYNCED_LOCAL_PREFERENCE_KEYS);
    const localPreferences = Object.fromEntries(localPreferenceEntries.filter(([key, value]) => (
      key !== 'fxsnap:profilePhoto:v1' || value?.startsWith('data:image/')
    )));
    const backup: AppBackup = {
      backupVersion: BACKUP_VERSION,
      appDataVersion: APP_DATA_VERSION,
      exportedAt: new Date().toISOString(),
      onboardingComplete,
      // Subscription state is provider-authoritative and intentionally omitted.
      settings,
      savedAnalyses,
      savedStrategies,
      savedBriefs,
      riskActivity,
      localPreferences,
    };
    return JSON.stringify(backup, null, 2);
  };

  const importData = async (backupJson: string): Promise<void> => {
    const backup = JSON.parse(backupJson) as Partial<AppBackup>;
    if (!backup || backup.backupVersion !== BACKUP_VERSION) {
      throw new Error('Unsupported or invalid FXSnap backup.');
    }

    const importedSettings = migrateSettings(backup.settings);
    const importedAnalyses = migrateAnalyses(backup.savedAnalyses);
    const importedStrategies = (Array.isArray(backup.savedStrategies) ? backup.savedStrategies : [])
      .map(migrateStrategy)
      .filter((strategy): strategy is SavedStrategy => strategy !== null);
    const importedBriefs = (Array.isArray(backup.savedBriefs) ? backup.savedBriefs : [])
      .map(migrateSavedBrief)
      .filter((brief): brief is SavedBrief => brief !== null);
    const importedOnboarding = backup.onboardingComplete === true;
    const preferenceEntries = Object.entries(backup.localPreferences || {})
      .filter(([key, value]) => SYNCED_LOCAL_PREFERENCE_KEYS.includes(key) && typeof value === 'string')
      .map(([key, value]) => [key, value as string] as [string, string]);
    const removedPreferences = Object.entries(backup.localPreferences || {})
      .filter(([key, value]) => SYNCED_LOCAL_PREFERENCE_KEYS.includes(key) && value === null)
      .map(([key]) => key);
    await AsyncStorage.multiSet([
      ['onboardingComplete', String(importedOnboarding)],
      ['settings', JSON.stringify(importedSettings)],
      ['savedAnalyses', JSON.stringify(importedAnalyses)],
      ['savedStrategies', JSON.stringify(importedStrategies)],
      ['savedBriefs', JSON.stringify(importedBriefs)],
      [RISK_ACTIVITY_KEY, JSON.stringify(normalizeDailyRiskActivity(backup.riskActivity || null, getLocalRiskDateKey()))],
      [DATA_VERSION_KEY, String(APP_DATA_VERSION)],
      ...preferenceEntries,
    ]);
    if (removedPreferences.length > 0) await AsyncStorage.multiRemove(removedPreferences);
    setOnboardingComplete(importedOnboarding);
    setSettings(importedSettings);
    setSavedAnalyses(importedAnalyses);
    setSavedStrategies(importedStrategies);
    setSavedBriefs(importedBriefs);
    setRiskActivity(normalizeDailyRiskActivity(backup.riskActivity || null, getLocalRiskDateKey()));
  };

  const syncAccountData = async () => {
    if (Platform.OS === 'web') throw new Error('Account data sync is available in the FXSnap mobile app.');
    setAccountSyncStatus('syncing');
    try {
      const cloudData = await getFxsnapAccountData();
      if (cloudData) {
        await importData(JSON.stringify(cloudData));
      } else {
        const initialData = JSON.parse(await exportData()) as Record<string, unknown>;
        await saveFxsnapAccountData(initialData);
      }
      setCloudSyncEnabled(true);
      setAccountSyncStatus('synced');
    } catch (error) {
      setAccountSyncStatus('error');
      throw error;
    }
  };

  const stopAccountDataSync = () => {
    setCloudSyncEnabled(false);
    setAccountSyncStatus('signed_out');
  };

  useEffect(() => {
    if (isLoading || Platform.OS === 'web') return;
    let active = true;
    void getAuthenticatedAccount()
      .then(async (account) => {
        if (!active) return;
        if (!account) {
          setAccountSyncStatus('signed_out');
          return null;
        }
        const cloudData = await getFxsnapAccountData();
        if (cloudData) await importData(JSON.stringify(cloudData));
        setCloudSyncEnabled(true);
        setAccountSyncStatus('synced');
        return cloudData;
      })
      .catch(() => {
        if (active) setAccountSyncStatus('error');
      });
    return () => { active = false; };
  }, [isLoading]);

  useEffect(() => {
    return subscribeToAccountDataChanges(() => setAccountDataRevision((revision) => revision + 1));
  }, []);

  useEffect(() => {
    if (!cloudSyncEnabled || isLoading) return;
    const timeout = setTimeout(() => {
      setAccountSyncStatus('syncing');
      void exportData()
        .then((backup) => {
          const data = JSON.parse(backup) as Record<string, unknown>;
          accountSyncQueue.current = accountSyncQueue.current
            .catch(() => undefined)
            .then(() => saveFxsnapAccountData(data));
          return accountSyncQueue.current;
        })
        .then(() => setAccountSyncStatus('synced'))
        .catch((error: unknown) => {
          console.error('[Account] FXSnap data sync failed.', error instanceof Error ? error.message : 'Unknown error');
          setAccountSyncStatus('error');
        });
    }, 900);
    return () => clearTimeout(timeout);
  }, [
    cloudSyncEnabled,
    isLoading,
    onboardingComplete,
    settings,
    savedAnalyses,
    savedStrategies,
    savedBriefs,
    riskActivity,
    accountDataRevision,
  ]);

  const deleteAccount = async () => {
    setCloudSyncEnabled(false);
    setAccountSyncStatus('signed_out');
    await AsyncStorage.multiRemove([
      'onboardingComplete',
      'settings',
      'savedAnalyses',
      'savedStrategies',
      'savedBriefs',
      RISK_ACTIVITY_KEY,
      'fxsnap:dailyBrief:assignments:v1',
      'fxsnap:dailyBrief:reads:v1',
      'fxsnap:learningHub:v1',
      DATA_VERSION_KEY,
    ]);
    setOnboardingComplete(false);
    setIsSubscribed(false);
    setSettings(defaultSettings);
    setHapticsEnabled(defaultSettings.hapticsEnabled);
    setSavedAnalyses([]);
    setSavedStrategies([]);
    setSavedBriefs([]);
    setRiskActivity(createDailyRiskActivity(getLocalRiskDateKey()));
    setCurrentAnalysis(null);
  };

  return (
    <AppContext.Provider
      value={{
        onboardingComplete,
        isSubscribed,
        settings,
        savedAnalyses,
        savedStrategies,
        savedBriefs,
        riskActivity,
        currentAnalysis,
        isLoading,
        completeOnboarding,
        billingAvailable,
        pendingFeatureRoute,
        checkFeatureAccess,
        consumeAnalysisAccessGrant,
        consumePendingFeatureRoute,
        clearPendingFeatureRoute,
        purchasePlan: buyPlan,
        restorePurchases: restore,
        updateSettings,
        saveAnalysis,
        deleteAnalysis,
        setCurrentAnalysis,
        saveStrategy,
        deleteStrategy,
        saveBriefCard,
        deleteBriefCard,
        recordOpenRiskPosition,
        closeRiskPosition,
        exportData,
        importData,
        deleteAccount,
        syncAccountData,
        stopAccountDataSync,
        accountSyncStatus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
