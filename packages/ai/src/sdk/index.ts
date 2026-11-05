/**
 * `@msm/ai/sdk`: the only runtime import of `@anthropic-ai/sdk` (ADR 0041 D2). Main loads this
 * entry with a dynamic `import()` so the SDK becomes a lazy chunk; the renderer and the preload
 * must never import it (Biome forbids it).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient } from '../client';
import { ModelClientError, ModelOutputError } from '../errors';

export { type AiKeyTestResult, testApiKey } from '../client';

/** The API host used when no `baseURL` is given; never read from the environment. */
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export interface AnthropicModelClientOptions {
  apiKey: string;
  /** Tests only: a local stub. Users have no base URL setting (ADR 0041 D1). */
  baseURL?: string;
  /** Tests only: retries of the SDK (default 2). */
  maxRetries?: number;
}

/**
 * SDK error classes by name, most specific first. Names are spelt out because the main chunk is
 * minified and `constructor.name` would not survive.
 */
const API_ERROR_CLASSES: ReadonlyArray<readonly [string, new (...args: never[]) => Error]> = [
  ['APIUserAbortError', Anthropic.APIUserAbortError],
  ['APIConnectionTimeoutError', Anthropic.APIConnectionTimeoutError],
  ['APIConnectionError', Anthropic.APIConnectionError],
  ['BadRequestError', Anthropic.BadRequestError],
  ['AuthenticationError', Anthropic.AuthenticationError],
  ['PermissionDeniedError', Anthropic.PermissionDeniedError],
  ['NotFoundError', Anthropic.NotFoundError],
  ['ConflictError', Anthropic.ConflictError],
  ['UnprocessableEntityError', Anthropic.UnprocessableEntityError],
  ['RateLimitError', Anthropic.RateLimitError],
  ['InternalServerError', Anthropic.InternalServerError],
];

/** Maps an SDK error to the package's errors; anything else is returned unchanged. */
export function mapSdkError(error: unknown): unknown {
  if (error instanceof Anthropic.APIError) {
    const entry = API_ERROR_CLASSES.find(([, cls]) => error instanceof cls);
    return new ModelClientError(entry?.[0] ?? 'APIError', error.message, error.status);
  }
  if (error instanceof Anthropic.AnthropicError) {
    // Not an API error: with eager input streaming, a tool input that is not JSON at all.
    return new ModelOutputError(error.message);
  }
  return error;
}

/**
 * A {@link ModelClient} over `client.beta.messages.stream`. The key is the only credential: the
 * auth token, base URL and webhook key are pinned so no environment variable or profile is used.
 */
export function createAnthropicModelClient(options: AnthropicModelClientOptions): ModelClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    authToken: null,
    webhookKey: null,
    baseURL: options.baseURL ?? DEFAULT_BASE_URL,
    maxRetries: options.maxRetries ?? 2,
  });
  return {
    async stream(request, signal, onEvent) {
      try {
        const stream = client.beta.messages.stream(request, { signal });
        for await (const event of stream) onEvent(event);
        return await stream.finalMessage();
      } catch (error) {
        throw mapSdkError(error);
      }
    },
  };
}
