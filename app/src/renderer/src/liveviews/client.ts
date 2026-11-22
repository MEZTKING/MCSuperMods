/**
 * The live views client (ADR 0120 D12; B608): the main thread's side of the live views worker
 * (`worker.ts`, the only module of the app that calls `@msm/sim`'s loot, tag and predicate
 * evaluators), so a thousand rolls never run on the main thread. Built on live worldgen's
 * pattern (`terrain/client.ts`), not on its file:
 *
 * - **Files once.** {@link LiveViewClient.setData} sends a view's files (the project's data
 *   files, the names of vanilla's folders it needs, the target's facts) and answers their hash;
 *   jobs name the hash, so an edit does not copy the files again. Vanilla's folders (read from
 *   the user's jar cache, about 1.4 MB for all of them) are sent once per version and folder and
 *   kept in the worker. The worker keeps the last {@link DATA_SETS_KEPT} file sets; the client
 *   mirrors which, and sends a set again when the worker has let it go.
 * - **Views ask in lanes.** {@link LiveViewClient.run} asks in a lane (one per view); a newer
 *   request in the same lane cancels the older one by its token, and answers of a cancelled
 *   token are dropped.
 * - **The odds in steps** (coarse, then fine): an `odds` job answers a step after the first
 *   {@link ODDS_FIRST_STEP} rolls and then every {@link ODDS_STEP}, so the view draws at once and
 *   sharpens; each step replaces the last.
 * - **A small cache** keyed by the files' hash and the job answers a repeated view without the
 *   worker. Answers are plain data; views must not change them (a cached one is handed out again).
 *
 * Nothing here imports the evaluators (`@msm/sim` only for types), so the views' chunks never
 * carry them; a test checks.
 */

import type { Json, Project, TargetFacts } from '@msm/plugin-api';
import type {
  ItemSample,
  LootPart,
  LootRoll,
  LootStack,
  OddsStep,
  PredicateResult,
  ResolvedTag,
  Situation,
  Unsupported,
} from '@msm/sim';
import { hashText, stableKey } from '../terrain/client';
import { type VanillaFolderFiles, vanillaFileId } from './vanilla-data';

/** Registry folder key (`loot_table`, `tags/item`) to id (`ns:path`) to JSON. */
export type DataFileMap = Readonly<Record<string, Readonly<Record<string, Json>>>>;

/** What an item modifier made. */
export interface ModifyResult {
  readonly item: ItemSample;
  readonly unsupported: readonly Unsupported[];
  /** The function types it used, with how close each is (B610 shows them). */
  readonly parts?: readonly LootPart[];
}

/** What an enchantment provider gave an item once (B609). */
export interface EnchantResult {
  readonly item: LootStack;
  readonly unsupported: readonly Unsupported[];
}

/** A piece of work for the worker. Every random draw comes from `seed` (`seedNumber`). */
export type LiveViewJob =
  | {
      readonly kind: 'roll';
      readonly table: Json;
      readonly situation: Situation;
      readonly seed: string;
    }
  | {
      readonly kind: 'odds';
      readonly table: Json;
      readonly situation: Situation;
      readonly seed: string;
      /** Rolls in all (default 1,000: "out of 1,000 rolls"). */
      readonly rolls: number;
      /** Rolls between steps after the first. */
      readonly step: number;
    }
  | { readonly kind: 'tag'; readonly registry: string; readonly id: string }
  | {
      readonly kind: 'predicate';
      readonly predicate: Json;
      readonly situation: Situation;
      readonly seed: string;
    }
  | {
      readonly kind: 'modify';
      readonly modifier: Json;
      readonly item: ItemSample;
      readonly situation: Situation;
      readonly seed: string;
    }
  /** An enchantment provider (inline, or the id of one) on an item, once (B609). */
  | {
      readonly kind: 'enchant';
      readonly provider: Json;
      readonly item: ItemSample;
      readonly situation: Situation;
      readonly seed: string;
    }
  /** The odds of an enchantment provider on an item, in steps as `odds` (B609). */
  | {
      readonly kind: 'enchant_odds';
      readonly provider: Json;
      readonly item: ItemSample;
      readonly situation: Situation;
      readonly seed: string;
      readonly rolls: number;
      readonly step: number;
    };

/** The jobs that answer in steps. */
export type SteppedJobKind = 'odds' | 'enchant_odds';

/** Whether a job kind answers in steps (`odds`, `enchant_odds`). */
export function isStepped(kind: string): kind is SteppedJobKind {
  return kind === 'odds' || kind === 'enchant_odds';
}

