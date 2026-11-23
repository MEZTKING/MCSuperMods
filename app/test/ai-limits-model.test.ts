import {
  AI_MODELS,
  aiRunLimitsSchema,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  estimateCost,
  formatCost,
  PROMPT_PREFIX_TOKENS,
} from '@msm/ai';
import { describe, expect, it } from 'vitest';
import { AI_OUTPUT_TOKENS_RANGE, AI_TOOL_TURNS_RANGE } from '../src/main/platform/settings';
import {
  clampLimit,
  LIMIT_LABELS,
  LIMIT_RANGES,
  LIMITS_INTRO,
  withLimit,
  withPacing,
  worstCaseCost,
  worstCaseSentence,
  worstCaseUsage,
} from '../src/renderer/src/components/ai/ai-limits-model';

describe('ai-limits-model (ADR 0125 D10)', () => {
  it('keeps the bounds main stores, inside the protocol', () => {
    expect([LIMIT_RANGES.steps.min, LIMIT_RANGES.steps.max]).toEqual([...AI_TOOL_TURNS_RANGE]);
    expect([LIMIT_RANGES.tokens.min, LIMIT_RANGES.tokens.max]).toEqual([...AI_OUTPUT_TOKENS_RANGE]);
    for (const steps of [LIMIT_RANGES.steps.min, LIMIT_RANGES.steps.max]) {
      for (const tokens of [LIMIT_RANGES.tokens.min, LIMIT_RANGES.tokens.max]) {
        expect(
          aiRunLimitsSchema.safeParse({
            maxToolTurns: steps,
            maxOutputTokens: tokens,
            taskBudget: true,
          }).success,
        ).toBe(true);
      }
    }
  });

  it('clamps and rounds', () => {
    expect(clampLimit('steps', 0)).toBe(1);
    expect(clampLimit('steps', 2000)).toBe(1000);
    expect(clampLimit('steps', 12.6)).toBe(13);
    expect(clampLimit('steps', Number.NaN)).toBe(1);
    expect(clampLimit('tokens', 10)).toBe(1000);
    expect(clampLimit('tokens', 99_000_000)).toBe(5_000_000);
  });

  it('changes one number or switch of one size and nothing else', () => {
    const next = withLimit(DEFAULT_AI_SETTINGS, 'build', 'steps', 5000);
    expect(next.limits.build).toEqual({ ...DEFAULT_LIMITS.build, maxToolTurns: 1000 });
    expect(next.limits.chat).toEqual(DEFAULT_LIMITS.chat);
    expect(next.model).toBe(DEFAULT_AI_SETTINGS.model);
    const tokens = withLimit(DEFAULT_AI_SETTINGS, 'chat', 'tokens', 50_000);
    expect(tokens.limits.chat.maxOutputTokens).toBe(50_000);
    expect(withPacing(DEFAULT_AI_SETTINGS, 'chat', false).limits.chat.taskBudget).toBe(false);
    // The defaults are not changed in place.
    expect(DEFAULT_AI_SETTINGS.limits.build.maxToolTurns).toBe(DEFAULT_LIMITS.build.maxToolTurns);
  });

  it('labels each size in plain words', () => {
    expect(LIMIT_LABELS.chat.steps).toEqual({ before: 'Stop a small ask after', after: 'steps' });
    expect(LIMIT_LABELS.build.steps).toEqual({
      before: 'Stop a whole build after',
      after: 'steps',
    });
    expect(LIMIT_LABELS.chat.tokens).toEqual({
      before: 'and after about',
      after: 'tokens written',
    });
    expect(LIMIT_LABELS.build.tokens).toEqual(LIMIT_LABELS.chat.tokens);
    expect(LIMITS_INTRO).toContain('Keep going');
    expect(LIMITS_INTRO).not.toMatch(/Settings, AI helper/);
  });

  it('works out the worst case of a stopped run from the price table', () => {
    const limits = { maxToolTurns: 10, maxOutputTokens: 20_000 };
    const usage = worstCaseUsage(limits, 1000);
    expect(usage).toEqual({
      inputTokens: 0,
      outputTokens: 20_000,
      cacheCreationInputTokens: 1000 + 40_000,
      cacheCreation1hInputTokens: 1000,
      cacheReadInputTokens: 10 * 1000 + (11 * 40_000) / 2,
      requests: 11,
    });
    for (const model of AI_MODELS) {
      for (const size of ['chat', 'build'] as const) {
        const cost = worstCaseCost(model.id, DEFAULT_LIMITS[size]);
        expect(cost).toBeCloseTo(estimateCost(model.id, worstCaseUsage(DEFAULT_LIMITS[size])), 10);
        // At least the output alone at the output price, never less.
        expect(cost).toBeGreaterThan(
          (DEFAULT_LIMITS[size].maxOutputTokens * model.pricing.outputPerMTok) / 1_000_000,
        );
        expect(worstCaseSentence(model.id, size, DEFAULT_LIMITS[size])).toBe(
          `${size === 'chat' ? 'A small ask' : 'A whole build'} stopped at these limits has cost at most ${formatCost(cost)} with ${model.label} (an estimate).`,
        );
      }
      // More steps or tokens never cost less.
      expect(
        worstCaseCost(model.id, { maxToolTurns: 50, maxOutputTokens: 100_000 }),
      ).toBeGreaterThan(worstCaseCost(model.id, DEFAULT_LIMITS.chat));
    }
    // The fixed part is the measured prefix by default.
    expect(worstCaseUsage(DEFAULT_LIMITS.chat).cacheCreation1hInputTokens).toBe(
      PROMPT_PREFIX_TOKENS,
    );
    // A build is dearer than a small ask on every model.
    for (const model of AI_MODELS) {
      expect(worstCaseCost(model.id, DEFAULT_LIMITS.build)).toBeGreaterThan(
        worstCaseCost(model.id, DEFAULT_LIMITS.chat),
      );
    }
  });
});
