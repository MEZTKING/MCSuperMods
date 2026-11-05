/**
 * The renderer side of a plugin worker (ADR 0035 D1, D3, D4): starts a dedicated worker from
 * a `blob:` of the bootstrap plus the plugin bundle, sends requests with deadlines and
 * relays exporter callbacks.
 *
 * Failure semantics: a request past its deadline, an uncaught error in the worker (the
 * `error` event: a bundle that throws at top level, for example) or a `fatal` message
 * terminates the worker and marks it `failed` (`plugin.timeout` or `plugin.crashed`); every
 * later call rejects with `plugin.unavailable`. A plugin function that throws or rejects only
 * fails that call (`plugin.crashed`), and one that returns something other than JSON or
 * `Uint8Array` fails it with `plugin.bad-result`: the worker keeps running, because the
 * plugin's other functions are unaffected.
 *
 * @packageDocumentation
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import type {
  PluginDescription,
  SandboxCallback,
  SandboxMethod,
  SandboxRequest,
  SandboxWorkerMessage,
} from './protocol';
import { bootstrapSource } from './worker-bootstrap';

/** Request deadlines in milliseconds (ADR 0035 D4). */
export const SANDBOX_DEADLINES: Readonly<Record<SandboxMethod, number>> = Object.freeze({
  lower: 2000,
  data: 2000,
  validate: 5000,
  build: 5000,
  import: 30_000,
  run: 120_000,
});

/** How long a plugin may take to report `ready` (plan B154: 10 s, then `plugin.timeout`). */
export const SANDBOX_START_DEADLINE_MS = 10_000;

/** The part of a `Worker` the host uses (a test double in Node). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void;
  terminate(): void;
}

/** A failed call or start: `code` is one of the plan's `plugin.*` codes. */
export class SandboxError extends Error {
  /** The `plugin.*` code. */
  readonly code: string;

  /**
   * @param code - `plugin.timeout`, `plugin.crashed`, `plugin.bad-result` or `plugin.unavailable`.
   * @param message - What happened.
   */
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SandboxError';
  }
}

/** Handlers for the callbacks a request may make (exporter sink and problem reporter). */
export interface CallHooks {
  writeFile?(path: string, contents: Uint8Array): void | Promise<void>;
  report?(problem: unknown): void;
}

/** A running plugin worker. */
export interface PluginWorker {
  /** Resolves with the plugin's description, or rejects if it fails before registering. */
  readonly ready: Promise<PluginDescription>;
  /** `starting`, `ready`, `failed` (timeout or crash; the worker is gone) or `terminated`. */
  readonly state: 'starting' | 'ready' | 'failed' | 'terminated';
  /** The error that failed the worker, once `state` is `failed`. */
  readonly failure: SandboxError | null;
  /**
   * Sends one request; rejects with a {@link SandboxError} on a deadline, crash or bad
   * result. Resolves only after every `writeFile` hook the request triggered has settled.
   */
  call(
    method: SandboxMethod,
    args: unknown[],
    deadlineMs?: number,
    hooks?: CallHooks,
  ): Promise<unknown>;
  /** Stops the worker; pending calls reject with `plugin.unavailable`. */
  terminate(): void;
  /** Subscribes to the worker failing (not to {@link terminate}); returns an unsubscribe function. */
  onFail(listener: (error: SandboxError) => void): () => void;
}

/** Options of {@link createPluginWorker}. */
export interface CreatePluginWorkerOptions {
  /** Deadline for the `ready` message (default {@link SANDBOX_START_DEADLINE_MS}). */
  startDeadlineMs?: number;
  /** Starts a worker from the full script text; the default uses a `blob:` URL. */
  spawn?(source: string, name: string): WorkerLike;
  /** The worker's name in developer tools (default `msm-plugin`). */
  name?: string;
}

interface BlobWorkerGlobals {
  Blob: new (parts: string[], options: { type: string }) => unknown;
  URL: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  Worker: new (url: string, options?: { name?: string }) => WorkerLike;
}

/** Starts a dedicated classic worker from a `blob:` URL of `source` (ADR 0035 D1). */
export function spawnBlobWorker(source: string, name = 'msm-plugin'): WorkerLike {
  const globals = globalThis as unknown as BlobWorkerGlobals;
  const url = globals.URL.createObjectURL(new globals.Blob([source], { type: 'text/javascript' }));
  try {
    return new globals.Worker(url, { name });
  } finally {
    // The worker has already resolved its script URL; revoking it keeps nothing alive.
    globals.URL.revokeObjectURL(url);
  }
}

const isUint8Array = (value: unknown): value is Uint8Array => value instanceof Uint8Array;

/** Whether `value` is JSON or `Uint8Array` all the way down (the host's own check, ADR 0035 D3). */
export function isCloneableResult(value: unknown, depth = 0): boolean {
  if (depth > 200) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object': {
      if (isUint8Array(value)) return true;
      if (Array.isArray(value)) return value.every((item) => isCloneableResult(item, depth + 1));
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(value as Record<string, unknown>).every(
        (item) => item === undefined || isCloneableResult(item, depth + 1),
      );
    }
    default:
      return false;
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: SandboxError): void;
  timer: ReturnType<typeof setTimeout>;
  hooks: CallHooks | undefined;
  /** `writeFile` hooks still running; the call settles after them. */
  writes: Promise<void>[];
  /** The first hook failure, which fails the call. */
  hookError: SandboxError | null;
}

/**
 * Starts a worker running the bootstrap followed by `code` (a plugin bundle that calls
 * `defineMsmPlugin` once).
 */
