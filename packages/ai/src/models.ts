/**
 * The model table: ids, labels, refusal-fallback support and first-party prices (ADR 0041 D7).
 * Prices are approximate and dated by `checkedOn`; the panel labels the cost "approximate".
 */
import type { AiModelId, AiUsage } from './protocol';

export interface AiModelPricing {
  /** USD per million uncached input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
  /** USD per million cache-read input tokens. */
  cacheReadPerMTok: number;
  /** When the prices were read (ISO date). */
  checkedOn: string;
}

export interface AiModelInfo {
  id: AiModelId;
  label: string;
  /** Whether the API accepts `fallbacks: 'default'` for this model. */
  supportsFallbacks: boolean;
  pricing: AiModelPricing;
}

/**
 * Cache writes (5-minute TTL) cost this multiple of the input price; the claude-api skill gives
 * about 1.25 times (verify at implementation).
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * The offered models. Haiku 5.5's cache-read price is not in the facts table; it is set to a
 * tenth of its input price, the ratio of the usual cache-read discount (verify at implementation).
 */
export const AI_MODELS: readonly AiModelInfo[] = Object.freeze([
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    supportsFallbacks: true,
    pricing: { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, checkedOn: '2026-11-05' },
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    supportsFallbacks: true,
    pricing: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, checkedOn: '2026-11-05' },
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    supportsFallbacks: false,
    pricing: {
      inputPerMTok: 0.1,
      outputPerMTok: 0.5,
      cacheReadPerMTok: 0.01,
      checkedOn: '2026-11-05',
    },
  },
]);

/** The table entry of a model id. */
export function modelInfo(id: AiModelId): AiModelInfo {
  const info = AI_MODELS.find((m) => m.id === id);
  if (info === undefined) throw new Error(`Unknown model ${id}`);
  return info;
}

/** Approximate cost of a usage in USD. */
export function estimateCost(model: AiModelId, usage: AiUsage): number {
  const p = modelInfo(model).pricing;
  return (
    (usage.inputTokens * p.inputPerMTok +
      usage.cacheCreationInputTokens * p.inputPerMTok * CACHE_WRITE_MULTIPLIER +
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
