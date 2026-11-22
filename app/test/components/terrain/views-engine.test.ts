/**
 * B585's plain worlds and markers through the real engine (`@msm/terrain`, which only the
 * worker imports in the app; tests may run it directly). Every file here is written for the test:
 * no vanilla file is read.
 */

import {
  buildColumns,
  createTerrainWorld,
  sampleValues,
  type TerrainWorldInput,
  type WorldgenFileMap,
} from '@msm/terrain';
import { describe, expect, it } from 'vitest';
import { compareNotes, compareSource } from '../../../src/renderer/src/terrain/CompareView';
import type { ColumnsData } from '../../../src/renderer/src/terrain/client';
import { MAX_MARKERS, setName, structureMarkers } from '../../../src/renderer/src/terrain/markers';
import { patchWindow, readScatter, scatterPlan } from '../../../src/renderer/src/terrain/Scatter';
import { valueHosts } from '../../../src/renderer/src/terrain/ValueMap';
import { type ViewWorldSpec, viewFiles } from '../../../src/renderer/src/terrain/views';

const STEPS = [
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification',
];
const FACTS = { dataFolders: [], approximate: [], featureSteps: STEPS } as const;

function inputOf(project: WorldgenFileMap, spec: ViewWorldSpec, seed = 1n): TerrainWorldInput {
  return {
    files: { vanilla: null, project: viewFiles(project, spec) },
    source: spec.source,
    seed,
    facts: FACTS,
  };
}

function scatterOf(project: WorldgenFileMap, spec: ViewWorldSpec, seed = 1n) {
  const world = createTerrainWorld(inputOf(project, spec, seed));
  const window = patchWindow({ x: 0, z: 0 });
  const land = buildColumns(world, window, 'surface') as ColumnsData;
  const features = buildColumns(world, window, 'features') as ColumnsData;
  return { world, result: readScatter(land, features), features };
}

const DANDELIONS = { type: 'minecraft:simple_block', to_place: { id: 'minecraft:dandelion' } };

const state = (project: WorldgenFileMap) => ({ project, vanilla: null, facts: FACTS });

