/**
 * The manual agent loop (ADR 0041 D3, D7): one run is one user message until the model ends its
 * turn, a limit is reached, the run is cancelled or an error ends it.
 *
 * History is append-only and committed in whole turns: the run's user message, each assistant
 * turn and the user message carrying all of that turn's tool results are appended together once
 * the tools have answered. A cancelled turn is dropped, so the conversation never holds a
 * `tool_use` without its results. Assistant turns go back unchanged, thinking blocks included.
 */
import type { ConversationState, ModelClient } from './client';
import {
  type AiErrorClass,
  classifyModelClientError,
  describeModelClientError,
  ERROR_SENTENCES,
  ModelClientError,
  ModelOutputError,
} from './errors';
import { modelInfo } from './models';
import {
  type AiDoneReason,
  type AiHost,
  type AiLimitReached,
  type AiRunLimits,
  type AiSettings,
  type AiStartRequest,
  type AiStopDetails,
  type AiToolResult,
  type AiUsage,
  addUsage,
  emptyUsage,
  TASK_BUDGET_MIN,
} from './protocol';
import type {
  BetaImageBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  ModelRequest,
} from './sdk-types';
import { systemPrompt } from './system-prompt';
import { parseToolInput, toolParams } from './tools/catalogue';

/** `max_tokens` of every request. */
export const MAX_TOKENS = 64_000;

/** Beta flag of server-side refusal fallback with `fallbacks: 'default'`. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Beta flag of `output_config.task_budget`. */
export const TASK_BUDGET_BETA = 'task-budgets-2026-03-13';

/** Consecutive unreadable responses retried before the run ends with an error. */
export const OUTPUT_ERROR_RETRIES = 2;

/**
 * The cache lifetime of the system block (tools and system prompt, the fixed part of every
 * request), ADR 0125 D8. The conversation's own breakpoint keeps the default five minutes, so
 * the longer entry comes first, as the API requires. `'5m'` here is the one-line veto.
 */
export const SYSTEM_CACHE_TTL: '5m' | '1h' = '1h';

export interface RunAssistantOptions {
  client: ModelClient;
  conversation: ConversationState;
  request: AiStartRequest;
  settings: AiSettings;
  limits: AiRunLimits;
  host: AiHost;
  signal: AbortSignal;
  /** Clock for tests; unused by the loop today. */
  now?: () => number;
}

export interface RunAssistantResult {
  reason: AiDoneReason;
  usage: AiUsage;
}

/**
 * The text of a `limit` stop: one plain sentence without numbers (ADR 0125 D10). Limits count
 * from zero in every run, so sending "continue" carries on; the numbers travel on the `done`
 * event's `limit` field.
 */
export function limitMessage(): string {
  return 'The helper paused at its limit so the cost stays small; send "continue" to carry on.';
}

/**
 * The limits of a run once the user has accepted a plan in it (ADR 0125 D2): each number is the
 * larger of the run's own and the build limits; the task-budget switch stays the run's own.
 */
export function raisedLimits(limits: AiRunLimits, build: AiRunLimits): AiRunLimits {
  return {
    maxToolTurns: Math.max(limits.maxToolTurns, build.maxToolTurns),
    maxOutputTokens: Math.max(limits.maxOutputTokens, build.maxOutputTokens),
    taskBudget: limits.taskBudget,
  };
}

/** Whether a tool result is a `propose_plan` answer that builds (`build_all` or `step`). */
export function acceptsPlan(toolName: string, content: string, isError: boolean): boolean {
  if (toolName !== 'propose_plan' || isError) return false;
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== 'object' || value === null) return false;
    const decision = (value as { decision?: unknown }).decision;
    return decision === 'build_all' || decision === 'step';
  } catch {
    return false;
  }
}

