import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildColumns,
  createTerrainWorld,
  sampleBiomes,
  sampleHeights,
  sampleSlice,
  sampleValues,
} from '../src';
import { HeightSearch } from '../src/fill';
import { forgetRegistries } from '../src/registries';
import { type EngineWorld, forgetKeptStates } from '../src/world';
import { hills, hillsFiles, input } from './fixture';

const WINDOW = { x0: 0, z0: 0, y0: 30, sizeX: 32, sizeY: 32, sizeZ: 32 };

/** The highest block of a column whose final density is above 0, the slow way. */
function bruteTop(world: EngineWorld, x: number, z: number): number {
  const parts = world.noise;
  if (!parts) return world.minY - 1;
  for (let y = world.minY + world.height - 1; y >= world.minY; y -= 1) {
    if (parts.router.finalDensity.compute({ x, y, z }) > 0) return y;
  }
  return world.minY - 1;
}

function topBlock(result: ReturnType<typeof buildColumns>, x: number, z: number): string {
  const { size, palette, blocks } = result;
  for (let y = size.y - 1; y >= 0; y -= 1) {
    const i = blocks[(y * size.z + z) * size.x + x] as number;
    if (i !== 0) return palette[i] as string;
  }
  return 'minecraft:air';
}

beforeEach(() => {
  forgetKeptStates();
  forgetRegistries();
});

describe('a noise world from hand-written files', () => {
  it('draws hills with grass over dirt over stone, and the sea', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    expect(world.generator).toBe('noise');
    expect(world.minY).toBe(0);
    expect(world.height).toBe(128);
    expect(world.seaLevel).toBe(60);
    expect(world.biomesKnown).toBe(true);
    expect(world.unsupported()).toEqual([]);
    const ground = buildColumns(world, WINDOW, 'surface');
    expect(ground.palette[0]).toBe('minecraft:air');
    expect(ground.size).toEqual({ x: 32, y: 32, z: 32 });
    expect(ground.blocks).toHaveLength(32 * 32 * 32);
    expect(new Set(ground.palette)).toEqual(
      new Set([
        'minecraft:air',
        'minecraft:grass_block[snowy=false]',
        'minecraft:dirt',
        'minecraft:stone',
        'minecraft:water[level=0]',
      ]),
    );
    const terrain = buildColumns(world, WINDOW, 'terrain');
    expect(terrain.palette).not.toContain('minecraft:dirt');
  });

  it('gives the same bytes for the same input, twice and in a fresh world', () => {
    const a = createTerrainWorld(input(hillsFiles(), 7n));
    const first = buildColumns(a, WINDOW, 'surface');
    const again = buildColumns(a, WINDOW, 'surface');
    forgetKeptStates();
    const b = createTerrainWorld(input(hillsFiles(), 7n));
    const fresh = buildColumns(b, WINDOW, 'surface');
    for (const other of [again, fresh]) {
      expect(other.palette).toEqual(first.palette);
      expect(Buffer.from(other.blocks.buffer).equals(Buffer.from(first.blocks.buffer))).toBe(true);
    }
    const region = { x0: -64, z0: -64, width: 128, depth: 128, step: 4 };
    expect(sampleHeights(a, region, 'surface')).toEqual(sampleHeights(b, region, 'surface'));
    expect(sampleBiomes(a, region)).toEqual(sampleBiomes(b, region));
    const cut = { axis: 'x', at: 3, from: -32, to: 32, step: 1, yStep: 1 } as const;
    expect(sampleSlice(a, cut)).toEqual(sampleSlice(b, cut));
    expect(sampleValues(a, 'msm:hills/bumps', region)).toEqual(
      sampleValues(b, 'msm:hills/bumps', region),
    );
  });

  it('gives a different world for another seed', () => {
    const region = { x0: 0, z0: 0, width: 128, depth: 128, step: 4 };
    const a = sampleHeights(createTerrainWorld(input(hillsFiles(), 1n)), region, 'ocean_floor');
    const b = sampleHeights(createTerrainWorld(input(hillsFiles(), 2n)), region, 'ocean_floor');
    expect(a).not.toEqual(b);
  });

  it('returns fresh arrays every time (the worker transfers them)', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    const region = { x0: 0, z0: 0, width: 16, depth: 16, step: 4 };
    expect(sampleHeights(world, region, 'surface')).not.toBe(
      sampleHeights(world, region, 'surface'),
    );
    expect(sampleBiomes(world, region).cells).not.toBe(sampleBiomes(world, region).cells);
    expect(buildColumns(world, WINDOW, 'terrain').blocks).not.toBe(
      buildColumns(world, WINDOW, 'terrain').blocks,
    );
  });

  it('finds the same heights as a block by block search', () => {
    const world = createTerrainWorld(input(hillsFiles(), 3n)) as EngineWorld;
    const region = { x0: -20, z0: 5, width: 40, depth: 10, step: 1 };
    const floor = sampleHeights(world, region, 'ocean_floor');
    const surface = sampleHeights(world, region, 'surface');
    let i = 0;
    for (let z = 5; z < 15; z += 1) {
      for (let x = -20; x < 20; x += 1) {
        const top = bruteTop(world, x, z);
        expect(floor[i]).toBe(top);
        expect(surface[i]).toBe(Math.max(top, 59));
        i += 1;
      }
    }
  });

  it('lays a map out in blocks: ceil(width / step) columns, row-major', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    expect(
      sampleHeights(world, { x0: 0, z0: 0, width: 256, depth: 128, step: 16 }, 'surface'),
    ).toHaveLength(16 * 8);
    expect(sampleBiomes(world, { x0: 0, z0: 0, width: 10, depth: 10, step: 4 }).cells).toHaveLength(
      9,
    );
    const cut = sampleSlice(world, { axis: 'z', at: 0, from: 0, to: 64, step: 4, yStep: 8 });
    expect(cut.cells).toHaveLength(16 * 16);
    const top = sampleHeights(
      world,
      { x0: 12, z0: 0, width: 1, depth: 1, step: 1 },
      'ocean_floor',
    )[0] as number;
    const column = sampleSlice(world, { axis: 'x', at: 0, from: 12, to: 13, step: 1, yStep: 1 });
    expect(column.palette[column.cells[top] as number]).not.toBe('minecraft:air');
    expect(column.palette[column.cells[top + 1] as number]).not.toMatch(/grass|dirt|stone/);
  });
});

