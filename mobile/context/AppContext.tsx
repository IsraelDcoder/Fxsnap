import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBillingListener, billingIsConfigured, configureBilling, getPremiumStatus, purchasePlan, restorePurchases, type BillingPlan } from '@/services/billing';
import { setHapticsEnabled } from '@/services/haptics';

export const APP_DATA_VERSION = 2;
const DATA_VERSION_KEY = 'fxsnap:dataVersion';
const BACKUP_VERSION = 1;

export type AnalysisStatus = 'success' | 'no_trade' | 'invalid_image' | 'ai_unavailable' | 'ai_invalid_response';

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
  tradeStatus?: string;
  setupStatus?: string;
  setupConfidence?: number;
  setupQuality?: number;
  entryQuality?: number;
  shortTermMomentum?: string;
  priceLocation?: string;
  decision?: string;
  tradeTrigger?: string;
  whyNotNow?: string[];
  dataLimitations?: string[];
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

export interface AppSettings {
  accountBalance: number;
  balanceSet: boolean;
  riskPercent: number;
  hapticsEnabled: boolean;
  darkMode: boolean;
}

interface AppContextValue {
  onboardingComplete: boolean;
  isSubscribed: boolean;
  settings: AppSettings;
  savedAnalyses: AnalysisResult[];
  savedStrategies: SavedStrategy[];
  currentAnalysis: AnalysisResult | null;
  isLoading: boolean;
  completeOnboarding: () => void;
  billingAvailable: boolean;
  purchasePlan: (plan: BillingPlan) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  updateSettings: (s: Partial<AppSettings>) => void;
  saveAnalysis: (a: AnalysisResult) => void;
  deleteAnalysis: (id: string) => void;
  setCurrentAnalysis: (a: AnalysisResult | null) => void;
  saveStrategy: (s: SavedStrategy) => Promise<void>;
  deleteStrategy: (id: string) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (backupJson: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  accountBalance: 1000,
  balanceSet: false,
  riskPercent: 1,
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
}

function migrateSettings(value: unknown): AppSettings {
  const stored = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
  return {
    ...defaultSettings,
    ...stored,
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
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ob, sett, saved, strats, versionValue] = await Promise.all([
          AsyncStorage.getItem('onboardingComplete'),
          AsyncStorage.getItem('settings'),
          AsyncStorage.getItem('savedAnalyses'),
          AsyncStorage.getItem('savedStrategies'),
          AsyncStorage.getItem(DATA_VERSION_KEY),
        ]);

        const storedSettings = migrateSettings(parseJson(sett, {}));
        const storedAnalyses = migrateAnalyses(parseJson(saved, []));
        const storedStrategies = parseJson<unknown[]>(strats, [])
          .map(migrateStrategy)
          .filter((strategy): strategy is SavedStrategy => strategy !== null);

        setOnboardingComplete(ob === 'true');
        if (await configureBilling()) setIsSubscribed(await getPremiumStatus());
        setSettings(storedSettings);
        setHapticsEnabled(storedSettings.hapticsEnabled);
        setSavedAnalyses(storedAnalyses);
        setSavedStrategies(storedStrategies);

        // A missing version means legacy data. Normalize it immediately so
        // future app updates always start from a known schema.
        const storedVersion = Number(versionValue || 0);
        if (storedVersion < APP_DATA_VERSION) {
          await AsyncStorage.multiSet([
            ['settings', JSON.stringify(storedSettings)],
            ['savedAnalyses', JSON.stringify(storedAnalyses)],
            ['savedStrategies', JSON.stringify(storedStrategies)],
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
    const importedOnboarding = backup.onboardingComplete === true;
    await AsyncStorage.multiSet([
      ['onboardingComplete', String(importedOnboarding)],
      ['settings', JSON.stringify(importedSettings)],
      ['savedAnalyses', JSON.stringify(importedAnalyses)],
      ['savedStrategies', JSON.stringify(importedStrategies)],
      [DATA_VERSION_KEY, String(APP_DATA_VERSION)],
    ]);
    setOnboardingComplete(importedOnboarding);
    setSettings(importedSettings);
    setSavedAnalyses(importedAnalyses);
    setSavedStrategies(importedStrategies);
  };

  const deleteAccount = async () => {
    await AsyncStorage.multiRemove([
      'onboardingComplete',
      'settings',
      'savedAnalyses',
      'savedStrategies',
      DATA_VERSION_KEY,
    ]);
    setOnboardingComplete(false);
    setIsSubscribed(false);
    setSettings(defaultSettings);
    setHapticsEnabled(defaultSettings.hapticsEnabled);
    setSavedAnalyses([]);
    setSavedStrategies([]);
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
        currentAnalysis,
        isLoading,
        completeOnboarding,
        billingAvailable,
        purchasePlan: buyPlan,
        restorePurchases: restore,
        updateSettings,
        saveAnalysis,
        deleteAnalysis,
        setCurrentAnalysis,
        saveStrategy,
        deleteStrategy,
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