describe('the Scatter through the engine', () => {
  it('places a placed feature by its own rules on the flat land, and nothing else', () => {
    const project: WorldgenFileMap = {
      'worldgen/feature': { 'demo:dandelions': DANDELIONS },
      'worldgen/placed_feature': {
        'demo:dandelions': {
          feature: 'demo:dandelions',
          placement: [
            { type: 'minecraft:count', count: 6 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          ],
        },
      },
    };
    const element = { kind: 'minecraft:worldgen/placed_feature', id: 'demo:dandelions', data: {} };
    const plan = scatterPlan(element, state(project));
    expect(plan).not.toBeNull();
    const { world, result, features } = scatterOf(project, plan?.spec as ViewWorldSpec);
    expect(world.unsupported().filter((part) => part.kind === 'file')).toEqual([]);
    expect(result.placed).toBeGreaterThan(10);
    expect(result.chunks).toBeGreaterThan(3);
    // Every placed block is a dandelion on top of the grass (y 64).
    expect(result.picks.map((pick) => pick.block)).toEqual(['minecraft:dandelion']);
    expect(result.rows).toEqual({ low: 128, high: 128 });
    // The land is grass over dirt over stone, its top at y 63.
    const column = (y: number) => result.blockAt(5, y + 64, 5);
    expect(column(63)).toBe('minecraft:grass_block[snowy=false]');
    expect(column(62)).toBe('minecraft:dirt');
    expect(column(50)).toBe('minecraft:stone');
    expect(features.notes.some((note) => note.type === 'about_right')).toBe(true);
  });

  it('places a lone ore through the stone and says how', () => {
    const project: WorldgenFileMap = {
      'worldgen/feature': {
        'demo:ore': {
          type: 'minecraft:ore',
          size: 9,
          discard_chance_on_air_exposure: 0,
          targets: [
            {
              target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
              state: 'minecraft:diamond_ore',
            },
          ],
        },
      },
    };
    const plan = scatterPlan(
      { kind: 'minecraft:worldgen/feature', id: 'demo:ore', data: {} },
      state(project),
    );
    expect(plan?.words.join(' ')).toContain('eight times a chunk, anywhere in the stone');
    const { result } = scatterOf(project, plan?.spec as ViewWorldSpec);
    expect(result.placed).toBeGreaterThan(20);
    expect((result.rows?.high ?? 999) + -64).toBeLessThan(64);
  });

  it('shows a block state provider as its picks', () => {
    const project: WorldgenFileMap = {
      'worldgen/block_state_provider': {
        'demo:rocks': {
          type: 'minecraft:weighted',
          entries: [
            { weight: 1, data: 'minecraft:cobblestone' },
            { weight: 1, data: 'minecraft:mossy_cobblestone' },
          ],
        },
      },
    };
    const plan = scatterPlan(
      { kind: 'minecraft:worldgen/block_state_provider', id: 'demo:rocks', data: {} },
      state(project),
    );
    expect(plan?.picks).toBe(true);
    const { result } = scatterOf(project, plan?.spec as ViewWorldSpec);
    expect(result.picks.map((pick) => pick.block).sort()).toEqual([
      'minecraft:cobblestone',
      'minecraft:mossy_cobblestone',
    ]);
    expect(result.strip.length).toBeGreaterThan(10);
  });

  it('draws a biome addition in its biome, on and off', () => {
    const addition = {
      format: 1,
      biomes: ['demo:moor'],
      features: [{ feature: 'demo:dandelions', step: 'vegetal_decoration' }],
    };
    const project: WorldgenFileMap = {
      'worldgen/biome': { 'demo:moor': { temperature: 0.5, downfall: 0.5, features: [] } },
      'worldgen/feature': { 'demo:dandelions': DANDELIONS },
      'worldgen/placed_feature': {
        'demo:dandelions': {
          feature: 'demo:dandelions',
          placement: [
            { type: 'minecraft:count', count: 6 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          ],
        },
      },
      'msm/biome_addition': { 'demo:more_flowers': addition },
    };
    const element = { kind: 'msm:biome_addition', id: 'demo:more_flowers', data: addition };
    const on = scatterPlan(element, state(project), true);
    const off = scatterPlan(element, state(project), false);
    expect(on?.addition).toBe('demo:more_flowers');
    expect(on?.words.join(' ')).toContain('in demo:moor');
    expect(scatterOf(project, on?.spec as ViewWorldSpec).result.placed).toBeGreaterThan(10);
    expect(scatterOf(project, off?.spec as ViewWorldSpec).result.placed).toBe(0);
  });

  it('uses a plain biome when the addition names none the files have', () => {
    const addition = {
      format: 1,
      biomes: ['minecraft:plains'],
      features: [{ feature: 'demo:dandelions', step: 'vegetal_decoration' }],
    };
    const project: WorldgenFileMap = {
      'worldgen/feature': { 'demo:dandelions': DANDELIONS },
      'worldgen/placed_feature': {
        'demo:dandelions': {
          feature: 'demo:dandelions',
          placement: [
            { type: 'minecraft:count', count: 6 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          ],
        },
      },
      'msm/biome_addition': { 'demo:more_flowers': addition },
    };
    const plan = scatterPlan(
      { kind: 'msm:biome_addition', id: 'demo:more_flowers', data: addition },
      state(project),
    );
    expect(plan?.words.join(' ')).toContain('minecraft:plains is not in the files here');
    expect(scatterOf(project, plan?.spec as ViewWorldSpec).result.placed).toBeGreaterThan(10);
  });
});

describe('the Value map through the engine', () => {
  it('draws a noise alone and a density function on its own', () => {
    const project: WorldgenFileMap = {
      'worldgen/noise': {
        'demo:bumps': {
          base_amplitude: 1,
          base_octave: -4,
          octave_count: 2,
          amplitude_modifiers: [1, 1],
        },
      },
      'worldgen/density_function': {
        'demo:height': {
          type: 'minecraft:add',
          left: {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: 0,
            from_value: 1,
            to_coordinate: 128,
            to_value: -1,
          },
          right: 0.25,
        },
      },
    };
    const noise = valueHosts(
      { kind: 'minecraft:worldgen/noise', id: 'demo:bumps', data: {} },
      project,
      null,
    );
    expect(noise.map((host) => host.label)).toEqual(['On its own']);
    const world = createTerrainWorld(inputOf(project, noise[0]?.spec as ViewWorldSpec));
    const values = sampleValues(world, noise[0]?.fn, {
      x0: 0,
      z0: 0,
      width: 64,
      depth: 64,
      step: 4,
      y: 0,
    });
    expect(values.length).toBe(256);
    expect(new Set(values).size).toBeGreaterThan(20);

    const fn = valueHosts(
      { kind: 'minecraft:worldgen/density_function', id: 'demo:height', data: {} },
      project,
      null,
    );
    const fnWorld = createTerrainWorld(inputOf(project, fn[0]?.spec as ViewWorldSpec));
    expect(fnWorld.unsupported().filter((part) => part.kind === 'file')).toEqual([]);
    const cut = sampleValues(fnWorld, fn[0]?.fn, {
      axis: 'x',
      at: 0,
      from: 0,
      to: 4,
      step: 4,
      yStep: 64,
    });
    // Rows from y -64 up every 64 blocks: the gradient clamps at 1 below y 0, -1 above y 128.
    expect([...cut].map((v) => Math.round(v * 100) / 100)).toEqual([
      1.25, 1.25, 0.25, -0.75, -0.75, -0.75,
    ]);
  });

  it('names a file the function needs and the project does not have', () => {
    const project: WorldgenFileMap = {
      'worldgen/density_function': {
        'demo:uses': { type: 'minecraft:add', left: 'demo:gone', right: 1 },
      },
    };
    const hosts = valueHosts(
      { kind: 'minecraft:worldgen/density_function', id: 'demo:uses', data: {} },
      project,
      null,
    );
    const world = createTerrainWorld(inputOf(project, hosts[0]?.spec as ViewWorldSpec));
    expect(
      world
        .unsupported()
        .map((part) => part.type)
        .join(' '),
    ).toContain('demo:gone');
  });

  it('offers a project world that uses the function first', () => {
    const project: WorldgenFileMap = {
      'worldgen/density_function': { 'demo:height': 0.5 },
      'worldgen/noise_settings': {
        'demo:land': { noise_router: { final_density: 'demo:height' } },
      },
      dimension: {
        'demo:world': {
          type: 'minecraft:overworld',
          generator: { type: 'minecraft:noise', settings: 'demo:land', biome_source: {} },
        },
      },
    };
    const hosts = valueHosts(
      { kind: 'minecraft:worldgen/density_function', id: 'demo:height', data: 0.5 },
      project,
      null,
    );
    expect(hosts.map((host) => host.label)).toEqual(['demo:world', 'On its own']);
  });
});

/** java.util.Random, for an independent check of the start chunks. */
class JavaRandom {
  #seed: bigint;
  constructor(seed: bigint) {
    this.#seed = (seed ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }
  next(bits: number): number {
    this.#seed = (this.#seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(BigInt.asIntN(32, this.#seed >> BigInt(48 - bits)));
  }
  nextInt(bound: number): number {
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits: number;
    let value: number;
    do {
      bits = this.next(31);
      value = bits % bound;
    } while (bits - value + (bound - 1) < 0);
    return value;
  }
}

function expectedStart(
  seed: bigint,
  salt: number,
  spacing: number,
  separation: number,
  rx: number,
  rz: number,
) {
  const random = new JavaRandom(
    BigInt.asIntN(
      64,
      BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + seed + BigInt(salt),
    ),
  );
  return [
    rx * spacing + random.nextInt(spacing - separation),
    rz * spacing + random.nextInt(spacing - separation),
  ];
}

describe('structure markers', () => {
  const VILLAGES = {
    placement: { type: 'minecraft:random_spread', salt: 10387312, spacing: 34, separation: 8 },
    structures: [{ structure: 'demo:hut', weight: 1 }],
  };
  const region = { x0: -34 * 16 * 2, z0: -34 * 16 * 2, width: 34 * 16 * 4, depth: 34 * 16 * 4 };

  it('marks the start chunk of each spread cell, as java.util.Random gives it', () => {
    const seed = 12345n;
    const result = structureMarkers({
      project: { 'worldgen/structure_set': { 'demo:huts': VILLAGES } },
      vanilla: null,
      seed,
      region,
    });
    const expected: string[] = [];
    for (let rx = -2; rx < 2; rx += 1) {
      for (let rz = -2; rz < 2; rz += 1) {
        expected.push(expectedStart(seed, 10387312, 34, 8, rx, rz).join(','));
      }
    }
    expect(result.markers.map((m) => `${m.chunkX},${m.chunkZ}`).sort()).toEqual(expected.sort());
    expect(result.markers[0]?.x).toBe((result.markers[0]?.chunkX ?? 0) * 16 + 8);
    expect(result.notes).toContain(
      'The markers are not checked against biomes here, so some may stand where none can start.',
    );
  });

  it('leaves out starts in biomes none of the structures accepts', () => {
    const files = {
      'worldgen/structure_set': { 'demo:huts': VILLAGES },
      'worldgen/structure': {
        'demo:hut': { type: 'minecraft:jigsaw', biomes: '#demo:hut_biomes' },
      },
      'tags/worldgen/biome': { 'demo:hut_biomes': { values: ['demo:moor'] } },
    };
    const all = structureMarkers({
      project: files,
      vanilla: null,
      seed: 1n,
      region,
      biomeAt: () => 'demo:moor',
    });
    const none = structureMarkers({
      project: files,
      vanilla: null,
      seed: 1n,
      region,
      biomeAt: () => 'demo:sea',
    });
    const unknown = structureMarkers({
      project: files,
      vanilla: null,
      seed: 1n,
      region,
      biomeAt: () => undefined,
    });
    expect(all.markers.length).toBe(16);
    expect(none.markers.length).toBe(0);
    expect(unknown.markers.length).toBe(16);
  });

  it('keeps away from an exclusion zone and names placements it does not mark', () => {
    const files = {
      'worldgen/structure_set': {
        'demo:huts': VILLAGES,
        'demo:towers': {
          placement: {
            type: 'minecraft:random_spread',
            salt: 99,
            spacing: 34,
            separation: 8,
            exclusion_zone: { other_set: 'demo:huts', chunk_count: 40 },
          },
          structures: [{ structure: 'demo:tower', weight: 1 }],
        },
        'demo:rings': {
          placement: { type: 'minecraft:concentric_rings', distance: 32, spread: 3, count: 128 },
          structures: [],
        },
      },
    };
    const result = structureMarkers({ project: files, vanilla: null, seed: 7n, region });
    // Every tower is within 40 chunks of a hut start, so none is left.
    expect(result.markers.filter((m) => m.set === 'demo:towers')).toEqual([]);
    expect(result.markers.filter((m) => m.set === 'demo:huts').length).toBe(16);
    expect(result.notes.join(' ')).toContain('Not marked: rings (placed by concentric rings');
    expect(setName('minecraft:ancient_cities')).toBe('ancient cities');
    expect(MAX_MARKERS).toBeGreaterThan(1000);
  });
});

describe('Compare with vanilla', () => {
  it("picks vanilla's world a project world is compared with", () => {
    const noise = (settings: string) => ({ generator: { type: 'minecraft:noise', settings } });
    expect(compareSource(noise('demo:land'), false).spec.source).toEqual({
      preset: 'minecraft:normal',
      dimension: 'minecraft:overworld',
    });
    expect(compareSource(noise('minecraft:nether'), false).label).toBe("Vanilla's Nether");
    expect(compareSource(noise('demo:land'), true).label).toBe("Vanilla's End");
    const amplified = compareSource(noise('minecraft:amplified'), false);
    expect(amplified.label).toBe("Vanilla's overworld on its amplified land");
    expect(amplified.spec.vanillaOnly).toBe(true);
    expect(viewFiles({ dimension: { 'demo:x': {} } }, amplified.spec).dimension).not.toHaveProperty(
      'demo:x',
    );
  });

  it('says what is about right on the target and what is not drawn', () => {
    const summary = {
      generator: 'noise' as const,
      minY: -64,
      height: 384,
      seaLevel: 63,
      biomesKnown: false,
      seed: '1',
      unsupported: [],
      ms: 1,
    };
    const overworld = compareSource(null, false);
    const unknown = compareNotes({
      facts: { dataFolders: [], approximate: ['biome_layout', 'end'] },
      source: overworld,
      summary,
    });
    expect(unknown).toContain(
      "Vanilla's biomes show here after you have pressed Play once. Until then its land is drawn in one colour.",
    );
    expect(unknown).not.toContain('Biome borders are about right on this version.');
    expect(unknown).toContain(
      'Carved caves, buildings and the land shaped around them show only in the game.',
    );
    const known = compareNotes({
      facts: { dataFolders: [], approximate: ['biome_layout', 'end'] },
      source: overworld,
      summary: { ...summary, biomesKnown: true },
    });
    expect(known).toContain('Biome borders are about right on this version.');
    const end = compareNotes({
      facts: { dataFolders: [], approximate: ['end'] },
      source: compareSource(null, true),
      summary: { ...summary, biomesKnown: true },
    });
    expect(end).toContain('The End is about right here.');
    const exact = compareNotes({
      facts: { dataFolders: [], approximate: [] },
      source: compareSource(null, true),
      summary: { ...summary, biomesKnown: true },
    });
    expect(exact.join(' ')).not.toContain('about right');
  });
});