describe('files', () => {
  it('lets a project file replace a vanilla one with the same id', () => {
    const vanilla = {
      'worldgen/noise_settings': {
        'msm:hills': hills({ sea_level: 10 }),
        'msm:other': hills({ sea_level: 5 }),
      },
    };
    const project = hillsFiles();
    const world = createTerrainWorld(input(project, 0n, { dimension: 'msm:test' }, vanilla));
    expect(world.seaLevel).toBe(60);
    const onlyVanilla = hillsFiles({ type: 'minecraft:fixed', biome: 'msm:meadow' });
    (onlyVanilla.dimension as Record<string, unknown>)['msm:test'] = {
      type: 'msm:hills',
      generator: {
        type: 'minecraft:noise',
        settings: 'msm:other',
        biome_source: { type: 'minecraft:fixed', biome: 'msm:meadow' },
      },
    };
    expect(
      createTerrainWorld(input(onlyVanilla, 0n, { dimension: 'msm:test' }, vanilla)).seaLevel,
    ).toBe(5);
  });

  it('reports a missing file and draws nothing for it', () => {
    const files = hillsFiles();
    (files.dimension as Record<string, unknown>)['msm:test'] = {
      type: 'msm:hills',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: { type: 'minecraft:fixed', biome: 'msm:meadow' },
      },
    };
    const world = createTerrainWorld(input(files));
    expect(world.unsupported()).toContainEqual(
      expect.objectContaining({
        kind: 'file',
        type: 'worldgen/noise_settings/minecraft:overworld',
      }),
    );
    const ground = buildColumns(world, WINDOW, 'surface');
    expect(ground.blocks.every((b) => b === 0)).toBe(true);
    expect(
      createTerrainWorld(input(files, 0n, { dimension: 'msm:nope' })).unsupported()[0]?.kind,
    ).toBe('file');
  });

  it('reports an unknown density function type and still draws the rest', () => {
    const files = hillsFiles(undefined, {
      'worldgen/density_function': {
        'msm:hills/bumps': {
          type: 'minecraft:add',
          left: { type: 'minecraft:wobble', amount: 3 },
          right: 0,
        },
      },
    });
    const world = createTerrainWorld(input(files));
    expect(world.unsupported()).toEqual([
      expect.objectContaining({
        kind: 'density_function',
        type: 'minecraft:wobble',
        where: 'msm:hills/bumps',
      }),
    ]);
    const ground = buildColumns(world, WINDOW, 'surface');
    expect(ground.palette).toContain('minecraft:stone');
    expect(ground.notes).toEqual(world.unsupported());
  });

  it('reports unknown rules, conditions and fields', () => {
    const files = hillsFiles(undefined, {
      'worldgen/material_rule': {
        'msm:hills/surface': {
          type: 'minecraft:sequence',
          sequence: [
            { type: 'minecraft:bandlands' },
            {
              type: 'minecraft:condition',
              if_true: { type: 'minecraft:steep' },
              then_run: { type: 'minecraft:block', result_state: { Name: 'minecraft:sand' } },
            },
            { type: 'minecraft:block', result_state: { Name: 'minecraft:stone' }, colour: 'red' },
          ],
        },
      },
    });
    const kinds = createTerrainWorld(input(files))
      .unsupported()
      .map((n) => `${n.kind} ${n.type}`);
    expect(kinds).toEqual([
      'material_rule minecraft:bandlands',
      'material_condition minecraft:steep',
      'field material_rule.block.colour',
    ]);
  });
});

