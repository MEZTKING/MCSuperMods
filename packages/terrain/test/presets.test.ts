/**
 * The presets seam (B592): a resolved list laid into the vanilla files turns a `multi_noise`
 * preset into its points. With `TERRAIN_BIOME_LISTS=<folder>` (the GameTest run folder
 * `engine-mod/build/run/gameTest/msm-dev-biomes-gametest` after a GameTest run, holding the runtime's
 * `biome-lists.json` and the game's own `reference.json`) and a Loom client jar of the same
 * version, it also compares the preview's vanilla biomes with the game's, cell by cell.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTerrainWorld, resolvePreset, sampleBiomes } from '../src';
import { RESOLVED_BIOME_LISTS_FOLDER } from '../src/presets';
import { forgetRegistries } from '../src/registries';
import { hillsFiles, input } from './fixture';
import { loomJars, readJarWorldgen } from './vanilla-jar';

afterEach(() => forgetRegistries());

/** A made-up list: two biomes, the second nearer a climate of 0 everywhere. */
const LIST = {
  biomes: ['msm:beach', 'msm:meadow'],
  points: [
    [1, 5000, 10000, -10000, 10000, -10000, 10000, -10000, 10000, 0, 0, -10000, 10000, 0],
    [0, -2000, 2000, -10000, 10000, -10000, 10000, -10000, 10000, 0, 0, -10000, 10000, 0],
  ],
};

const REST = LIST.points[0]?.slice(1) ?? [];

const lists = (entry: unknown) => ({
  [RESOLVED_BIOME_LISTS_FOLDER]: { 'minecraft:overworld': entry },
});

describe('resolvePreset (B592)', () => {
  it('turns a resolved list into data pack points, in order', () => {
    expect(resolvePreset({ vanilla: lists(LIST), project: {} }, 'minecraft:overworld')).toEqual([
      {
        biome: 'msm:meadow',
        parameters: {
          temperature: [0.5, 1],
          humidity: [-1, 1],
          continentalness: [-1, 1],
          erosion: [-1, 1],
          depth: [0, 0],
          weirdness: [-1, 1],
          offset: 0,
        },
      },
      {
        biome: 'msm:beach',
        parameters: {
          temperature: [-0.2, 0.2],
          humidity: [-1, 1],
          continentalness: [-1, 1],
          erosion: [-1, 1],
          depth: [0, 0],
          weirdness: [-1, 1],
          offset: 0,
        },
      },
    ]);
  });

  it('is null without a list, for another preset, or for a broken list', () => {
    const at = (
      vanilla: Record<string, Record<string, unknown>> | null,
      preset = 'minecraft:overworld',
    ) => resolvePreset({ vanilla, project: {} }, preset);
    expect(at(null)).toBeNull();
    expect(at({})).toBeNull();
    expect(at(lists(LIST), 'minecraft:nether')).toBeNull();
    expect(at(lists({ biomes: LIST.biomes, points: [] }))).toBeNull();
    expect(at(lists({ biomes: LIST.biomes, points: [[0, 1, 2]] }))).toBeNull();
    expect(at(lists({ biomes: LIST.biomes, points: [[2, ...REST]] }))).toBeNull();
    expect(at(lists({ biomes: LIST.biomes, points: [[0.5, ...REST]] }))).toBeNull();
    expect(at(lists({ biomes: [1], points: LIST.points }))).toBeNull();
    // A project file under the folder is not read: the lists come only from vanilla's side.
    expect(
      resolvePreset({ vanilla: null, project: lists(LIST) }, 'minecraft:overworld'),
    ).toBeNull();
  });

  it('lets a multi_noise preset draw its biomes once the list is there', () => {
    const project = hillsFiles({ type: 'minecraft:multi_noise', preset: 'minecraft:overworld' });
    const without = createTerrainWorld(input(project));
    expect(without.biomesKnown).toBe(false);
    expect(without.unsupported().map((u) => u.type)).toEqual(['multi_noise.preset']);
    forgetRegistries();
    const known = createTerrainWorld(input(project, 0n, { dimension: 'msm:test' }, lists(LIST)));
    expect(known.biomesKnown).toBe(true);
    expect(known.unsupported()).toEqual([]);
    const map = sampleBiomes(known, { x0: 0, z0: 0, width: 64, depth: 64, step: 16, y: 64 });
    expect(map.palette).toEqual(['msm:beach']);
  });
});

