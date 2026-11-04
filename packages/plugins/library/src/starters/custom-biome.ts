/**
 * The Custom biome starter (plan D5, D9). A data pack cannot add a biome to the existing
 * overworld, so the biome reaches a world through a world preset: a World Type whose overworld
 * uses the vanilla terrain with an explicit multi-noise biome list holding the new biome and a
 * few vanilla biomes around it. The `minecraft:normal` world preset tag puts that World Type on
 * the Create New World screen. The biome has its own tree and ore, and the dimension types are
 * the vanilla ones.
 *
 * Feature lists are vanilla-ordered subsequences of the forest biome per decoration step, with
 * the project's own features added, so the world cannot hit the "Feature order cycle" crash.
 */
import type { BundleContext, ContentBundle, Json } from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';

/** A climate point: one value per parameter, depth and offset 0. */
function point(
  temperature: number,
  humidity: number,
  continentalness: number,
  erosion: number,
  weirdness: number,
): Json {
  return { temperature, humidity, continentalness, erosion, weirdness, depth: 0, offset: 0 };
}

/** Vanilla biomes around the new one; the nearest entry wins, so they cover the climate space. */
const SURROUNDINGS: readonly [string, Json][] = [
  ['minecraft:ocean', point(0, 0, -0.6, 0, 0)],
  ['minecraft:plains', point(0, -0.3, 0.3, 0.3, 0)],
  ['minecraft:forest', point(0, 0.3, 0.3, 0.3, 0)],
  ['minecraft:desert', point(0.8, -0.6, 0.3, 0.3, 0)],
  ['minecraft:snowy_plains', point(-0.8, 0, 0.3, 0.3, 0)],
  ['minecraft:jungle', point(0.6, 0.6, 0.3, 0.3, 0)],
  ['minecraft:windswept_hills', point(-0.3, 0, 0.6, -0.6, 0.6)],
];

/** Vanilla overworld ores, in vanilla order (`underground_ores`). */
const ORES = [
  'minecraft:ore_dirt',
  'minecraft:ore_gravel',
  'minecraft:ore_granite_upper',
  'minecraft:ore_granite_lower',
  'minecraft:ore_diorite_upper',
  'minecraft:ore_diorite_lower',
  'minecraft:ore_andesite_upper',
  'minecraft:ore_andesite_lower',
  'minecraft:ore_tuff',
  'minecraft:ore_coal_upper',
  'minecraft:ore_coal_lower',
  'minecraft:ore_iron_upper',
  'minecraft:ore_iron_middle',
  'minecraft:ore_iron_small',
  'minecraft:ore_gold',
  'minecraft:ore_gold_lower',
  'minecraft:ore_redstone',
  'minecraft:ore_redstone_lower',
  'minecraft:ore_diamond',
  'minecraft:ore_diamond_medium',
  'minecraft:ore_diamond_large',
  'minecraft:ore_diamond_buried',
  'minecraft:ore_lapis',
  'minecraft:ore_lapis_buried',
  'minecraft:ore_copper',
];

const uniform = (min: number, max: number): Json => ({
  type: 'minecraft:uniform',
  min_inclusive: min,
  max_inclusive: max,
});

const spawn = (type: string, weight: number, min = 4, max = 4): Json => ({
  type,
  count: uniform(min, max),
  weight,
});

/** The ids of the Custom biome content in `namespace`. */
export function customBiomeIds(namespace: string) {
  return {
    biome: rl(namespace, 'amber_woods'),
    tree: rl(namespace, 'amber_tree'),
    treePlaced: rl(namespace, 'amber_tree_placed'),
    ore: rl(namespace, 'rich_copper_ore'),
    orePlaced: rl(namespace, 'rich_copper_ore_placed'),
    preset: rl(namespace, 'amber_world'),
  };
}

/**
 * The Custom biome content without `pack.mcmeta`: the biome, its tree and ore (configured and
 * placed), the world preset and its `minecraft:normal` tag, an `is_overworld` biome tag entry
 * and English names.
 */
