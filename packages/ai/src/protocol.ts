/**
 * The AI helper's protocol: settings, run requests, tool round trips and the events a run emits
 * (ADR 0041 D3, D7). Main, preload and renderer share these types; the zod schemas back the IPC
 * contract of `msm:v1:ai:*`.
 */
import { z } from 'zod';

/** The Claude models the helper offers, by exact API id. */
export type AiModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

/** Every model id, in the order the Settings select lists them. */
export const AI_MODEL_IDS: readonly AiModelId[] = Object.freeze([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
]);

/** The model a new conversation uses unless Settings say otherwise. */
export const DEFAULT_AI_MODEL: AiModelId = 'claude-opus-5-5';

/** `output_config.effort` values the helper offers. */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh';

/** Chat answers questions and proposes small edits; build makes whole content from one prompt. */
export type AiMode = 'chat' | 'build';

/** The limits of one run (ADR 0041 D7). */
export interface AiRunLimits {
  /** Assistant turns that call tools before the run stops with `limit`. */
  maxToolTurns: number;
  /** Sum of `usage.output_tokens` across the run's requests before it stops with `limit`. */
  maxOutputTokens: number;
  /** Send `output_config.task_budget` (when `maxOutputTokens` is at least {@link TASK_BUDGET_MIN}). */
  taskBudget: boolean;
}

/** The smallest `task_budget.total` the API accepts. */
export const TASK_BUDGET_MIN = 20_000;

/** Default limits per mode. */
export const DEFAULT_LIMITS: Readonly<Record<AiMode, AiRunLimits>> = Object.freeze({
  chat: Object.freeze({ maxToolTurns: 24, maxOutputTokens: 100_000, taskBudget: true }),
  build: Object.freeze({ maxToolTurns: 150, maxOutputTokens: 600_000, taskBudget: true }),
});

/** Default effort per mode. */
export const DEFAULT_EFFORT: Readonly<Record<AiMode, AiEffort>> = Object.freeze({
  chat: 'medium',
  build: 'high',
});

/** The helper's part of the app settings (`AppSettings.ai`). */
export interface AiSettings {
  model: AiModelId;
  effort: Record<AiMode, AiEffort>;
  /** Allow server-side refusal fallback (`fallbacks: 'default'`) on models that support it. */
  fallbacks: boolean;
  limits: Record<AiMode, AiRunLimits>;
}

/** Settings of a fresh install. */
export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = Object.freeze({
  model: DEFAULT_AI_MODEL,
  effort: { ...DEFAULT_EFFORT },
  fallbacks: true,
  limits: { chat: { ...DEFAULT_LIMITS.chat }, build: { ...DEFAULT_LIMITS.build } },
});

export const aiModelIdSchema = z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
export const aiEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh']);
export const aiModeSchema = z.enum(['chat', 'build']);

export const aiRunLimitsSchema = z.object({
  maxToolTurns: z.number().int().min(1).max(1000),
  maxOutputTokens: z.number().int().min(1000).max(10_000_000),
  taskBudget: z.boolean(),
});

export const aiSettingsSchema = z.object({
  model: aiModelIdSchema,
  effort: z.object({ chat: aiEffortSchema, build: aiEffortSchema }),
  fallbacks: z.boolean(),
  limits: z.object({ chat: aiRunLimitsSchema, build: aiRunLimitsSchema }),
});

/** Starts one run: one user message until the model ends its turn. */
export interface AiStartRequest {
  runId: string;
  conversationId: string;
  mode: AiMode;
  /** The user's message. */
  text: string;
  /** Visible context blocks (a problem, an element) sent before the message as text blocks. */
  contextBlocks: string[];
  /** Limits for this run only; the mode's settings apply when omitted. */
  limits?: AiRunLimits;
}

export const aiStartRequestSchema = z.object({
  runId: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  mode: aiModeSchema,
  text: z.string().max(200_000),
  contextBlocks: z.array(z.string().max(200_000)).max(16),
  limits: aiRunLimitsSchema.optional(),
});

/** A validated tool call the host executes (in the app: the renderer, against the session). */
export interface AiToolRequest {
  /** Unique within the run; the host answers with the same id. */
  requestId: string;
  /** The `tool_use` block's id. */
  toolUseId: string;
  name: string;
  /** The input, already validated against the tool's zod schema. */
  input: unknown;
}

export const aiToolRequestSchema = z.object({
  requestId: z.string(),
  toolUseId: z.string(),
  name: z.string(),
  input: z.unknown(),
});

/** The host's answer to an {@link AiToolRequest}: JSON text and whether it is an error. */
export interface AiToolResult {
  requestId: string;
  content: string;
  isError: boolean;
}

export const aiToolResultSchema = z.object({
  requestId: z.string().min(1).max(200),
  content: z.string().max(4_000_000),
  isError: z.boolean(),
});

/** Token usage, per turn or summed over a run. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  requests: number;
}

export const aiUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  requests: z.number(),
});

/** No usage yet. */
export function emptyUsage(): AiUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    requests: 0,
  };
}

/** Sums two usages. */
export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    requests: a.requests + b.requests,
  };
}

/** Why a run ended. `no_key` is emitted by the host (main) when no key is stored. */
export type AiDoneReason =
  | 'end_turn'
  | 'cancelled'
  | 'limit'
  | 'refusal'
  | 'max_tokens'
  | 'error'
  | 'no_key';

export const aiDoneReasonSchema = z.enum([
  'end_turn',
  'cancelled',
  'limit',
  'refusal',
  'max_tokens',
  'error',
  'no_key',
]);

/** The refusal details of a `refusal` stop. */
export interface AiStopDetails {
  category: string | null;
  explanation: string;
}

/** What a run reports while it proceeds. */
export type AiEvent =
  | { type: 'turn_start' }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_request'; request: AiToolRequest }
  | { type: 'tool_done'; requestId: string; isError: boolean }
  | { type: 'usage'; turn: AiUsage; total: AiUsage }
  | { type: 'fallback'; from: string; to: string }
  | { type: 'done'; reason: AiDoneReason; message?: string; stopDetails?: AiStopDetails };

export const aiEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn_start') }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('thinking_delta'), text: z.string() }),
  z.object({ type: z.literal('tool_request'), request: aiToolRequestSchema }),
  z.object({ type: z.literal('tool_done'), requestId: z.string(), isError: z.boolean() }),
  z.object({ type: z.literal('usage'), turn: aiUsageSchema, total: aiUsageSchema }),
  z.object({ type: z.literal('fallback'), from: z.string(), to: z.string() }),
  z.object({
    type: z.literal('done'),
    reason: aiDoneReasonSchema,
    message: z.string().optional(),
    stopDetails: z.object({ category: z.string().nullable(), explanation: z.string() }).optional(),
  }),
]);

/**
 * Where a run sends its events and tool calls. `runAssistant` emits `tool_request` immediately
 * before it calls `executeTool` for that request, so a host that executes tools in another
 * process may treat the event as the request and resolve `executeTool` when the answer arrives.
 */
export interface AiHost {
  executeTool(request: AiToolRequest, signal: AbortSignal): Promise<AiToolResult>;
  emit(event: AiEvent): void;
}