describe('fixes F1 to F6 in a world', () => {
  it('F1: above_preliminary_surface reads the router field chunk_surface_level', () => {
    const rule = (above: string) => ({
      type: 'minecraft:sequence',
      sequence: [
        {
          type: 'minecraft:condition',
          if_true: { type: 'minecraft:above_preliminary_surface' },
          then_run: { type: 'minecraft:block', result_state: { Name: above } },
        },
        { type: 'minecraft:block', result_state: { Name: 'minecraft:cobblestone' } },
      ],
    });
    const settings = hills({ material_rule: rule('minecraft:sand') });
    const router = { ...(settings.noise_router as Record<string, unknown>) };
    delete router.preliminary_surface_level;
    router.chunk_surface_level = 300;
    const files = hillsFiles(undefined, {
      'worldgen/noise_settings': { 'msm:hills': { ...settings, noise_router: router } },
    });
    const ground = buildColumns(createTerrainWorld(input(files)), WINDOW, 'surface');
    expect(ground.palette).toContain('minecraft:cobblestone');
    expect(ground.palette).not.toContain('minecraft:sand');
  });

  it('F2: y_above honours add_stone_depth', () => {
    const flatDensity = {
      type: 'minecraft:gradient',
      axis: 'y',
      from_coordinate: 0,
      from_value: 1,
      to_coordinate: 64,
      to_value: -1,
    };
    const settings = hills({
      sea_level: 0,
      material_rule: {
        type: 'minecraft:condition',
        if_true: {
          type: 'minecraft:y_above',
          anchor: { absolute: 32 },
          surface_depth_multiplier: 0,
          add_stone_depth: true,
        },
        then_run: { type: 'minecraft:block', result_state: { Name: 'minecraft:sand' } },
      },
    });
    (settings.noise_router as Record<string, unknown>).final_density = flatDensity;
    const files = hillsFiles(undefined, { 'worldgen/noise_settings': { 'msm:hills': settings } });
    const ground = buildColumns(createTerrainWorld(input(files)), { ...WINDOW, y0: 0 }, 'surface');
    expect(topBlock(ground, 3, 3)).toBe('minecraft:sand');
    expect(ground.palette).not.toContain('minecraft:stone');
  });

  it('F3: a noise settings file without default_block fills with the placeholder', () => {
    const settings = hills({ material_rule: { type: 'minecraft:sequence', sequence: [] } });
    delete settings.default_block;
    const files = hillsFiles(undefined, { 'worldgen/noise_settings': { 'msm:hills': settings } });
    const ground = buildColumns(createTerrainWorld(input(files)), WINDOW, 'surface');
    expect(ground.palette).toContain('minecraft:stone');
  });

  it('F4: linear upscale draws as interpolated', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    const inner = { type: 'minecraft:noise', noise: 'msm:bumps', xz_scale: 4, y_scale: 2 };
    const lin = (n: number) => ({ cell_size: n, mode: 'interpolate_linear' });
    const region = { axis: 'x', at: 5, from: 0, to: 40, step: 1, yStep: 3 } as const;
    const up = sampleValues(
      world,
      { type: 'minecraft:upscale', input: inner, x: lin(4), y: lin(8), z: lin(4) },
      region,
    );
    const interpolated = sampleValues(
      world,
      { type: 'minecraft:interpolated', input: inner, cell_size_xz: 4, cell_size_y: 8 },
      region,
    );
    expect(up).toEqual(interpolated);
    expect(new Set(up).size).toBeGreaterThan(10);
    expect(world.unsupported()).toEqual([]);
  });

  it('F5: interval_select keeps its last band', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    const fn = {
      type: 'minecraft:interval_select',
      input: {
        type: 'minecraft:gradient',
        axis: 'x',
        from_coordinate: 0,
        from_value: 0,
        to_coordinate: 30,
        to_value: 3,
      },
      thresholds: [1, 2],
      functions: [10, 20, 30],
    };
    const values = sampleValues(world, fn, { x0: 0, z0: 0, width: 30, depth: 1, step: 5 });
    expect(Array.from(values)).toEqual([10, 10, 20, 20, 30, 30]);
  });

  it('F6: two biomes in one chunk each get their own surface', () => {
    const biomeSource = {
      type: 'minecraft:multi_noise',
      biomes: [
        {
          biome: 'msm:beach',
          parameters: {
            temperature: [-1, 0],
            humidity: 0,
            continentalness: 0,
            erosion: 0,
            depth: 0,
            weirdness: 0,
            offset: 0,
          },
        },
        {
          biome: 'msm:meadow',
          parameters: {
            temperature: [0, 1],
            humidity: 0,
            continentalness: 0,
            erosion: 0,
            depth: 0,
            weirdness: 0,
            offset: 0,
          },
        },
      ],
    };
    const settings = hills({ sea_level: 0 });
    (settings.noise_router as Record<string, unknown>).temperature = {
      type: 'minecraft:gradient',
      axis: 'x',
      from_coordinate: 0,
      from_value: -1,
      to_coordinate: 15,
      to_value: 1,
    };
    const files = hillsFiles(biomeSource, { 'worldgen/noise_settings': { 'msm:hills': settings } });
    const world = createTerrainWorld(input(files));
    const biomes = sampleBiomes(world, { x0: 0, z0: 0, width: 16, depth: 4, step: 4 });
    expect(biomes.cells.map((c) => (biomes.palette[c] === 'msm:beach' ? 1 : 2))).toEqual(
      new Uint16Array([1, 1, 2, 2]),
    );
    const ground = buildColumns(
      world,
      { x0: 0, z0: 16, y0: 40, sizeX: 16, sizeY: 48, sizeZ: 16 },
      'surface',
    );
    const tops = new Set<string>();
    for (let x = 0; x < 16; x += 1) {
      for (let z = 0; z < 16; z += 1) {
        const top = topBlock(ground, x, z);
        if (top.startsWith('minecraft:water')) continue;
        tops.add(`${x < 8 ? 'beach' : 'meadow'} ${top}`);
      }
    }
    expect(tops.has('beach minecraft:sand')).toBe(true);
    expect([...tops].some((t) => t.startsWith('meadow minecraft:grass_block'))).toBe(true);
    expect([...tops].some((t) => t.startsWith('beach minecraft:grass_block'))).toBe(false);
  });
});

