/**
 * The search client (ADR 0124 D3; B660): the main thread's side of the search worker. It imports
 * `@msm/search` for types only, so it stays a small stub in whatever chunk loads it; the engine
 * is in the worker (`worker.ts` over `host.ts`), or, when no worker starts, in `host.ts` loaded on
 * the main thread by a dynamic import.
 *
 * - **Layers:** `setStatic` (the static layer with the vocabulary, protected words, the plugins'
 *   search data and the flows' facts), `setLayer` (guide, vanilla, project) and `patchLayer` (a
 *   project delta). The client keeps every entry it sent by id, so answers cross the boundary
 *   slim (entry ids) and come back whole.
 * - **Newest wins:** a query replaces the one before it, which resolves `null` at once and is
 *   cancelled in the worker.
 * - **Fallback:** when the worker cannot be made or fails to load, the host runs on the main
 *   thread and everything sent so far is sent to it again.
 *
 * @packageDocumentation
 */

import type { SearchVocabulary } from '@msm/plugin-api';
import type {
  ReaderPluginData,
  SearchAnswer,
  SearchContext,
  SearchEntry,
  SearchHit,
  SearchHitSlim,
  SearchRequest,
  SearchThing,
  Understood,
} from '@msm/search';
import type { FlowSpec } from './sources/flows';

/** The static layer and what goes with it. */
export interface StaticSpec {
  /** The target the static layer was collected for. */
  readonly targetId: string;
  readonly entries: readonly SearchEntry[];
  /** The plugins' vocabularies, in plugin order. */
  readonly vocabulary: readonly SearchVocabulary[];
  /** Words the stemmer must not cut (vocabulary headwords; the vanilla layer adds the ids'). */
  readonly protect: readonly string[];
  /** The plugins' search data for the answer reader (hints and behaviours). */
  readonly plugins: readonly ReaderPluginData[];
  /** Each flow and starter's sort, defaults and parameters, by starter id. */
  readonly flows: Readonly<Record<string, FlowSpec>>;
}

/** Messages to the host. */
export type SearchInbound =
  | { readonly type: 'static'; readonly spec: StaticSpec }
  | {
      readonly type: 'layer';
      readonly layer: string;
      readonly entries: readonly SearchEntry[];
      /** Things the answer reader may name (the project's and the game's). */
      readonly things?: readonly SearchThing[];
      readonly protect?: readonly string[];
    }
  | {
      readonly type: 'patch';
      readonly layer: string;
      readonly upserts: readonly SearchEntry[];
      readonly removes: readonly string[];
      readonly things?: readonly SearchThing[];
    }
  | { readonly type: 'context'; readonly context: SearchContext }
  | { readonly type: 'query'; readonly token: number; readonly request: SearchRequest }
  | { readonly type: 'cancel'; readonly token: number };

/** An answer with its hits slim (entry ids). */
export interface SlimAnswer {
  readonly understood: Understood;
  readonly best: readonly SearchHitSlim[];
  readonly sections: readonly {
    readonly id: string;
    readonly hits: readonly SearchHitSlim[];
    readonly more: number;
  }[];
  readonly confident: boolean;
}

/** Messages from the host. */
export type SearchOutbound =
  | {
      readonly type: 'answer';
      readonly token: number;
      readonly answer: SlimAnswer;
      readonly ms: number;
    }
  | {
      readonly type: 'built';
      readonly layer: string;
      readonly entries: number;
      readonly ms: number;
    }
  | { readonly type: 'failed'; readonly token?: number; readonly message: string };

/** An answer with whole hits, and how long the host took. */
export interface SearchResult extends SearchAnswer {
  readonly ms: number;
}

/** What the client needs of a worker (a `Worker`, or a fake in tests). */
export interface SearchWorkerLike {
  postMessage(message: SearchInbound): void;
  onmessage: ((event: { data: SearchOutbound }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}

/** What the client needs of a host on the main thread. */
export interface SearchHostLike {
  receive(message: SearchInbound): void;
}

/** A layer as the client keeps it. */
interface HeldLayer {
  readonly entries: Map<string, SearchEntry>;
  things?: readonly SearchThing[];
  protect?: readonly string[];
}

/** One finished build, for listeners (the timings of the report and the status line). */
export interface SearchBuilt {
  readonly layer: string;
  readonly entries: number;
  readonly ms: number;
}

/**
 * The global `Worker`, declared here so the file type-checks without the DOM library (the Node
 * test project); in a window it is the browser's.
 */
declare const Worker:
  | (new (
      url: URL,
      options: { type: 'module'; name: string },
    ) => SearchWorkerLike)
  | undefined;

/**
 * The module worker of `worker.ts`, a chunk of its own: Vite bundles the
 * `new Worker(new URL(..., import.meta.url))` form as it bundles `?worker` imports.
 */
export function createSearchWorker(): SearchWorkerLike {
  if (typeof Worker === 'undefined') throw new Error('This window has no Web Workers.');
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'msm-search',
  });
}

