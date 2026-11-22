/**
 * The model table: ids, labels, refusal-fallback support and first-party prices (ADR 0041 D7,
 * ADR 0125 D8). Prices are approximate and dated by `checkedOn`; the panel labels the cost
 * "approximate". Prices change: re-read {@link PRICES_SOURCE} when touching this table (verify at
 * implementation).
 */
import type { AiModelId, AiUsage } from './protocol';

/** Where the prices were read: Anthropic's pricing page ("Model pricing" and "Prompt caching"). */
export const PRICES_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';

/** The day the prices of {@link AI_MODELS} were read from {@link PRICES_SOURCE} (ISO date). */
export const PRICES_CHECKED_ON = '2026-11-22';

/** The per-token prices of one tier, in USD per million tokens. */
export interface AiPriceTier {
  /** Uncached input tokens. */
  inputPerMTok: number;
  /** Output tokens. */
  outputPerMTok: number;
  /** Cache hits and refreshes. */
  cacheReadPerMTok: number;
}

export interface AiModelPricing extends AiPriceTier {
  /** When the prices were read (ISO date). */
  checkedOn: string;
  /**
   * Higher prices for a request whose prompt (input, cache reads and cache writes together) is
   * over `thresholdTokens`; each request is priced on its own (Claude Haiku 5.5 only).
   */
  longPrompt?: AiPriceTier & { thresholdTokens: number };
}

export interface AiModelInfo {
  id: AiModelId;
  label: string;
  /** Whether the API accepts `fallbacks: 'default'` for this model. */
  supportsFallbacks: boolean;
  pricing: AiModelPricing;
}

/**
 * Cache writes with the five-minute lifetime cost this multiple of the input price (the pricing
 * page's "Prompt caching" table, read on {@link PRICES_CHECKED_ON}).
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** Cache writes with the one-hour lifetime cost this multiple of the input price (same table). */
export const CACHE_WRITE_1H_MULTIPLIER = 2;

/**
 * The offered models, with the prices of {@link PRICES_SOURCE} read on {@link PRICES_CHECKED_ON}:
 * Opus 5.5 $4 / $20, cache hits $0.20 (0.05 times input); Sonnet 5.5 $2 / $10, cache hits $0.10
 * (0.05 times input); Haiku 5.5 $0.10 / $0.50, cache hits $0.01, and over 100,000 prompt tokens
 * $0.50 / $2.50, cache hits $0.05.
 */
export const AI_MODELS: readonly AiModelInfo[] = Object.freeze([
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    supportsFallbacks: true,
    pricing: {
      inputPerMTok: 4,
      outputPerMTok: 20,
      cacheReadPerMTok: 0.2,
      checkedOn: PRICES_CHECKED_ON,
    },
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    supportsFallbacks: true,
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 10,
      cacheReadPerMTok: 0.1,
      checkedOn: PRICES_CHECKED_ON,
    },
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    supportsFallbacks: false,
    pricing: {
      inputPerMTok: 0.1,
      outputPerMTok: 0.5,
      cacheReadPerMTok: 0.01,
      checkedOn: PRICES_CHECKED_ON,
      longPrompt: {
        thresholdTokens: 100_000,
        inputPerMTok: 0.5,
        outputPerMTok: 2.5,
        cacheReadPerMTok: 0.05,
      },
    },
  },
]);

/** The table entry of a model id. */
export function modelInfo(id: AiModelId): AiModelInfo {
  const info = AI_MODELS.find((m) => m.id === id);
  if (info === undefined) throw new Error(`Unknown model ${id}`);
  return info;
}

/** The prompt tokens of a usage: input, cache reads and cache writes together. */
function promptTokens(usage: AiUsage): number {
  return usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
}

/**
 * The price tier of a usage. A summed usage is priced as `requests` requests of its average
 * prompt, so the long-prompt tier is exact for one request and an estimate for a sum.
 */
