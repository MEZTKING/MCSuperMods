/**
 * Configured feature (`worldgen/feature`) and placed feature templates. A placed feature
 * template's `feature` starts as the new placed feature's own id. Ids are unique across kinds,
 * so no configured feature can have that id: the user points `feature` at their configured
 * feature (for example a placed feature `ruby_ore_placed` placing `ruby_ore`), and until then
 * the schema check reports the unknown id.
 *
 * "Tree for a sapling" (ADR 0068 D5) names project blocks: the log and leaves ids come from
 * the project namespace and the tree's own path without a trailing `_tree` (`demo:maple_tree`
 * grows `demo:maple_log` and `demo:maple_leaves`), so the user makes those blocks or points
 * the providers elsewhere.
 */
import type { ElementTemplate, Json, TemplateContext } from '@msm/plugin-api';
import { FEATURES, fixed, ownId } from './shared';

const simple = (state: Json): Json => ({ type: 'minecraft:simple', state });

/** The base name of a sapling tree's own blocks: its path without a trailing `_tree`. */
function treeBlockBase(context: TemplateContext): string {
  const base = context.path.replace(/_tree$/, '');
  return `${context.projectNamespace}:${base === '' ? context.path : base}`;
}

/** Vanilla's leaf state in tree features: not persistent, as far from a log as possible. */
const TREE_LEAVES_STATE: Json = { distance: '7', persistent: 'false' };

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
  {
    id: 'feature_sapling_tree',
    kind: 'minecraft:worldgen/feature',
    category: FEATURES,
    title: 'Tree for a sapling',
    description:
      "Oak's shape grown from your own log and leaves (named after this tree, such as maple_log and maple_leaves for maple_tree), with the soil under the trunk turned to dirt as vanilla trees do. Name it as a sapling's tree.",
    data: (context) => {
      const base = treeBlockBase(context);
      return {
        type: 'minecraft:tree',
        ignore_vines: true,
        minimum_size: { type: 'minecraft:two_layers_feature_size' },
        below_trunk_provider: 'minecraft:soil_beneath_tree',
        trunk_provider: { id: `${base}_log` },
        foliage_provider: { id: `${base}_leaves`, properties: structuredClone(TREE_LEAVES_STATE) },
        trunk_placer: {
          type: 'minecraft:straight_trunk_placer',
          base_height: 4,
          height_rand_a: 2,
          height_rand_b: 0,
        },
        foliage_placer: { type: 'minecraft:blob_foliage_placer', radius: 2, offset: 0, height: 3 },
        decorators: [],
      };
    },
  },
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
        "Places a configured feature ten times per chunk, spread evenly from the bottom of the world to y 64. Its feature starts as this element's own id: set it to your configured feature, such as ruby_ore for ruby_ore_placed.",
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
        "Places a configured feature a few times per chunk on the surface, where an oak sapling would survive. Its feature starts as this element's own id: set it to your configured feature, such as amber_tree for amber_tree_placed.",
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
        "Scatters a configured feature into a patch on the surface, in about one chunk in four. Its feature starts as this element's own id: set it to your configured feature, such as flowers for flowers_placed.",
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