/** The host on the main thread (a lazy chunk of its own). */
export async function createMainThreadHost(
  post: (message: SearchOutbound) => void,
): Promise<SearchHostLike> {
  const module = await import('./host');
  return module.createSearchHost(post);
}

/** Options of {@link SearchClient}. */
export interface SearchClientOptions {
  /** Makes the worker; default {@link createSearchWorker}. Throwing means: use the main thread. */
  createWorker?: () => SearchWorkerLike;
  /** Makes the main-thread host; default {@link createMainThreadHost}. */
  createFallback?: (post: (message: SearchOutbound) => void) => Promise<SearchHostLike>;
}

interface PendingQuery {
  readonly token: number;
  readonly request: SearchRequest;
  readonly resolve: (result: SearchResult | null) => void;
}

/** The main thread's side of the search; see the module comment. */
export class SearchClient {
  readonly #createWorker: () => SearchWorkerLike;
  readonly #createFallback: (post: (message: SearchOutbound) => void) => Promise<SearchHostLike>;
  readonly #layers = new Map<string, HeldLayer>();
  readonly #listeners = new Set<(built: SearchBuilt) => void>();
  #static: StaticSpec | null = null;
  #context: SearchContext | null = null;
  #worker: SearchWorkerLike | null = null;
  #host: SearchHostLike | null = null;
  #hostLoading: Promise<void> | null = null;
  #pending: PendingQuery | null = null;
  #nextToken = 1;
  #disposed = false;
  /** Where the engine runs: `worker`, `main` (fallback) or `none` (not started). */
  #where: 'none' | 'worker' | 'main' = 'none';

  constructor(options: SearchClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createSearchWorker;
    this.#createFallback = options.createFallback ?? createMainThreadHost;
  }

  /** Where the engine runs now. */
  get where(): 'none' | 'worker' | 'main' {
    return this.#where;
  }

  /** The target of the static layer sent last, if any. */
  get staticTarget(): string | undefined {
    return this.#static?.targetId;
  }