/** A job's kind. */
export type LiveViewJobKind = LiveViewJob['kind'];

/** What each kind of job answers (`odds`: its last step). */
export interface LiveViewResults {
  readonly roll: LootRoll;
  readonly odds: OddsStep;
  readonly tag: ResolvedTag;
  readonly predicate: PredicateResult;
  readonly modify: ModifyResult;
  readonly enchant: EnchantResult;
  readonly enchant_odds: OddsStep;
}

interface RequestBase {
  readonly token: number;
  readonly lane: string;
}

/** A message to the worker. */
export type LiveViewRequest =
  /** Asks nothing: the worker answers `not_yet` (B601's probe). */
  | (RequestBase & { readonly kind: 'ping' })
  /** Drops the work of `token`. */
  | (RequestBase & { readonly kind: 'cancel' })
  /** Some of vanilla's folders of one version, kept by the worker under `key`. */
  | (RequestBase & {
      readonly kind: 'vanilla';
      readonly key: string;
      readonly folders: Readonly<Record<string, VanillaFolderFiles>>;
    })
  /** A view's files under their hash. */
  | (RequestBase & {
      readonly kind: 'data';
      readonly hash: string;
      readonly project: DataFileMap;
      /** The key of the vanilla folders sent before, or `null` for project files only. */
      readonly vanillaKey: string | null;
      readonly facts: TargetFacts;
      /** Registry name (no `minecraft:`) to namespaced ids, for the tags' `exists`; or `null`. */
      readonly registries: Readonly<Record<string, readonly string[]>> | null;
    })
  /** A job over the files of hash `data`. */
  | (RequestBase & { readonly data: string } & LiveViewJob);

/** A message from the worker. */
export type LiveViewAnswer =
  | { readonly token: number; readonly kind: 'not_yet' }
  | {
      readonly token: number;
      readonly kind: 'result';
      readonly job: LiveViewJobKind;
      readonly result: LiveViewResults[LiveViewJobKind];
      readonly ms: number;
    }
  | { readonly token: number; readonly kind: 'step'; readonly step: OddsStep; readonly ms: number }
  | { readonly token: number; readonly kind: 'error'; readonly message: string };

/** The worker as the client sees it (a fake in tests). */
export interface LiveViewWorkerLike {
  postMessage(message: LiveViewRequest): void;
  onmessage: ((event: { readonly data: LiveViewAnswer }) => void) | null;
  terminate(): void;
}

/** File sets the worker keeps (and the client mirrors). */
export const DATA_SETS_KEPT = 8;
/** Answers the client's cache keeps. */
export const LIVE_VIEW_CACHE_SIZE = 32;
/** Rolls of the odds' first step: a first picture at once. */
export const ODDS_FIRST_STEP = 100;
/** Rolls between later steps. */
export const ODDS_STEP = 300;
/** Rolls of the odds ("out of 1,000 rolls"). */
export const ODDS_ROLLS = 1000;

/**
 * The number a seed text rolls with: a whole number from 0 to 4294967295 is itself, any other
 * text is hashed (FNV-1a), so words work as seeds too. The worker seeds `@msm/sim`'s random
 * source with it.
 */
export function seedNumber(text: string): number {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) return value;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = Math.imul(hash ^ trimmed.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The registry folder an element kind's file goes in, for the kinds whose data is the file
 * itself (`minecraft:loot_table` to `loot_table`, `minecraft:tag/item` to `tags/item`), or
 * `null` (MSM's own kinds lower to other files, and functions are not JSON).
 */
export function dataFolderOfKind(kind: string): string | null {
  if (!kind.startsWith('minecraft:')) return null;
  const rest = kind.slice('minecraft:'.length);
  if (rest === 'function' || rest === '') return null;
  return rest.startsWith('tag/') ? `tags/${rest.slice('tag/'.length)}` : rest;
}

/**
 * The project's data files by folder and id, from the elements whose data is the file
 * ({@link dataFolderOfKind}). `folders` keeps only those folders.
 */
export function projectDataFiles(
  project: Pick<Project, 'namespaces'>,
  folders?: readonly string[],
): DataFileMap {
  const wanted = folders === undefined ? null : new Set(folders);
  const out: Record<string, Record<string, Json>> = {};
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const folder = dataFolderOfKind(element.kind);
      if (folder === null || (wanted !== null && !wanted.has(folder))) continue;
      out[folder] ??= {};
      (out[folder] as Record<string, Json>)[vanillaFileId(element.id)] = element.data as Json;
    }
  }
  return out;
}

