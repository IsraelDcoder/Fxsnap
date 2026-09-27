import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { addBillingListener, billingIsConfigured, configureBilling, getPremiumStatus, purchasePlan, restorePurchases, type BillingPlan } from '@/services/billing';
import { setHapticsEnabled } from '@/services/haptics';
import { createDailyRiskActivity, getLocalRiskDateKey, normalizeDailyRiskActivity, type DailyRiskActivity, type OpenRiskPosition } from '@/services/risk';

export const APP_DATA_VERSION = 3;
const DATA_VERSION_KEY = 'fxsnap:dataVersion';
const BACKUP_VERSION = 1;
const RISK_ACTIVITY_KEY = 'fxsnap:riskActivity';

export type AnalysisStatus = 'success' | 'no_trade' | 'invalid_image' | 'ai_unavailable' | 'ai_invalid_response' | 'free_analysis_used' | 'free_access_unavailable';

export interface AnalysisResult {
  id: string;
  pair: string;
  status?: AnalysisStatus;
  direction?: 'BUY' | 'SELL';
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
    volume: 'low' | 'moderate' | 'high' | 'not_visible';
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
  checkFeatureAccess: (route: string) => boolean;
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
}

const defaultSettings: AppSettings = {
  displayName: '',
  accountBalance: 1000,
  balanceSet: false,
  riskPercent: 1,
  maxDailyLossPercent: 3,
  maxOpenRiskPercent: 3,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 3,
  hapticsEnabled: true,
  darkMode: true,
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
}

function migrateSettings(value: unknown): AppSettings {
  const stored = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
  return {
    ...defaultSettings,
    ...stored,
    displayName: typeof stored.displayName === 'string' ? stored.displayName : '',
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
  const [pendingFeatureRoute, setPendingFeatureRoute] = useState<string | null>(null);

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
        if (await configureBilling()) setIsSubscribed(await getPremiumStatus());
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
    void configureBilling().then(async (available) => {
      if (!available) return;
      setIsSubscribed(await getPremiumStatus());
      cleanup = addBillingListener(setIsSubscribed);
    }).catch(() => setIsSubscribed(false));
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

  const checkFeatureAccess = (route: string): boolean => {
    if (isSubscribed) {
      console.log('[PREMIUM GATE] Access granted', { route, isSubscribed });
      return true;
    }

    console.log('[PREMIUM GATE] Access blocked; sending to paywall', { route, isSubscribed });
    setPendingFeatureRoute(route);
    router.replace('/paywall');
    return false;
  };

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
    await AsyncStorage.multiSet([
      ['onboardingComplete', String(importedOnboarding)],
      ['settings', JSON.stringify(importedSettings)],
      ['savedAnalyses', JSON.stringify(importedAnalyses)],
      ['savedStrategies', JSON.stringify(importedStrategies)],
      ['savedBriefs', JSON.stringify(importedBriefs)],
      [RISK_ACTIVITY_KEY, JSON.stringify(normalizeDailyRiskActivity(backup.riskActivity || null, getLocalRiskDateKey()))],
      [DATA_VERSION_KEY, String(APP_DATA_VERSION)],
    ]);
    setOnboardingComplete(importedOnboarding);
    setSettings(importedSettings);
    setSavedAnalyses(importedAnalyses);
    setSavedStrategies(importedStrategies);
    setSavedBriefs(importedBriefs);
    setRiskActivity(normalizeDailyRiskActivity(backup.riskActivity || null, getLocalRiskDateKey()));
  };

  const deleteAccount = async () => {
    await AsyncStorage.multiRemove([
      'onboardingComplete',
      'settings',
      'savedAnalyses',
      'savedStrategies',
      'savedBriefs',
      RISK_ACTIVITY_KEY,
      'fxsnap:dailyBrief:assignments:v1',
      'fxsnap:dailyBrief:reads:v1',
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
