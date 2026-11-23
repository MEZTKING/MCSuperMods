/**
 * The main thread's side of the shader worker (B629). One job at a time: while one runs, only
 * the newest waiting job is kept (an older one answers `null`), so typing never queues a row of
 * half-second runs. Without a worker (or when it cannot start) every job answers `webgl: false`.
 */

import type { GlAnswer, GlJob, PostJob, ProgramJob } from './gl-jobs';
import { NO_WEBGL_WORDS } from './gl-jobs';

/** The worker as the client sees it (a fake in tests). */
export interface GlWorkerLike {
  postMessage(message: GlJob): void;
  onmessage: ((event: { readonly data: GlAnswer }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  terminate(): void;
}

/** The Vite module worker of `gl.worker.ts` (its own chunk). */
export async function createGlWorker(): Promise<GlWorkerLike> {
  const module = await import('./gl.worker?worker');
  return new module.default({ name: 'msm-shader' }) as unknown as GlWorkerLike;
}

interface Waiting {
  readonly job: ProgramJob | PostJob;
  readonly resolve: (answer: GlAnswer | null) => void;
}

/** Asks the shader worker; see the module comment. */
export class GlClient {
  readonly #create: () => GlWorkerLike | Promise<GlWorkerLike>;
  #worker: Promise<GlWorkerLike | null> | null = null;
  #token = 0;
  #running: { readonly token: number; readonly resolve: (answer: GlAnswer | null) => void } | null =
    null;
  #waiting: Waiting | null = null;
  /** Jobs sent to the worker (tests). */
  sent = 0;

  constructor(create: () => GlWorkerLike | Promise<GlWorkerLike> = createGlWorker) {
    this.#create = create;
  }

  /** Runs a job; `null` when a newer job replaced it before it was sent, or on dispose. */
  run(job: ProgramJob | PostJob): Promise<GlAnswer | null> {
    return new Promise((resolve) => {
      if (this.#running !== null) {
        this.#waiting?.resolve(null);
        this.#waiting = { job, resolve };
        return;
      }
      void this.#send({ job, resolve });
    });
  }

  /** Stops the worker. */
  dispose(): void {
    const worker = this.#worker;
    this.#worker = null;
    this.#running?.resolve(null);
    this.#running = null;
    this.#waiting?.resolve(null);
    this.#waiting = null;
    void worker?.then((started) => started?.terminate()).catch(() => undefined);
  }

  async #send(waiting: Waiting): Promise<void> {
    this.#token += 1;
    const token = this.#token;
    this.#running = { token, resolve: waiting.resolve };
    const worker = await this.#start();
    if (this.#running?.token !== token) return;
    if (worker === null) {
      this.#finish(token, { token, webgl: false, reason: NO_WEBGL_WORDS });
      return;
    }
    this.sent += 1;
    try {
      worker.postMessage({ ...waiting.job, token } as GlJob);
    } catch {
      this.#finish(token, { token, webgl: false, reason: NO_WEBGL_WORDS });
    }
  }

  #finish(token: number, answer: GlAnswer | null): void {
    if (this.#running?.token !== token) return;
    const { resolve } = this.#running;
    this.#running = null;
    resolve(answer);
    const next = this.#waiting;
    this.#waiting = null;
    if (next !== null) void this.#send(next);
  }

  #start(): Promise<GlWorkerLike | null> {
    if (this.#worker === null) {
      this.#worker = Promise.resolve()
        .then(() => this.#create())
        .then((worker) => {
          worker.onmessage = (event) => this.#finish(event.data.token, event.data);
          worker.onerror = () => {
            const running = this.#running;
            if (running !== null) {
              this.#finish(running.token, {
                token: running.token,
                webgl: false,
                reason: NO_WEBGL_WORDS,
              });
            }
          };
          return worker;
        })
        .catch(() => null);
    }
    return this.#worker;
  }
}

let shared: GlClient | null = null;

/** The app's one shader client (made on first use). */
export function sharedGlClient(): GlClient {
  shared ??= new GlClient();
  return shared;
}

/** Replaces the shared client (tests); the old one is stopped. */
export function setSharedGlClient(client: GlClient | null): void {
  if (shared !== null && shared !== client) shared.dispose();
  shared = client;
}