describe('one world at a time (F9)', () => {
  it('shares nothing between two worlds made one after the other', () => {
    const region = { x0: 0, z0: 0, width: 64, depth: 64, step: 2 };
    const a = createTerrainWorld(input(hillsFiles(), 5n));
    const heightsA = sampleHeights(a, region, 'ocean_floor');
    const groundA = buildColumns(a, WINDOW, 'surface');
    const otherNoise = hillsFiles(undefined, {
      'worldgen/noise': {
        'msm:bumps': {
          base_amplitude: 2,
          base_octave: -3,
          octave_count: 1,
          amplitude_modifiers: [1],
        },
      },
      'worldgen/material_rule': {
        'msm:hills/surface': {
          type: 'minecraft:block',
          result_state: { Name: 'minecraft:snow_block' },
        },
      },
    });
    const b = createTerrainWorld(input(otherNoise, 5n));
    const heightsB = sampleHeights(b, region, 'ocean_floor');
    expect(heightsB).not.toEqual(heightsA);
    expect(buildColumns(b, WINDOW, 'surface').palette).toContain('minecraft:snow_block');
    // World A again, after B filled the registries.
    expect(sampleHeights(a, region, 'ocean_floor')).toEqual(heightsA);
    expect(buildColumns(a, WINDOW, 'surface')).toEqual(groundA);
    forgetKeptStates();
    forgetRegistries();
    const freshB = createTerrainWorld(input(otherNoise, 5n));
    expect(sampleHeights(freshB, region, 'ocean_floor')).toEqual(heightsB);
  });
});

