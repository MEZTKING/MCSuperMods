/**
 * The renderer side of a plugin worker (ADR 0035 D1, D3, D4). Spike quality (B150); B154
 * replaces it with the real loader.
 *
 * @packageDocumentation
 */

import { assertProjectRelativePath } from '@msm/plugin-api';
import type {
  PluginDescription,
  SandboxCallback,
  SandboxMethod,
  SandboxRequest,
  SandboxWorkerMessage,
} from './protocol';
import { bootstrapSource } from './worker-bootstrap';

/** The part of a `Worker` the host uses (a test double in Node). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void;
  terminate(): void;
}

/** A failed call: `code` is one of the plan's `plugin.*` codes. */
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
  writeFile?(path: string, contents: Uint8Array): void;
  report?(problem: unknown): void;
}

/** A running plugin worker. */
export interface PluginWorker {
  /** Resolves with the plugin's description, or rejects if it fails before registering. */
  readonly ready: Promise<PluginDescription>;
  /** `starting`, `ready`, `failed` (timeout or crash; the worker is gone) or `terminated`. */
  readonly state: 'starting' | 'ready' | 'failed' | 'terminated';
  /** Sends one request; rejects with a {@link SandboxError} on a deadline, crash or bad result. */
  call(
    method: SandboxMethod,
    args: unknown[],
    deadlineMs: number,
    hooks?: CallHooks,
  ): Promise<unknown>;
  /** Stops the worker; pending calls reject with `plugin.unavailable`. */
  terminate(): void;
}

/** Options of {@link createPluginWorker}. */
export interface CreatePluginWorkerOptions {
  /** Remove network and storage globals in the bootstrap (default `true`). */
  strip?: boolean;
  /** Deadline for the `ready` message (default 5 s). */
  startDeadlineMs?: number;
  /** Starts a worker from the full script text; the default uses a `blob:` URL. */
  spawn?(source: string): WorkerLike;
}

interface BlobWorkerGlobals {
  Blob: new (parts: string[], options: { type: string }) => unknown;
  URL: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  Worker: new (url: string, options?: { name?: string }) => WorkerLike;
}

/** Starts a dedicated worker from a `blob:` URL of `source` (ADR 0035 D1). */
export function spawnBlobWorker(source: string): WorkerLike {
  const globals = globalThis as unknown as BlobWorkerGlobals;
  const url = globals.URL.createObjectURL(new globals.Blob([source], { type: 'text/javascript' }));
  try {
    return new globals.Worker(url, { name: 'msm-plugin' });
  } finally {
    // The worker has already resolved its script URL; revoking it keeps nothing alive.
    globals.URL.revokeObjectURL(url);
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: SandboxError): void;
  timer: ReturnType<typeof setTimeout>;
  hooks: CallHooks | undefined;
}

/**
 * Starts a worker running the bootstrap followed by `code` (a plugin bundle that calls
 * `defineMsmPlugin` once).
 */
export function createPluginWorker(
  code: string,
  options: CreatePluginWorkerOptions = {},
): PluginWorker {
  const worker = (options.spawn ?? spawnBlobWorker)(
    `${bootstrapSource(options.strip ?? true)}${code}\n`,
  );
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let state: PluginWorker['state'] = 'starting';
  let resolveReady!: (description: PluginDescription) => void;
  let rejectReady!: (error: SandboxError) => void;
  const ready = new Promise<PluginDescription>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Callers that never await `ready` must not see an unhandled rejection.
  ready.catch(() => undefined);

  const fail = (error: SandboxError, nextState: 'failed' | 'terminated'): void => {
    if (state === 'failed' || state === 'terminated') return;
    state = nextState;
    worker.terminate();
    clearTimeout(startTimer);
    rejectReady(error);
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(
        nextState === 'failed' ? error : new SandboxError('plugin.unavailable', error.message),
      );
    }
    pending.clear();
  };

  const startTimer = setTimeout(() => {
    fail(new SandboxError('plugin.timeout', 'The plugin did not register in time.'), 'failed');
  }, options.startDeadlineMs ?? 5000);

  const onCallback = (message: SandboxCallback): void => {
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    if (message.op === 'writeFile') {
      const [path, contents] = message.args;
      if (typeof path !== 'string' || !(contents instanceof Uint8Array)) {
        settle(
          message.id,
          new SandboxError('plugin.bad-result', 'writeFile needs a path and bytes.'),
        );
        return;
      }
      try {
        assertProjectRelativePath(path);
      } catch (error) {
        settle(message.id, new SandboxError('plugin.bad-result', (error as Error).message));
        return;
      }
      entry.hooks?.writeFile?.(path, contents);
    } else {
      entry.hooks?.report?.(message.args[0]);
    }
  };

  const settle = (id: number, outcome: SandboxError | { value: unknown }): void => {
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (outcome instanceof SandboxError) entry.reject(outcome);
    else entry.resolve(outcome.value);
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
        fail(new SandboxError(message.code, message.message), 'failed');
        return;
      case 'callback':
        onCallback(message);
        return;
      case 'response':
        settle(
          message.id,
          message.ok ? { value: message.value } : new SandboxError(message.code, message.message),
        );
        return;
    }
  });
  worker.addEventListener('error', (event) => {
    fail(
      new SandboxError('plugin.crashed', event.message ?? 'The plugin worker crashed.'),
      'failed',
    );
  });

  return {
    ready,
    get state() {
      return state;
    },
    call(method, args, deadlineMs, hooks) {
      if (state === 'failed' || state === 'terminated') {
        return Promise.reject(
          new SandboxError('plugin.unavailable', 'The plugin worker is not running.'),
        );
      }
      const id = nextId++;
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          fail(
            new SandboxError('plugin.timeout', `${method} did not answer within ${deadlineMs} ms.`),
            'failed',
          );
        }, deadlineMs);
        pending.set(id, { resolve, reject, timer, hooks });
        const request: SandboxRequest = { type: 'request', id, method, args };
        worker.postMessage(request);
      });
    },
    terminate() {
      fail(
        new SandboxError('plugin.unavailable', 'The plugin worker was terminated.'),
        'terminated',
      );
    },
  };
}
