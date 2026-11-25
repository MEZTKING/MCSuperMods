/**
 * Try it's script worker (B400, ADR 0085 D9 slice 4): a {@link ScriptRunner} that runs the
 * project's transpiled ES5 scripts in a dedicated Web Worker against `@msm/sim`'s Script API
 * shim, with no network and no DOM.
 *
 * - **No `eval`.** The renderer's Content Security Policy allows scripts from `'self'` only (no
 *   `'unsafe-eval'`) and workers from `'self'` and `blob:`. As the plugin sandbox does (ADR 0035,
 *   `plugins/sandbox/`), the worker is a classic `blob:` worker whose one script is built here:
 *   each compiled script wrapped in a CommonJS function, then the shim
 *   (`createScriptRuntime`, self-contained, serialised with `Function.prototype.toString`) and
 *   {@link scriptWorkerMain}. Nothing is evaluated from text inside the worker.
 * - **No network, no storage.** A `blob:` worker inherits the document's CSP (`connect-src
 *   'self'`); {@link scriptWorkerMain} also removes, before any script runs, the plugin
 *   worker's list (`plugins/sandbox/worker-lockdown.ts`: network, storage and storage buckets,
 *   Web Locks, `Notification`, devices, the GPU; B870) and the timers, and keeps `postMessage`
 *   for itself.
 * - **A budget per call.** Each request has {@link SCRIPT_BUDGET_MS} (ADR 0031 D3's 2,000 ms):
 *   past it the worker is terminated and the call answers `timedOut`; the bridge reports it in
 *   "What happened" and starts the scripts again in a fresh worker.
 * - Promise callbacks of the scripts run before the answer goes back (the worker answers on its
 *   next task), as the runtime runs microtasks after each handler (ADR 0031 D4).
 *
 * Part of the lazy Try it chunk.
 */
import {
  type CompiledScript,
  createScriptRuntime,
  type ScriptRequest,
  type ScriptResponse,
  type ScriptRunner,
  type ScriptRuntimeInit,
} from '@msm/sim';
import { spawnBlobWorker, type WorkerLike } from '../plugins/sandbox/host';
import {
  lockDownWorkerScope,
  WORKER_STRIPPED_GLOBALS,
  WORKER_STRIPPED_NAVIGATOR,
} from '../plugins/sandbox/worker-lockdown';

/** How long one call may run before the worker is stopped (ADR 0031 D3). */
export const SCRIPT_BUDGET_MS = 2000;

/**
 * The globals the worker removes before any script runs: the plugin worker's list, and the
 * timers (a script runs only inside a call: nothing of it may keep running after one).
 */
export const SCRIPT_WORKER_STRIPPED = [
  ...WORKER_STRIPPED_GLOBALS,
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'scheduler',
] as const;

/** The `navigator` members the worker removes before any script runs. */
export const SCRIPT_WORKER_STRIPPED_NAVIGATOR = WORKER_STRIPPED_NAVIGATOR;

/** A message to the worker. */
export type ScriptWorkerMessage =
  | { readonly id: number; readonly kind: 'start'; readonly init: ScriptRuntimeInit }
  | { readonly id: number; readonly kind: 'send'; readonly request: ScriptRequest };

/** A message from the worker. */
export type ScriptWorkerReply =
  | { readonly id: number; readonly response: ScriptResponse }
  | { readonly id: number; readonly error: string };

/**
 * Runs first inside the worker. Self-contained (serialised with `Function.prototype.toString`):
 * it may reference nothing outside its own body.
 *
 * @param createRuntime - `createScriptRuntime` of `@msm/sim`.
 * @param modules - The compiled scripts by id.
 * @param lockDown - `lockDownWorkerScope` of the plugin sandbox.
 * @param stripped - The global names to remove.
 * @param strippedNavigator - The `navigator` members to remove.
 */
