/**
 * The main thread's side of the font worker (B624): asks for the unihex glyphs of a typed line.
 * The zip is read by the caller only when the worker does not hold it already (the worker keeps
 * the last zip's glyph table in memory; nothing is cached on disk or copied). Requests are
 * answered in order; a view drops the answers of a line it no longer shows.
 */

import type { UnihexAnswer, UnihexRequest } from './unihex';

/** The worker as the client sees it (a fake in tests). */
export interface UnihexWorkerLike {
  postMessage(message: UnihexRequest): void;
  onmessage: ((event: { readonly data: UnihexAnswer }) => void) | null;
  terminate(): void;
}

/** The Vite module worker of `unihex.worker.ts` (its own chunk). */
export async function createUnihexWorker(): Promise<UnihexWorkerLike> {
  const module = await import('./unihex.worker?worker');
  return new module.default({ name: 'msm-font-unihex' }) as unknown as UnihexWorkerLike;
}

/** What {@link UnihexClient.glyphs} answers. */
export type UnihexGlyphsAnswer =
  | { readonly ok: true; readonly glyphs: ReadonlyMap<number, string> }
  | { readonly ok: false; readonly reason: 'unreadable' | 'missing' };

/** Asks the font worker; see the module comment. */
export class UnihexClient {
  readonly #create: () => UnihexWorkerLike | Promise<UnihexWorkerLike>;
  #worker: Promise<UnihexWorkerLike> | null = null;
  #token = 0;
  #held: string | null = null;
  readonly #pending = new Map<number, (answer: UnihexAnswer | null) => void>();
  /** Zips sent to the worker (tests). */
  sent = 0;

  constructor(create: () => UnihexWorkerLike | Promise<UnihexWorkerLike> = createUnihexWorker) {
    this.#create = create;
  }

  /**
   * The hex rows of `codePoints` in the zip known as `file`, read with `read` only when the
   * worker does not hold it. `null` when the client was disposed meanwhile.
   */
  async glyphs(
    file: string,
    read: () => Promise<Uint8Array | null>,
    codePoints: readonly number[],
  ): Promise<UnihexGlyphsAnswer | null> {
    let answer = this.#held === file ? await this.#ask(file, null, codePoints) : undefined;
    if (answer === null) return null;
    if (answer === undefined || (!answer.ok && answer.error === 'not_held')) {
      const bytes = await read().catch(() => null);
      if (bytes === null) return { ok: false, reason: 'missing' };
      this.sent += 1;
      answer = await this.#ask(file, bytes, codePoints);
      if (answer === null) return null;
    }
    if (!answer.ok) {
      this.#held = null;
      return { ok: false, reason: 'unreadable' };
    }
    this.#held = file;
    return { ok: true, glyphs: new Map(answer.glyphs) };
  }

  /** Stops the worker. */
  dispose(): void {
    const worker = this.#worker;
    this.#worker = null;
    this.#held = null;
    for (const resolve of this.#pending.values()) resolve(null);
    this.#pending.clear();
    void worker?.then((started) => started.terminate()).catch(() => undefined);
  }

  async #ask(
    file: string,
    bytes: Uint8Array | null,
    codePoints: readonly number[],
  ): Promise<UnihexAnswer | null> {
    this.#token += 1;
    const token = this.#token;
    if (this.#worker === null) {
      this.#worker = Promise.resolve(this.#create()).then((worker) => {
        worker.onmessage = (event) => {
          const resolve = this.#pending.get(event.data.token);
          if (resolve === undefined) return;
          this.#pending.delete(event.data.token);
          resolve(event.data);
        };
        return worker;
      });
    }
    const worker = await this.#worker;
    return await new Promise<UnihexAnswer | null>((resolve) => {
      this.#pending.set(token, resolve);
      worker.postMessage({ token, file, bytes, codePoints: [...codePoints] });
    });
  }
}

let shared: UnihexClient | null = null;

/** The one client the font views share (one worker). */
export function sharedUnihexClient(): UnihexClient {
  shared ??= new UnihexClient();
  return shared;
}

/** Replaces the shared client (tests: a worker running in this thread). */
export function setSharedUnihexClient(client: UnihexClient | null): void {
  shared?.dispose();
  shared = client;
}
