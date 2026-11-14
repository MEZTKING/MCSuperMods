/**
 * The adapter interface every image service implements (ADR 0093 D2), and the error words
 * shared by the adapters. Adapters run in main only: they get the key from the service, a
 * `fetch` and an `AbortSignal` (cancel or time-out), and return PNG bytes.
 *
 * @packageDocumentation
 */

import type {
  AiPictureErrorClass,
  AiPictureKeyTest,
  AiPictureServiceId,
  AiPictureStyle,
} from '../../shared/ai-pictures';

/** What an adapter is asked for. */
export interface GenerateInput {
  prompt: string;
  style: AiPictureStyle;
  /** The texture's edge in pixels; the adapter picks the nearest size its service draws. */
  size: number;
  count: number;
  transparent: boolean;
}

/** What every call of an adapter gets. */
export interface CallContext {
  apiKey: string;
  fetch: typeof fetch;
  /** Aborted on cancel or time-out. */
  signal: AbortSignal;
  /** Waits between polls (tests pass one that resolves at once). */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

/** One image service. */
export interface PictureProvider {
  id: AiPictureServiceId;
  /** PNG bytes, one per picture. Throws {@link PictureError}. */
  generate(input: GenerateInput, context: CallContext): Promise<Uint8Array[]>;
  /** A free request that checks the key. */
  testKey(context: CallContext): Promise<AiPictureKeyTest>;
}

/** A failure the UI can explain. */
export class PictureError extends Error {
  readonly errorClass: AiPictureErrorClass;
  constructor(errorClass: AiPictureErrorClass, message: string) {
    super(message);
    this.name = 'PictureError';
    this.errorClass = errorClass;
  }
}

/** The plain words of each error class (the service's own detail is added after them). */
export const ERROR_WORDS: Readonly<Record<AiPictureErrorClass, string>> = Object.freeze({
  no_key: 'No key is set for this service. Add one in Settings, AI pictures.',
  bad_key: 'The service did not accept the key. Check it in Settings, AI pictures.',
  quota: 'The account has run out of credit or quota. Top it up on the service’s website.',
  rate_limit: 'The service is getting too many requests. Wait a minute and try again.',
  refused: 'The service declined this description. Try describing it another way.',
  network: 'The service could not be reached. Check the internet connection.',
  timeout: 'The service took too long to answer. Try again.',
  cancelled: 'Cancelled.',
  server: 'The service had a problem. Try again later.',
  bad_response: 'The service sent back something MSM could not read.',
});

/** A {@link PictureError} with the plain words of `errorClass` and the service's detail. */
export function pictureError(errorClass: AiPictureErrorClass, detail?: string): PictureError {
  const words = ERROR_WORDS[errorClass];
  const extra = detail === undefined || detail === '' ? '' : ` (${detail.slice(0, 300)})`;
  return new PictureError(errorClass, `${words}${extra}`);
}

/** Whether `error` is an abort (cancel or time-out). */
export function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * `fetch` with errors turned into {@link PictureError}: aborts are rethrown as they are (the
 * service decides between cancel and time-out), anything else is `network`.
 */
export async function send(
  context: CallContext,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await context.fetch(url, { ...init, signal: context.signal });
  } catch (error) {
    if (isAbort(error) || context.signal.aborted) throw error;
    throw pictureError('network', error instanceof Error ? error.message : String(error));
  }
}

/** The body of a failed response as JSON, or `null`. */
export async function errorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Decodes base64 to bytes and checks the PNG signature. */
export function pngFromBase64(text: unknown): Uint8Array {
  if (typeof text !== 'string' || text === '') throw pictureError('bad_response', 'no picture');
  const bytes = new Uint8Array(Buffer.from(text, 'base64'));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || png.some((byte, index) => bytes[index] !== byte)) {
    throw pictureError('bad_response', 'not a PNG picture');
  }
  return bytes;
}

/** Waits `ms`, or rejects with an abort when `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('Aborted.');
  error.name = 'AbortError';
  return error;
}

/** A field of an object, or `undefined`. */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