/** What {@link LiveViewClient.setData} sends. */
export interface LiveViewDataSpec {
  readonly project: DataFileMap;
  /** Vanilla's folders a view needs (read with `VanillaDataReader.folders`), or `null`. */
  readonly vanilla: {
    /** The version they came from. */
    readonly key: string;
    readonly folders: Readonly<Record<string, VanillaFolderFiles>>;
  } | null;
  readonly facts: TargetFacts;
  /**
   * The registries a tag view checks entries against (registry name without `minecraft:` to
   * namespaced ids: the session's registry index of the registries the view reads). Without it
   * a tag entry is kept as the game would keep one that exists ("cannot tell").
   */
  readonly registries?: Readonly<Record<string, readonly string[]>>;
}

/** The hash of a view's files. */
export function dataHashOf(spec: LiveViewDataSpec): string {
  const folders = spec.vanilla === null ? '' : Object.keys(spec.vanilla.folders).sort().join(',');
  return hashText(
    `${stableKey(spec.project)}|${spec.vanilla?.key ?? 'none'}|${folders}|${spec.facts.id}|${stableKey(spec.registries ?? null)}`,
  );
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
  /** Answers kept; default {@link LIVE_VIEW_CACHE_SIZE}. */
  cacheSize?: number;
}

interface Pending {
  readonly lane: string;
  /** The cache key, or `null` for a ping. */
  readonly key: string | null;
  readonly onStep: (step: OddsStep) => void;
  readonly resolve: (answer: LiveViewAnswer | null) => void;
  readonly reject: (error: Error) => void;
}

/** The main thread's side of the worker; see the module comment. */
export class LiveViewClient {
  readonly #createWorker: () => LiveViewWorkerLike | Promise<LiveViewWorkerLike>;
  readonly #cacheSize: number;
  readonly #lanes = new Map<string, number>();
  readonly #pending = new Map<number, Pending>();
  readonly #cache = new Map<string, LiveViewResults[LiveViewJobKind]>();
  /** File sets the worker holds, least recently used first (mirrors the worker). */
  readonly #sets: { hash: string; spec: LiveViewDataSpec }[] = [];
  /** Vanilla folders the worker holds, by version key. */
  readonly #vanilla = new Map<string, Set<string>>();
  #worker: Promise<LiveViewWorkerLike> | null = null;
  #nextToken = 1;
  #disposed = false;
  /** Jobs posted to the worker (tests and the status line). */
  posted = 0;

  constructor(options: LiveViewClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createLiveViewWorker;
    this.#cacheSize = options.cacheSize ?? LIVE_VIEW_CACHE_SIZE;
  }

  /**
   * Asks in a lane; the answer, or `null` when a newer request in the same lane replaced it.
   */
  ping(lane: string): Promise<LiveViewAnswer | null> {
    const token = this.#take(lane);
    return new Promise((resolve, reject) => {
      this.#pending.set(token, { lane, key: null, onStep: () => undefined, resolve, reject });
      void this.#post((worker) => worker.postMessage({ token, lane, kind: 'ping' }));
    });
  }