export function customBiomeContent({ namespace }: BundleContext): ContentBundle {
  const ids = customBiomeIds(namespace);
  const [, biomePath] = ids.biome.split(':') as [string, string];
  const [, presetPath] = ids.preset.split(':') as [string, string];
  return {
    elements: [
      element(
        ids.biome,
        KINDS.biome,
        {
          has_precipitation: true,
          temperature: 0.6,
          downfall: 0.7,
          attributes: {
            'minecraft:visual/sky_color': 7972607,
            'minecraft:visual/fog_color': 12638463,
            'minecraft:visual/water_fog_color': 329011,
            'minecraft:gameplay/natural_mob_spawns': {
              spawns_by_category: {
                creature: [
                  spawn('minecraft:sheep', 12),
                  spawn('minecraft:pig', 10),
                  spawn('minecraft:chicken', 10),
                  spawn('minecraft:fox', 8, 2, 4),
                ],
                monster: [
                  spawn('minecraft:zombie', 95),
                  spawn('minecraft:skeleton', 100),
                  spawn('minecraft:spider', 100),
                  spawn('minecraft:creeper', 100),
                ],
              },
              spawn_costs: {},
            },
          },
          effects: { water_color: 4159204, grass_color: 13148224, foliage_color: 13666864 },
          carvers: ['minecraft:cave', 'minecraft:cave_extra_underground', 'minecraft:canyon'],
          features: [
            [],
            ['minecraft:lake_lava_underground', 'minecraft:lake_lava_surface'],
            ['minecraft:amethyst_geode'],
            ['minecraft:monster_room', 'minecraft:monster_room_deep'],
            [],
            [],
            [...ORES, ids.orePlaced],
            [],
            ['minecraft:spring_water', 'minecraft:spring_lava'],
            [
              'minecraft:forest_flowers',
              ids.treePlaced,
              'minecraft:flower_default',
              'minecraft:patch_grass_forest',
              'minecraft:brown_mushroom_normal',
              'minecraft:red_mushroom_normal',
              'minecraft:patch_pumpkin',
            ],
            ['minecraft:freeze_top_layer'],
          ],
        },
        `A mild forest with orange grass and leaves, birch-trunked amber trees and extra copper. features holds one list of placed features per decoration step, in the game's step order; ${ids.treePlaced} is in the vegetal decoration step and ${ids.orePlaced} in the underground ores step. The vanilla features are kept in vanilla's order, which avoids the "Feature order cycle" crash. The biome appears in worlds made with the World Type of ${ids.preset}.`,
      ),
      element(
        ids.tree,
        KINDS.feature,
        {
          type: 'minecraft:tree',
          ignore_vines: true,
          minimum_size: {
            type: 'minecraft:two_layers_feature_size',
            limit: 1,
            lower_size: 0,
            upper_size: 1,
          },
          below_trunk_provider: { type: 'minecraft:simple', state: 'minecraft:dirt' },
          trunk_provider: { type: 'minecraft:simple', state: 'minecraft:birch_log' },
          foliage_provider: { type: 'minecraft:simple', state: 'minecraft:acacia_leaves' },
          trunk_placer: {
            type: 'minecraft:straight_trunk_placer',
            base_height: 5,
            height_rand_a: 2,
            height_rand_b: 0,
          },
          foliage_placer: {
            type: 'minecraft:blob_foliage_placer',
            radius: 2,
            offset: 0,
            height: 3,
          },
          decorators: [],
        },
        `The configured feature says what a tree looks like: a birch trunk five to seven blocks high under a round crown of acacia leaves. The placed feature ${ids.treePlaced} says where and how often it grows. Element ids are unique in a project, so the placed feature has its own name.`,
      ),
      element(
        ids.treePlaced,
        KINDS.placedFeature,
        {
          feature: ids.tree,
          placement: [
            { type: 'minecraft:count', count: uniform(4, 8) },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
            { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
            {
              type: 'minecraft:block_predicate_filter',
              predicate: { type: 'minecraft:would_survive', state: 'minecraft:birch_sapling' },
            },
            { type: 'minecraft:biome' },
          ],
        },
        `Places ${ids.tree}: four to eight tries per chunk, each at a random spot on the surface, only on dry land where a birch sapling would survive. minecraft:biome keeps the tree inside biomes that list it.`,
      ),
      element(
        ids.ore,
        KINDS.feature,
        {
          type: 'minecraft:ore',
          size: 14,
          discard_chance_on_air_exposure: 0,
          targets: [
            {
              target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
              state: 'minecraft:copper_ore',
            },
            {
              target: { predicate_type: 'minecraft:block_match', block: 'minecraft:deepslate' },
              state: 'minecraft:deepslate_copper_ore',
            },
          ],
        },
        'A large copper ore blob: copper ore where it replaces stone, deepslate copper ore where it replaces deepslate. size is roughly how many blocks one blob holds.',
      ),
      element(
        ids.orePlaced,
        KINDS.placedFeature,
        {
          feature: ids.ore,
          placement: [
            { type: 'minecraft:count', count: 12 },
            { type: 'minecraft:in_square' },
            {
              type: 'minecraft:height_range',
              height: {
                type: 'minecraft:uniform',
                min_inclusive: { absolute: -16 },
                max_inclusive: { absolute: 96 },
              },
            },
            { type: 'minecraft:biome' },
          ],
        },
        `Places ${ids.ore}: twelve blobs per chunk, spread evenly between y -16 and y 96.`,
      ),
      element(
        ids.preset,
        KINDS.worldPreset,
        {
          dimensions: {
            'minecraft:overworld': {
              type: 'minecraft:overworld',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biome_source: {
                  type: 'minecraft:multi_noise',
                  biomes: [
                    { biome: ids.biome, parameters: point(0.2, 0.2, 0.3, 0.3, 0) },
                    ...SURROUNDINGS.map(([biome, parameters]) => ({
                      biome,
                      parameters: structuredClone(parameters),
                    })),
                  ],
                },
              },
            },
            'minecraft:the_nether': {
              type: 'minecraft:the_nether',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:nether',
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
              },
            },
            'minecraft:the_end': {
              type: 'minecraft:the_end',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:end',
                biome_source: { type: 'minecraft:the_end' },
              },
            },
          },
        },
        `A World Type: the vanilla overworld terrain, but its biomes come from this list. Each biome sits at a climate point and every column takes the nearest one, so ${ids.biome} fills the mild, humid areas and seven vanilla biomes the rest. The nether and the end are the vanilla ones, using the vanilla dimension types. Choose it under More > World Type when creating a world.`,
      ),
      element(
        'minecraft:normal',
        KINDS.tagWorldgenWorldPreset,
        { values: [ids.preset] },
        'The Create New World screen offers the presets in this vanilla tag. Adding ours here (replace stays false) keeps every vanilla World Type.',
      ),
      element(
        'minecraft:is_overworld',
        KINDS.tagWorldgenBiome,
        { values: [ids.biome] },
        'Marks the new biome as an overworld biome for vanilla checks that use #minecraft:is_overworld.',
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        {
          [`biome.${namespace}.${biomePath}`]: 'Amber Woods',
          [`generator.${namespace}.${presetPath}`]: 'Amber Woods',
        },
        'English names for the biome (shown in F3 and /locate) and the World Type button. Install the resource pack too, or the screen shows the raw keys.',
      ),
    ],
    assets: [],
  };
}

/** The Custom biome starter. */
export function customBiomeBundle(context: BundleContext): ContentBundle {
  const content = customBiomeContent(context);
  return {
    elements: [
      packElement(
        context.namespace,
        `${context.projectName}: the Amber Woods biome and World Type`,
        'The pack description shown in the resource pack and data pack lists. Both packs are exported from this one element.',
      ),
      ...content.elements,
    ],
    assets: content.assets,
  };
}
