/**
 * A fake terrain engine and a worker that runs `createTerrainHost` in the test's own thread, so
 * the client and the worker are tested together without `@msm/terrain`'s bodies (B578).
 */

import type {
  ColumnWindow,
  MapRegion,
  SliceRegion,
  WorkerInbound,
  WorkerLike,
  WorkerOutbound,
} from '../../../src/renderer/src/terrain/client';
import { createTerrainHost, type TerrainEngine } from '../../../src/renderer/src/terrain/worker';

export interface EngineCall {
  readonly fn: string;
  readonly region?: MapRegion | SliceRegion | ColumnWindow;
  readonly arg?: unknown;
}

export function fakeEngine(options: { failWorld?: boolean; failBiomes?: boolean } = {}): {
  engine: TerrainEngine;
  calls: EngineCall[];
} {
  const calls: EngineCall[] = [];
  const world = {
    generator: 'noise' as const,
    minY: -64,
    height: 384,
    seaLevel: 63,
    biomesKnown: true,
    unsupported: () => [
      {
        kind: 'density_function' as const,
        type: 'minecraft:bandlands',
        where: 'demo:land',
        drawnInstead: 'left flat',
      },
    ],
  };
  const cellsOf = (region: MapRegion): number =>
    Math.ceil(region.width / region.step) * Math.ceil(region.depth / region.step);
  const engine: TerrainEngine = {
    createTerrainWorld(input) {
      calls.push({ fn: 'world', arg: input });
      if (options.failWorld === true) throw new Error('bad noise settings');
      return world;
    },
    sampleBiomes(_world, region) {
      calls.push({ fn: 'biomes', region });
      if (options.failBiomes === true) throw new Error('no biomes here');
      return { palette: ['minecraft:plains'], cells: new Uint16Array(cellsOf(region)) };
    },
    sampleHeights(_world, region, kind) {
      calls.push({ fn: 'heights', region, arg: kind });
      return new Int16Array(cellsOf(region)).fill(70);
    },
    sampleSlice(_world, region) {
      calls.push({ fn: 'slice', region });
      return { palette: ['minecraft:stone'], cells: new Uint16Array(4) };
    },
    sampleValues(_world, fn, region) {
      calls.push({ fn: 'values', region, arg: fn });
      return new Float32Array(4);
    },
    buildColumns(_world, window, stage) {
      calls.push({ fn: 'columns', region: window, arg: stage });
      return {
        size: { x: window.sizeX, y: window.sizeY, z: window.sizeZ },
        palette: ['minecraft:air'],
        blocks: new Uint16Array(window.sizeX * window.sizeY * window.sizeZ),
        notes: [],
      };
    },
    seedFromText(text) {
      return /^-?\d+$/.test(text) ? BigInt(text) : 7n;
    },
  };
  return { engine, calls };
}

/**
 * A worker over `createTerrainHost`: messages are cloned both ways as `postMessage` would, the
 * host's jobs run only when the test calls {@link LocalWorker.flush}.
 */
export interface LocalWorker {
  readonly worker: WorkerLike;
  /** Every message the client posted. */
  readonly sent: WorkerInbound[];
  /** Every message the worker posted, with the buffers it transferred. */
  readonly answered: { message: WorkerOutbound; transfer: ArrayBuffer[] }[];
  /** Runs the worker's jobs and delivers answers until nothing is left. */
  flush(): Promise<void>;
  /** Runs the next job without delivering its answer (it waits for {@link flush}). */
  runOne(): Promise<void>;
  terminated: boolean;
}

async function ticks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

export function localWorker(engine: TerrainEngine): LocalWorker {
  const runs: (() => void)[] = [];
  const outbox: WorkerOutbound[] = [];
  const local: LocalWorker = {
    sent: [],
    answered: [],
    terminated: false,
    worker: {
      onmessage: null,
      postMessage(message) {
        local.sent.push(message);
        host.receive(structuredClone(message));
      },
      terminate() {
        local.terminated = true;
      },
    },
    async runOne() {
      await ticks();
      runs.shift()?.();
    },
    async flush() {
      await ticks();
      while (runs.length > 0 || outbox.length > 0) {
        const run = runs.shift();
        if (run !== undefined) run();
        while (outbox.length > 0) {
          const message = outbox.shift() as WorkerOutbound;
          local.worker.onmessage?.({ data: message });
        }
        await ticks();
      }
    },
  };
  const host = createTerrainHost(
    engine,
    (message, transfer) => {
      local.answered.push({ message, transfer });
      outbox.push(message);
    },
    (run) => runs.push(run),
  );
  return local;
}