describe('generators and biome sources', () => {
  it('reports a multi_noise preset and draws one biome', () => {
    const files = hillsFiles(
      { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
      {
        'worldgen/multi_noise_biome_source_parameter_list': {
          'minecraft:overworld': { preset: 'minecraft:overworld' },
        },
      },
    );
    const world = createTerrainWorld(input(files));
    expect(world.biomesKnown).toBe(false);
    expect(world.unsupported()).toContainEqual(
      expect.objectContaining({ kind: 'biome_source', type: 'multi_noise.preset' }),
    );
    expect(sampleBiomes(world, { x0: 0, z0: 0, width: 64, depth: 64, step: 16 }).palette).toEqual([
      'minecraft:plains',
    ]);
    expect(buildColumns(world, WINDOW, 'surface').palette).toContain('minecraft:stone');
  });

  it('reads a world preset inline dimension', () => {
    const files = hillsFiles(undefined, {
      'worldgen/world_preset': {
        'msm:islands': {
          dimensions: {
            'minecraft:overworld': {
              type: 'msm:hills',
              generator: {
                type: 'minecraft:noise',
                settings: 'msm:hills',
                biome_source: { type: 'minecraft:fixed', biome: 'msm:beach' },
              },
            },
          },
        },
      },
    });
    const world = createTerrainWorld(
      input(files, 0n, { preset: 'msm:islands', dimension: 'minecraft:overworld' }),
    );
    expect(sampleBiomes(world, { x0: 0, z0: 0, width: 4, depth: 4, step: 4 }).palette).toEqual([
      'msm:beach',
    ]);
    expect(world.unsupported()).toEqual([]);
  });

  it('reports a flat world until the flat generator exists, and a debug world', () => {
    const flat = hillsFiles();
    (flat.dimension as Record<string, unknown>)['msm:test'] = {
      type: 'msm:hills',
      generator: { type: 'minecraft:flat', settings: { layers: [] } },
    };
    const world = createTerrainWorld(input(flat));
    expect(world.generator).toBe('flat');
    expect(world.unsupported()).toContainEqual(
      expect.objectContaining({ kind: 'chunk_generator', type: 'minecraft:flat' }),
    );
    expect(buildColumns(world, WINDOW, 'surface').blocks.every((b) => b === 0)).toBe(true);
    const debug = hillsFiles();
    (debug.dimension as Record<string, unknown>)['msm:test'] = {
      type: 'msm:hills',
      generator: { type: 'minecraft:debug' },
    };
    const d = createTerrainWorld(input(debug));
    expect(d.generator).toBe('debug');
    expect(d.unsupported()[0]?.drawnInstead).toMatch(/only in the game/);
  });

  it('hands the features stage to the features seam', () => {
    const world = createTerrainWorld(input(hillsFiles()));
    const notes = buildColumns(world, WINDOW, 'features').notes;
    expect(notes).toContainEqual(expect.objectContaining({ kind: 'feature' }));
  });

  it('keeps heights the same through the cached search and a fresh one', () => {
    const world = createTerrainWorld(input(hillsFiles(), 9n)) as EngineWorld;
    const parts = world.noise;
    if (!parts) throw new Error('no noise world');
    const search = new HeightSearch(parts);
    for (let i = 0; i < 50; i += 1) {
      expect(search.height(i * 7 - 100, i * 3, 'ocean_floor')).toBe(
        bruteTop(world, i * 7 - 100, i * 3),
      );
    }
  });
});
