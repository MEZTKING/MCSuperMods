/**
 * The terrain worker (ADR 0119 D5; B580): a Vite module worker in its own chunk, loaded by
 * `client.ts` with `?worker` as Monaco's workers are. It is the only module of the app that
 * imports `@msm/terrain` (a test checks), so noise is never sampled on the renderer's main thread.
 *
 * - **One world at a time** (F9): a `world` message replaces the world; work queued for the
 *   world before it is dropped.
 * - **Jobs one by one, yielding between them**, so a `cancel` or a newer world arriving while a
 *   job runs is seen before the next job starts. A job already running finishes (sampling is
 *   synchronous); the client drops its answer. Worlds go first, then coarse passes, then fine.
 * - **Typed arrays are transferred** to the main thread, not copied: the engine must hand out
 *   fresh arrays (not ones it keeps in a cache), since a transferred buffer is emptied here.
 * - Vanilla's files arrive once per key (`vanilla`) and are kept; a world names them by key.
 */

import * as terrain from '@msm/terrain';
import type {
  ColumnStage,
  ColumnWindow,
  MapRegion,
  SliceRegion,
  TerrainAnswer,
  TerrainFacts,
  TerrainRequest,
  TerrainSource,
  Unsupported,
  WorkerInbound,
  WorkerOutbound,
  WorldgenFileMap,
  WorldgenFiles,
  WorldSummary,
} from './client';

/** Whether two types are the same (each assignable to the other). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * `client.ts` mirrors the engine's protocol types so that nothing outside this worker imports
 * the engine; this fails to compile when the two drift apart.
 */
export const PROTOCOL_MATCHES_ENGINE: [
  Same<TerrainRequest, terrain.TerrainRequest>,
  Same<TerrainAnswer, terrain.TerrainAnswer>,
  Same<WorldgenFiles, terrain.WorldgenFiles>,
  Same<TerrainFacts, terrain.TerrainTargetFacts>,
  Same<TerrainSource, terrain.TerrainSource>,
  Same<Unsupported, terrain.Unsupported>,
  Same<MapRegion, terrain.MapRegion>,
  Same<SliceRegion, terrain.SliceRegion>,
  Same<ColumnWindow, terrain.ColumnWindow>,
  Same<ColumnStage, terrain.ColumnStage>,
] = [true, true, true, true, true, true, true, true, true, true];

/** The engine functions the worker calls (tests pass a fake). */
export type TerrainEngine = Pick<
  typeof terrain,
  | 'createTerrainWorld'
  | 'sampleBiomes'
  | 'sampleHeights'
  | 'sampleSlice'
  | 'sampleValues'
  | 'buildColumns'
  | 'seedFromText'
>;

type WorldJob = Extract<WorkerInbound, { type: 'world' }>;
type SampleJob = Extract<TerrainRequest, { pass: 'coarse' | 'fine' }>;
type Job = WorldJob | SampleJob;

/** What the worker's message handler calls. */
export interface TerrainHost {
  receive(message: WorkerInbound): void;
  /** Jobs waiting (for tests). */
  readonly queued: number;
}

/** Sends a message to the main thread, transferring the listed buffers. */
export type PostOutbound = (message: WorkerOutbound, transfer: ArrayBuffer[]) => void;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bufferOf(array: ArrayBufferView): ArrayBuffer | null {
  return array.buffer instanceof ArrayBuffer ? array.buffer : null;
}

/** The buffers of an answer's typed arrays, each once. */
function transferList(data: TerrainAnswer['data']): ArrayBuffer[] {
  const views: ArrayBufferView[] = [];
  if (ArrayBuffer.isView(data)) views.push(data);
  else if ('cells' in data) views.push(data.cells);
  else views.push(data.blocks);
  const out = new Set<ArrayBuffer>();
  for (const view of views) {
    const buffer = bufferOf(view);
    if (buffer !== null) out.add(buffer);
  }
  return [...out];
}

/**
 * The worker's logic, apart from the worker scope so tests can drive it.
 *
 * @param engine - `@msm/terrain`, or a fake.
 * @param post - Sends to the main thread.
 * @param schedule - Runs the next job later (default `setTimeout(run, 0)`, which lets waiting
 *   messages in first).
 */
