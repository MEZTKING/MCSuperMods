/**
 * The default run limits in Settings, Advanced (ADR 0125 D10, ADR 0041 D7): a pure model with
 * plain labels, the bounds main stores them in and the most a stopped run can have cost by the
 * price table.
 *
 * @packageDocumentation
 */

import {
  type AiMode,
  type AiModelId,
  type AiRunLimits,
  type AiSettings,
  type AiUsage,
  estimateCost,
  formatCost,
  modelInfo,
  PROMPT_PREFIX_TOKENS,
} from '@msm/ai';

/**
 * The bounds of the two numbers: main keeps stored limits within these (`AI_TOOL_TURNS_RANGE`
 * and `AI_OUTPUT_TOKENS_RANGE` in `main/platform/settings.ts`), which lie inside the protocol's
 * `aiRunLimitsSchema`; the panel's Run limits use the same.
 */
export const LIMIT_RANGES = Object.freeze({
  steps: Object.freeze({ min: 1, max: 1000 }),
  tokens: Object.freeze({ min: 1000, max: 5_000_000 }),
});

/** Which number of a run size's limits. */
export type LimitField = keyof typeof LIMIT_RANGES;

/** The words around one number: "<before> [24] <after>"; the field is named by `before`. */
export interface LimitLabel {
  before: string;
  after: string;
}

/** The labels of each size's two numbers and its pacing switch (ADR 0125 plan, B687). */
export const LIMIT_LABELS: Readonly<
  Record<AiMode, { steps: LimitLabel; tokens: LimitLabel; pace: string }>
> = Object.freeze({
  chat: {
    steps: {
      before: 'Stop a small ask after',
      after: 'steps',
    },
    tokens: {
      before: 'and after about',
      after: 'tokens written',
    },
    pace: 'Let the helper pace a small ask to its tokens',
  },
  build: {
    steps: {
      before: 'Stop a whole build after',
      after: 'steps',
    },
    tokens: {
      before: 'and after about',
      after: 'tokens written',
    },
    pace: 'Let the helper pace a whole build to its tokens',
  },
});

/** The section's heading and the line under it. */
export const LIMITS_HEADING = 'Default limits';
export const LIMITS_INTRO =
  'The helper pauses when it reaches one of these, so the cost stays small; Keep going carries on from there. ' +
  "The panel's Run limits change one run only.";

/** A number kept within its field's bounds (whole numbers). */
export function clampLimit(field: LimitField, value: number): number {
  const { min, max } = LIMIT_RANGES[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** The settings with one number of one size changed (clamped). */
export function withLimit(
  settings: AiSettings,
  size: AiMode,
  field: LimitField,
  value: number,
): AiSettings {
  const key = field === 'steps' ? 'maxToolTurns' : 'maxOutputTokens';
  return {
    ...settings,
    limits: {
      ...settings.limits,
      [size]: { ...settings.limits[size], [key]: clampLimit(field, value) },
    },
  };
}

/** The settings with one size's pacing switch changed. */
export function withPacing(settings: AiSettings, size: AiMode, taskBudget: boolean): AiSettings {
  return {
    ...settings,
    limits: { ...settings.limits, [size]: { ...settings.limits[size], taskBudget } },
  };
}

/**
 * How much of the conversation the tools' answers add for each token the helper writes. An
 * assumption for the worst case, not a measurement (verify at implementation against real runs).
 */
export const TOOL_ANSWER_TOKENS_PER_OUTPUT = 1;

/**
 * The usage of a run that used up both of its limits, as an estimate: one request per step and
 * one to finish; the fixed part written once to the one-hour cache and read by every later
 * request; every token written, and as much again of tool answers, written once to the
 * five-minute cache and read by every later request (half of it on average over the run).
 */
export function worstCaseUsage(
  limits: Pick<AiRunLimits, 'maxToolTurns' | 'maxOutputTokens'>,
  prefixTokens: number = PROMPT_PREFIX_TOKENS,
): AiUsage {
  const requests = limits.maxToolTurns + 1;
  const output = limits.maxOutputTokens;
  const history = output * (1 + TOOL_ANSWER_TOKENS_PER_OUTPUT);
  return {
    inputTokens: 0,
    outputTokens: output,
    cacheCreationInputTokens: prefixTokens + history,
    cacheCreation1hInputTokens: prefixTokens,
    cacheReadInputTokens: Math.round((requests - 1) * prefixTokens + (requests * history) / 2),
    requests,
  };
}

/** The most a run of these limits can have cost when it stops, in USD (an estimate). */
export function worstCaseCost(
  model: AiModelId,
  limits: Pick<AiRunLimits, 'maxToolTurns' | 'maxOutputTokens'>,
): number {
  return estimateCost(model, worstCaseUsage(limits));
}

/** "A small ask stopped at these limits has cost at most about $3.90 with Claude Opus 5.5." */
export function worstCaseSentence(
  model: AiModelId,
  size: AiMode,
  limits: Pick<AiRunLimits, 'maxToolTurns' | 'maxOutputTokens'>,
): string {
  const what = size === 'chat' ? 'A small ask' : 'A whole build';
  return `${what} stopped at these limits has cost at most ${formatCost(worstCaseCost(model, limits))} with ${modelInfo(model).label} (an estimate).`;
}
