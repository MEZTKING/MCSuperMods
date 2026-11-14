/**
 * The Crop and Tree Creator flows and the Simple block's placement options (ADR 0069 D1, D4):
 * block types, item ids, loot presets, food, tags, the tree and world generation. Validation
 * and export with the real plugins on both targets live in
 * `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ContentBundleElement, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { libraryStarters } from '../src/index';
import { cropBundle } from '../src/starters/crop';
import { simpleBlockBundle } from '../src/starters/simple-block';
import { treeBundle } from '../src/starters/tree';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const context = (values: Record<string, Json>) => ({
  namespace: 'demo',
  projectName: 'Demo',
  target,
  values,
});
const crop = (values: Record<string, Json> = {}): ContentBundle => cropBundle(context(values));
const tree = (values: Record<string, Json> = {}): ContentBundle => treeBundle(context(values));
const simple = (values: Record<string, Json> = {}): ContentBundle =>
  simpleBlockBundle(context(values));

const find = (bundle: ContentBundle, id: string, kind?: string): ContentBundleElement => {
  const found = bundle.elements.find(
    (entry) => entry.id === id && (kind === undefined || entry.kind === kind),
  );
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const data = (bundle: ContentBundle, id: string, kind?: string): JsonObject =>
  find(bundle, id, kind).data as JsonObject;
const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);
const paths = (bundle: ContentBundle): string[] => bundle.assets.map((asset) => asset.path);

describe('Crop flow (ADR 0069 D1)', () => {
  it('is a Creator flow in the blocks group', () => {
    for (const id of ['crop', 'tree']) {
      const entry = libraryStarters.find((starter) => starter.id === id);
      expect(entry?.creator?.group, id).toBe('blocks');
      expect(entry?.layers, id).toEqual(['resourcepack', 'datapack', 'msm']);
    }
  });

  it('grows a crop from its own seeds and drops a new food', () => {
    const bundle = crop();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:tomato_crop',
      'demo:item/tomato_seeds',
      'demo:tomato',
      'demo:item/tomato',
    ]);
    const block = data(bundle, 'demo:tomato_crop');
    expect(block).toMatchObject({
      type: 'crop',
      display_name: 'Tomato Seeds',
      max_age: 7,
      loot: 'crop',
      crop_drops: { produce: 'demo:tomato' },
      item: { id: 'demo:tomato_seeds', compost: '30%' },
      models: { item: 'demo:item/tomato_seeds' },
    });
    // Four looks over eight ages, as potatoes.
    expect((block.textures as JsonObject).stages).toEqual([
      'demo:block/tomato_crop_stage0',
      'demo:block/tomato_crop_stage1',
      'demo:block/tomato_crop_stage2',
      'demo:block/tomato_crop_stage3',
    ]);
    expect(block.villager_plantable).toBeUndefined();
    expect(block.soil).toBeUndefined();
    expect(data(bundle, 'demo:tomato', 'msm:item')).toMatchObject({
      display_name: 'Tomato',
      compost: '65%',
      components: { 'msm:food': { nutrition: 3, saturation: 0.6 } },
    });
    expect(paths(bundle)).toEqual([
      'textures/block/tomato_crop_stage0.png',
      'textures/block/tomato_crop_stage1.png',
      'textures/block/tomato_crop_stage2.png',
      'textures/block/tomato_crop_stage3.png',
      'textures/item/tomato_seeds.png',
      'textures/item/tomato.png',
    ]);
  });

  it('plants the produce itself, edible through the vanilla food components', () => {
    const bundle = crop({ crop_name: 'Radish', produce: 'produce', nutrition: 3, harvest_max: 3 });
    expect(ids(bundle)).not.toContain('demo:radish_seeds');
    expect(bundle.elements.filter((entry) => entry.kind === 'msm:item')).toEqual([]);
    const block = data(bundle, 'demo:radish_crop');
    expect(block).toMatchObject({
      display_name: 'Radish',
      crop_drops: { produce: 'demo:radish', produce_count: { min: 1, max: 3 } },
      item: {
        id: 'demo:radish',
        compost: '65%',
        components: {
          'msm:components': {
            'minecraft:consumable': {},
            // Vanilla's saturation is nutrition times the modifier times two (carrot: 3.6).
            'minecraft:food': { nutrition: 3, saturation: 3.6 },
          },
        },
      },
    });
    expect(paths(bundle)).toContain('textures/item/radish.png');
  });

  it('follows the stage choice, the seeds name and the villager answer', () => {
    const wheat = data(crop({ stages: 'eight' }), 'demo:tomato_crop');
    expect(((wheat.textures as JsonObject).stages as string[]).length).toBe(8);
    const beet = data(crop({ stages: 'short' }), 'demo:tomato_crop');
    expect(beet.max_age).toBe(3);
    expect(((beet.textures as JsonObject).stages as string[]).length).toBe(4);
    const pips = crop({ seeds_name: 'Red Pips', villagers: false });
    expect(data(pips, 'demo:tomato_crop')).toMatchObject({
      display_name: 'Red Pips',
      item: { id: 'demo:red_pips' },
      villager_plantable: false,
    });
    // A seeds name that would clash with the produce or the crop keeps the _seeds id.
    expect((data(crop({ seeds_name: 'Tomato' }), 'demo:tomato_crop').item as JsonObject).id).toBe(
      'demo:tomato_seeds',
    );
  });

  it('adds wild patches on grass and lets the crop grow there', () => {
    const bundle = crop({ wild: true, wild_biomes: '#minecraft:is_taiga', wild_rarity: 8 });
    expect(data(bundle, 'demo:tomato_crop').soil).toBe('#demo:tomato_soil');
    expect(data(bundle, 'demo:tomato_soil', 'minecraft:tag/block').values).toEqual([
      'minecraft:farmland',
      'minecraft:grass_block',
    ]);
    expect(data(bundle, 'demo:wild_tomato', 'minecraft:worldgen/feature')).toEqual({
      type: 'minecraft:simple_block',
      to_place: { id: 'demo:tomato_crop', properties: { age: '7' } },
    });
    const placed = data(bundle, 'demo:wild_tomato_placed');
    expect(placed.feature).toBe('demo:wild_tomato');
    expect((placed.placement as JsonObject[])[0]).toEqual({
      type: 'minecraft:rarity_filter',
      chance: 8,
    });
    expect(data(bundle, 'demo:wild_tomato_patches', 'msm:biome_addition')).toEqual({
      format: 1,
      biomes: ['#minecraft:is_taiga'],
      features: [{ feature: 'demo:wild_tomato_placed', step: 'vegetal_decoration' }],
    });
  });
});

describe('Tree flow (ADR 0069 D1)', () => {
  it('makes a new log, new leaves, the sapling, the tree and its growth by default', () => {
    const bundle = tree();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:rowan_log',
      'demo:rowan_leaves',
      'demo:rowan_sapling',
      'demo:rowan_tree',
      'demo:rowan_tree_placed',
      'demo:rowan_trees',
      'minecraft:logs',
      'minecraft:logs_that_burn',
    ]);
    expect(data(bundle, 'demo:rowan_log').type).toBe('pillar');
    expect(data(bundle, 'demo:rowan_leaves')).toMatchObject({
      type: 'leaves',
      leaves_drops: { sapling: 'demo:rowan_sapling' },
    });
    expect(data(bundle, 'demo:rowan_sapling').tree).toBe('demo:rowan_tree');
    const feature = data(bundle, 'demo:rowan_tree');
    expect(feature.trunk_provider).toEqual({ id: 'demo:rowan_log' });
    expect((feature.foliage_provider as JsonObject).id).toBe('demo:rowan_leaves');
    expect(data(bundle, 'minecraft:logs', 'minecraft:tag/block').values).toEqual([
      'demo:rowan_log',
    ]);
    expect(paths(bundle)).toEqual([
      'textures/block/rowan_log.png',
      'textures/block/rowan_log_top.png',
      'textures/block/rowan_leaves.png',
      'textures/block/rowan_sapling.png',
    ]);
  });

  it('grows from vanilla blocks without tags or their textures', () => {
    const bundle = tree({
      log: 'minecraft:birch_log',
      leaves: 'minecraft:birch_leaves',
      grows: false,
    });
    expect(ids(bundle)).toEqual(['demo:pack', 'demo:mod', 'demo:rowan_sapling', 'demo:rowan_tree']);
    const feature = data(bundle, 'demo:rowan_tree');
    expect(feature.trunk_provider).toEqual({ id: 'minecraft:birch_log' });
    expect((feature.foliage_provider as JsonObject).id).toBe('minecraft:birch_leaves');
    expect(paths(bundle)).toEqual(['textures/block/rowan_sapling.png']);
  });

  it('grows a two by two tree from four saplings for the dark oak shape', () => {
    const bundle = tree({ tree_shape: 'dark_oak' });
    expect(data(bundle, 'demo:rowan_sapling').mega_tree).toBe('demo:rowan_mega_tree');
    expect((data(bundle, 'demo:rowan_mega_tree').trunk_placer as JsonObject).type).toBe(
      'minecraft:dark_oak_trunk_placer',
    );
    expect(data(bundle, 'demo:rowan_tree_placed').feature).toBe('demo:rowan_mega_tree');
  });
});

describe('Simple block placement (ADR 0069 D4)', () => {
  it('keeps the plain cube by default', () => {
    const bundle = simple();
    expect(data(bundle, 'demo:ruby_tiles').model).toBe('demo:block/ruby_tiles');
    expect(ids(bundle)).toContain('demo:block/ruby_tiles');
  });

  it('turns to face the player with a front texture', () => {
    const bundle = simple({ placement: 'horizontal' });
    expect(data(bundle, 'demo:ruby_tiles')).toMatchObject({
      type: 'horizontal',
      textures: { all: 'demo:block/ruby_tiles', front: 'demo:block/ruby_tiles_front' },
    });
    expect(data(bundle, 'demo:ruby_tiles').model).toBeUndefined();
    // The type's lowering writes the model, so no model element shares its id.
    expect(ids(bundle)).not.toContain('demo:block/ruby_tiles');
    expect(paths(bundle)).toEqual([
      'textures/block/ruby_tiles.png',
      'textures/block/ruby_tiles_front.png',
    ]);
  });

  it('is placed like a log with ringed ends', () => {
    const bundle = simple({ placement: 'pillar' });
    expect(data(bundle, 'demo:ruby_tiles')).toMatchObject({
      type: 'pillar',
      textures: { side: 'demo:block/ruby_tiles', end: 'demo:block/ruby_tiles_top' },
    });
    expect(paths(bundle)).toContain('textures/block/ruby_tiles_top.png');
  });
});
