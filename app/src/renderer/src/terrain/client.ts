/**
 * The live world generation client (ADR 0119 D5, D14; B580): the main thread's side of the
 * terrain worker (`worker.ts`, the only module that imports `@msm/terrain`).
 *
 * - **One world a worker** (F9): {@link TerrainClient.setWorld} sends the world (files, source,
 *   seed text, the target's facts); a world with another hash replaces the one before and
 *   cancels every view's work on the old one. Vanilla's files (about 1.2 MB) are sent once per
 *   version and kept in the worker; a world names them by key, so an edit does not copy them.
 * - **Views ask in lanes.** {@link TerrainClient.sample} asks for one region in a lane (one per
 *   view: the map, the side cut, ...); a newer request in the same lane cancels the older one by
 *   its token, and answers of a cancelled token are dropped.
 * - **Coarse, then fine.** Every kind but the ground's columns asks for a coarse pass first
 *   (every 4th column: the step times {@link COARSE_FACTOR}); each answer replaces the last.
 * - **A small cache** keyed by the world's hash (the files' hash, the seed and the source), the
 *   kind and the region answers a repeated view without the worker.
 * - Typed arrays come back transferred, not copied. Views must not write into them: a cached
 *   answer is handed out again.
 *
 * The protocol's types mirror `@msm/terrain`'s `api.ts` (`TerrainRequest`, `TerrainAnswer` and
 * the types they use); `worker.ts` checks at compile time that both stay the same. Nothing here
 * imports the engine, so the renderer's main chunk never carries it.
 */

/** Registry folder key to id to JSON (the engine's `WorldgenFileMap`). */
export type WorldgenFileMap = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** Project files laid over vanilla's (the engine's `WorldgenFiles`). */
export interface WorldgenFiles {
  readonly vanilla: WorldgenFileMap | null;
  readonly project: WorldgenFileMap;
}

/** The target's facts as the engine reads them (the engine's `TerrainTargetFacts`). */
export interface TerrainFacts {
  readonly dataFolders: readonly string[];
  readonly approximate: readonly ('biome_layout' | 'end')[];
}

/** Which world to draw (the engine's `TerrainSource`). */
export type TerrainSource =
  | { readonly dimension: string }
  | { readonly preset: string; readonly dimension: string };

/** A part the engine could not work out (the engine's `Unsupported`). */
export interface Unsupported {
  readonly kind:
    | 'density_function'
    | 'material_rule'
    | 'material_condition'
    | 'biome_source'
    | 'chunk_generator'
    | 'feature'
    | 'placement'
    | 'carver'
    | 'field'
    | 'file';
  readonly type: string;
  readonly where: string;
  readonly drawnInstead: string;
}

/** A map region in blocks (the engine's `MapRegion`). */
export interface MapRegion {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
  readonly step: number;
  readonly y?: number;
}

/** A vertical cut (the engine's `SliceRegion`). */
export interface SliceRegion {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly step: number;
  readonly yStep: number;
}

