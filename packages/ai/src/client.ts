/**
 * The model seam (ADR 0041 D9) and conversation state. The real client lives in `@msm/ai/sdk`;
 * tests use `ScriptedModelClient`.
 */
import { ModelClientError } from './errors';
import type { AiModelId } from './protocol';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  ModelRequest,
} from './sdk-types';

/**
 * Streams one request. Calls `onEvent` for every raw stream event and resolves with the final
 * message. Rejects with {@link ModelClientError} for API and transport failures and with
 * `ModelOutputError` for unreadable output; rejects (with any error) once `signal` aborts.
 */
export interface ModelClient {
  stream(
    request: ModelRequest,
    signal: AbortSignal,
    onEvent: (event: BetaRawMessageStreamEvent) => void,
  ): Promise<BetaMessage>;
}

/**
 * One conversation as main holds it: the model it is bound to and the append-only API history,
 * thinking blocks included. The renderer never sees `messages`.
 */
export interface ConversationState {
  id: string;
  model: AiModelId;
  messages: BetaMessageParam[];
}

/** A new, empty conversation bound to a model. */
export function createConversation(id: string, model: AiModelId): ConversationState {
  return { id, model, messages: [] };
}

/** The outcome of {@link testApiKey}, the shape `PlatformAdapter.ai.testKey` returns. */
export type AiKeyTestResult =
  | { ok: true; model: string }
  | { ok: false; error: string; errorClass: string };

/** The model and token limit of the key test request. */
export const KEY_TEST_MODEL: AiModelId = 'claude-haiku-5-5';

/**
 * Makes one tiny request (Haiku 5.5, `max_tokens: 16`) to check a key. API failures become
 * `{ ok: false }` with the error class; other errors are rethrown.
 */
export async function testApiKey(
  client: ModelClient,
  signal?: AbortSignal,
): Promise<AiKeyTestResult> {
  try {
    const message = await client.stream(
      {
        model: KEY_TEST_MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the word ok.' }],
      },
      signal ?? new AbortController().signal,
      () => {},
    );
    return { ok: true, model: message.model };
  } catch (error) {
    if (error instanceof ModelClientError) {
      return { ok: false, error: error.message, errorClass: error.errorClass };
    }
    throw error;
  }
}
