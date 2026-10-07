import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_RATING_PROMPT_STATE,
  RATING_PROMPT_COOLDOWN_MS,
  recordSuccessfulAnalysis,
} from '../services/ratingPromptPolicy';

const firstPromptAt = new Date('2026-10-07T12:00:00.000Z');

test('the prompt is queued after three successful analyses, not before', () => {
  const first = recordSuccessfulAnalysis(INITIAL_RATING_PROMPT_STATE, firstPromptAt);
  const second = recordSuccessfulAnalysis(first.state, firstPromptAt);
  const third = recordSuccessfulAnalysis(second.state, firstPromptAt);

  assert.equal(first.shouldPrompt, false);
  assert.equal(second.shouldPrompt, false);
  assert.equal(third.shouldPrompt, true);
  assert.equal(third.state.promptCount, 1);
});

test('dismissed prompts wait 90 days and are capped at two total', () => {
  const firstPrompt = recordSuccessfulAnalysis({
    ...INITIAL_RATING_PROMPT_STATE,
    successfulAnalyses: 2,
  }, firstPromptAt);
  const beforeCooldown = recordSuccessfulAnalysis(firstPrompt.state, new Date(firstPromptAt.getTime() + RATING_PROMPT_COOLDOWN_MS - 1));
  const afterCooldown = recordSuccessfulAnalysis(beforeCooldown.state, new Date(firstPromptAt.getTime() + RATING_PROMPT_COOLDOWN_MS));
  const afterSecondDismissal = recordSuccessfulAnalysis(afterCooldown.state, new Date(firstPromptAt.getTime() + 2 * RATING_PROMPT_COOLDOWN_MS));

  assert.equal(firstPrompt.shouldPrompt, true);
  assert.equal(beforeCooldown.shouldPrompt, false);
  assert.equal(afterCooldown.shouldPrompt, true);
  assert.equal(afterSecondDismissal.shouldPrompt, false);
});

test('a completed review request permanently disables prompts', () => {
  const result = recordSuccessfulAnalysis({
    ...INITIAL_RATING_PROMPT_STATE,
    successfulAnalyses: 2,
    completed: true,
  }, firstPromptAt);
  assert.equal(result.shouldPrompt, false);
});

