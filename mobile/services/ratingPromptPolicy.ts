export type RatingPromptState = {
  successfulAnalyses: number;
  promptCount: number;
  lastPromptAt: string | null;
  completed: boolean;
  pending: boolean;
};

export const INITIAL_RATING_PROMPT_STATE: RatingPromptState = {
  successfulAnalyses: 0,
  promptCount: 0,
  lastPromptAt: null,
  completed: false,
  pending: false,
};

export const RATING_PROMPT_ANALYSIS_THRESHOLD = 3;
export const RATING_PROMPT_MAX_COUNT = 2;
export const RATING_PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export function recordSuccessfulAnalysis(state: RatingPromptState, now: Date) {
  const successfulAnalyses = state.successfulAnalyses + 1;
  const lastPromptTime = state.lastPromptAt ? Date.parse(state.lastPromptAt) : Number.NEGATIVE_INFINITY;
  const cooldownExpired = now.getTime() - lastPromptTime >= RATING_PROMPT_COOLDOWN_MS;
  const shouldPrompt = !state.completed
    && successfulAnalyses >= RATING_PROMPT_ANALYSIS_THRESHOLD
    && state.promptCount < RATING_PROMPT_MAX_COUNT
    && cooldownExpired;

  return {
    shouldPrompt,
    state: {
      ...state,
      successfulAnalyses,
      promptCount: shouldPrompt ? state.promptCount + 1 : state.promptCount,
      lastPromptAt: shouldPrompt ? now.toISOString() : state.lastPromptAt,
      pending: shouldPrompt,
    },
  };
}
