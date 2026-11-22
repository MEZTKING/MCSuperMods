/**
 * The features stage over vanilla's own files, read at test time from the Loom cache's client
 * jars (as the app reads the user's jar; nothing is kept), skipped without a jar. Vanilla's
 * overworld land with real biomes: trees, grass, flowers and ores appear, and the types left out
 * are named. With `TERRAIN_SPEED=1` it also times a 9-chunk ground with features against the
 * ground budget of ADR 0119 D14 (1.5 s), printing the median and worst of the runs.
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildColumns,
  type ColumnWindow,
  createTerrainWorld,
  sampleHeights,
  type TerrainWorld,
  type WorldgenFileMap,
} from '../src';
import { forgetRegistries } from '../src/registries';
import { forgetKeptStates } from '../src/world';
import { FACTS } from './fixture';
import { loomJars, readJarWorldgen } from './vanilla-jar';

const jars = loomJars();
const RUNS = Number(process.env.TERRAIN_SPEED_RUNS ?? 3);

/** The feature folders of a jar (`vanilla-jar.ts` reads the terrain folders only). */
const FEATURE_FOLDERS = new Map([
  ['worldgen/feature', 2],
  ['worldgen/placed_feature', 2],
  ['worldgen/block_state_provider', 2],
  ['tags/block', 2],
]);

function readFeatureFolders(path: string): WorldgenFileMap {
  const zip = readFileSync(path);
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < entries; i += 1) {
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    const match = /^data\/([^/]+)\/(.+)\.json$/.exec(name);
    if (!match) continue;
    const [, ns, rest] = match as unknown as [string, string, string];
    const parts = rest.split('/');
    const folder = parts.slice(0, 2).join('/');
    const n = FEATURE_FOLDERS.get(folder);
    if (n === undefined) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    const data = method === 0 ? raw : inflateRawSync(raw);
    out[folder] ??= {};
    (out[folder] as Record<string, unknown>)[`${ns}:${parts.slice(n).join('/')}`] = JSON.parse(
      data.toString('utf8'),
    );
  }
  return out;
}

const BIOMES = [
  'minecraft:plains',
  'minecraft:forest',
  'minecraft:taiga',
  'minecraft:dark_forest',
  'minecraft:savanna',
  'minecraft:jungle',
  'minecraft:birch_forest',
  'minecraft:snowy_plains',
];

function world(jar: string, biomeSource: unknown, seed = 0n): TerrainWorld {
  const vanilla = { ...readJarWorldgen(jar), ...readFeatureFolders(jar) };
  return createTerrainWorld({
    files: {
      vanilla,
      project: {
        dimension: {
          'msm:features': {
            type: 'minecraft:overworld',
            generator: {
              type: 'minecraft:noise',
              settings: 'minecraft:overworld',
              biome_source: biomeSource,
            },
          },
        },
      },
    },
    source: { dimension: 'msm:features' },
    seed,
    facts: FACTS,
  });
}

function count(grid: ReturnType<typeof buildColumns>, test: (name: string) => boolean): number {
  let n = 0;
  const hits = grid.palette.map(test);
  for (const b of grid.blocks) if (hits[b]) n += 1;
  return n;
}

/** A window of 3 by 3 chunks whose rows hold the land's top at its middle. */
function surfaceWindow(w: TerrainWorld, x0: number, z0: number): ColumnWindow {
  const h = sampleHeights(w, { x0: x0 + 24, z0: z0 + 24, width: 1, depth: 1, step: 1 }, 'surface');
  return { x0, z0, y0: (h[0] as number) - 12, sizeX: 48, sizeY: 32, sizeZ: 48 };
}

beforeAll(() => {
  forgetKeptStates();
  forgetRegistries();
});

describe.skipIf(jars.length === 0)('features over vanilla files', () => {
  for (const jar of jars) {
    it(`${jar.version}: trees, plants and ores in real biomes`, () => {
      const forest = world(jar.path, { type: 'minecraft:fixed', biome: 'minecraft:forest' }, 1n);
      const window = surfaceWindow(forest, 160, 160);
      const ground = buildColumns(forest, window, 'features');
      const logs = count(ground, (n) => /_log\[/.test(n));
      const leaves = count(ground, (n) => n.includes('_leaves'));
      const grass = count(ground, (n) => n.startsWith('minecraft:short_grass'));
      console.log(`${jar.version} forest: logs ${logs}, leaves ${leaves}, grass ${grass}`);
      expect(logs).toBeGreaterThan(20);
      expect(leaves).toBeGreaterThan(logs);
      expect(grass).toBeGreaterThan(0);
      const types = new Set(ground.notes.map((n) => n.type));
      for (const t of [
        'about_right',
        'minecraft:geode',
        'minecraft:monster_room',
        'minecraft:lake',
      ]) {
        expect(types, t).toContain(t);
      }
      for (const n of ground.notes) expect(n.drawnInstead.length).toBeGreaterThan(0);
      const deep = buildColumns(forest, { ...window, y0: -40 }, 'features');
      const ores = count(deep, (n) => n.endsWith('_ore'));
      console.log(`${jar.version} y -40 to -9: ore blocks ${ores}`);
      expect(ores).toBeGreaterThan(20);
      expect(
        count(deep, (n) => n.startsWith('minecraft:deepslate_') && n.endsWith('_ore')),
      ).toBeGreaterThan(0);
    }, 120_000);
  }
});

function time(label: string, f: (i: number) => void): { median: number; worst: number } {
  const t: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const a = performance.now();
    f(i);
    t.push(performance.now() - a);
  }
  t.sort((a, b) => a - b);
  const out = {
    median: Math.round(t[Math.floor(t.length / 2)] as number),
    worst: Math.round(t[t.length - 1] as number),
  };
  console.log(`${label}: median ${out.median} ms, worst ${out.worst} ms`);
  return out;
}

describe.skipIf(!process.env.TERRAIN_SPEED || jars.length === 0)(
  'features speed (ADR 0119 D14, ground 1.5 s)',
  () => {
    for (const jar of jars) {
      it(jar.version, () => {
        console.log(`== ${jar.version} features`);
        const w = world(jar.path, {
          type: 'minecraft:checkerboard',
          biomes: BIOMES,
          scale: 2,
        });
        for (const y0 of [50, 100, -20]) {
          time(`ground 9 chunks at y ${y0}, surface`, (i) =>
            buildColumns(
              w,
              { x0: 3000 * i, z0: 800, y0, sizeX: 48, sizeY: 32, sizeZ: 48 },
              'surface',
            ),
          );
          time(`ground 9 chunks at y ${y0}, with features`, (i) =>
            buildColumns(
              w,
              { x0: 3000 * i + 96, z0: 800, y0, sizeX: 48, sizeY: 32, sizeZ: 48 },
              'features',
            ),
          );
        }
        time('ground 9 chunks at the land, with features', (i) =>
          buildColumns(w, surfaceWindow(w, 3000 * i + 192, 800), 'features'),
        );
      }, 600_000);
    }
  },
);