/** A window of columns for Try it's ground (the engine's `ColumnWindow`). */
export interface ColumnWindow {
  readonly x0: number;
  readonly z0: number;
  readonly y0: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/** How far the ground is built (the engine's `ColumnStage`). */
export type ColumnStage = 'terrain' | 'surface' | 'features';

/** A grid of palette indices (the engine's `PaletteGrid`). */
export interface PaletteGrid {
  readonly palette: readonly string[];
  readonly cells: Uint16Array;
}

/** The ground's columns (what the engine's `buildColumns` returns). */
export interface ColumnsData {
  readonly size: { x: number; y: number; z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
  readonly notes: readonly Unsupported[];
}

/** A pass: coarse (every 4th column) first, then fine. */
export type TerrainPass = 'coarse' | 'fine';

/** What a view can ask for. */
export type SampleType = 'biomes' | 'heights' | 'slice' | 'values' | 'columns';

/**
 * One request to the worker (the engine's `TerrainRequest`). In this app `filesHash` is the
 * world's hash ({@link worldHashOf}): the files' hash with the seed and the source. For
 * `heights`, `fn` names the height map (`'surface'` or `'ocean_floor'`).
 */
export type TerrainRequest =
  | {
      readonly type: 'world';
      readonly token: number;
      readonly input: {
        readonly files: WorldgenFiles;
        readonly source: TerrainSource;
        readonly seed: bigint;
        readonly facts: TerrainFacts;
      };
      readonly filesHash: string;
    }
  | {
      readonly type: SampleType;
      readonly token: number;
      readonly filesHash: string;
      readonly pass: TerrainPass;
      readonly region: MapRegion | SliceRegion | ColumnWindow;
      readonly fn?: string | unknown;
      readonly stage?: ColumnStage;
    }
  | { readonly type: 'cancel'; readonly token: number };

/** One answer from the worker (the engine's `TerrainAnswer`). */
export interface TerrainAnswer {
  readonly token: number;
  readonly type: TerrainRequest['type'];
  readonly pass: TerrainPass;
  readonly ms: number;
  readonly data: PaletteGrid | Int16Array | Float32Array | ColumnsData;
  readonly notes: readonly Unsupported[];
}

/** The world as the app describes it: the seed as typed (the worker turns it into a number). */
export interface WorldSpec {
  readonly files: WorldgenFiles;
  readonly source: TerrainSource;
  /** The seed as the user typed it: a whole number is itself, other text is hashed (WS17). */
  readonly seed: string;
  readonly facts: TerrainFacts;
}

/** What the worker says about the world it made. */
export interface WorldSummary {
  readonly generator: 'noise' | 'flat' | 'debug';
  readonly minY: number;
  readonly height: number;
  readonly seaLevel: number;
  /** False when a `multi_noise` preset is missing (WS9). */
  readonly biomesKnown: boolean;
  /** The seed the typed text became, as a decimal string. */
  readonly seed: string;
  /** What the world could not work out, for the view's notes. */
  readonly unsupported: readonly Unsupported[];
  /** How long making the world took in the worker. */
  readonly ms: number;
}

/** Messages to the worker: vanilla's files once per key, the world, requests and cancels. */
export type WorkerInbound =
  | { readonly type: 'vanilla'; readonly key: string; readonly files: WorldgenFileMap }
  | {
      readonly type: 'world';
      readonly token: number;
      readonly filesHash: string;
      readonly spec: {
        readonly project: WorldgenFileMap;
        readonly source: TerrainSource;
        readonly seed: string;
        readonly facts: TerrainFacts;
      };
      /** The key of the vanilla files sent before, or `null` for a world without them. */
      readonly vanillaKey: string | null;
    }
  | Exclude<TerrainRequest, { readonly type: 'world' }>;

/** Messages from the worker. */
export type WorkerOutbound =
  | { readonly type: 'answer'; readonly answer: TerrainAnswer }
  | {
      readonly type: 'world';
      readonly token: number;
      readonly filesHash: string;
      readonly summary: WorldSummary;
    }
  | {
      readonly type: 'error';
      readonly token: number;
      readonly request: TerrainRequest['type'];
      readonly pass: TerrainPass | null;
      readonly message: string;
    };

/** The part of a `Worker` the client uses (tests pass a fake). */
export interface WorkerLike {
  postMessage(message: WorkerInbound): void;
  onmessage: ((event: { readonly data: WorkerOutbound }) => void) | null;
  terminate(): void;
}

/** How much coarser the coarse pass is: every 4th column (ADR 0119 D14). */
export const COARSE_FACTOR = 4;

/** Answers kept by the client's cache. */
export const DEFAULT_CACHE_SIZE = 32;

/** The passes a kind asks for: the ground's columns come in one pass, the rest coarse first. */
export function passesFor(type: SampleType): readonly TerrainPass[] {
  return type === 'columns' ? ['fine'] : ['coarse', 'fine'];
}

/**
 * The coarse pass's region: the same area with every 4th column (a map's or a cut's step times
 * {@link COARSE_FACTOR}; a cut keeps its height step). The ground's window is unchanged.
 */
export function coarseRegion(
  region: MapRegion | SliceRegion | ColumnWindow,
): MapRegion | SliceRegion | ColumnWindow {
  if ('step' in region) return { ...region, step: region.step * COARSE_FACTOR };
  return region;
}

/** A short hash of text (cyrb53, as hex); for cache keys, not for security. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compact JSON with object keys sorted and `undefined` members left out, so equal values give
 * equal text (cache keys and hashes).
 */
export function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? `${value}n` : (JSON.stringify(value) ?? 'null');
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableKey(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${stableKey(record[key])}`);
  }
  return `{${parts.join(',')}}`;
}

/** The world's hash: the files' hash, the source and the seed text. */
export function worldHashOf(filesHash: string, source: TerrainSource, seed: string): string {
  return hashText(`${filesHash}|${stableKey(source)}|${seed}`);
}

/** What {@link TerrainClient.sample} asks for. */
export interface SampleQuery {
  readonly type: SampleType;
  readonly region: MapRegion | SliceRegion | ColumnWindow;
  /** A value map's function, or for `heights` the height map (`'surface'` by default). */
  readonly fn?: string | unknown;
  /** For `columns`: how far to build. */
  readonly stage?: ColumnStage;
}

function cacheKeyOf(world: string, query: SampleQuery, pass: TerrainPass): string {
  const region = pass === 'coarse' ? coarseRegion(query.region) : query.region;
  return `${world}|${query.type}|${pass}|${stableKey({
    fn: query.fn ?? null,
    region,
    stage: query.stage ?? null,
  })}`;
}

interface Pending {
  readonly lane: string;
  readonly query: SampleQuery;
  readonly world: string;
  readonly passes: Set<TerrainPass>;
  readonly onPass: (answer: TerrainAnswer) => void;
  readonly resolve: (answer: TerrainAnswer | null) => void;
  readonly reject: (error: Error) => void;
}

interface PendingWorld {
  readonly token: number;
  readonly hash: string;
  readonly resolve: (summary: WorldSummary) => void;
  readonly reject: (error: Error) => void;
}

/** Options of {@link TerrainClient}. */
export interface TerrainClientOptions {
  /** Makes the worker, on first use. Default: the Vite module worker of `worker.ts`. */
  createWorker?: () => WorkerLike | Promise<WorkerLike>;
  /** Answers kept; default {@link DEFAULT_CACHE_SIZE}. */
  cacheSize?: number;
}

/** The Vite module worker (its own chunk, as Monaco's workers are under `msm-app://`). */
export async function createTerrainWorker(): Promise<WorkerLike> {
  const module = await import('./worker?worker');
  return new module.default({ name: 'msm-terrain' }) as unknown as WorkerLike;
}

/** The main thread's side of the terrain worker; see the module comment. */
export class TerrainClient {
  readonly #createWorker: () => WorkerLike | Promise<WorkerLike>;
  readonly #cacheSize: number;
  readonly #cache = new Map<string, TerrainAnswer>();
  readonly #pending = new Map<number, Pending>();
  readonly #lanes = new Map<string, number>();
  #worker: Promise<WorkerLike> | null = null;
  #nextToken = 1;
  #world: { hash: string; summary: Promise<WorldSummary> } | null = null;
  #pendingWorld: PendingWorld | null = null;
  #vanillaKey: string | null = null;
  #disposed = false;
  /** Requests posted to the worker, sample passes only (for tests and the status line). */
  posted = 0;

  constructor(options: TerrainClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createTerrainWorker;
    this.#cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;
  }

  /** The hash of the world last sent, or `null` before the first. */
  get worldHash(): string | null {
    return this.#world?.hash ?? null;
  }

  /**
   * Makes `spec` the worker's world, unless it already is (same hash). A new world cancels the
   * work every lane asked of the old one.
   *
   * @param filesHash - The files' hash (`files.ts`), which covers vanilla's key and the facts.
   * @param vanillaKey - A key for `spec.files.vanilla` (the version it came from), or `null`
   *   when it is `null`; files under one key are sent to the worker once.
   * @returns What the worker says about the world; rejects when the engine cannot make it.
   */
  setWorld(spec: WorldSpec, filesHash: string, vanillaKey: string | null): Promise<WorldSummary> {
    const hash = worldHashOf(filesHash, spec.source, spec.seed);
    if (this.#world !== null && this.#world.hash === hash) return this.#world.summary;
    this.#cancelAll();
    const token = this.#nextToken++;
    const summary = new Promise<WorldSummary>((resolve, reject) => {
      this.#pendingWorld?.reject(new Error('A newer world replaced this one.'));
      this.#pendingWorld = { token, hash, resolve, reject };
    });
    // A rejected world is handled by whoever awaits it; keep it from being reported unhandled.
    summary.catch(() => undefined);
    this.#world = { hash, summary };
    const vanilla = spec.files.vanilla;
    const key = vanilla === null ? null : (vanillaKey ?? `anonymous:${hash}`);
    void this.#post((worker) => {
      if (vanilla !== null && key !== null && key !== this.#vanillaKey) {
        worker.postMessage({ type: 'vanilla', key, files: vanilla });
        this.#vanillaKey = key;
      }
      worker.postMessage({
        type: 'world',
        token,
        filesHash: hash,
        spec: {
          project: spec.files.project,
          source: spec.source,
          seed: spec.seed,
          facts: spec.facts,
        },
        vanillaKey: key,
      });
    });
    return summary;
  }

  /**
   * Asks for one region in `lane`, cancelling the lane's older request. `onPass` gets each
   * answer, coarse first; a cached answer comes at once, without the worker.
   *
   * @returns The last (fine) answer, or `null` when a newer request, a new world or
   *   {@link cancel} cancelled this one.
   */
  sample(
    lane: string,
    query: SampleQuery,
    onPass: (answer: TerrainAnswer) => void = () => undefined,
  ): Promise<TerrainAnswer | null> {
    this.cancel(lane);
    const world = this.#world;
    if (world === null || this.#disposed) return Promise.resolve(null);
    const passes = passesFor(query.type);
    const last = passes[passes.length - 1] as TerrainPass;
    const lastCached = this.#cacheGet(cacheKeyOf(world.hash, query, last));
    if (lastCached !== undefined) {
      onPass(lastCached);
      return Promise.resolve(lastCached);
    }
    const toAsk = new Set<TerrainPass>();
    for (const pass of passes) {
      const cached =
        pass === last ? undefined : this.#cacheGet(cacheKeyOf(world.hash, query, pass));
      if (cached !== undefined) onPass(cached);
      else toAsk.add(pass);
    }
    const token = this.#nextToken++;
    this.#lanes.set(lane, token);
    const result = new Promise<TerrainAnswer | null>((resolve, reject) => {
      this.#pending.set(token, {
        lane,
        query,
        world: world.hash,
        passes: toAsk,
        onPass,
        resolve,
        reject,
      });
    });
    void this.#post((worker) => {
      if (!this.#pending.has(token)) return;
      for (const pass of toAsk) {
        this.posted += 1;
        worker.postMessage({
          type: query.type,
          token,
          filesHash: world.hash,
          pass,
          region: pass === 'coarse' ? coarseRegion(query.region) : query.region,
          ...(query.fn === undefined ? {} : { fn: query.fn }),
          ...(query.stage === undefined ? {} : { stage: query.stage }),
        });
      }
    });
    return result;
  }

