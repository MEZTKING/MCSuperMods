/**
 * The main thread's side of the processors (ADR 0122 D6; B641): one instance of the structures
 * worker of its own (`../assembly/worker.ts`, which routes the processors' messages to
 * `host.ts`), made on first use and shared by every processor view. A request runs in a lane; a
 * newer one in the same lane cancels the older. A worker that fails rejects what waits.
 */

import type { ProcessorAnswer, ProcessorJob, ProcessorRequest } from './host';
import type { ProcessedResult } from './model';

/** The worker as the client sees it (a fake in tests). */
export interface ProcessorWorkerLike {
  postMessage(message: ProcessorRequest): void;
  onmessage: ((event: { readonly data: ProcessorAnswer }) => void) | null;
  onerror?: ((event: { readonly message?: string }) => void) | null;
  terminate(): void;
}

/** The structures worker's Vite module (its own chunk), one instance for the processors. */
export async function createProcessorWorker(): Promise<ProcessorWorkerLike> {
  const module = await import('../assembly/worker?worker');
  return new module.default({ name: 'msm-processors' }) as unknown as ProcessorWorkerLike;
}

/** A processed template and how long the worker took. */
export interface ProcessorDone {
  readonly result: ProcessedResult;
  readonly ms: number;
}

interface Pending {
  readonly lane: string;
  readonly resolve: (done: ProcessorDone | null) => void;
  readonly reject: (error: Error) => void;
}

/** Options of {@link ProcessorClient}. */
export interface ProcessorClientOptions {
  createWorker?: () => ProcessorWorkerLike | Promise<ProcessorWorkerLike>;
}

/** See the module comment. */
export class ProcessorClient {
  readonly #createWorker: () => ProcessorWorkerLike | Promise<ProcessorWorkerLike>;
  #worker: Promise<ProcessorWorkerLike> | null = null;
  #nextToken = 1;
  readonly #pending = new Map<number, Pending>();
  readonly #lanes = new Map<string, number>();

  constructor(options: ProcessorClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createProcessorWorker;
  }

  /** Runs a job in a lane; answers the result, or `null` when a newer request cancelled it. */
  run(lane: string, job: ProcessorJob): Promise<ProcessorDone | null> {
    this.cancel(lane);
    const token = this.#nextToken++;
    this.#lanes.set(lane, token);
    const answer = new Promise<ProcessorDone | null>((resolve, reject) => {
      this.#pending.set(token, { lane, resolve, reject });
    });
    void this.#post((worker) => worker.postMessage({ token, kind: 'process', job }));
    return answer;
  }

  /** Cancels the lane's request, if any (its promise answers `null`). */
  cancel(lane: string): void {
    const token = this.#lanes.get(lane);
    if (token === undefined) return;
    this.#lanes.delete(lane);
    const pending = this.#pending.get(token);
    if (pending === undefined) return;
    this.#pending.delete(token);
    pending.resolve(null);
    void this.#post((worker) => worker.postMessage({ token, kind: 'process-cancel' }));
  }

  #failAll(error: Error): void {
    for (const [token, pending] of [...this.#pending]) {
      this.#pending.delete(token);
      pending.reject(error);
    }
    this.#lanes.clear();
  }

  async #post(send: (worker: ProcessorWorkerLike) => void): Promise<void> {
    if (this.#worker === null) {
      this.#worker = Promise.resolve(this.#createWorker()).then((worker) => {
        worker.onmessage = (event) => this.#onMessage(event.data);
        worker.onerror = (event) => {
          // The worker is gone or broken: the next request makes a new one.
          this.#worker = null;
          worker.terminate();
          this.#failAll(new Error(event.message || 'The worker stopped.'));
        };
        return worker;
      });
    }
    try {
      send(await this.#worker);
    } catch (error) {
      this.#worker = null;
      this.#failAll(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #onMessage(answer: ProcessorAnswer): void {
    const pending = this.#pending.get(answer.token);
    if (pending === undefined) return;
    this.#pending.delete(answer.token);
    if (this.#lanes.get(pending.lane) === answer.token) this.#lanes.delete(pending.lane);
    if (answer.kind === 'process-error') pending.reject(new Error(answer.message));
    else pending.resolve({ result: answer.result, ms: answer.ms });
  }
}

let shared: ProcessorClient | null = null;

/** The one client the processor views share (one worker). */
export function sharedProcessorClient(): ProcessorClient {
  shared ??= new ProcessorClient();
  return shared;
}
