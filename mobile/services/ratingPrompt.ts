import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INITIAL_RATING_PROMPT_STATE,
  recordSuccessfulAnalysis,
  type RatingPromptState,
} from './ratingPromptPolicy';

const RATING_STATE_KEY = 'fxsnap:ratingPrompt:v1';
export const GOOGLE_PLAY_RATING_URL = 'https://play.google.com/store/apps/details?id=com.fxsnap.mobile';

async function getState(): Promise<RatingPromptState> {
  const stored = await AsyncStorage.getItem(RATING_STATE_KEY);
  if (!stored) return INITIAL_RATING_PROMPT_STATE;
  try {
    const value = JSON.parse(stored) as Partial<RatingPromptState>;
    return {
      successfulAnalyses: Number.isInteger(value.successfulAnalyses) ? Math.max(0, value.successfulAnalyses as number) : 0,
      promptCount: Number.isInteger(value.promptCount) ? Math.max(0, value.promptCount as number) : 0,
      lastPromptAt: typeof value.lastPromptAt === 'string' ? value.lastPromptAt : null,
      completed: value.completed === true,
      pending: value.pending === true,
    };
  } catch {
    return INITIAL_RATING_PROMPT_STATE;
  }
}

export async function recordRatingEligibleAnalysis() {
  try {
    const result = recordSuccessfulAnalysis(await getState(), new Date());
    await AsyncStorage.setItem(RATING_STATE_KEY, JSON.stringify(result.state));
    return result.shouldPrompt;
  } catch {
    return false;
  }
}

export async function consumeRatingPrompt() {
  try {
    const state = await getState();
    if (!state.pending) return false;
    await AsyncStorage.setItem(RATING_STATE_KEY, JSON.stringify({ ...state, pending: false }));
    return true;
  } catch {
    return false;
  }
}

export async function completeRatingPrompt() {
  try {
    const state = await getState();
    await AsyncStorage.setItem(RATING_STATE_KEY, JSON.stringify({ ...state, pending: false, completed: true }));
  } catch {
    return;
  }
}