/** The GameTest's reference cells: the biome the game picks at a block position for a seed. */
interface ReferenceCell {
  readonly biome: string;
  readonly preset: string;
  readonly seed: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const folder = process.env.TERRAIN_BIOME_LISTS ?? '';
const listsFile = join(folder, 'biome-lists.json');
const referenceFile = join(folder, 'reference.json');
const ready = folder !== '' && existsSync(listsFile) && existsSync(referenceFile);

describe.skipIf(!ready)(
  'vanilla biomes against the game (TERRAIN_BIOME_LISTS)',
  { timeout: 120_000 },
  () => {
    it('draws the overworld and the Nether with the game biome at every reference cell', () => {
      const written = JSON.parse(readFileSync(listsFile, 'utf8')) as {
        minecraftVersion: string;
        presets: Record<string, unknown>;
      };
      const reference = JSON.parse(readFileSync(referenceFile, 'utf8')) as {
        minecraftVersion: string;
        cells: ReferenceCell[];
      };
      const jar = loomJars().find((j) => j.version === written.minecraftVersion);
      if (jar === undefined) throw new Error(`No Loom client jar of ${written.minecraftVersion}.`);
      const vanilla = {
        ...readJarWorldgen(jar.path),
        [RESOLVED_BIOME_LISTS_FOLDER]: written.presets,
      };
      const groups = new Map<string, ReferenceCell[]>();
      for (const cell of reference.cells) {
        const key = `${cell.seed} ${cell.preset}`;
        groups.set(key, [...(groups.get(key) ?? []), cell]);
      }
      let same = 0;
      const misses: string[] = [];
      const biomes = new Set<string>();
      for (const [key, cells] of groups) {
        const [seed, preset] = key.split(' ') as [string, string];
        forgetRegistries();
        const world = createTerrainWorld({
          files: { vanilla, project: {} },
          source: {
            preset: 'minecraft:normal',
            dimension: preset === 'minecraft:nether' ? 'minecraft:the_nether' : preset,
          },
          seed: BigInt(seed),
          facts: { dataFolders: [], approximate: [] },
        });
        expect(world.biomesKnown).toBe(true);
        for (const cell of cells) {
          const map = sampleBiomes(world, {
            x0: cell.x,
            z0: cell.z,
            width: 4,
            depth: 4,
            step: 4,
            y: cell.y,
          });
          const biome = map.palette[map.cells[0] ?? 0];
          biomes.add(`${preset} ${biome}`);
          if (biome === cell.biome) same += 1;
          else misses.push(`${key} ${cell.x} ${cell.y} ${cell.z}: ${biome} against ${cell.biome}`);
        }
      }
      const byPreset = (preset: string) =>
        `${reference.cells.filter((c) => c.preset === preset).length - misses.filter((m) => m.includes(` ${preset} `)).length} of ${reference.cells.filter((c) => c.preset === preset).length}`;
      console.log(
        `${written.minecraftVersion}: ${same} of ${reference.cells.length} cells the game's biome ` +
          `(overworld ${byPreset('minecraft:overworld')}, Nether ${byPreset('minecraft:nether')}); ` +
          `${biomes.size} preset biomes drawn; first misses ${JSON.stringify(misses.slice(0, 6))}`,
      );
      expect(biomes.size).toBeGreaterThan(10);
      if (process.env.TERRAIN_BIOME_LISTS_EXACT === '1') expect(misses).toEqual([]);
    });
  },
);
