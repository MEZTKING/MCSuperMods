/**
 * The features stage (B583; ADR 0119 D6) over the hand-written hills (`fixture.ts`) with
 * hand-written features of MSM's own: counts per chunk within what a modifier chain allows, trees
 * from their own fields, ores only in what they may replace, the selectors, biome additions, the
 * same placements for the same seed, and every type left out reported by name.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildColumns, type ColumnWindow, createTerrainWorld, type WorldgenFileMap } from '../src';
import {
  ADDITIONS_FOLDER,
  FEATURE_TYPES,
  leftOutWords,
  PLACEMENT_MODIFIER_TYPES,
} from '../src/features';
import { mergeOrders } from '../src/features/order';
import { forgetRegistries } from '../src/registries';
import { forgetKeptStates } from '../src/world';
import { hillsFiles, input } from './fixture';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The targets' folders (their vendored registries list the types; read by listing). */
const TARGETS = join(HERE, '..', '..', 'targets');

/** A 3 by 3 chunk window over the whole height of the hills (0 to 127). */
const WINDOW: ColumnWindow = { x0: 0, z0: 0, y0: 0, sizeX: 48, sizeY: 128, sizeZ: 48 };

const EMPTY_STEPS = (): unknown[][] => Array.from({ length: 11 }, () => []);

/** The hills, with the meadow listing `features` per step index. */
function files(
  steps: Record<number, string[]>,
  placed: Record<string, unknown>,
  configured: Record<string, unknown> = {},
  extra: Record<string, Record<string, unknown>> = {},
): WorldgenFileMap {
  const lists = EMPTY_STEPS();
  for (const [step, list] of Object.entries(steps)) lists[Number(step)] = list;
  return hillsFiles(undefined, {
    'worldgen/biome': { 'msm:meadow': { temperature: 0.8, features: lists } },
    'worldgen/placed_feature': placed,
    'worldgen/feature': configured,
    ...extra,
  });
}

function build(project: WorldgenFileMap, seed = 0n, window: ColumnWindow = WINDOW) {
  const world = createTerrainWorld(input(project, seed));
  return {
    surface: buildColumns(world, window, 'surface'),
    features: buildColumns(world, window, 'features'),
  };
}

type Grid = ReturnType<typeof buildColumns>;

/** Every position (window coordinates) whose block's id is `id`. */
function find(grid: Grid, id: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  const { size, palette, blocks } = grid;
  for (let y = 0; y < size.y; y += 1) {
    for (let z = 0; z < size.z; z += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const name = palette[blocks[(y * size.z + z) * size.x + x] as number] as string;
        if (name === id || name.startsWith(`${id}[`)) out.push([x, y, z]);
      }
    }
  }
  return out;
}

function at(grid: Grid, x: number, y: number, z: number): string {
  const { size, palette, blocks } = grid;
  if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) return 'outside';
  return palette[blocks[(y * size.z + z) * size.x + x] as number] as string;
}