  /** Cancels the lane's request, if any (its promise resolves with `null`). */
  cancel(lane: string): void {
    const token = this.#lanes.get(lane);
    if (token === undefined) return;
    this.#lanes.delete(lane);
    this.#drop(token);
  }

  /** Stops the worker; later requests answer `null`. */
  dispose(): void {
    this.#disposed = true;
    this.#cancelAll();
    this.#pendingWorld?.reject(new Error('The terrain client was closed.'));
    this.#pendingWorld = null;
    const worker = this.#worker;
    this.#worker = null;
    void worker?.then((w) => w.terminate()).catch(() => undefined);
  }

  #drop(token: number): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) return;
    this.#pending.delete(token);
    pending.resolve(null);
    void this.#post((worker) => worker.postMessage({ type: 'cancel', token }));
  }

  #cancelAll(): void {
    for (const lane of [...this.#lanes.keys()]) this.cancel(lane);
  }

  #cacheGet(key: string): TerrainAnswer | undefined {
    const hit = this.#cache.get(key);
    if (hit === undefined) return undefined;
    this.#cache.delete(key);
    this.#cache.set(key, hit);
    return hit;
  }

  #cacheSet(key: string, answer: TerrainAnswer): void {
    this.#cache.delete(key);
    this.#cache.set(key, answer);
    while (this.#cache.size > this.#cacheSize) {
      const oldest = this.#cache.keys().next().value as string;
      this.#cache.delete(oldest);
    }
  }

  async #post(send: (worker: WorkerLike) => void): Promise<void> {
    if (this.#disposed) return;
    if (this.#worker === null) {
      this.#worker = Promise.resolve(this.#createWorker()).then((worker) => {
        worker.onmessage = (event) => this.#onMessage(event.data);
        return worker;
      });
    }
    try {
      const worker = await this.#worker;
      if (!this.#disposed) send(worker);
    } catch (error) {
      this.#failAll(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #failAll(error: Error): void {
    for (const [token, pending] of [...this.#pending]) {
      this.#pending.delete(token);
      pending.reject(error);
    }
    this.#lanes.clear();
    this.#pendingWorld?.reject(error);
    this.#pendingWorld = null;
    this.#world = null;
    this.#worker = null;
    // A new worker has none of the vanilla files sent to this one.
    this.#vanillaKey = null;
  }

  #onMessage(message: WorkerOutbound): void {
    if (message.type === 'world') {
      const pending = this.#pendingWorld;
      if (pending === null || pending.token !== message.token) return;
      this.#pendingWorld = null;
      pending.resolve(message.summary);
      return;
    }
    if (message.type === 'error') {
      if (message.request === 'world') {
        const pending = this.#pendingWorld;
        if (pending === null || pending.token !== message.token) return;
        this.#pendingWorld = null;
        if (this.#world?.hash === pending.hash) this.#world = null;
        pending.reject(new Error(message.message));
        return;
      }
      const pending = this.#pending.get(message.token);
      if (pending === undefined) return;
      this.#pending.delete(message.token);
      if (this.#lanes.get(pending.lane) === message.token) this.#lanes.delete(pending.lane);
      pending.reject(new Error(message.message));
      return;
    }
    const answer = message.answer;
    const pending = this.#pending.get(answer.token);
    if (pending === undefined || !pending.passes.has(answer.pass)) return;
    this.#cacheSet(cacheKeyOf(pending.world, pending.query, answer.pass), answer);
    // A fine answer ends the request: a coarse one arriving after it would replace a better picture.
    if (answer.pass === 'fine') pending.passes.clear();
    else pending.passes.delete(answer.pass);
    pending.onPass(answer);
    if (pending.passes.size === 0) {
      this.#pending.delete(answer.token);
      if (this.#lanes.get(pending.lane) === answer.token) this.#lanes.delete(pending.lane);
      pending.resolve(answer);
    }
  }
}
