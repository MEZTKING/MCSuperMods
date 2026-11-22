/**
 * Speeds of WS2 to WS4, WS14 and the Height map (ADR 0119 D14), over the Loom jars' vanilla
 * overworld settings with a biome list of MSM's own. Opt-in (`TERRAIN_SPEED=1`) and skipped
 * without a jar; it prints the median and worst of the runs and asserts nothing about time.
 */

import { describe, expect, it } from 'vitest';
import {
  buildColumns,
  createTerrainWorld,
  type MapRegion,
  sampleBiomes,
  sampleHeights,
  sampleSlice,
  type TerrainWorld,
} from '../src';
import { forgetRegistries } from '../src/registries';
import { forgetKeptStates } from '../src/world';
import { FACTS } from './fixture';
import { loomJars, readJarWorldgen } from './vanilla-jar';

const jars = loomJars();
const RUNS = Number(process.env.TERRAIN_SPEED_RUNS ?? 3);

/** A biome list of MSM's own: n points spread over the six climate parameters. */
function ownList(n: number): unknown[] {
  let s = 1;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
  const names = ['temperature', 'humidity', 'continentalness', 'erosion', 'depth', 'weirdness'];
  return Array.from({ length: n }, (_, i) => ({
    biome: `msm:biome_${i % 40}`,
    parameters: Object.fromEntries([
      ...names.map((p) => {
        const a = r();
        const b = r();
        return [p, [Math.min(a, b), Math.max(a, b)]];
      }),
      ['offset', 0],
    ]),
  }));
}

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

describe.skipIf(!process.env.TERRAIN_SPEED || jars.length === 0)('speeds (ADR 0119 D14)', () => {
  for (const jar of jars) {
    it(jar.version, () => {
      const vanilla = readJarWorldgen(jar.path);
      const make = (biomes: unknown, seed = 0n, seaLevel?: number): TerrainWorld => {
        const settings = {
          ...(vanilla['worldgen/noise_settings']?.['minecraft:overworld'] as Record<
            string,
            unknown
          >),
        };
        if (seaLevel !== undefined) settings.sea_level = seaLevel;
        return createTerrainWorld({
          files: {
            vanilla,
            project: {
              'worldgen/noise_settings': { 'msm:speed': settings },
              dimension: {
                'msm:speed': {
                  type: 'minecraft:overworld',
                  generator: {
                    type: 'minecraft:noise',
                    settings: 'msm:speed',
                    biome_source: { type: 'minecraft:multi_noise', biomes },
                  },
                },
              },
            },
          },
          source: { dimension: 'msm:speed' },
          seed,
          facts: FACTS,
        });
      };
      console.log(`== ${jar.version}`);
      forgetKeptStates();
      forgetRegistries();
      let world = make(ownList(24));
      time('world, nothing kept', (i) => {
        forgetKeptStates();
        world = make(ownList(24), BigInt(i));
      });
      time('world after an edit to the sea level (random state kept)', (i) => {
        world = make(ownList(24), BigInt(RUNS - 1), 50 + i);
      });
      const at = (i: number, area: number, step: number): MapRegion => ({
        x0: 4000 * (i + 1),
        z0: -2000,
        width: area,
        depth: area,
        step,
      });
      time('biomes coarse 64 x 64 (step 16)', (i) => sampleBiomes(world, at(i, 1024, 16)));
      time('biomes full 256 x 256 (step 4)', (i) => sampleBiomes(world, at(i, 1024, 4)));
      time('heights coarse 64 x 64 (step 16)', (i) =>
        sampleHeights(world, at(i, 1024, 16), 'surface'),
      );
      time('heights 128 x 128 (step 8)', (i) => sampleHeights(world, at(i, 1024, 8), 'surface'));
      time('heights full 256 x 256 (step 4)', (i) =>
        sampleHeights(world, at(i, 1024, 4), 'surface'),
      );
      time('heights 256 x 256 (step 1)', (i) => sampleHeights(world, at(i, 256, 1), 'surface'));
      time('side cut 256 wide, full height', (i) =>
        sampleSlice(world, { axis: 'x', at: 900 * i, from: 0, to: 256, step: 1, yStep: 1 }),
      );
      time('side cut coarse (every 4th column)', (i) =>
        sampleSlice(world, { axis: 'x', at: 900 * i + 50, from: 0, to: 256, step: 4, yStep: 1 }),
      );
      for (const y0 of [50, 100, -20]) {
        time(`ground 9 chunks, 32 high at y ${y0}`, (i) => {
          const g = buildColumns(
            world,
            { x0: 3000 * i, z0: 800, y0, sizeX: 48, sizeY: 32, sizeZ: 48 },
            'surface',
          );
          expect(g.blocks.length).toBe(48 * 48 * 32);
        });
      }
      time('ground 9 chunks, terrain only', (i) =>
        buildColumns(
          world,
          { x0: 3000 * i + 500, z0: 800, y0: 50, sizeX: 48, sizeY: 32, sizeZ: 48 },
          'terrain',
        ),
      );
      time('ground 16 chunks, 32 high', (i) =>
        buildColumns(
          world,
          { x0: 3000 * i + 1000, z0: 800, y0: 50, sizeX: 64, sizeY: 32, sizeZ: 64 },
          'surface',
        ),
      );
      time('ground 9 chunks, full height', (i) =>
        buildColumns(
          world,
          { x0: 3000 * i + 1500, z0: 800, y0: -64, sizeX: 48, sizeY: 384, sizeZ: 48 },
          'surface',
        ),
      );
    }, 600_000);
  }
});