export function createTerrainHost(
  engine: TerrainEngine,
  post: PostOutbound,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
): TerrainHost {
  let world: { hash: string; world: terrain.TerrainWorld } | null = null;
  let vanilla: { key: string; files: WorldgenFileMap } | null = null;
  let queue: Job[] = [];
  let scheduled = false;

  const next = (): Job | undefined => {
    let index = queue.findIndex((job) => job.type === 'world');
    if (index < 0) index = queue.findIndex((job) => job.type !== 'world' && job.pass === 'coarse');
    if (index < 0) index = 0;
    const [job] = queue.splice(index, 1);
    return job;
  };

  const makeWorld = (job: WorldJob): void => {
    world = null;
    const started = performance.now();
    try {
      let files: WorldgenFileMap | null = null;
      if (job.vanillaKey !== null) {
        if (vanilla === null || vanilla.key !== job.vanillaKey) {
          throw new Error('The vanilla files for this world were not sent.');
        }
        files = vanilla.files;
      }
      const seed = engine.seedFromText(job.spec.seed);
      const made = engine.createTerrainWorld({
        files: { vanilla: files, project: job.spec.project },
        source: job.spec.source,
        seed,
        facts: job.spec.facts,
      });
      world = { hash: job.filesHash, world: made };
      const summary: WorldSummary = {
        generator: made.generator,
        minY: made.minY,
        height: made.height,
        seaLevel: made.seaLevel,
        biomesKnown: made.biomesKnown,
        seed: seed.toString(),
        unsupported: made.unsupported(),
        ms: performance.now() - started,
      };
      post({ type: 'world', token: job.token, filesHash: job.filesHash, summary }, []);
    } catch (error) {
      post(
        {
          type: 'error',
          token: job.token,
          request: 'world',
          pass: null,
          message: messageOf(error),
        },
        [],
      );
    }
  };

  const sample = (job: SampleJob): void => {
    const current = world;
    if (current === null || current.hash !== job.filesHash) {
      post(
        {
          type: 'error',
          token: job.token,
          request: job.type,
          pass: job.pass,
          message: 'The world changed before this part was drawn.',
        },
        [],
      );
      return;
    }
    const started = performance.now();
    try {
      let data: TerrainAnswer['data'];
      let notes: readonly Unsupported[] = [];
      switch (job.type) {
        case 'biomes':
          data = engine.sampleBiomes(current.world, job.region as MapRegion);
          break;
        case 'heights':
          data = engine.sampleHeights(
            current.world,
            job.region as MapRegion,
            job.fn === 'ocean_floor' ? 'ocean_floor' : 'surface',
          );
          break;
        case 'slice':
          data = engine.sampleSlice(current.world, job.region as SliceRegion);
          break;
        case 'values':
          data = engine.sampleValues(current.world, job.fn, job.region as MapRegion | SliceRegion);
          break;
        case 'columns': {
          const columns = engine.buildColumns(
            current.world,
            job.region as ColumnWindow,
            job.stage ?? 'terrain',
          );
          data = columns;
          notes = columns.notes;
          break;
        }
      }
      const answer: TerrainAnswer = {
        token: job.token,
        type: job.type,
        pass: job.pass,
        ms: performance.now() - started,
        data,
        notes,
      };
      post({ type: 'answer', answer }, transferList(data));
    } catch (error) {
      post(
        {
          type: 'error',
          token: job.token,
          request: job.type,
          pass: job.pass,
          message: messageOf(error),
        },
        [],
      );
    }
  };

  const run = (): void => {
    scheduled = false;
    const job = next();
    if (job !== undefined) {
      if (job.type === 'world') makeWorld(job);
      else sample(job);
    }
    if (queue.length > 0 && !scheduled) {
      scheduled = true;
      schedule(run);
    }
  };

  return {
    get queued() {
      return queue.length;
    },
    receive(message) {
      switch (message.type) {
        case 'vanilla':
          vanilla = { key: message.key, files: message.files };
          return;
        case 'cancel':
          queue = queue.filter((job) => job.token !== message.token);
          return;
        case 'world':
          // The new world replaces the old: what was queued for any world before is dropped.
          queue = [message];
          break;
        default:
          queue.push(message);
      }
      if (!scheduled) {
        scheduled = true;
        schedule(run);
      }
    },
  };
}

interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
}

// Wired only inside a worker; tests import the module in Node and call `createTerrainHost`.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const host = createTerrainHost(terrain, (message, transfer) =>
    scope.postMessage(message, transfer),
  );
  scope.onmessage = (event) => host.receive(event.data);
}
