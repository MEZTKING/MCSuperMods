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
    for (const m of AI_MODELS) expect(m.pricing.checkedOn).toBe('2026-11-05');
  });

  it('estimates cost from usage', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 0,
      requests: 3,
    };
    // 4 + 2 + 0.2
    expect(estimateCost('claude-opus-5-5', usage)).toBeCloseTo(6.2, 6);
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(3.2, 6);
    expect(
      estimateCost('claude-opus-5-5', { ...usage, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 1_000_000 }),
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
    expect(DEFAULT_LIMITS.chat).toEqual({ maxToolTurns: 24, maxOutputTokens: 100_000, taskBudget: true });
    expect(DEFAULT_LIMITS.build).toEqual({ maxToolTurns: 150, maxOutputTokens: 600_000, taskBudget: true });
    expect(DEFAULT_AI_SETTINGS.effort).toEqual({ chat: 'medium', build: 'high' });
  });
});
