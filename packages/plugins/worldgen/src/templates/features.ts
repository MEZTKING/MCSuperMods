/**
 * Configured feature (`worldgen/feature`) and placed feature templates. A placed feature
 * template places the configured feature of the same id, so naming the two alike connects them
 * (a configured feature `ruby_ore` and a placed feature `ruby_ore`).
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { FEATURES, fixed, ownId } from './shared';

const simple = (state: Json): Json => ({ type: 'minecraft:simple', state });

export const featureTemplates: readonly ElementTemplate[] = [
  fixed(
    {
      id: 'feature_ore_vein',
      kind: 'minecraft:worldgen/feature',
      category: FEATURES,
      title: 'Ore vein',
      description: 'A blob of ore that replaces stone and deepslate; place it with Ore placement.',
      // `block_match` rather than vanilla's `tag_match` on `#stone_ore_replaceables`: the schema
      // validator does not yet read `tags="implicit"` ids, so a tag here reports unknown-id.
    },
    {
      type: 'minecraft:ore',
      size: 9,
      discard_chance_on_air_exposure: 0,
      targets: [
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
          state: 'minecraft:iron_ore',
        },
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:deepslate' },
          state: 'minecraft:deepslate_iron_ore',
        },
      ],
    },
  ),
  fixed(
    {
      id: 'feature_tree',
      kind: 'minecraft:worldgen/feature',
      category: FEATURES,
      title: 'Tree (oak-like)',
      description:
        'A small straight tree with a round crown of leaves; place it with Tree placement.',
    },
    {
      type: 'minecraft:tree',
      ignore_vines: true,
      minimum_size: {
        type: 'minecraft:two_layers_feature_size',
        limit: 1,
        lower_size: 0,
        upper_size: 1,
      },
      below_trunk_provider: simple('minecraft:dirt'),
      trunk_provider: simple('minecraft:oak_log'),
      foliage_provider: simple('minecraft:oak_leaves'),
      trunk_placer: {
        type: 'minecraft:straight_trunk_placer',
        base_height: 4,
        height_rand_a: 2,
        height_rand_b: 0,
      },
      foliage_placer: { type: 'minecraft:blob_foliage_placer', radius: 2, offset: 0, height: 3 },
      decorators: [],
    },
  ),
  fixed(
    {
      id: 'feature_flower_patch',
      kind: 'minecraft:worldgen/feature',
      category: FEATURES,
      title: 'Flower patch',
      description: 'One flower picked by weight; Patch placement scatters it into a patch.',
    },
    {
      type: 'minecraft:simple_block',
      to_place: {
        type: 'minecraft:weighted',
        entries: [
          { data: 'minecraft:poppy', weight: 2 },
          { data: 'minecraft:dandelion', weight: 2 },
          { data: 'minecraft:cornflower', weight: 1 },
        ],
      },
    },
  ),
  fixed(
    {
      id: 'feature_single_block',
      kind: 'minecraft:worldgen/feature',
      category: FEATURES,
      title: 'Single block',
      description: 'Places one block, such as a boulder or a marker, wherever it is placed.',
    },
    {
      type: 'minecraft:simple_block',
      to_place: simple('minecraft:mossy_cobblestone'),
    },
  ),
  ownId(
    {
      id: 'placed_feature_ore',
      kind: 'minecraft:worldgen/placed_feature',
      category: FEATURES,
      title: 'Ore placement',
      description:
        'Places the configured feature of the same id ten times per chunk, spread evenly from the bottom of the world to y 64.',
    },
    (id) => ({
      feature: id,
      placement: [
        { type: 'minecraft:count', count: 10 },
        { type: 'minecraft:in_square' },
        {
          type: 'minecraft:height_range',
          height: {
            type: 'minecraft:uniform',
            min_inclusive: { above_bottom: 0 },
            max_inclusive: { absolute: 64 },
          },
        },
        { type: 'minecraft:biome' },
      ],
    }),
  ),
  ownId(
    {
      id: 'placed_feature_tree',
      kind: 'minecraft:worldgen/placed_feature',
      category: FEATURES,
      title: 'Tree placement',
      description:
        'Places the configured feature of the same id a few times per chunk on the surface, where an oak sapling would survive.',
    },
    (id) => ({
      feature: id,
      placement: [
        {
          type: 'minecraft:count',
          count: { type: 'minecraft:uniform', min_inclusive: 1, max_inclusive: 3 },
        },
        { type: 'minecraft:in_square' },
        { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
        { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
        {
          type: 'minecraft:block_predicate_filter',
          predicate: { type: 'minecraft:would_survive', state: 'minecraft:oak_sapling' },
        },
        { type: 'minecraft:biome' },
      ],
    }),
  ),
  ownId(
    {
      id: 'placed_feature_patch',
      kind: 'minecraft:worldgen/placed_feature',
      category: FEATURES,
      title: 'Patch placement',
      description:
        'Scatters the configured feature of the same id into a patch on the surface, in about one chunk in four.',
    },
    (id) => ({
      feature: id,
      placement: [
        { type: 'minecraft:rarity_filter', chance: 4 },
        { type: 'minecraft:in_square' },
        { type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' },
        { type: 'minecraft:count', count: 32 },
        {
          type: 'minecraft:offset',
          x: { type: 'minecraft:uniform', min_inclusive: -7, max_inclusive: 7 },
          y: { type: 'minecraft:uniform', min_inclusive: -3, max_inclusive: 3 },
          z: { type: 'minecraft:uniform', min_inclusive: -7, max_inclusive: 7 },
        },
        {
          type: 'minecraft:block_predicate_filter',
          predicate: { type: 'minecraft:matching_blocks', blocks: 'minecraft:air' },
        },
        { type: 'minecraft:biome' },
      ],
    }),
  ),
];