  /**
   * Makes a view's files known to the worker (sent only when it does not hold them) and answers
   * their hash, which {@link run} names.
   */
  setData(spec: LiveViewDataSpec): string {
    const hash = dataHashOf(spec);
    if (this.#sets.some((set) => set.hash === hash)) return hash;
    this.#sendData(hash, spec);
    return hash;
  }

  /**
   * Runs a job over the files of `data` in `lane`, cancelling the lane's older request. `onStep`
   * gets each step of the odds. A cached answer comes at once, without the worker.
   *
   * @returns The answer, or `null` when a newer request in the lane, {@link cancel} or
   *   {@link dispose} cancelled it; rejects when the worker fails the job.
   */
  run<J extends LiveViewJob>(
    lane: string,
    data: string,
    job: J,
    onStep: (step: OddsStep) => void = () => undefined,
  ): Promise<LiveViewResults[J['kind']] | null> {
    this.cancel(lane);
    if (this.#disposed) return Promise.resolve(null);
    const index = this.#sets.findIndex((set) => set.hash === data);
    if (index < 0) {
      return Promise.reject(new Error('These files were not given to the live views worker.'));
    }
    const key = `${data}|${stableKey(job)}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      this.#cache.delete(key);
      this.#cache.set(key, cached);
      if (isStepped(job.kind)) onStep(cached as OddsStep);
      return Promise.resolve(cached as LiveViewResults[J['kind']]);
    }
    // The worker moves a set to the end when a job names it; mirror that.
    const [set] = this.#sets.splice(index, 1);
    if (set !== undefined) this.#sets.push(set);
    const token = this.#take(lane);
    const result = new Promise<LiveViewAnswer | null>((resolve, reject) => {
      this.#pending.set(token, { lane, key, onStep, resolve, reject });
    });
    void this.#post((worker) => {
      if (!this.#pending.has(token)) return;
      this.posted += 1;
      worker.postMessage({ token, lane, data, ...job } as LiveViewRequest);
    });
    return result.then((answer) =>
      answer !== null && answer.kind === 'result'
        ? (answer.result as LiveViewResults[J['kind']])
        : null,
    );
  }

  /** Cancels the lane's request, if any (its promise resolves with `null`). */
  cancel(lane: string): void {
    const token = this.#lanes.get(lane);
    if (token === undefined) return;
    this.#lanes.delete(lane);
    if (!this.#pending.has(token)) return;
    this.#settle(token, null);
    void this.#post((worker) => worker.postMessage({ token, lane, kind: 'cancel' }));
  }

  /** Stops the worker; pending requests answer `null`, later ones too. */
  dispose(): void {
    this.#disposed = true;
    for (const token of [...this.#pending.keys()]) this.#settle(token, null);
    this.#lanes.clear();
    const worker = this.#worker;
    this.#worker = null;
    void worker?.then((started) => started.terminate()).catch(() => undefined);
  }

  #take(lane: string): number {
    const older = this.#lanes.get(lane);
    if (older !== undefined) this.#settle(older, null);
    const token = this.#nextToken++;
    this.#lanes.set(lane, token);
    return token;
  }

  #sendData(hash: string, spec: LiveViewDataSpec): void {
    this.#sets.push({ hash, spec });
    while (this.#sets.length > DATA_SETS_KEPT) this.#sets.shift();
    const vanilla = spec.vanilla;
    let missing: Record<string, VanillaFolderFiles> | null = null;
    if (vanilla !== null) {
      let sent = this.#vanilla.get(vanilla.key);
      if (sent === undefined) {
        sent = new Set();
        this.#vanilla.set(vanilla.key, sent);
      }
      for (const [folder, files] of Object.entries(vanilla.folders)) {
        if (sent.has(folder)) continue;
        sent.add(folder);
        missing ??= {};
        missing[folder] = files;
      }
    }
    const token = this.#nextToken++;
    void this.#post((worker) => {
      if (vanilla !== null && missing !== null) {
        worker.postMessage({
          token,
          lane: '',
          kind: 'vanilla',
          key: vanilla.key,
          folders: missing,
        });
      }
      worker.postMessage({
        token,
        lane: '',
        kind: 'data',
        hash,
        project: spec.project,
        vanillaKey: vanilla?.key ?? null,
        facts: spec.facts,
        registries: spec.registries ?? null,
      });
    });
  }

  async #post(send: (worker: LiveViewWorkerLike) => void): Promise<void> {
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
    // A new worker holds none of the files sent to this one.
    this.#worker = null;
    this.#sets.length = 0;
    this.#vanilla.clear();
  }

  #settle(token: number, answer: LiveViewAnswer | null): void {
    const pending = this.#pending.get(token);
    if (pending === undefined) return;
    this.#pending.delete(token);
    if (this.#lanes.get(pending.lane) === token) this.#lanes.delete(pending.lane);
    pending.resolve(answer);
  }

  #cacheSet(key: string, result: LiveViewResults[LiveViewJobKind]): void {
    this.#cache.delete(key);
    this.#cache.set(key, result);
    while (this.#cache.size > this.#cacheSize) {
      this.#cache.delete(this.#cache.keys().next().value as string);
    }
  }

  #onMessage(answer: LiveViewAnswer): void {
    const pending = this.#pending.get(answer.token);
    if (pending === undefined) return;
    switch (answer.kind) {
      case 'step':
        pending.onStep(answer.step);
        return;
      case 'error':
        this.#pending.delete(answer.token);
        if (this.#lanes.get(pending.lane) === answer.token) this.#lanes.delete(pending.lane);
        pending.reject(new Error(answer.message));
        return;
      case 'result':
        if (pending.key !== null) this.#cacheSet(pending.key, answer.result);
        if (isStepped(answer.job)) pending.onStep(answer.result as OddsStep);
        this.#settle(answer.token, answer);
        return;
      default:
        this.#settle(answer.token, answer);
    }
  }
}

let shared: LiveViewClient | null = null;

/** The one client the app's views share (one worker for every live view). */
export function sharedLiveViewClient(): LiveViewClient {
  shared ??= new LiveViewClient();
  return shared;
}