/** Builds the params of one request (exported for tests and for main's diagnostics). */
export function buildRequest(
  conversation: ConversationState,
  mode: AiStartRequest['mode'],
  settings: AiSettings,
  limits: AiRunLimits,
  messages: BetaMessageParam[],
): ModelRequest {
  const betas: string[] = [];
  const useBudget = limits.taskBudget && limits.maxOutputTokens >= TASK_BUDGET_MIN;
  if (useBudget) betas.push(TASK_BUDGET_BETA);
  const useFallbacks = settings.fallbacks && modelInfo(conversation.model).supportsFallbacks;
  if (useFallbacks) betas.push(FALLBACK_BETA);
  const params: ModelRequest = {
    model: conversation.model,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemPrompt(mode),
        cache_control: { type: 'ephemeral', ttl: SYSTEM_CACHE_TTL },
      },
    ],
    tools: toolParams(),
    tool_choice: { type: 'auto' },
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: {
      effort: settings.effort[mode],
      ...(useBudget ? { task_budget: { type: 'tokens', total: limits.maxOutputTokens } } : {}),
    },
    // Automatic caching: a second breakpoint on the last cacheable block, so each request
    // reads the conversation prefix the previous one wrote (five minutes, after the system
    // block's longer entry).
    cache_control: { type: 'ephemeral' },
    messages,
  };
  if (betas.length > 0) params.betas = betas;
  if (useFallbacks) params.fallbacks = 'default';
  return params;
}

function usageOf(message: BetaMessage): AiUsage {
  const usage: AiUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    requests: 1,
  };
  const written1h = message.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  if (written1h > 0) usage.cacheCreation1hInputTokens = written1h;
  return usage;
}

function assistantParam(message: BetaMessage): BetaMessageParam {
  // The response blocks go back unchanged (thinking and fallback blocks included).
  return { role: 'assistant', content: message.content };
}

function errorResults(blocks: BetaToolUseBlock[], text: string): BetaToolResultBlockParam[] {
  return blocks.map((b) => ({
    type: 'tool_result',
    tool_use_id: b.id,
    is_error: true,
    content: JSON.stringify({ error: text }),
  }));
}

class Cancelled extends Error {}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Cancelled());
    else signal.addEventListener('abort', () => reject(new Cancelled()), { once: true });
  });
}

/** Runs one user message to the end. Never leaves the conversation inconsistent. */
export async function runAssistant(options: RunAssistantOptions): Promise<RunAssistantResult> {
  const { client, conversation, request, settings, host, signal } = options;
  // The run's limits; they rise to the build limits once a plan is accepted (ADR 0125 D2).
  let limits = options.limits;
  let total = emptyUsage();
  let toolTurns = 0;
  let outputErrors = 0;
  let requestSeq = 0;

  // Pictures first, then the context and the message (ADR 0048).
  const userContent: (BetaImageBlockParam | BetaTextBlockParam)[] = [
    ...(request.images ?? []).map(
      (image): BetaImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data },
      }),
    ),
    ...request.contextBlocks.map((text): BetaTextBlockParam => ({ type: 'text', text })),
    { type: 'text', text: request.text },
  ];
  // Messages of the current turn, not yet committed to the conversation.
  let staged: BetaMessageParam[] = [{ role: 'user', content: userContent }];

  const commit = (): void => {
    conversation.messages.push(...staged);
    staged = [];
  };

  const finish = (
    reason: AiDoneReason,
    extra: {
      message?: string;
      stopDetails?: AiStopDetails;
      errorClass?: AiErrorClass;
      limit?: AiLimitReached;
    } = {},
  ): RunAssistantResult => {
    host.emit({ type: 'done', reason, ...extra });
    return { reason, usage: total };
  };

  /** Commits an assistant turn whose tools will not run, answering them with errors. */
  const commitWithoutTools = (message: BetaMessage, why: string): void => {
    staged.push(assistantParam(message));
    const uses = message.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
    if (uses.length > 0) staged.push({ role: 'user', content: errorResults(uses, why) });
    commit();
  };

  while (true) {
    if (signal.aborted) return finish('cancelled');
    host.emit({ type: 'turn_start' });
    const params = buildRequest(conversation, request.mode, settings, limits, [
      ...conversation.messages,
      ...staged,
    ]);

    let message: BetaMessage;
    try {
      message = await client.stream(params, signal, (event) => forwardEvent(event, host));
      outputErrors = 0;
    } catch (error) {
      if (signal.aborted) return finish('cancelled');
      if (error instanceof ModelOutputError && outputErrors < OUTPUT_ERROR_RETRIES) {
        outputErrors++;
        continue;
      }
      if (error instanceof ModelOutputError) {
        return finish('error', {
          message: `${ERROR_SENTENCES.ModelOutputError} ${error.message}`,
          errorClass: 'ModelOutputError',
        });
      }
      if (error instanceof ModelClientError) {
        return finish('error', {
          message: describeModelClientError(error),
          errorClass: classifyModelClientError(error),
        });
      }
      host.emit({
        type: 'done',
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
        errorClass: 'Error',
      });
      throw error;
    }

    const turn = usageOf(message);
    total = addUsage(total, turn);
    host.emit({ type: 'usage', turn, total });

    const uses = message.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');

    switch (message.stop_reason) {
      case 'refusal': {
        commitWithoutTools(message, 'not run: the turn ended with a refusal');
        const details = message.stop_details;
        return finish('refusal', {
          stopDetails: {
            category: details?.category ?? null,
            explanation: details?.explanation ?? 'The request was declined.',
          },
        });
      }
      case 'max_tokens':
        commitWithoutTools(message, 'not run: the turn was cut off at max_tokens');
        return finish('max_tokens');
      case 'model_context_window_exceeded':
        commitWithoutTools(message, 'not run: the context window is full');
        return finish('error', {
          message: ERROR_SENTENCES.ContextWindowExceeded,
          errorClass: 'ContextWindowExceeded',
        });
      case 'pause_turn':
        staged.push(assistantParam(message));
        commit();
        continue;
      case 'tool_use':
        break;
      default:
        commitWithoutTools(message, 'not run: the turn ended');
        return finish('end_turn');
    }

    if (uses.length === 0) {
      commitWithoutTools(message, 'not run');
      return finish('end_turn');
    }

    toolTurns++;
    if (toolTurns > limits.maxToolTurns || total.outputTokens > limits.maxOutputTokens) {
      commitWithoutTools(message, 'not run: run limit reached');
      return finish('limit', {
        message: limitMessage(),
        limit: { toolTurns: limits.maxToolTurns, outputTokens: limits.maxOutputTokens },
      });
    }

    const results = await runTools(uses, request.runId, () => ++requestSeq, host, signal);
    if (results === 'cancelled') return finish('cancelled');
    const accepted = results.some((result, i) =>
      acceptsPlan(
        uses[i]?.name ?? '',
        typeof result.content === 'string' ? result.content : '',
        result.is_error === true,
      ),
    );
    if (accepted) limits = raisedLimits(limits, settings.limits.build);
    staged.push(assistantParam(message));
    staged.push({ role: 'user', content: results });
    commit();
  }
}