const SURFACE_GLOWSTONE = {
  feature: { type: 'minecraft:simple_block', to_place: { id: 'minecraft:glowstone' } },
  placement: [
    { type: 'minecraft:count', count: 4 },
    { type: 'minecraft:in_square' },
    { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
    { type: 'minecraft:biome' },
  ],
};

const OAK = {
  type: 'minecraft:tree',
  below_trunk_provider: { type: 'minecraft:simple_state_provider_unknown' },
  trunk_provider: { id: 'minecraft:oak_log', properties: { axis: 'y' } },
  foliage_provider: { id: 'minecraft:oak_leaves', properties: { persistent: 'false' } },
  trunk_placer: {
    type: 'minecraft:straight_trunk_placer',
    base_height: 4,
    height_rand_a: 2,
    height_rand_b: 0,
  },
  foliage_placer: { type: 'minecraft:blob_foliage_placer', radius: 2, offset: 0, height: 3 },
  minimum_size: { type: 'minecraft:two_layers_feature_size' },
  decorators: [],
};

beforeEach(() => {
  forgetKeptStates();
  forgetRegistries();
});

describe('placement by the data', () => {
  it('keeps the count of a chain within what it allows, chunk by chunk', () => {
    const { surface, features } = build(
      files({ 9: ['msm:glow'] }, { 'msm:glow': SURFACE_GLOWSTONE }),
    );
    expect(find(surface, 'minecraft:glowstone')).toHaveLength(0);
    const glow = find(features, 'minecraft:glowstone');
    for (let cx = 0; cx < 3; cx += 1) {
      for (let cz = 0; cz < 3; cz += 1) {
        const n = glow.filter(([x, , z]) => x >> 4 === cx && z >> 4 === cz).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(4);
      }
    }
    // Each stands on the land or the sea, one above the top the terrain left.
    for (const [x, y, z] of glow) {
      expect(at(surface, x, y, z)).toBe('minecraft:air');
      expect(at(surface, x, y - 1, z)).not.toBe('minecraft:air');
    }
  });

  it('gives the same placements for the same seed and others for another', () => {
    const project = files({ 9: ['msm:glow'] }, { 'msm:glow': SURFACE_GLOWSTONE });
    const a = build(project, 5n).features;
    const b = build(project, 5n).features;
    const c = build(project, 6n).features;
    expect(find(a, 'minecraft:glowstone')).toEqual(find(b, 'minecraft:glowstone'));
    expect(find(a, 'minecraft:glowstone')).not.toEqual(find(c, 'minecraft:glowstone'));
  });

  it('places the same blocks where two windows overlap', () => {
    const project = files(
      { 6: ['msm:gold'], 9: ['msm:trees', 'msm:glow'] },
      { 'msm:glow': SURFACE_GLOWSTONE, 'msm:trees': TREES, 'msm:gold': GOLD },
    );
    const a = build(project, 3n, WINDOW).features;
    const b = build(project, 3n, { ...WINDOW, x0: 16, z0: 16 }).features;
    let same = 0;
    let all = 0;
    for (let y = 0; y < 128; y += 1) {
      for (let z = 16; z < 48; z += 1) {
        for (let x = 16; x < 48; x += 1) {
          all += 1;
          if (at(a, x, y, z) === at(b, x - 16, y, z - 16)) same += 1;
        }
      }
    }
    expect(same / all).toBeGreaterThan(0.995);
  });

  it('runs every one of the 18 modifier types of the targets', () => {
    const placed = {
      feature: { type: 'minecraft:simple_block', to_place: { id: 'minecraft:melon' } },
      placement: [
        {
          type: 'minecraft:count',
          count: { type: 'minecraft:uniform', min_inclusive: 2, max_inclusive: 3 },
        },
        {
          type: 'minecraft:noise_threshold_count',
          noise_level: -2,
          below_noise: 0,
          above_noise: 2,
        },
        {
          type: 'minecraft:noise_based_count',
          noise_to_count_ratio: 1,
          noise_factor: 80,
          noise_offset: 2,
        },
        { type: 'minecraft:rarity_filter', chance: 1 },
        { type: 'minecraft:random_chance', chance: 1 },
        { type: 'minecraft:in_square' },
        { type: 'minecraft:height_range', height: { absolute: 100 } },
        {
          type: 'minecraft:randomly_selected',
          placements: [{ type: 'minecraft:offset', x: 0, y: 0, z: 0 }],
        },
        { type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' },
        { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
        {
          type: 'minecraft:surface_relative_threshold_filter',
          heightmap: 'WORLD_SURFACE_WG',
          min_inclusive: 0,
        },
        {
          type: 'minecraft:environment_scan',
          direction_of_search: 'down',
          max_steps: 4,
          target_condition: { type: 'minecraft:solid', offset: [0, -1, 0] },
        },
        {
          type: 'minecraft:block_predicate_filter',
          predicate: { type: 'minecraft:matching_block_tag', tag: 'minecraft:air' },
        },
        { type: 'minecraft:biome' },
        { type: 'minecraft:count_on_every_layer', count: 1 },
        {
          type: 'minecraft:cuboid',
          xz_size: 1,
          y_size: 1,
          include_interior: true,
          include_edges: true,
        },
        { type: 'minecraft:fixed_placement', positions: [[1, 70, 1]] },
        { type: 'minecraft:offset', x: 0, y: 0, z: 0 },
      ],
    };
    const { features } = build(files({ 9: ['msm:all'] }, { 'msm:all': placed }));
    expect(features.notes.filter((n) => n.kind === 'placement')).toEqual([]);
    const used = new Set(placed.placement.map((m) => m.type.replace('minecraft:', '')));
    expect([...used].sort()).toEqual([...PLACEMENT_MODIFIER_TYPES].sort());
  });

  it('reports a modifier type it does not know and places without it', () => {
    const placed = {
      ...SURFACE_GLOWSTONE,
      placement: [...SURFACE_GLOWSTONE.placement, { type: 'msm:weird' }],
    };
    const { features } = build(files({ 9: ['msm:glow'] }, { 'msm:glow': placed }));
    expect(features.notes).toContainEqual(
      expect.objectContaining({ kind: 'placement', type: 'msm:weird', where: 'msm:glow' }),
    );
    expect(find(features, 'minecraft:glowstone').length).toBeGreaterThan(0);
  });

  it('places nothing where the biome does not list the feature', () => {
    const placed = { 'msm:glow': SURFACE_GLOWSTONE };
    const project = files({}, placed);
    expect(find(build(project).features, 'minecraft:glowstone')).toHaveLength(0);
  });
});

const TREES = {
  feature: OAK,
  placement: [
    { type: 'minecraft:count', count: 3 },
    { type: 'minecraft:in_square' },
    { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
    { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
    {
      type: 'minecraft:block_predicate_filter',
      predicate: { type: 'minecraft:would_survive', state: 'minecraft:oak_sapling' },
    },
    { type: 'minecraft:biome' },
  ],
};

const GOLD = {
  feature: {
    type: 'minecraft:ore',
    size: 9,
    discard_chance_on_air_exposure: 0,
    targets: [
      {
        target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
        state: 'minecraft:gold_ore',
      },
    ],
  },
  placement: [
    { type: 'minecraft:count', count: 6 },
    { type: 'minecraft:in_square' },
    {
      type: 'minecraft:height_range',
      height: {
        type: 'minecraft:uniform',
        min_inclusive: { absolute: 5 },
        max_inclusive: { absolute: 30 },
      },
    },
    { type: 'minecraft:biome' },
  ],
};

describe('the first feature types', () => {
  it('grows trees from their own trunk and crown fields', () => {
    const project = files({ 9: ['msm:trees'] }, { 'msm:trees': TREES });
    const { surface, features } = build(project);
    const logs = find(features, 'minecraft:oak_log');
    const leaves = find(features, 'minecraft:oak_leaves');
    expect(logs.length).toBeGreaterThan(8);
    expect(leaves.length).toBeGreaterThan(logs.length);
    // Every trunk stands on the grass the terrain made (no provider of its own here).
    const bases = logs.filter(
      ([x, y, z]) => !at(features, x, y - 1, z).startsWith('minecraft:oak_log'),
    );
    for (const [x, y, z] of bases) {
      expect(at(surface, x, y - 1, z)).toMatch(/^minecraft:(grass_block|dirt)/);
      expect(at(surface, x, y, z)).toBe('minecraft:air');
    }
    for (const [x, y, z] of logs) expect(at(features, x, y, z)).toBe('minecraft:oak_log[axis=y]');
    // A trunk is 4 to 6 high.
    for (const [x, y, z] of bases) {
      let h = 0;
      while (at(features, x, y + h, z).startsWith('minecraft:oak_log')) h += 1;
      expect(h).toBeGreaterThanOrEqual(4);
      expect(h).toBeLessThanOrEqual(6);
    }
    // The unknown provider type gives no block under the trunk, and is no feature note.
    expect(features.notes.some((n) => n.type.includes('simple_state_provider_unknown'))).toBe(
      false,
    );
  });

  it('puts the block under the trunk from below_trunk_provider', () => {
    const tree = {
      ...TREES,
      feature: {
        ...OAK,
        below_trunk_provider: {
          type: 'minecraft:simple',
          state: { Name: 'minecraft:rooted_dirt' },
        },
      },
    };
    const { features } = build(files({ 9: ['msm:trees'] }, { 'msm:trees': tree }));
    expect(find(features, 'minecraft:rooted_dirt').length).toBeGreaterThan(0);
  });

  it('replaces only what an ore may replace', () => {
    const project = files({ 6: ['msm:gold'] }, { 'msm:gold': GOLD });
    const { surface, features } = build(project);
    const gold = find(features, 'minecraft:gold_ore');
    expect(gold.length).toBeGreaterThan(20);
    for (const [x, y, z] of gold) {
      expect(at(surface, x, y, z)).toBe('minecraft:stone');
      expect(y).toBeGreaterThanOrEqual(5 - 4);
      expect(y).toBeLessThanOrEqual(30 + 4);
    }
    // About the vein size a chunk: 6 veins of up to 9.
    expect(gold.length).toBeLessThanOrEqual(9 * 6 * 9 + 9 * 6 * 16);
  });

  it('draws columns, disks, scattered ore and frozen tops', () => {
    const project = files(
      { 6: ['msm:scatter', 'msm:disk'], 9: ['msm:cane'], 10: ['msm:freeze'] },
      {
        'msm:cane': {
          feature: 'msm:cane',
          placement: [
            { type: 'minecraft:count', count: 6 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          ],
        },
        'msm:disk': {
          feature: {
            type: 'minecraft:disk',
            state_provider: { id: 'minecraft:clay' },
            radius: 3,
            half_height: 1,
            target: {
              type: 'minecraft:matching_blocks',
              blocks: ['minecraft:dirt', 'minecraft:grass_block'],
            },
          },
          placement: [
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR_WG' },
            { type: 'minecraft:offset', x: 0, y: -1, z: 0 },
          ],
        },
        'msm:scatter': {
          feature: {
            type: 'minecraft:scattered_ore',
            size: 12,
            discard_chance_on_air_exposure: 0,
            targets: [
              {
                target: {
                  predicate_type: 'minecraft:tag_match',
                  tag: 'minecraft:stone_ore_replaceables',
                },
                state: 'minecraft:diamond_ore',
              },
            ],
          },
          placement: [
            { type: 'minecraft:count', count: 4 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:height_range', height: { absolute: 10 } },
          ],
        },
        'msm:freeze': {
          feature: { type: 'minecraft:freeze_top_layer', config: {} },
          placement: [],
        },
      },
      {
        'msm:cane': {
          type: 'minecraft:block_column',
          direction: 'up',
          allowed_placement: { type: 'minecraft:matching_block_tag', tag: 'minecraft:air' },
          prioritize_tip: false,
          layers: [
            { height: 3, provider: { id: 'minecraft:bone_block', properties: { axis: 'y' } } },
            { height: 1, provider: { id: 'minecraft:jack_o_lantern' } },
          ],
        },
      },
    );
    const { features } = build(project);
    const tips = find(features, 'minecraft:jack_o_lantern');
    expect(tips.length).toBeGreaterThan(20);
    for (const [x, y, z] of tips) {
      expect(at(features, x, y - 1, z)).toBe('minecraft:bone_block[axis=y]');
      expect(at(features, x, y - 3, z)).toBe('minecraft:bone_block[axis=y]');
    }
    expect(find(features, 'minecraft:clay').length).toBeGreaterThan(0);
    expect(find(features, 'minecraft:diamond_ore').length).toBeGreaterThan(0);
    // The meadow is warm: nothing freezes.
    expect(find(features, 'minecraft:snow')).toHaveLength(0);
    const cold = files(
      { 10: ['msm:freeze'] },
      { 'msm:freeze': { feature: { type: 'minecraft:freeze_top_layer' }, placement: [] } },
    );
    (cold['worldgen/biome'] as Record<string, Record<string, unknown>>)['msm:meadow'] = {
      temperature: -0.5,
      features: [...EMPTY_STEPS().slice(0, 10), ['msm:freeze']],
    };
    const frozen = build(cold).features;
    expect(
      find(frozen, 'minecraft:snow').length + find(frozen, 'minecraft:ice').length,
    ).toBeGreaterThan(1000);
  });

  it('reaches features through every selector', () => {
    const block = (id: string) => ({
      feature: { type: 'minecraft:simple_block', to_place: { id } },
      placement: [],
    });
    const selectors = {
      'msm:random': {
        type: 'minecraft:random_selector',
        features: [{ chance: 0, feature: block('minecraft:emerald_block') }],
        default: block('minecraft:gold_block'),
      },
      'msm:weighted': {
        type: 'minecraft:weighted_random_selector',
        features: [{ data: block('minecraft:iron_block'), weight: 1 }],
      },
      'msm:simple': {
        type: 'minecraft:simple_random_selector',
        features: [block('minecraft:coal_block')],
      },
      'msm:boolean': {
        type: 'minecraft:random_boolean_selector',
        feature_true: block('minecraft:lapis_block'),
        feature_false: block('minecraft:lapis_block'),
      },
      'msm:sequence': {
        type: 'minecraft:sequence',
        features: [
          block('minecraft:redstone_block'),
          { feature: { type: 'minecraft:no_op' }, placement: [] },
          {
            feature: {
              type: 'minecraft:simple_block',
              to_place: { id: 'minecraft:diamond_block' },
            },
            placement: [{ type: 'minecraft:offset', x: 0, y: 1, z: 0 }],
          },
        ],
      },
    };
    const placed: Record<string, unknown> = {};
    for (const id of Object.keys(selectors)) {
      placed[id] = {
        feature: id,
        placement: [
          { type: 'minecraft:count', count: 2 },
          { type: 'minecraft:in_square' },
          { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE' },
        ],
      };
    }
    const { features } = build(files({ 9: Object.keys(selectors) }, placed, selectors));
    for (const id of ['gold', 'iron', 'coal', 'lapis', 'redstone', 'diamond']) {
      expect(find(features, `minecraft:${id}_block`).length, id).toBeGreaterThan(0);
    }
    expect(find(features, 'minecraft:emerald_block')).toHaveLength(0);
    for (const [x, y, z] of find(features, 'minecraft:diamond_block')) {
      expect(at(features, x, y - 1, z)).toBe('minecraft:redstone_block');
    }
  });

  it('places two-block plants whole and plants only where they can stand', () => {
    const project = files(
      { 9: ['msm:flowers'] },
      {
        'msm:flowers': {
          feature: {
            type: 'minecraft:simple_block',
            to_place: {
              type: 'minecraft:weighted',
              entries: [
                { data: 'minecraft:poppy', weight: 1 },
                { data: 'minecraft:tall_grass', weight: 1 },
              ],
            },
          },
          placement: [
            { type: 'minecraft:count', count: 64 },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' },
            {
              type: 'minecraft:offset',
              x: 0,
              y: { type: 'minecraft:uniform', min_inclusive: -1, max_inclusive: 1 },
              z: 0,
            },
            {
              type: 'minecraft:block_predicate_filter',
              predicate: { type: 'minecraft:matching_block_tag', tag: 'minecraft:air' },
            },
          ],
        },
      },
    );
    const { features } = build(project);
    const poppies = find(features, 'minecraft:poppy');
    expect(poppies.length).toBeGreaterThan(10);
    for (const [x, y, z] of poppies) expect(at(features, x, y - 1, z)).toMatch(/grass_block|dirt/);
    const lower = find(features, 'minecraft:tall_grass').filter(([x, y, z]) =>
      at(features, x, y, z).includes('half=lower'),
    );
    expect(lower.length).toBeGreaterThan(5);
    for (const [x, y, z] of lower)
      expect(at(features, x, y + 1, z)).toBe('minecraft:tall_grass[half=upper]');
  });
});

describe('notes and additions', () => {
  it('reports every type it leaves out by name, and missing files', () => {
    const project = files(
      { 1: ['msm:lake'], 2: ['msm:geode', 'msm:missing'] },
      {
        'msm:geode': { feature: 'msm:geode', placement: [{ type: 'minecraft:in_square' }] },
        'msm:lake': {
          feature: { type: 'minecraft:lake', fluid: 'minecraft:water' },
          placement: [],
        },
      },
      { 'msm:geode': { type: 'minecraft:geode' } },
    );
    const notes = build(project).features.notes;
    expect(notes).toContainEqual(
      expect.objectContaining({
        kind: 'feature',
        type: 'about_right',
        drawnInstead: expect.stringMatching(/about right/),
      }),
    );
    expect(notes).toContainEqual(
      expect.objectContaining({
        kind: 'feature',
        type: 'minecraft:geode',
        where: 'msm:geode',
        drawnInstead: expect.stringMatching(/geodes/),
      }),
    );
    expect(notes).toContainEqual(
      expect.objectContaining({ kind: 'feature', type: 'minecraft:lake' }),
    );
    expect(notes).toContainEqual(
      expect.objectContaining({ kind: 'file', type: 'worldgen/placed_feature/msm:missing' }),
    );
    // Once each.
    expect(notes.filter((n) => n.type === 'minecraft:geode')).toHaveLength(1);
  });

  it("places a biome addition's features in the biomes it names", () => {
    const placed = {
      'msm:extra': {
        feature: { type: 'minecraft:simple_block', to_place: 'minecraft:melon' },
        placement: [
          { type: 'minecraft:count', count: 3 },
          { type: 'minecraft:in_square' },
          { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          { type: 'minecraft:biome' },
        ],
      },
    };
    const without = build(files({}, placed)).features;
    expect(find(without, 'minecraft:melon')).toHaveLength(0);
    const addition = {
      [ADDITIONS_FOLDER]: {
        'msm:more_melons': {
          format: 1,
          biomes: ['#msm:green'],
          features: [{ feature: 'msm:extra', step: 'vegetal_decoration' }],
        },
      },
      'tags/worldgen/biome': { 'msm:green': { values: ['msm:meadow'] } },
    };
    const withIt = build(files({}, placed, {}, addition)).features;
    expect(find(withIt, 'minecraft:melon').length).toBeGreaterThan(9);
    const elsewhere = build(
      files(
        {},
        placed,
        {},
        { ...addition, 'tags/worldgen/biome': { 'msm:green': { values: ['msm:beach'] } } },
      ),
    ).features;
    expect(find(elsewhere, 'minecraft:melon')).toHaveLength(0);
  });

  it('knows every type the targets list: drawn, or left out with plain words', () => {
    const targets = readdirSync(TARGETS).filter((d) =>
      existsSync(join(TARGETS, d, 'vendor', 'mcmeta', 'registries.json')),
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const registries = JSON.parse(
        readFileSync(join(TARGETS, target, 'vendor', 'mcmeta', 'registries.json'), 'utf8'),
      ) as Record<string, string[]>;
      expect([...(registries['worldgen/placement_modifier_type'] ?? [])].sort()).toEqual(
        [...PLACEMENT_MODIFIER_TYPES].sort(),
      );
      for (const type of registries['worldgen/feature_type'] ?? []) {
        if (FEATURE_TYPES.includes(type)) continue;
        expect(leftOutWords(type), type).not.toMatch(/this kind of feature/);
      }
      for (const type of FEATURE_TYPES) expect(registries['worldgen/feature_type']).toContain(type);
    }
  });

  it('orders a step by every biome, each keeping its own order', () => {
    expect(
      mergeOrders(
        [
          ['a', 'b', 'd'],
          ['a', 'c', 'd'],
          ['b', 'c'],
        ],
        new Map(),
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(
      mergeOrders(
        [
          ['x', 'y'],
          ['y', 'x'],
        ],
        new Map(),
      ),
    ).toHaveLength(2);
    expect(
      mergeOrders(
        [['p'], ['q']],
        new Map([
          ['q', 0],
          ['p', 1],
        ]),
      ),
    ).toEqual(['q', 'p']);
  });
});