function tierOf(pricing: AiModelPricing, usage: AiUsage): AiPriceTier {
  const long = pricing.longPrompt;
  if (long === undefined) return pricing;
  const perRequest = promptTokens(usage) / Math.max(1, usage.requests);
  return perRequest > long.thresholdTokens ? long : pricing;
}

/** Approximate cost of a usage in USD. */
export function estimateCost(model: AiModelId, usage: AiUsage): number {
  const p = tierOf(modelInfo(model).pricing, usage);
  const written1h = Math.min(usage.cacheCreation1hInputTokens ?? 0, usage.cacheCreationInputTokens);
  const written5m = usage.cacheCreationInputTokens - written1h;
  return (
    (usage.inputTokens * p.inputPerMTok +
      written5m * p.inputPerMTok * CACHE_WRITE_MULTIPLIER +
      written1h * p.inputPerMTok * CACHE_WRITE_1H_MULTIPLIER +
      usage.cacheReadInputTokens * p.cacheReadPerMTok +
      usage.outputTokens * p.outputPerMTok) /
    1_000_000
  );
}

/** A cost for the usage line: "about $0.12", or "less than $0.01" for tiny amounts. */
export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return 'less than $0.01';
  return `about $${usd.toFixed(2)}`;
}

/**
 * Characters of the fixed part of every request: the longer of the two system prompts plus the
 * tool definitions as JSON. Measured by `models.test.ts`, which fails when the measurement moves
 * more than 5 % away from this number; then set it to the measured value.
 */
export const PROMPT_PREFIX_CHARS = 112_804;

/**
 * Characters per token used to turn {@link PROMPT_PREFIX_CHARS} into tokens. An estimate (verify
 * at implementation by counting the prefix with the token-counting endpoint, which no test may
 * call); the pricing page says the tokenizer of Claude 4.7 and later makes about 30 % more tokens
 * of the same text than the earlier one.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Tokens the API adds for tool use with `tool_choice` auto on Opus 5.5, Sonnet 5.5 and Haiku 5.5
 * (the pricing page's "Tool use pricing" table, read on {@link PRICES_CHECKED_ON}).
 */
export const TOOL_USE_SYSTEM_TOKENS = 286;

/** The estimated tokens of the fixed part of every request (prompt, tools, tool use). */
export const PROMPT_PREFIX_TOKENS =
  Math.round(PROMPT_PREFIX_CHARS / CHARS_PER_TOKEN) + TOOL_USE_SYSTEM_TOKENS;

/**
 * The assumed size of one typical question and answer on top of the fixed part: the question
 * with its context and the conversation so far (written to the five-minute cache), and the
 * answer with its thinking. Assumptions for the cost sentence, not measurements.
 */
export const TYPICAL_QUESTION = Object.freeze({ messageTokens: 2_000, outputTokens: 1_500 });

/** The cost of a typical question in USD (ADR 0125 D8). */
export interface AiTypicalCost {
  /** A first question, or one after an hour's pause: the fixed part is written for an hour. */
  firstQuestion: number;
  /** A question within the hour: the fixed part is read from the cache. */
  followUp: number;
}

/**
 * The typical cost of one question with the fixed part of `prefixTokens` (by default
 * {@link PROMPT_PREFIX_TOKENS}), as one request of {@link TYPICAL_QUESTION}'s size.
 */
export function typicalCost(
  model: AiModelId,
  prefixTokens: number = PROMPT_PREFIX_TOKENS,
): AiTypicalCost {
  const { messageTokens, outputTokens } = TYPICAL_QUESTION;
  const first: AiUsage = {
    inputTokens: 0,
    outputTokens,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: prefixTokens + messageTokens,
    cacheCreation1hInputTokens: prefixTokens,
    requests: 1,
  };
  const followUp: AiUsage = {
    inputTokens: 0,
    outputTokens,
    cacheReadInputTokens: prefixTokens,
    cacheCreationInputTokens: messageTokens,
    requests: 1,
  };
  return { firstQuestion: estimateCost(model, first), followUp: estimateCost(model, followUp) };
}
