/**
 * AI pictures in main (ADR 0093 D1, D3): one encrypted key per service (the AI helper's key
 * store, ADR 0041 D1, over `<msmHome>/ai-pictures-<service>-key.bin`), the chosen service in
 * `<msmHome>/ai-pictures.json` (not a secret), and the requests: each with a time-out and a
 * cancel by request id. Only the description and the style leave the computer; never project
 * files. The keys never reach the renderer: {@link AiPicturesService.status} reports whether one
 * is set and its last four characters.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AI_PICTURE_SERVICES,
  AI_PICTURES_IMAGE_MAX_BYTES,
  type AiPictureKeyTest,
  type AiPictureRequest,
  type AiPictureResult,
  type AiPictureServiceId,
  type AiPicturesPlatform,
  type AiPicturesStatus,
  DEFAULT_AI_PICTURE_SERVICE,
} from '../../shared/ai-pictures';
import { AI_KEY_TAIL_LENGTH, type AiKeyStore } from '../ai/ai-key-store';
import { writeFileAtomic } from '../platform/node-platform';
import { openAiProvider } from './openai';
import { ERROR_WORDS, isAbort, PictureError, type PictureProvider, pictureError } from './provider';
import { retroDiffusionProvider } from './retro-diffusion';

/** The settings file name below the MSM home directory. */
export const AI_PICTURES_SETTINGS_FILE = 'ai-pictures.json';

/** The key file of a service below the MSM home directory. */
export function aiPicturesKeyFile(service: AiPictureServiceId): string {
  return `ai-pictures-${service}-key.bin`;
}

/** How long one request may take (OpenAI: up to two minutes; a queued task as long). */
export const AI_PICTURES_TIMEOUT_MS = 180_000;

/** The tail reported for the fake service's pretend key. */
export const AI_PICTURES_E2E_TAIL = 'e2e!';

export interface AiPicturesServiceDeps {
  msmHome: string;
  /** Creates the key store of a service (the AI helper's store with another file). */
  keyStore(service: AiPictureServiceId): AiKeyStore;
  /** The adapters (default: the real ones). */
  providers?: Partial<Record<AiPictureServiceId, PictureProvider>>;
  /** Replaces every service and needs no key (e2e). */
  fake?: PictureProvider;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Waits between polls (tests). */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
  /** Logs unexpected failures (never a key). */
  log?(message: string, error?: unknown): void;
}

/** The service behind `PlatformAdapter.aiPictures`. */
export type AiPicturesService = AiPicturesPlatform & {
  /** Request ids still running (tests). */
  active(): string[];
};

const PROVIDERS: Record<AiPictureServiceId, PictureProvider> = {
  'retro-diffusion': retroDiffusionProvider,
  openai: openAiProvider,
};

function isService(value: unknown): value is AiPictureServiceId {
  return (AI_PICTURE_SERVICES as readonly unknown[]).includes(value);
}