  /** Replaces the static layer (and the vocabulary, the reader's data and the flows). */
  setStatic(spec: StaticSpec): void {
    this.#static = spec;
    this.#layers.set('static', {
      entries: new Map(spec.entries.map((entry) => [entry.id, entry])),
    });
    this.#send({ type: 'static', spec });
  }

  /** Replaces one other layer. */
  setLayer(
    layer: string,
    entries: readonly SearchEntry[],
    extras: { things?: readonly SearchThing[]; protect?: readonly string[] } = {},
  ): void {
    const held: HeldLayer = { entries: new Map(entries.map((entry) => [entry.id, entry])) };
    if (extras.things !== undefined) held.things = extras.things;
    if (extras.protect !== undefined) held.protect = extras.protect;
    this.#layers.set(layer, held);
    this.#send({ type: 'layer', layer, entries, ...extras });
  }

  /** Patches one layer: entries added or replaced, ids removed, and its things when given. */
  patchLayer(
    layer: string,
    upserts: readonly SearchEntry[],
    removes: readonly string[],
    things?: readonly SearchThing[],
  ): void {
    const held = this.#layers.get(layer) ?? { entries: new Map<string, SearchEntry>() };
    for (const id of removes) held.entries.delete(id);
    for (const entry of upserts) held.entries.set(entry.id, entry);
    if (things !== undefined) held.things = things;
    this.#layers.set(layer, held);
    this.#send({
      type: 'patch',
      layer,
      upserts,
      removes,
      ...(things !== undefined ? { things } : {}),
    });
  }

  /** Whether a layer has been sent. */
  hasLayer(layer: string): boolean {
    return this.#layers.has(layer);
  }

  /** The entries of a layer as last sent (tests, deltas). */
  layerEntries(layer: string): ReadonlyMap<string, SearchEntry> {
    return this.#layers.get(layer)?.entries ?? new Map();
  }

  /** Replaces the context (the open mod's ids, the history, the door's lean). */
  setContext(context: SearchContext): void {
    this.#context = context;
    this.#send({ type: 'context', context });
  }

  /** The entry with this id, from any layer sent. */
  entry(id: string): SearchEntry | undefined {
    for (const layer of this.#layers.values()) {
      const entry = layer.entries.get(id);
      if (entry !== undefined) return entry;
    }
    return undefined;
  }

  /** Listens to finished builds; returns the unsubscribe. */
  onBuilt(listener: (built: SearchBuilt) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Asks; the answer with whole hits, or `null` when a newer query replaced this one (or the
   * client was disposed, or the host failed).
   */
  query(request: SearchRequest): Promise<SearchResult | null> {
    if (this.#disposed) return Promise.resolve(null);
    const before = this.#pending;
    if (before !== null) {
      before.resolve(null);
      this.#send({ type: 'cancel', token: before.token });
    }
    const token = this.#nextToken++;
    return new Promise((resolve) => {
      this.#pending = { token, request, resolve };
      this.#send({ type: 'query', token, request });
    });
  }

  /** Stops the worker; pending queries resolve `null`. */
  dispose(): void {
    this.#disposed = true;
    this.#pending?.resolve(null);
    this.#pending = null;
    this.#worker?.terminate();
    this.#worker = null;
    this.#host = null;
    this.#listeners.clear();
  }

  #send(message: SearchInbound): void {
    if (this.#disposed) return;
    if (this.#where === 'none') this.#start();
    if (this.#worker !== null) {
      try {
        this.#worker.postMessage(message);
        return;
      } catch {
        this.#fallBack();
        return;
      }
    }
    if (this.#host !== null) {
      this.#host.receive(message);
      return;
    }
    // The main-thread host is loading: `#fallBack` replays the state, then the pending query.
  }

  #start(): void {
    try {
      const worker = this.#createWorker();
      worker.onmessage = (event) => this.#receive(event.data);
      worker.onerror = () => this.#fallBack();
      this.#worker = worker;
      this.#where = 'worker';
    } catch {
      this.#fallBack();
    }
  }

  /** Moves the engine to the main thread and sends it everything again. */
  #fallBack(): void {
    if (this.#disposed || this.#hostLoading !== null) return;
    if (this.#worker !== null) {
      this.#worker.onmessage = null;
      this.#worker.onerror = null;
      try {
        this.#worker.terminate();
      } catch {
        // Already gone.
      }
      this.#worker = null;
    }
    this.#where = 'main';
    this.#hostLoading = this.#createFallback((message) => this.#receive(message)).then(
      (host) => {
        if (this.#disposed) return;
        this.#host = host;
        for (const message of this.#replay()) host.receive(message);
      },
      () => {
        // No engine at all: every query answers nothing.
        this.#pending?.resolve(null);
        this.#pending = null;
      },
    );
  }

  /** Everything the host must hold, as messages, then the pending query. */
  #replay(): SearchInbound[] {
    const out: SearchInbound[] = [];
    if (this.#static !== null) out.push({ type: 'static', spec: this.#static });
    for (const [layer, held] of this.#layers) {
      if (layer === 'static') continue;
      out.push({
        type: 'layer',
        layer,
        entries: [...held.entries.values()],
        ...(held.things !== undefined ? { things: held.things } : {}),
        ...(held.protect !== undefined ? { protect: held.protect } : {}),
      });
    }
    if (this.#context !== null) out.push({ type: 'context', context: this.#context });
    if (this.#pending !== null) {
      out.push({ type: 'query', token: this.#pending.token, request: this.#pending.request });
    }
    return out;
  }

  #receive(message: SearchOutbound): void {
    if (this.#disposed || typeof message !== 'object' || message === null) return;
    switch (message.type) {
      case 'built':
        for (const listener of this.#listeners) listener(message);
        return;
      case 'answer': {
        const pending = this.#pending;
        if (pending === null || pending.token !== message.token) return;
        this.#pending = null;
        pending.resolve({ ...this.#whole(message.answer), ms: message.ms });
        return;
      }
      case 'failed': {
        const pending = this.#pending;
        if (message.token !== undefined && pending !== null && pending.token === message.token) {
          this.#pending = null;
          pending.resolve(null);
        }
        return;
      }
      default:
        return;
    }
  }

  #hit(slim: SearchHitSlim): SearchHit | undefined {
    const entry = this.entry(slim.id);
    if (entry === undefined) return undefined;
    return {
      entry,
      score: slim.score,
      ...(slim.answers !== undefined ? { answers: slim.answers } : {}),
      ...(slim.behaviour !== undefined ? { behaviour: slim.behaviour } : {}),
      why: slim.why,
    };
  }

  #whole(answer: SlimAnswer): SearchAnswer {
    const hits = (list: readonly SearchHitSlim[]): SearchHit[] =>
      list.flatMap((slim) => {
        const hit = this.#hit(slim);
        return hit === undefined ? [] : [hit];
      });
    return {
      understood: answer.understood,
      best: hits(answer.best),
      sections: answer.sections.map((section) => ({
        id: section.id,
        hits: hits(section.hits),
        more: section.more,
      })),
      confident: answer.confident,
    };
  }
}
