/**
 * The live views client (ADR 0120 D12; B601 stub, B608 builds it): the main thread's side of the
 * worker (`worker.ts`, the only module that will import `@msm/sim`'s evaluators, so a thousand
 * rolls never run on the main thread). A newer request in a lane cancels the older one by its
 * token; answers of a cancelled token are dropped. The stub knows one request and answers
 * "not yet".
 */

/** A request to the worker. B608 adds roll, odds, tags and functions. */
export type LiveViewRequest =
  | { readonly token: number; readonly lane: string; readonly kind: 'ping' }
  | { readonly token: number; readonly lane: string; readonly kind: 'cancel' };

/** An answer from the worker. */
export type LiveViewAnswer = { readonly token: number; readonly kind: 'not_yet' };

/** The worker as the client sees it (a fake in tests). */
export interface LiveViewWorkerLike {
  postMessage(message: LiveViewRequest): void;
  onmessage: ((event: { readonly data: LiveViewAnswer }) => void) | null;
  terminate(): void;
}

/** The Vite module worker (its own chunk, as the terrain worker is). */
export async function createLiveViewWorker(): Promise<LiveViewWorkerLike> {
  const module = await import('./worker?worker');
  return new module.default({ name: 'msm-live-views' }) as unknown as LiveViewWorkerLike;
}

/** Options of {@link LiveViewClient}. */
export interface LiveViewClientOptions {
  /** Makes the worker, on first use. Default: the Vite module worker of `worker.ts`. */
  createWorker?: () => LiveViewWorkerLike | Promise<LiveViewWorkerLike>;
}

/** The main thread's side of the worker. Stub: asks, and says "not yet". */
export class LiveViewClient {
  readonly #createWorker: () => LiveViewWorkerLike | Promise<LiveViewWorkerLike>;
  readonly #lanes = new Map<string, number>();
  readonly #pending = new Map<number, (answer: LiveViewAnswer | null) => void>();
  #worker: Promise<LiveViewWorkerLike> | null = null;
  #nextToken = 1;

  constructor(options: LiveViewClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createLiveViewWorker;
  }

  /**
   * Asks in a lane; the answer, or `null` when a newer request in the same lane replaced it.
   */
  async ping(lane: string): Promise<LiveViewAnswer | null> {
    const worker = await this.#start();
    const token = this.#nextToken++;
    const older = this.#lanes.get(lane);
    if (older !== undefined) this.#settle(older, null);
    this.#lanes.set(lane, token);
    return new Promise((resolve) => {
      this.#pending.set(token, resolve);
      worker.postMessage({ token, lane, kind: 'ping' });
    });
  }

  /** Stops the worker; pending requests answer `null`. */
  dispose(): void {
    for (const token of [...this.#pending.keys()]) this.#settle(token, null);
    const worker = this.#worker;
    this.#worker = null;
    void worker?.then((started) => started.terminate());
  }

  #start(): Promise<LiveViewWorkerLike> {
    this.#worker ??= Promise.resolve(this.#createWorker()).then((worker) => {
      worker.onmessage = (event) => this.#settle(event.data.token, event.data);
      return worker;
    });
    return this.#worker;
  }

  #settle(token: number, answer: LiveViewAnswer | null): void {
    const resolve = this.#pending.get(token);
    if (resolve === undefined) return;
    this.#pending.delete(token);
    resolve(answer);
  }
}