/** Creates the service. */
export function createAiPicturesService(deps: AiPicturesServiceDeps): AiPicturesService {
  const stores = new Map<AiPictureServiceId, AiKeyStore>();
  const storeOf = (service: AiPictureServiceId): AiKeyStore => {
    let store = stores.get(service);
    if (store === undefined) {
      store = deps.keyStore(service);
      stores.set(service, store);
    }
    return store;
  };
  const providerOf = (service: AiPictureServiceId): PictureProvider =>
    deps.fake ?? deps.providers?.[service] ?? PROVIDERS[service];
  const settingsFile = join(deps.msmHome, AI_PICTURES_SETTINGS_FILE);
  const running = new Map<string, AbortController>();
  const doFetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const log =
    deps.log ??
    ((message: string, error?: unknown) =>
      error === undefined ? console.error(message) : console.error(message, error));

  const chosen = async (): Promise<AiPictureServiceId> => {
    try {
      const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as { service?: unknown };
      return isService(parsed.service) ? parsed.service : DEFAULT_AI_PICTURE_SERVICE;
    } catch {
      return DEFAULT_AI_PICTURE_SERVICE;
    }
  };

  const keyOf = async (service: AiPictureServiceId): Promise<string | null> =>
    deps.fake === undefined ? storeOf(service).read() : 'e2e-fake-key';

  /** Runs `work` with a time-out and a cancel by `requestId`. */
  const withSignal = async <T>(
    requestId: string | null,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deps.timeoutMs ?? AI_PICTURES_TIMEOUT_MS);
    if (requestId !== null) running.set(requestId, controller);
    try {
      return await work(controller.signal);
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        throw pictureError(timedOut ? 'timeout' : 'cancelled');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (requestId !== null && running.get(requestId) === controller) running.delete(requestId);
    }
  };

  const failed = (
    error: unknown,
  ): { ok: false; error: string; errorClass: PictureError['errorClass'] } => {
    if (error instanceof PictureError) {
      return { ok: false, error: error.message, errorClass: error.errorClass };
    }
    log('MSM AI pictures: the request failed unexpectedly.', error);
    return { ok: false, error: ERROR_WORDS.bad_response, errorClass: 'bad_response' };
  };

  return {
    async status(): Promise<AiPicturesStatus> {
      const service = await chosen();
      if (deps.fake !== undefined) {
        const set = { set: true, tail: AI_PICTURES_E2E_TAIL };
        return {
          service,
          keys: { 'retro-diffusion': set, openai: set },
          encryptionAvailable: true,
        };
      }
      const entries = await Promise.all(
        AI_PICTURE_SERVICES.map(async (id) => [id, await storeOf(id).status()] as const),
      );
      const keys = Object.fromEntries(
        entries.map(([id, status]) => [
          id,
          {
            set: status.set,
            tail: status.tail === null ? null : status.tail.slice(-AI_KEY_TAIL_LENGTH),
          },
        ]),
      ) as AiPicturesStatus['keys'];
      return {
        service,
        keys,
        encryptionAvailable: entries.every(([, status]) => status.encryptionAvailable),
      };
    },
    async setService(service) {
      if (!isService(service)) throw new Error(`Unknown image service ${String(service)}.`);
      await writeFileAtomic(
        settingsFile,
        new TextEncoder().encode(`${JSON.stringify({ service }, null, 2)}\n`),
      );
    },
    async setKey(service, key) {
      await storeOf(service).set(key);
    },
    async clearKey(service) {
      await storeOf(service).clear();
    },
    async testKey(service): Promise<AiPictureKeyTest> {
      const apiKey = await keyOf(service);
      if (apiKey === null) return { ok: false, error: ERROR_WORDS.no_key, errorClass: 'no_key' };
      try {
        return await withSignal(null, (signal) =>
          providerOf(service).testKey({
            apiKey,
            fetch: doFetch,
            signal,
            ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
          }),
        );
      } catch (error) {
        return failed(error);
      }
    },
    async generate(request: AiPictureRequest): Promise<AiPictureResult> {
      const service = await chosen();
      const apiKey = await keyOf(service);
      if (apiKey === null) return { ok: false, error: ERROR_WORDS.no_key, errorClass: 'no_key' };
      if (running.has(request.requestId)) {
        return failed(pictureError('bad_response', 'that request is already running'));
      }
      try {
        const images = await withSignal(request.requestId, (signal) =>
          providerOf(service).generate(
            {
              prompt: request.prompt,
              style: request.style,
              size: request.size,
              count: request.count,
              transparent: request.transparent,
            },
            {
              apiKey,
              fetch: doFetch,
              signal,
              ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
            },
          ),
        );
        if (images.some((image) => image.length > AI_PICTURES_IMAGE_MAX_BYTES)) {
          throw pictureError('bad_response', 'a picture is too large');
        }
        return { ok: true, images: images.slice(0, request.count) };
      } catch (error) {
        return failed(error);
      }
    },
    async cancel(requestId) {
      running.get(requestId)?.abort();
    },
    active: () => [...running.keys()],
  };
}
