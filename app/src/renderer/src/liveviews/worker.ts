/**
 * The live views worker (ADR 0120 D12; B608): a Vite module worker in its own chunk, loaded by
 * `client.ts` with `?worker`. It is the only module of the app that calls `@msm/sim`'s loot, tag
 * and predicate evaluators (a test checks), so nothing heavy runs on the main thread.
 *
 * - **Files once** (`vanilla` and `data` messages): vanilla's folders are kept per version key,
 *   a view's files per hash (the last {@link DATA_SETS_KEPT}, least recently used dropped first;
 *   the client mirrors the same rule).
 * - **Jobs one by one, yielding between them**, so a `cancel` arriving while work waits is seen
 *   before it runs. Single answers (a roll, a tag, a predicate, a modifier) go before the odds;
 *   the odds run step by step, a step at a time between other jobs, and stop at their cancel
 *   token.
 * - Every job builds its evaluator context afresh: the files' lookup (`@msm/sim`'s
 *   `layeredLookup`, the project's file over vanilla's with both layers kept, so tags merge them
 *   as the game does), one tag resolver per file set (`createTagResolver` with the target's tags
 *   folder and, when the view sent a registry list, `exists`), the target's facts, and a random
 *   source seeded from the job's seed (`seedNumber`), so the same job gives the same answer.
 *
 * {@link answerRequest} answers one request as a function of the request and the files held;
 * {@link createLiveViewHost} queues and steps them for the worker scope and for tests.
 */

import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import {
  applyItemModifier,
  createTagResolver,
  type DataLookup,
  type EvalContext,
  type LayeredLookup,
  layeredLookup,
  lootOdds,
  NO_FILES,
  type OddsStep,
  rollLoot,
  SimRandom,
  type TagResolver,
  testPredicate,
} from '@msm/sim';
import {
  DATA_SETS_KEPT,
  type LiveViewAnswer,
  type LiveViewJob,
  type LiveViewRequest,
  type LiveViewResults,
  seedNumber,
} from './client';
import { type VanillaFolderFiles, vanillaFileId } from './vanilla-data';

/** The evaluators the worker calls (tests pass fakes). */
export interface LiveViewEngine {
  readonly rollLoot: typeof rollLoot;
  readonly lootOdds: typeof lootOdds;
  readonly createTagResolver: typeof createTagResolver;
  readonly testPredicate: typeof testPredicate;
  readonly applyItemModifier: typeof applyItemModifier;
}

/** `@msm/sim`'s evaluators. */
export const SIM_ENGINE: LiveViewEngine = {
  rollLoot,
  lootOdds,
  createTagResolver,
  testPredicate,
  applyItemModifier,
};

interface DataSet {
  readonly lookup: LayeredLookup;
  readonly facts: TargetFacts;
  /** One resolver a file set: each tag resolved once (B604). */
  readonly resolveTag: TagResolver;
}

/** What the worker holds between requests. */
export interface LiveViewStore {
  /** Vanilla's folders by version key. */
  readonly vanilla: Map<string, Record<string, VanillaFolderFiles>>;
  /** File sets by hash, least recently used first. */
  readonly data: Map<string, DataSet>;
}

/** An empty store. */
export function createStore(): LiveViewStore {
  return { vanilla: new Map(), data: new Map() };
}

/** A lookup over files by folder and id (`stone` is `minecraft:stone`, a `#` is dropped). */
export function mapLookup(
  files: Readonly<Record<string, Readonly<Record<string, Json>>>> | undefined,
): DataLookup {
  if (files === undefined) return NO_FILES;
  return (folder, id) => {
    const map = Object.hasOwn(files, folder) ? files[folder] : undefined;
    const key = vanillaFileId(id);
    return map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
  };
}

/**
 * The `exists` of the tag resolver from a registry list (registry name without `minecraft:` to
 * namespaced ids): `undefined` ("cannot tell") for a registry the list does not hold.
 */
