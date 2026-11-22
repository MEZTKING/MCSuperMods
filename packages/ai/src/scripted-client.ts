/**
 * A {@link ModelClient} that replays a script of assistant turns (ADR 0041 D9). It emits realistic
 * stream events, assigns `toolu_<n>` ids, records every request it was sent and throws on a
 * request past the last turn. A turn may wait before its first event (`delayMs`) or be an error
 * the client throws (`{ error: { errorClass, message, status } }`), so the waiting and failing
 * states can be tested without a key (ADR 0125 D12). Used by unit tests, the scenario test and the e2e hook
 * (`MSM_E2E_AI_SCRIPT`).
 */
import { z } from 'zod';
import type { ModelClient } from './client';
import { ModelClientError } from './errors';
import type { AiUsage } from './protocol';
import type {
  BetaContentBlock,
  BetaMessage,
  BetaRawMessageStreamEvent,
  BetaStopReason,
  ModelRequest,
} from './sdk-types';

/** One content block of a scripted turn. `fallback` is an MSM addition for testing notices. */
export type ScriptedBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'fallback'; from: string; to: string };

/** A scripted answer. */
export interface ScriptedContentTurn {
  content: ScriptedBlock[];
  /** Defaults to `tool_use` when the turn has a `tool_use` block, otherwise `end_turn`. */
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';
  /**
   * Usage of the turn. `cacheCreation1hInputTokens` is the part of `cacheCreationInputTokens`
   * written for an hour; `requests` is ignored (each turn is one request).
   */
  usage?: Partial<AiUsage>;
  /** Milliseconds to wait before the first event; the abort signal ends the wait. */
  delayMs?: number;
}

/** A scripted failure: the client throws a {@link ModelClientError} with these fields. */
export interface ScriptedErrorTurn {
  error: { errorClass: string; message: string; status?: number };
  /** Milliseconds to wait before throwing; the abort signal ends the wait. */
  delayMs?: number;
}

export type ScriptedTurn = ScriptedContentTurn | ScriptedErrorTurn;

export interface AiModelScript {
  turns: ScriptedTurn[];
}

const usageSchema = z
  .object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    cacheReadInputTokens: z.number().int().min(0),
    cacheCreationInputTokens: z.number().int().min(0),
    cacheCreation1hInputTokens: z.number().int().min(0),
    requests: z.number().int().min(0),
  })
  .partial();

/** The longest wait a scripted turn may ask for. */
export const SCRIPTED_DELAY_MAX_MS = 600_000;

const delaySchema = z.number().int().min(0).max(SCRIPTED_DELAY_MAX_MS).optional();

export const aiModelScriptSchema = z.object({
  turns: z.array(
    z.union([
      z.object({
        content: z.array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('text'), text: z.string() }),
            z.object({ type: z.literal('thinking'), thinking: z.string() }),
            z.object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() }),
            z.object({ type: z.literal('fallback'), from: z.string(), to: z.string() }),
          ]),
        ),
        stopReason: z.enum(['end_turn', 'tool_use', 'max_tokens', 'refusal']).optional(),
        usage: usageSchema.optional(),
        delayMs: delaySchema,
      }),
      z.object({
        error: z.object({
          errorClass: z.string().min(1).max(200),
          message: z.string().max(2000),
          status: z.number().int().min(100).max(599).optional(),
        }),
        delayMs: delaySchema,
      }),
    ]),
  ),
});

function abortError(): Error {
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
}

/** Waits `ms`, rejecting with an abort error as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Splits text into word chunks that keep their trailing whitespace. */
function words(text: string): string[] {
  const parts = text.match(/\S+\s*|\s+/g);
  return parts ?? [''];
}

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length > 0 ? out : [''];
}

export class ScriptedModelClient implements ModelClient {
  /** Deep copies of every request, in order. */
  readonly requests: ModelRequest[] = [];
  readonly #turns: ScriptedTurn[];
  #next = 0;
  #toolSeq = 0;

  constructor(script: AiModelScript) {
    this.#turns = script.turns;
  }

  /** Turns not yet replayed. */
  get remaining(): number {
    return this.#turns.length - this.#next;
  }

