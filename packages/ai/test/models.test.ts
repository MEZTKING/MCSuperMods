import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_IDS,
  AI_MODELS,
  aiSettingsSchema,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  estimateCost,
  formatCost,
  PRICES_CHECKED_ON,
  PRICES_SOURCE,
  PROMPT_PREFIX_CHARS,
  PROMPT_PREFIX_TOKENS,
  systemPrompt,
  TOOL_USE_SYSTEM_TOKENS,
  toolParams,
  typicalCost,
} from '../src/index';

describe('models', () => {
  it('lists the three models with exact ids', () => {
    expect(AI_MODELS.map((m) => m.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(AI_MODEL_IDS).toEqual(AI_MODELS.map((m) => m.id));
    expect(DEFAULT_AI_MODEL).toBe('claude-opus-5-5');
    expect(AI_MODELS.find((m) => m.id === 'claude-haiku-5-5')?.supportsFallbacks).toBe(false);
    for (const m of AI_MODELS) expect(m.pricing.checkedOn).toBe(PRICES_CHECKED_ON);
    expect(PRICES_CHECKED_ON).toBe('2026-11-22');
    expect(PRICES_SOURCE).toBe('https://platform.claude.com/docs/en/about-claude/pricing');
  });

  it('estimates cost from usage', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 0,
      requests: 3,
    };
    // 4 + 2 + 0.2: unchanged for Opus.
    expect(estimateCost('claude-opus-5-5', usage)).toBeCloseTo(6.2, 6);
    // 2 + 1 + 0.1: Sonnet 5.5's cache reads are $0.10, not $0.20 as before.
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(3.1, 6);
    expect(
      estimateCost('claude-opus-5-5', {
        ...usage,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
      }),
    ).toBeCloseTo(5, 6);
  });

  it('formats costs', () => {
    expect(formatCost(0.1234)).toBe('about $0.12');
    expect(formatCost(0)).toBe('about $0.00');
    expect(formatCost(0.001)).toBe('less than $0.01');
  });

  it('validates the default settings', () => {
    expect(aiSettingsSchema.parse(DEFAULT_AI_SETTINGS)).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS.limits).toEqual(DEFAULT_LIMITS);
    expect(DEFAULT_LIMITS.chat).toEqual({
      maxToolTurns: 24,
      maxOutputTokens: 100_000,
      taskBudget: true,
    });
    expect(DEFAULT_LIMITS.build).toEqual({
      maxToolTurns: 150,
      maxOutputTokens: 600_000,
      taskBudget: true,
    });
    expect(DEFAULT_AI_SETTINGS.effort).toEqual({ chat: 'medium', build: 'high' });
  });

  it('prices the one-hour cache write at twice the input price', () => {
    const base = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      requests: 1,
    };
    // All five-minute: 1.25 times $4.
    expect(estimateCost('claude-opus-5-5', base)).toBeCloseTo(5, 6);
    // All one-hour: 2 times $4.
    expect(
      estimateCost('claude-opus-5-5', { ...base, cacheCreation1hInputTokens: 1_000_000 }),
    ).toBeCloseTo(8, 6);
    // Half and half on Sonnet: 0.5 x 2.5 + 0.5 x 4.
    expect(
      estimateCost('claude-sonnet-5-5', { ...base, cacheCreation1hInputTokens: 500_000 }),
    ).toBeCloseTo(3.25, 6);
  });

  it("prices Haiku 5.5's requests over 100,000 prompt tokens at the higher tier", () => {
    const short = {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      requests: 1,
    };
    // 0.1 x 0.1 + 0.01 x 0.5
    expect(estimateCost('claude-haiku-5-5', short)).toBeCloseTo(0.015, 9);
    // Cache reads count toward the prompt: 0.1 x 0.5 + 0.001 x 0.05 + 0.01 x 2.5
    expect(estimateCost('claude-haiku-5-5', { ...short, cacheReadInputTokens: 1_000 })).toBeCloseTo(
      0.05 + 0.00005 + 0.025,
      9,
    );
    // A sum of two short requests stays at the lower tier.
    expect(
      estimateCost('claude-haiku-5-5', {
        ...short,
        inputTokens: 150_000,
        outputTokens: 0,
        requests: 2,
      }),
    ).toBeCloseTo(0.015, 9);
  });

  it('measures the fixed part of a request within 5 % of PROMPT_PREFIX_CHARS', () => {
    const measured =
      Math.max(systemPrompt('chat').length, systemPrompt('build').length) +
      JSON.stringify(toolParams()).length;
    // When this fails, set PROMPT_PREFIX_CHARS in models.ts to the measured value.
    expect(Math.abs(measured - PROMPT_PREFIX_CHARS) / measured).toBeLessThanOrEqual(0.05);
    expect(PROMPT_PREFIX_TOKENS).toBe(Math.round(PROMPT_PREFIX_CHARS / 4) + TOOL_USE_SYSTEM_TOKENS);
  });

  it('works out the typical cost from the prefix and the price table', () => {
    for (const model of AI_MODEL_IDS) {
      const cost = typicalCost(model);
      expect(cost.firstQuestion).toBeGreaterThan(cost.followUp);
      expect(cost.followUp).toBeGreaterThan(0);
      expect(typicalCost(model, PROMPT_PREFIX_TOKENS)).toEqual(cost);
      // A larger prefix costs more.
      expect(typicalCost(model, PROMPT_PREFIX_TOKENS * 2).firstQuestion).toBeGreaterThan(
        cost.firstQuestion,
      );
    }
    // Opus 5.5, by hand: the prefix written for an hour (2 x $4), the message for five minutes
    // (1.25 x $4) and 1,500 tokens of answer ($20); then the prefix read at $0.20.
    const p = PROMPT_PREFIX_TOKENS;
    expect(typicalCost('claude-opus-5-5').firstQuestion).toBeCloseTo(
      (p * 8 + 2_000 * 5 + 1_500 * 20) / 1_000_000,
      9,
    );
    expect(typicalCost('claude-opus-5-5').followUp).toBeCloseTo(
      (p * 0.2 + 2_000 * 5 + 1_500 * 20) / 1_000_000,
      9,
    );
  });
});