export function existsIn(
  registries: Readonly<Record<string, readonly string[]>> | null,
): ((registry: string, id: string) => boolean | undefined) | undefined {
  if (registries === null) return undefined;
  const sets = new Map<string, Set<string>>();
  return (registry, id) => {
    const name = registry.startsWith('minecraft:') ? registry.slice('minecraft:'.length) : registry;
    if (!Object.hasOwn(registries, name)) return undefined;
    let set = sets.get(name);
    if (set === undefined) {
      set = new Set((registries[name] ?? []).map((entry) => vanillaFileId(entry)));
      sets.set(name, set);
    }
    return set.has(vanillaFileId(id));
  };
}

function contextOf(set: DataSet, seed: string): EvalContext {
  return {
    random: new SimRandom(seedNumber(seed)),
    lookup: set.lookup,
    resolveTag: set.resolveTag,
    types: set.facts,
  };
}

/** Takes the file set a job names, moving it to the most recently used end. */
function useSet(store: LiveViewStore, hash: string): DataSet | undefined {
  const set = store.data.get(hash);
  if (set !== undefined) {
    store.data.delete(hash);
    store.data.set(hash, set);
  }
  return set;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type JobRequest = Extract<LiveViewRequest, { readonly data: string }>;

/** Runs a single-answer job (everything but the odds' steps). */
function runJob(
  request: JobRequest,
  set: DataSet,
  engine: LiveViewEngine,
): LiveViewResults[LiveViewJob['kind']] {
  switch (request.kind) {
    case 'roll':
      return engine.rollLoot(request.table, request.situation, contextOf(set, request.seed));
    case 'tag':
      return set.resolveTag(request.registry, request.id);
    case 'predicate':
      return engine.testPredicate(
        request.predicate,
        request.situation,
        contextOf(set, request.seed),
      );
    case 'modify':
      return engine.applyItemModifier(
        request.modifier as JsonObject | readonly Json[],
        request.item,
        request.situation,
        contextOf(set, request.seed),
      );
    case 'odds': {
      let last: OddsStep = { done: 0, rows: [] };
      for (const step of oddsSteps(request, set, engine, { cancelled: false })) last = step;
      return last;
    }
  }
}

/** The odds of an `odds` job, step by step. */
function oddsSteps(
  request: Extract<JobRequest, { kind: 'odds' }>,
  set: DataSet,
  engine: LiveViewEngine,
  cancel: { cancelled: boolean },
): Iterable<OddsStep> {
  return engine.lootOdds(request.table, request.situation, contextOf(set, request.seed), {
    rolls: request.rolls,
    step: request.step,
    cancel,
  });
}

/**
 * Answers one request from what `store` holds, changing the store for `vanilla` and `data`
 * messages (they answer nothing). A ping answers `not_yet`, a cancel nothing; an `odds` job is
 * run to its end here (the host steps it instead).
 */
export function answerRequest(
  request: LiveViewRequest,
  store: LiveViewStore = createStore(),
  engine: LiveViewEngine = SIM_ENGINE,
): LiveViewAnswer | null {
  switch (request.kind) {
    case 'ping':
      return { token: request.token, kind: 'not_yet' };
    case 'cancel':
      return null;
    case 'vanilla': {
      // Added in place: file sets made before see the new folders too.
      const held = store.vanilla.get(request.key) ?? {};
      Object.assign(held, request.folders);
      store.vanilla.set(request.key, held);
      return null;
    }
    case 'data': {
      const vanilla =
        request.vanillaKey === null ? undefined : store.vanilla.get(request.vanillaKey);
      store.data.delete(request.hash);
      const lookup = layeredLookup(mapLookup(request.project), mapLookup(vanilla));
      const exists = existsIn(request.registries);
      store.data.set(request.hash, {
        lookup,
        facts: request.facts,
        resolveTag: engine.createTagResolver(lookup, {
          tagsFolder: request.facts.folders.data.tags,
          ...(exists === undefined ? {} : { exists }),
        }),
      });
      while (store.data.size > DATA_SETS_KEPT) {
        store.data.delete(store.data.keys().next().value as string);
      }
      return null;
    }
    default: {
      const set = useSet(store, request.data);
      if (set === undefined) {
        return {
          token: request.token,
          kind: 'error',
          message: 'The files for this view were not sent to the live views worker.',
        };
      }
      const started = performance.now();
      try {
        const result = runJob(request, set, engine);
        return {
          token: request.token,
          kind: 'result',
          job: request.kind,
          result,
          ms: performance.now() - started,
        };
      } catch (error) {
        return { token: request.token, kind: 'error', message: messageOf(error) };
      }
    }
  }
}

/** What the worker's message handler calls. */
export interface LiveViewHost {
  receive(request: LiveViewRequest): void;
  /** Jobs waiting (for tests). */
  readonly queued: number;
}

interface OddsRun {
  readonly request: Extract<JobRequest, { kind: 'odds' }>;
  readonly cancel: { cancelled: boolean };
  iterator: Iterator<OddsStep> | null;
  last: OddsStep;
  readonly started: number;
}

/**
 * The worker's logic, apart from the worker scope so tests can drive it.
 *
 * @param engine - `@msm/sim`'s evaluators, or fakes.
 * @param post - Sends an answer to the main thread.
 * @param schedule - Runs the next job later (default `setTimeout(run, 0)`, which lets waiting
 *   messages in first).
 */
export function createLiveViewHost(
  engine: LiveViewEngine,
  post: (answer: LiveViewAnswer) => void,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
): LiveViewHost {
  const store = createStore();
  let queue: JobRequest[] = [];
  let odds: OddsRun[] = [];
  let scheduled = false;

  const stepOdds = (run: OddsRun): boolean => {
    const set = useSet(store, run.request.data);
    if (set === undefined) {
      post({
        token: run.request.token,
        kind: 'error',
        message: 'The files for this view were not sent to the live views worker.',
      });
      return true;
    }
    try {
      run.iterator ??= oddsSteps(run.request, set, engine, run.cancel)[Symbol.iterator]();
      const next = run.iterator.next();
      if (run.cancel.cancelled) return true;
      const ms = performance.now() - run.started;
      if (next.done === true) {
        post({ token: run.request.token, kind: 'result', job: 'odds', result: run.last, ms });
        return true;
      }
      run.last = next.value;
      if (next.value.done >= run.request.rolls) {
        post({ token: run.request.token, kind: 'result', job: 'odds', result: next.value, ms });
        return true;
      }
      post({ token: run.request.token, kind: 'step', step: next.value, ms });
      return false;
    } catch (error) {
      post({ token: run.request.token, kind: 'error', message: messageOf(error) });
      return true;
    }
  };

  const run = (): void => {
    scheduled = false;
    const job = queue.shift();
    if (job !== undefined) {
      const answer = answerRequest(job, store, engine);
      if (answer !== null) post(answer);
    } else {
      const current = odds.shift();
      if (current !== undefined && !stepOdds(current)) odds.push(current);
    }
    if ((queue.length > 0 || odds.length > 0) && !scheduled) {
      scheduled = true;
      schedule(run);
    }
  };

  return {
    get queued() {
      return queue.length + odds.length;
    },
    receive(request) {
      switch (request.kind) {
        case 'ping': {
          const answer = answerRequest(request, store, engine);
          if (answer !== null) post(answer);
          return;
        }
        case 'cancel':
          queue = queue.filter((job) => job.token !== request.token);
          odds = odds.filter((entry) => {
            if (entry.request.token !== request.token) return true;
            entry.cancel.cancelled = true;
            return false;
          });
          return;
        case 'vanilla':
        case 'data':
          // Files are taken in at once, in order, so a job sent after them finds them.
          answerRequest(request, store, engine);
          return;
        case 'odds':
          odds.push({
            request,
            cancel: { cancelled: false },
            iterator: null,
            last: { done: 0, rows: [] },
            started: performance.now(),
          });
          break;
        default:
          queue.push(request);
      }
      if (!scheduled) {
        scheduled = true;
        schedule(run);
      }
    },
  };
}

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<LiveViewRequest>) => void) | null;
}

// Wired only inside a worker; tests import the module in Node and call `answerRequest` or
// `createLiveViewHost`.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const host = createLiveViewHost(SIM_ENGINE, (answer) => scope.postMessage(answer));
  scope.onmessage = (event) => host.receive(event.data);
}