  async stream(
    request: ModelRequest,
    signal: AbortSignal,
    onEvent: (event: BetaRawMessageStreamEvent) => void,
  ): Promise<BetaMessage> {
    this.requests.push(structuredClone(request));
    const turnIndex = this.#next;
    const turn = this.#turns[turnIndex];
    if (turn === undefined) {
      throw new Error(`ScriptedModelClient: no scripted turn left for request ${turnIndex + 1}`);
    }
    this.#next++;

    if (turn.delayMs !== undefined && turn.delayMs > 0) await wait(turn.delayMs, signal);
    if (signal.aborted) throw abortError();
    if ('error' in turn) {
      throw new ModelClientError(turn.error.errorClass, turn.error.message, turn.error.status);
    }

    const content: BetaContentBlock[] = turn.content.map((block): BetaContentBlock => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text, citations: null };
        case 'thinking':
          return { type: 'thinking', thinking: block.thinking, signature: `sig_${turnIndex + 1}` };
        case 'tool_use':
          this.#toolSeq++;
          return {
            type: 'tool_use',
            id: `toolu_${this.#toolSeq}`,
            name: block.name,
            input: structuredClone(block.input),
          };
        default:
          return {
            type: 'fallback',
            from: { model: block.from },
            to: { model: block.to },
            trigger: { type: 'refusal', category: null },
          };
      }
    });
    const stopReason: BetaStopReason =
      turn.stopReason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
    const usage = {
      inputTokens: turn.usage?.inputTokens ?? 100,
      outputTokens: turn.usage?.outputTokens ?? 50,
      cacheReadInputTokens: turn.usage?.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: turn.usage?.cacheCreationInputTokens ?? 0,
    };
    const written1h = turn.usage?.cacheCreation1hInputTokens;
    const cacheCreation =
      written1h === undefined
        ? null
        : {
            ephemeral_1h_input_tokens: written1h,
            ephemeral_5m_input_tokens: Math.max(0, usage.cacheCreationInputTokens - written1h),
          };
    const message: BetaMessage = {
      id: `msg_scripted_${turnIndex + 1}`,
      type: 'message',
      role: 'assistant',
      model: request.model,
      container: null,
      context_management: null,
      diagnostics: null,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: {
        cache_creation: cacheCreation,
        cache_creation_input_tokens: usage.cacheCreationInputTokens,
        cache_read_input_tokens: usage.cacheReadInputTokens,
        fallback_credit: null,
        inference_geo: null,
        input_tokens: usage.inputTokens,
        iterations: null,
        output_tokens: 1,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: 'standard',
        speed: null,
      },
    };

    const emit = async (event: BetaRawMessageStreamEvent): Promise<void> => {
      if (signal.aborted) throw abortError();
      onEvent(event);
      // Yield so an abort raised by a listener or a timer lands between events.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) throw abortError();
    };

    await emit({ type: 'message_start', message: structuredClone(message) });
    for (const [index, block] of content.entries()) {
      switch (block.type) {
        case 'text':
          await emit({
            type: 'content_block_start',
            index,
            content_block: { type: 'text', text: '', citations: null },
          });
          for (const w of words(block.text)) {
            await emit({
              type: 'content_block_delta',
              index,
              delta: { type: 'text_delta', text: w },
            });
          }
          break;
        case 'thinking':
          await emit({
            type: 'content_block_start',
            index,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          });
          for (const w of words(block.thinking)) {
            await emit({
              type: 'content_block_delta',
              index,
              delta: { type: 'thinking_delta', thinking: w, estimated_tokens: null },
            });
          }
          await emit({
            type: 'content_block_delta',
            index,
            delta: { type: 'signature_delta', signature: block.signature },
          });
          break;
        case 'tool_use':
          await emit({
            type: 'content_block_start',
            index,
            content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
          });
          for (const part of chunks(JSON.stringify(block.input ?? {}), 24)) {
            await emit({
              type: 'content_block_delta',
              index,
              delta: { type: 'input_json_delta', partial_json: part },
            });
          }
          break;
        default:
          await emit({ type: 'content_block_start', index, content_block: block });
          break;
      }
      await emit({ type: 'content_block_stop', index });
    }
    await emit({
      type: 'message_delta',
      context_management: null,
      delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null, container: null },
      usage: {
        cache_creation_input_tokens: usage.cacheCreationInputTokens,
        cache_read_input_tokens: usage.cacheReadInputTokens,
        fallback_credit: null,
        input_tokens: usage.inputTokens,
        iterations: null,
        output_tokens: usage.outputTokens,
        output_tokens_details: null,
        server_tool_use: null,
      },
    });
    await emit({ type: 'message_stop' });

    return {
      ...message,
      content,
      stop_reason: stopReason,
      stop_details:
        stopReason === 'refusal'
          ? {
              type: 'refusal',
              category: null,
              explanation: 'Scripted refusal.',
              fallback_credit_token: null,
              fallback_has_prefill_claim: null,
              recommended_model: null,
            }
          : null,
      usage: { ...message.usage, output_tokens: usage.outputTokens },
    };
  }
}