export function scriptWorkerMain(
  createRuntime: typeof createScriptRuntime,
  modules: Parameters<typeof createScriptRuntime>[1],
  lockDown: typeof lockDownWorkerScope,
  stripped: readonly string[],
  strippedNavigator: readonly string[],
): void {
  type Obj = Record<string, unknown>;
  interface Scope {
    postMessage(message: unknown): void;
    addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
    setTimeout(callback: () => void, ms: number): unknown;
  }
  const scope = globalThis as unknown as Scope & Obj;
  const post = scope.postMessage.bind(scope);
  const listen = scope.addEventListener.bind(scope);
  const later = scope.setTimeout.bind(scope);
  lockDown([...stripped, 'postMessage'], strippedNavigator);

  let runtime: ReturnType<typeof createScriptRuntime> | null = null;
  listen('message', (event) => {
    const message = event.data as
      | { id: number; kind: 'start'; init: Parameters<typeof createScriptRuntime>[0] }
      | {
          id: number;
          kind: 'send';
          request: Parameters<ReturnType<typeof createScriptRuntime>['handle']>[0];
        };
    try {
      if (message.kind === 'start') {
        runtime = createRuntime(message.init, modules);
        runtime.handle({ type: 'load' });
      } else {
        if (runtime === null) throw new Error('The scripts have not started.');
        runtime.handle(message.request);
      }
    } catch (error) {
      post({ id: message.id, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    // On the next task, after the scripts' Promise callbacks have run.
    later(() => {
      try {
        post({ id: message.id, response: (runtime as NonNullable<typeof runtime>).collect() });
      } catch (error) {
        post({ id: message.id, error: error instanceof Error ? error.message : String(error) });
      }
    }, 0);
  });
}

/** The worker's whole script: the compiled scripts, the shim and {@link scriptWorkerMain}. */
export function scriptWorkerSource(scripts: readonly CompiledScript[]): string {
  const parts = ['var __msmScripts = {};\n'];
  for (const script of scripts) {
    // A line break before the closing brace: the script may end in a line comment.
    parts.push(
      `__msmScripts[${JSON.stringify(script.id)}] = function (exports, require, module, msm) {\n${script.js}\n};\n`,
    );
  }
  parts.push(
    `(${scriptWorkerMain.toString()})(${createScriptRuntime.toString()}, __msmScripts, ${lockDownWorkerScope.toString()}, ${JSON.stringify(SCRIPT_WORKER_STRIPPED)}, ${JSON.stringify(SCRIPT_WORKER_STRIPPED_NAVIGATOR)});\n`,
  );
  return parts.join('');
}

/** Options of {@link createWorkerRunner}. */
export interface WorkerRunnerOptions {
  /** The budget per call; default {@link SCRIPT_BUDGET_MS}. */
  readonly budgetMs?: number;
  /** Starts a worker from its script text; default a `blob:` worker. */
  readonly spawn?: (source: string) => WorkerLike;
}

/** A response for a call stopped after its budget. */
const timedOut = (ms: number): ScriptResponse => ({
  steps: [],
  cancelled: false,
  keepBlocks: false,
  listeners: {},
  actions: [],
  nextDue: null,
  timedOut: { ms },
});

/** The Web Worker runner; see the module comment. */
export function createWorkerRunner(options: WorkerRunnerOptions = {}): ScriptRunner {
  const budget = options.budgetMs ?? SCRIPT_BUDGET_MS;
  const spawn =
    options.spawn ?? ((source: string) => spawnBlobWorker(source, 'msm-try-it-scripts'));
  let worker: WorkerLike | null = null;
  let source = '';
  let serial = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (response: ScriptResponse) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const stop = (): void => {
    worker?.terminate();
    worker = null;
  };

  const failAll = (message: string): void => {
    for (const [id, call] of pending) {
      clearTimeout(call.timer);
      pending.delete(id);
      call.reject(new Error(message));
    }
  };

  const open = (): WorkerLike => {
    const next = spawn(source);
    next.addEventListener('message', (event) => {
      const reply = event.data as ScriptWorkerReply;
      const call = pending.get(reply.id);
      if (call === undefined) return;
      clearTimeout(call.timer);
      pending.delete(reply.id);
      if ('error' in reply) call.reject(new Error(reply.error));
      else call.resolve(reply.response);
    });
    next.addEventListener('error', (event) => {
      if (worker !== next) return;
      stop();
      failAll(event.message ?? 'the script worker stopped');
    });
    return next;
  };

  type Unsent =
    | { readonly kind: 'start'; readonly init: ScriptRuntimeInit }
    | { readonly kind: 'send'; readonly request: ScriptRequest };
  const ask = (message: Unsent): Promise<ScriptResponse> => {
    if (disposed) return Promise.reject(new Error('Try it has closed.'));
    if (worker === null) worker = open();
    const target = worker;
    serial += 1;
    const id = serial;
    return new Promise<ScriptResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        // An endless loop: only stopping the worker ends it.
        if (worker === target) stop();
        failAll('the scripts were stopped');
        resolve(timedOut(budget));
      }, budget);
      pending.set(id, { resolve, reject, timer });
      target.postMessage({ id, ...message });
    });
  };

  return {
    start(init: ScriptRuntimeInit, scripts: readonly CompiledScript[]) {
      // A fresh worker for each start: new scripts, or the scripts again after a stop.
      stop();
      failAll('the scripts started again');
      source = scriptWorkerSource(scripts);
      return ask({ kind: 'start', init });
    },
    send(request: ScriptRequest) {
      return ask({ kind: 'send', request });
    },
    dispose() {
      disposed = true;
      stop();
      failAll('Try it has closed.');
    },
  };
}
