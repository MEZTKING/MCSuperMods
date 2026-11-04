/**
 * Biome templates. A biome's `features` holds one list of placed features per decoration step,
 * in the target's step order (`target.worldgen.featureSteps`); empty lists keep the later steps
 * at their index. Each list here is a subsequence of what the matching vanilla biome places in
 * that step, in vanilla's order, so a world mixing these biomes with vanilla ones cannot hit
 * the "Feature order cycle" crash (`worldgen.feature-order` checks project biomes against each
 * other). The template test checks every list index against the target's step names.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { BIOMES, fixed } from './shared';

/** Carvers every overworld land biome uses. */
const CARVERS = ['minecraft:cave', 'minecraft:cave_extra_underground', 'minecraft:canyon'];

/** Common overworld ores (`underground_ores`), a vanilla-ordered subsequence. */
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

/**
 * The step lists of an overworld land biome. Positions follow the decoration steps: raw
 * generation, lakes, local modifications, underground structures, surface structures,
 * strongholds, underground ores, underground decoration, fluid springs, vegetal decoration and
 * top-layer modification.
 */
function overworldFeatures(surface: string[], vegetal: string[]): Json {
  return [
    [],
    ['minecraft:lake_lava_underground', 'minecraft:lake_lava_surface'],
    ['minecraft:amethyst_geode'],
    ['minecraft:monster_room', 'minecraft:monster_room_deep'],
    surface,
    [],
    ORES,
    [],
    ['minecraft:spring_water', 'minecraft:spring_lava'],
    vegetal,
    ['minecraft:freeze_top_layer'],
  ];
}

const mobSpawns = (creatures: Json[]): Json => ({
  spawns_by_category: {
    creature: creatures,
    monster: [
      {
        type: 'minecraft:zombie',
        count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
        weight: 95,
      },
      {
        type: 'minecraft:skeleton',
        count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
        weight: 100,
      },
      {
        type: 'minecraft:spider',
        count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
        weight: 100,
      },
      {
        type: 'minecraft:creeper',
        count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
        weight: 100,
      },
    ],
  },
  spawn_costs: {},
});

export const biomeTemplates: readonly ElementTemplate[] = [
  fixed(
    {
      id: 'biome_temperate_forest',
      kind: 'minecraft:worldgen/biome',
      category: BIOMES,
      title: 'Temperate forest biome',
      description: 'A mild, rainy forest of oak and birch with flowers, grass and the usual ores.',
    },
    {
      has_precipitation: true,
      temperature: 0.7,
      downfall: 0.8,
      attributes: {
        'minecraft:visual/sky_color': 7972607,
        'minecraft:visual/fog_color': 12638463,
        'minecraft:visual/water_fog_color': 329011,
        'minecraft:gameplay/natural_mob_spawns': mobSpawns([
          {
            type: 'minecraft:sheep',
            count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
            weight: 12,
          },
          {
            type: 'minecraft:pig',
            count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
            weight: 10,
          },
          {
            type: 'minecraft:chicken',
            count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
            weight: 10,
          },
          {
            type: 'minecraft:cow',
            count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
            weight: 8,
          },
          {
            type: 'minecraft:wolf',
            count: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 },
            weight: 5,
          },
        ]),
      },
      effects: { water_color: 4159204, grass_color: 7979098, foliage_color: 5877296 },
      carvers: CARVERS,
      features: overworldFeatures(
        [],
        [
          'minecraft:forest_flowers',
          'minecraft:trees_birch_and_oak_leaf_litter',
          'minecraft:flower_default',
          'minecraft:patch_grass_forest',
          'minecraft:brown_mushroom_normal',
          'minecraft:red_mushroom_normal',
          'minecraft:patch_sugar_cane',
          'minecraft:patch_pumpkin',
        ],
      ),
    },
  ),
  fixed(
    {
      id: 'biome_desert',
      kind: 'minecraft:worldgen/biome',
      category: BIOMES,
      title: 'Desert biome',
      description: 'A hot, dry biome without rain: dead bushes, cacti and desert wells.',
    },
    {
      has_precipitation: false,
      temperature: 2,
      downfall: 0,
      attributes: {
        'minecraft:visual/sky_color': 7254527,
        'minecraft:visual/fog_color': 12638463,
        'minecraft:visual/water_fog_color': 329011,
        'minecraft:gameplay/natural_mob_spawns': mobSpawns([
          {
            type: 'minecraft:rabbit',
            count: { type: 'minecraft:uniform', min_inclusive: 2, max_inclusive: 3 },
            weight: 12,
          },
          {
            type: 'minecraft:camel',
            count: { type: 'minecraft:uniform', min_inclusive: 1, max_inclusive: 1 },
            weight: 1,
          },
        ]),
      },
      effects: { water_color: 4159204 },
      carvers: CARVERS,
      features: overworldFeatures(
        ['minecraft:desert_well'],
        [
          'minecraft:flower_default',
          'minecraft:patch_dead_bush_2',
          'minecraft:brown_mushroom_normal',
          'minecraft:red_mushroom_normal',
          'minecraft:patch_sugar_cane_desert',
          'minecraft:patch_cactus_desert',
        ],
      ),
    },
  ),
];
