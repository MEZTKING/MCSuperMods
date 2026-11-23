/**
 * The processors' side of the structures worker (ADR 0122 D6; B641). It does not import
 * `@msm/terrain` itself: the worker entry (`../assembly/worker.ts`, one of the two app files that
 * may, `test/components/terrain/imports.test.ts`) hands it the engine and routes the messages
 * {@link isProcessorRequest} accepts to it, so the processors never run on the page's thread.
 * Tests pass the real engine.
 *
 * One run at a time: a newer request replaces an older one, and a `cancel` drops the answer.
 */

import type { PieceTemplate } from '../vanilla-pieces';
import type { ProcessedResult } from './model';

/** What the view asks the worker to work out. */
export interface ProcessorJob {
  readonly template: PieceTemplate;
  /** The list's data as the element holds it (`{ processors: [...] }`). */
  readonly list: unknown;
  /** The seed as typed. */
  readonly seed: string;
  /** Where the template's 0, 0, 0 stands; its floor's height is the `y`. */
  readonly origin: readonly [number, number, number];
  /** The block around the building (every place outside it), or `null` for air. */
  readonly around: string | null;
  /** Block tag files by id, the mod's over Minecraft's. */
  readonly tags: Readonly<Record<string, unknown>>;
  /** The pool element type that places the template, when a pool of the mod does. */
  readonly elementType?: string;
}

/** A message to the worker for the processors. */
export type ProcessorRequest =
  | { readonly token: number; readonly kind: 'process'; readonly job: ProcessorJob }
  | { readonly token: number; readonly kind: 'process-cancel' };

/** A message from the worker for the processors. */
export type ProcessorAnswer =
  | {
      readonly token: number;
      readonly kind: 'processed';
      readonly result: ProcessedResult;
      readonly ms: number;
    }
  | { readonly token: number; readonly kind: 'process-error'; readonly message: string };

/** Whether a worker message is the processors' (the worker entry routes on this). */
export function isProcessorRequest(message: unknown): message is ProcessorRequest {
  const kind = (message as { kind?: unknown } | null)?.kind;
  return kind === 'process' || kind === 'process-cancel';
}

/** The part of `@msm/terrain` the host calls (`processTemplate`). */
export interface ProcessorEngine {
  processTemplate(
    input: {
      readonly template: PieceTemplate;
      readonly list: unknown;
      readonly rotation: 'none';
      readonly origin: readonly [number, number, number];
      readonly seed: bigint;
      readonly world: {
        blockAt(x: number, y: number, z: number): string | null;
        surfaceAt(x: number, z: number): number | null;
      };
    },
    options?: {
      readonly blockTag?: (id: string) => unknown;
      readonly element?: { readonly type?: string };
    },
  ): ProcessedResult;
}

/** The number a seed text runs with: the live views' rule (a whole number, else a hash). */
export function seedBigint(text: string): bigint {
  const trimmed = text.trim();
  if (/^-?\d+$/.test(trimmed)) {
    try {
      return BigInt.asIntN(64, BigInt(trimmed));
    } catch {
      // Falls through to the hash.
    }
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = Math.imul(hash ^ trimmed.charCodeAt(i), 0x01000193);
  }
  return BigInt(hash >>> 0);
}

/** What the worker entry calls with the processors' messages. */
export interface ProcessorHost {
  receive(message: ProcessorRequest): void;
}

/**
 * The host, apart from the worker scope so tests can drive it.
 *
 * @param engine - `@msm/terrain` (tests pass it too).
 * @param post - Sends to the main thread.
 * @param schedule - Runs the work after the current message (default `setTimeout(run, 0)`), so
 *   a newer request or a cancel that is already queued wins.
 * @param now - The clock (default `performance.now`).
 */
export function createProcessorHost(
  engine: ProcessorEngine,
  post: (answer: ProcessorAnswer) => void,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
  now: () => number = () => performance.now(),
): ProcessorHost {
  let current = 0;
  const run = (token: number, job: ProcessorJob): void => {
    if (current !== token) return;
    const began = now();
    try {
      const around = job.around;
      const floor = job.origin[1];
      const result = engine.processTemplate(
        {
          template: job.template,
          list: job.list,
          rotation: 'none',
          origin: job.origin,
          seed: seedBigint(job.seed),
          world: { blockAt: () => around, surfaceAt: () => floor },
        },
        {
          blockTag: (id) => job.tags[id],
          ...(job.elementType === undefined ? {} : { element: { type: job.elementType } }),
        },
      );
      if (current !== token) return;
      post({ token, kind: 'processed', result, ms: now() - began });
    } catch (error) {
      if (current !== token) return;
      post({
        token,
        kind: 'process-error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (current === token) current = 0;
  };
  return {
    receive(message) {
      if (message.kind === 'process-cancel') {
        if (current === message.token) current = 0;
        return;
      }
      current = message.token;
      schedule(() => run(message.token, message.job));
    },
  };
}