export function createPluginWorker(
  code: string,
  options: CreatePluginWorkerOptions = {},
): PluginWorker {
  const name = options.name ?? 'msm-plugin';
  const worker = (options.spawn ?? spawnBlobWorker)(`${bootstrapSource()}${code}\n`, name);
  const pending = new Map<number, Pending>();
  const failListeners = new Set<(error: SandboxError) => void>();
  let nextId = 1;
  let state: PluginWorker['state'] = 'starting';
  let failure: SandboxError | null = null;
  let resolveReady!: (description: PluginDescription) => void;
  let rejectReady!: (error: SandboxError) => void;
  const ready = new Promise<PluginDescription>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Callers that never await `ready` must not see an unhandled rejection.
  ready.catch(() => undefined);

  const stop = (error: SandboxError, nextState: 'failed' | 'terminated'): void => {
    if (state === 'failed' || state === 'terminated') return;
    state = nextState;
    worker.terminate();
    clearTimeout(startTimer);
    rejectReady(error);
    const unavailable =
      nextState === 'failed'
        ? new SandboxError('plugin.unavailable', `The plugin stopped: ${error.message}`)
        : error;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(unavailable);
    }
    pending.clear();
    if (nextState === 'failed') {
      failure = error;
      for (const listener of failListeners) listener(error);
    }
  };

  const startTimer = setTimeout(() => {
    stop(
      new SandboxError(
        'plugin.timeout',
        `The plugin did not start within ${options.startDeadlineMs ?? SANDBOX_START_DEADLINE_MS} ms.`,
      ),
      'failed',
    );
  }, options.startDeadlineMs ?? SANDBOX_START_DEADLINE_MS);

  const settle = (id: number, outcome: SandboxError | { value: unknown }): void => {
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    void Promise.allSettled(entry.writes).then(() => {
      if (outcome instanceof SandboxError) entry.reject(outcome);
      else if (entry.hookError !== null) entry.reject(entry.hookError);
      else entry.resolve(outcome.value);
    });
  };

  const onCallback = (message: SandboxCallback): void => {
    const entry = pending.get(message.id);
    if (entry === undefined || !Array.isArray(message.args)) return;
    if (message.op === 'writeFile') {
      const [path, contents] = message.args;
      if (typeof path !== 'string' || !isUint8Array(contents)) {
        entry.hookError ??= new SandboxError(
          'plugin.bad-result',
          'writeFile needs a path and Uint8Array contents.',
        );
        return;
      }
      if (!isProjectRelativePath(path)) {
        entry.hookError ??= new SandboxError(
          'plugin.bad-result',
          `writeFile path ${JSON.stringify(path)} is not a safe relative path.`,
        );
        return;
      }
      const write = entry.hooks?.writeFile;
      if (write === undefined) return;
      entry.writes.push(
        Promise.resolve()
          .then(() => write(path, contents))
          .catch((error: unknown) => {
            entry.hookError ??= new SandboxError(
              'plugin.crashed',
              `writeFile ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }),
      );
    } else if (message.op === 'report') {
      entry.hooks?.report?.(message.args[0]);
    }
  };

  worker.addEventListener('message', (event) => {
    const message = event.data as SandboxWorkerMessage;
    if (message === null || typeof message !== 'object') return;
    switch (message.type) {
      case 'ready':
        if (state !== 'starting') return;
        state = 'ready';
        clearTimeout(startTimer);
        resolveReady(message.description);
        return;
      case 'fatal':
        stop(new SandboxError('plugin.crashed', String(message.message)), 'failed');
        return;
      case 'callback':
        onCallback(message);
        return;
      case 'response': {
        if (typeof message.id !== 'number') return;
        if (!message.ok) {
          const code =
            message.code === 'plugin.bad-result' ? 'plugin.bad-result' : 'plugin.crashed';
          settle(message.id, new SandboxError(code, String(message.message)));
        } else if (!isCloneableResult(message.value)) {
          settle(
            message.id,
            new SandboxError('plugin.bad-result', 'The result is not JSON or Uint8Array.'),
          );
        } else {
          settle(message.id, { value: message.value });
        }
        return;
      }
    }
  });
  worker.addEventListener('error', (event) => {
    stop(
      new SandboxError('plugin.crashed', event.message ?? 'The plugin worker crashed.'),
      'failed',
    );
  });

  return {
    ready,
    get state() {
      return state;
    },
    get failure() {
      return failure;
    },
    call(method, args, deadlineMs = SANDBOX_DEADLINES[method], hooks) {
      if (state === 'failed' || state === 'terminated') {
        return Promise.reject(
          new SandboxError(
            'plugin.unavailable',
            failure === null
              ? 'The plugin is not running.'
              : `The plugin is not running: ${failure.message}`,
          ),
        );
      }
      const id = nextId++;
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          const error = new SandboxError(
            'plugin.timeout',
            `${method} did not answer within ${deadlineMs} ms.`,
          );
          pending.delete(id);
          reject(error);
          stop(error, 'failed');
        }, deadlineMs);
        pending.set(id, { resolve, reject, timer, hooks, writes: [], hookError: null });
        const request: SandboxRequest = { type: 'request', id, method, args };
        try {
          worker.postMessage(request);
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(
            new SandboxError(
              'plugin.bad-result',
              `The request could not be sent: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });
    },
    terminate() {
      stop(
        new SandboxError('plugin.unavailable', 'The plugin worker was terminated.'),
        'terminated',
      );
    },
    onFail(listener) {
      failListeners.add(listener);
      return () => {
        failListeners.delete(listener);
      };
    },
  };
}