function forwardEvent(event: BetaRawMessageStreamEvent, host: AiHost): void {
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta')
      host.emit({ type: 'text_delta', text: event.delta.text });
    else if (event.delta.type === 'thinking_delta') {
      host.emit({ type: 'thinking_delta', text: event.delta.thinking });
    }
  } else if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
    host.emit({
      type: 'fallback',
      from: event.content_block.from.model,
      to: event.content_block.to.model,
    });
  }
}

async function runTools(
  uses: BetaToolUseBlock[],
  runId: string,
  nextSeq: () => number,
  host: AiHost,
  signal: AbortSignal,
): Promise<BetaToolResultBlockParam[] | 'cancelled'> {
  const aborted = abortPromise(signal);
  aborted.catch(() => {});
  const pending = uses.map(async (use): Promise<BetaToolResultBlockParam> => {
    const parsed = parseToolInput(use.name, use.input);
    if (!parsed.ok) {
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        is_error: true,
        content: JSON.stringify({ ...parsed.error, received: use.input }),
      };
    }
    const toolRequest = {
      requestId: `${runId}:${nextSeq()}`,
      toolUseId: use.id,
      name: parsed.name,
      input: parsed.input,
    };
    host.emit({ type: 'tool_request', request: toolRequest });
    let result: AiToolResult;
    try {
      result = await Promise.race([host.executeTool(toolRequest, signal), aborted]);
    } catch (error) {
      if (error instanceof Cancelled || signal.aborted) throw new Cancelled();
      result = {
        requestId: toolRequest.requestId,
        isError: true,
        content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      };
    }
    host.emit({ type: 'tool_done', requestId: toolRequest.requestId, isError: result.isError });
    return {
      type: 'tool_result',
      tool_use_id: use.id,
      content: result.content,
      ...(result.isError ? { is_error: true } : {}),
    };
  });
  try {
    const results = await Promise.all(pending);
    if (signal.aborted) return 'cancelled';
    return results;
  } catch (error) {
    if (error instanceof Cancelled || signal.aborted) {
      // Let the other tools settle quietly; their results are dropped with the turn.
      await Promise.allSettled(pending);
      return 'cancelled';
    }
    throw error;
  }
}
