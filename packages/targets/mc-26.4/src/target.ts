/**
 * Verified facts for Minecraft Java 26.4, pinned to 26.4-snapshot-7 until the release lands
 * (checked 2026-11-05; sources in `CHANGES.md`; ADR 0037).
 */

import type { Target } from '@msm/plugin-api';
import featureOrder from '../vendor/worldgen/feature-order.json' with { type: 'json' };
import { controls } from './controls';
import { createMigrateFrom, migrationTables } from './migrate';
import { soundSetEvents } from './sound-sets';

const ID = 'mc-26.4';
const MC_VERSION = '26.4-snapshot-7';
/** noise_settings lost default_block (`until 26.4` in the vendored mcdoc; ADR 0036 D8). */
const NOISE_SETTINGS_DEFAULT_BLOCK = false;

/** The decoration step names, in the order the game runs them (`worldgen.featureSteps`). */
const FEATURE_STEPS = [
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
] as const;

/**
 * `worldgen.vanillaFeatureOrder` (ADR 0097 D1): the vendored order per step index, written by
 * `tools/sync-feature-order` from mcmeta's biome summary (ids only), keyed by step name.
 */
const vanillaFeatureOrder: Record<string, readonly string[]> = Object.fromEntries(
  FEATURE_STEPS.map((step, index) => [step, featureOrder.steps[index] ?? []]),
);

/**
 * `worldgen.environmentAttributes` (ADR 0100 D5; plugin API 1.18.0): the 52 ids of the vendored
 * `registries.json` `environment_attribute` list, namespaced and sorted (tied to it by
 * `test/target.test.ts`).
 */
const ENVIRONMENT_ATTRIBUTES = [
  'minecraft:audio/ambient_sounds',
  'minecraft:audio/background_music',
  'minecraft:audio/firefly_bush_sounds',
  'minecraft:audio/music_volume',
  'minecraft:gameplay/baby_villager_activity',
  'minecraft:gameplay/bed_rule',
  'minecraft:gameplay/bees_stay_in_hive',
  'minecraft:gameplay/can_pillager_patrol_spawn',
  'minecraft:gameplay/can_start_raid',
  'minecraft:gameplay/cat_waking_up_gift_chance',
  'minecraft:gameplay/creaking_active',
  'minecraft:gameplay/creature_world_gen_spawn_probability',
  'minecraft:gameplay/eyeblossom_open',
  'minecraft:gameplay/fast_lava',
  'minecraft:gameplay/increased_fire_burnout',
  'minecraft:gameplay/monsters_burn',
  'minecraft:gameplay/natural_mob_spawns',
  'minecraft:gameplay/nether_portal_spawns_piglin',
  'minecraft:gameplay/piglins_zombify',
  'minecraft:gameplay/respawn_anchor_works',
  'minecraft:gameplay/sky_light_level',
  'minecraft:gameplay/snow_golem_melts',
  'minecraft:gameplay/straw_bed_rule',
  'minecraft:gameplay/surface_slime_spawn_chance',
  'minecraft:gameplay/turtle_egg_hatch_chance',
  'minecraft:gameplay/villager_activity',
  'minecraft:gameplay/water_evaporates',
  'minecraft:visual/ambient_light_color',
  'minecraft:visual/ambient_particles',
  'minecraft:visual/block_light_tint',
  'minecraft:visual/cloud_color',
  'minecraft:visual/cloud_fog_end_distance',
  'minecraft:visual/cloud_height',
  'minecraft:visual/default_dripstone_particle',
  'minecraft:visual/fog_color',
  'minecraft:visual/fog_end_distance',
  'minecraft:visual/fog_start_distance',
  'minecraft:visual/has_sky_occluder',
  'minecraft:visual/moon_angle',
  'minecraft:visual/moon_phase',
  'minecraft:visual/night_vision_color',
  'minecraft:visual/sky_color',
  'minecraft:visual/sky_fog_end_distance',
  'minecraft:visual/sky_light_color',
  'minecraft:visual/sky_light_factor',
  'minecraft:visual/star_angle',
  'minecraft:visual/star_brightness',
  'minecraft:visual/sun_angle',
  'minecraft:visual/sunrise_sunset_color',
  'minecraft:visual/water_fog_color',
  'minecraft:visual/water_fog_end_distance',
  'minecraft:visual/water_fog_start_distance',
] as const;

/**
 * `worldgen.terrainPreview.dataFolders` (ADR 0119 D16): the `data/minecraft/` folders whose JSON
 * the jar extraction keeps for the live world generation preview, sorted. Terrain: noise
 * settings, density functions, noises, surface rules and conditions, biomes, world presets,
 * multi-noise parameter lists, flat presets and dimension types; features, carvers and
 * structures; their worldgen tags; and block tags (the features' block predicates, B585).
 */
const TERRAIN_PREVIEW_DATA_FOLDERS: readonly string[] = Object.freeze([
  'dimension_type',
  'tags/block',
  'tags/worldgen/biome',
  'tags/worldgen/feature',
  'tags/worldgen/flat_level_generator_preset',
  'tags/worldgen/structure',
  'tags/worldgen/world_preset',
  'worldgen/biome',
  'worldgen/block_state_provider',
  'worldgen/carver',
  'worldgen/density_function',
  'worldgen/feature',
  'worldgen/flat_level_generator_preset',
  'worldgen/material_condition',
  'worldgen/material_rule',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/noise',
  'worldgen/noise_settings',
  'worldgen/placed_feature',
  'worldgen/processor_list',
  'worldgen/structure',
  'worldgen/structure_set',
  'worldgen/template_pool',
  'worldgen/world_preset',
]);

export const target: Target = {
  id: ID,
  mcVersion: MC_VERSION,
  channel: 'snapshot',
  java: 25,
  packFormats: {
    resource: { major: 102, minor: 0 },
    data: { major: 126, minor: 0 },
  },
  mcdocRef: '1a674539af7150444db0e2fa8fc46318f91ed86b',
  mcmetaRef: '26.4-snapshot-7',
  folders: {
    resource: {
      model: 'models',
      block_definition: 'blockstates',
      item_definition: 'items',
      lang: 'lang',
      sounds_file: 'sounds.json',
      textures: 'textures',
      atlases: 'atlases',
      font: 'font',
    },
    data: {
      recipe: 'recipe',
      loot_table: 'loot_table',
      advancement: 'advancement',
      predicate: 'predicate',
      item_modifier: 'item_modifier',
      function: 'function',
      tags: 'tags',
      enchantment: 'enchantment',
      damage_type: 'damage_type',
      dimension_type: 'dimension_type',
      chat_type: 'chat_type',
      jukebox_song: 'jukebox_song',
      banner_pattern: 'banner_pattern',
      painting_variant: 'painting_variant',
      trim_material: 'trim_material',
      trim_pattern: 'trim_pattern',
      dialog: 'dialog',
      structure: 'structure',
      dimension: 'dimension',
      worldgen: 'worldgen',
      villager_trade: 'villager_trade',
      trade_set: 'trade_set',
      wolf_variant: 'wolf_variant',
      cat_variant: 'cat_variant',
      pig_variant: 'pig_variant',
      cow_variant: 'cow_variant',
      chicken_variant: 'chicken_variant',
      frog_variant: 'frog_variant',
      zombie_nautilus_variant: 'zombie_nautilus_variant',
      wolf_sound_variant: 'wolf_sound_variant',
      cat_sound_variant: 'cat_sound_variant',
      pig_sound_variant: 'pig_sound_variant',
      cow_sound_variant: 'cow_sound_variant',
      chicken_sound_variant: 'chicken_sound_variant',
      instrument: 'instrument',
      enchantment_provider: 'enchantment_provider',
      trial_spawner: 'trial_spawner',
      timeline: 'timeline',
      world_clock: 'world_clock',
      decorated_pot_pattern: 'decorated_pot_pattern',
      block_transformer: 'block_transformer',
      test_environment: 'test_environment',
      test_instance: 'test_instance',
      sulfur_cube_archetype: 'sulfur_cube_archetype',
      context_int_provider: 'context_int_provider',
      context_float_provider: 'context_float_provider',
    },
  },
  dataVersion: 5127,
  worldgen: {
    featureSteps: FEATURE_STEPS,
    biomeAttributes: {
      colours: [
        'minecraft:visual/sky_color',
        'minecraft:visual/fog_color',
        'minecraft:visual/water_fog_color',
      ],
      skyColour: 'minecraft:visual/sky_color',
      naturalMobSpawns: 'minecraft:gameplay/natural_mob_spawns',
    },
    noiseSettingsDefaultBlock: NOISE_SETTINGS_DEFAULT_BLOCK,
    vanillaFeatureOrder,
    // dimensionHeight (ADR 0100 D5): the vendored mcdoc's `DimensionType` ranges, `min_y`
    // -2032 to 2031 and `height` 16 to 4064, both `divisible_by` 16, so the highest block is
    // y 2031 (tied to the mcdoc by `test/target.test.ts`, 2026-11-15).
    dimensionHeight: { minY: -2032, maxY: 2031, step: 16 },
    environmentAttributes: ENVIRONMENT_ATTRIBUTES,
    // terrainPreview (ADR 0119 D16; plugin API 1.21.0): the jar's `data/minecraft/` folders the
    // live world generation preview caches, from B574's WS11 list and checked against the Loom-
    // cached client jar by `all/test/terrain-preview.test.ts` (1,640 files, 315 of them the block
    // tags B585 added for the features' block predicates; no `dimension` folder: vanilla's
    // dimensions are inline in the world presets). Approximate here:
    // the End (as on 26.3) and the biome layout (B574 WS8: 67 % of biome cells, a code change of
    // the snapshot that its data files do not show; re-measure at the next pin).
    terrainPreview: {
      dataFolders: TERRAIN_PREVIEW_DATA_FOLDERS,
      approximate: ['biome_layout', 'end'],
    },
  },
  // items.armorMaterials: the ArmorMaterials constants in lower case. B151's error table had no
  // armour entry; javap over the Loom-cached 26.4-snapshot-7 merged jar (2026-11-05) lists the
  // same nine constants as 26.3 (re-check at the next snapshot pin; ADR 0042 D4).
  items: {
    armorMaterials: [
      'leather',
      'copper',
      'chainmail',
      'iron',
      'gold',
      'diamond',
      'turtle_scute',
      'netherite',
      'armadillo_scute',
    ],
    // items.compostProviders: the chance a compostable item has, mapped to the vanilla
    // context_int_provider that gives it (ADR 0060 D4). Read from the five
    // data/minecraft/context_int_provider/compostable/*.json files of the Loom-cached merged jar
    // (never stored in the repository): low 30/70, low_medium 50/50, medium 65/35, medium_high
    // 85/15 (each weighted_list, one layer on an empty composter) and always_add_one (constant 1).
    compostProviders: {
      '30%': 'minecraft:compostable/low',
      '50%': 'minecraft:compostable/low_medium',
      '65%': 'minecraft:compostable/medium',
      '85%': 'minecraft:compostable/medium_high',
      '100%': 'minecraft:compostable/always_add_one',
    },
    // vanillaTools (ADR 0050): the tooltip numbers of each vanilla tool, read 2026-11-07 from
    // misode/mcmeta 26.4-snapshot-7-summary item_components/data.min.json (attack damage = 1 + the attack_damage
    // modifier, attack speed = 4 + the attack_speed modifier; mining speed from minecraft:tool).
    vanillaTools: {
      wooden: {
        sword: { attackDamage: 4, attackSpeed: 1.6, durability: 59, enchantability: 15 },
        pickaxe: {
          attackDamage: 2,
          attackSpeed: 1.2,
          durability: 59,
          enchantability: 15,
          miningSpeed: 2,
        },
        axe: {
          attackDamage: 7,
          attackSpeed: 0.8,
          durability: 59,
          enchantability: 15,
          miningSpeed: 2,
        },
        shovel: {
          attackDamage: 2.5,
          attackSpeed: 1,
          durability: 59,
          enchantability: 15,
          miningSpeed: 2,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 1,
          durability: 59,
          enchantability: 15,
          miningSpeed: 2,
        },
        spear: { attackDamage: 1, attackSpeed: 1.54, durability: 59, enchantability: 15 },
      },
      stone: {
        sword: { attackDamage: 5, attackSpeed: 1.6, durability: 131, enchantability: 5 },
        pickaxe: {
          attackDamage: 3,
          attackSpeed: 1.2,
          durability: 131,
          enchantability: 5,
          miningSpeed: 4,
        },
        axe: {
          attackDamage: 9,
          attackSpeed: 0.8,
          durability: 131,
          enchantability: 5,
          miningSpeed: 4,
        },
        shovel: {
          attackDamage: 3.5,
          attackSpeed: 1,
          durability: 131,
          enchantability: 5,
          miningSpeed: 4,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 2,
          durability: 131,
          enchantability: 5,
          miningSpeed: 4,
        },
        spear: { attackDamage: 2, attackSpeed: 1.33, durability: 131, enchantability: 5 },
      },
      copper: {
        sword: { attackDamage: 5, attackSpeed: 1.6, durability: 190, enchantability: 13 },
        pickaxe: {
          attackDamage: 3,
          attackSpeed: 1.2,
          durability: 190,
          enchantability: 13,
          miningSpeed: 5,
        },
        axe: {
          attackDamage: 9,
          attackSpeed: 0.8,
          durability: 190,
          enchantability: 13,
          miningSpeed: 5,
        },
        shovel: {
          attackDamage: 3.5,
          attackSpeed: 1,
          durability: 190,
          enchantability: 13,
          miningSpeed: 5,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 2,
          durability: 190,
          enchantability: 13,
          miningSpeed: 5,
        },
        spear: { attackDamage: 2, attackSpeed: 1.18, durability: 190, enchantability: 13 },
      },
      iron: {
        sword: { attackDamage: 6, attackSpeed: 1.6, durability: 250, enchantability: 14 },
        pickaxe: {
          attackDamage: 4,
          attackSpeed: 1.2,
          durability: 250,
          enchantability: 14,
          miningSpeed: 6,
        },
        axe: {
          attackDamage: 9,
          attackSpeed: 0.9,
          durability: 250,
          enchantability: 14,
          miningSpeed: 6,
        },
        shovel: {
          attackDamage: 4.5,
          attackSpeed: 1,
          durability: 250,
          enchantability: 14,
          miningSpeed: 6,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 3,
          durability: 250,
          enchantability: 14,
          miningSpeed: 6,
        },
        spear: { attackDamage: 3, attackSpeed: 1.05, durability: 250, enchantability: 14 },
      },
      golden: {
        sword: { attackDamage: 4, attackSpeed: 1.6, durability: 32, enchantability: 22 },
        pickaxe: {
          attackDamage: 2,
          attackSpeed: 1.2,
          durability: 32,
          enchantability: 22,
          miningSpeed: 12,
        },
        axe: {
          attackDamage: 7,
          attackSpeed: 1,
          durability: 32,
          enchantability: 22,
          miningSpeed: 12,
        },
        shovel: {
          attackDamage: 2.5,
          attackSpeed: 1,
          durability: 32,
          enchantability: 22,
          miningSpeed: 12,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 1,
          durability: 32,
          enchantability: 22,
          miningSpeed: 12,
        },
        spear: { attackDamage: 1, attackSpeed: 1.05, durability: 32, enchantability: 22 },
      },
      diamond: {
        sword: { attackDamage: 7, attackSpeed: 1.6, durability: 1561, enchantability: 10 },
        pickaxe: {
          attackDamage: 5,
          attackSpeed: 1.2,
          durability: 1561,
          enchantability: 10,
          miningSpeed: 8,
        },
        axe: {
          attackDamage: 9,
          attackSpeed: 1,
          durability: 1561,
          enchantability: 10,
          miningSpeed: 8,
        },
        shovel: {
          attackDamage: 5.5,
          attackSpeed: 1,
          durability: 1561,
          enchantability: 10,
          miningSpeed: 8,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 4,
          durability: 1561,
          enchantability: 10,
          miningSpeed: 8,
        },
        spear: { attackDamage: 4, attackSpeed: 0.95, durability: 1561, enchantability: 10 },
      },
      netherite: {
        sword: { attackDamage: 8, attackSpeed: 1.6, durability: 2031, enchantability: 15 },
        pickaxe: {
          attackDamage: 6,
          attackSpeed: 1.2,
          durability: 2031,
          enchantability: 15,
          miningSpeed: 9,
        },
        axe: {
          attackDamage: 10,
          attackSpeed: 1,
          durability: 2031,
          enchantability: 15,
          miningSpeed: 9,
        },
        shovel: {
          attackDamage: 6.5,
          attackSpeed: 1,
          durability: 2031,
          enchantability: 15,
          miningSpeed: 9,
        },
        hoe: {
          attackDamage: 1,
          attackSpeed: 4,
          durability: 2031,
          enchantability: 15,
          miningSpeed: 9,
        },
        spear: { attackDamage: 5, attackSpeed: 0.87, durability: 2031, enchantability: 15 },
      },
    },
    // dataPackComponents (ADR 0050): data components whose value names a data pack registry
    // entry, derived 2026-11-07 from this target's vendored vanilla-mcdoc; the targets tests
    // derive it again from the mcdoc and must agree. `block_transformer` added 2026-11-22: javap
    // shows `DataComponents.BLOCK_TRANSFORMER` is a `Holder<BlockTransformer>` of the data pack
    // registry `block_transformer`, which the tests' list of data pack registries had missed.
    dataPackComponents: [
      'banner_patterns',
      'block_transformer',
      'blocks_attacks',
      'cat/sound_variant',
      'cat/variant',
      'chicken/sound_variant',
      'chicken/variant',
      'cow/sound_variant',
      'cow/variant',
      'damage_resistant',
      'damage_type',
      'enchantments',
      'frog/variant',
      'instrument',
      'jukebox_playable',
      'painting/variant',
      'pig/sound_variant',
      'pig/variant',
      'provides_banner_patterns',
      'provides_pottery_pattern',
      'provides_trim_material',
      'stored_enchantments',
      'trim',
      'wolf/sound_variant',
      'wolf/variant',
      'zombie_nautilus/variant',
    ],
    // rangedPull: verified 2026-11-06 against mcmeta's 26.4-snapshot-7-assets assets/minecraft/items/bow.json
    // and crossbow.json.
    rangedPull: {
      usingItem: 'minecraft:using_item',
      bow: { useDuration: 'minecraft:use_duration', scale: 0.05, thresholds: [0.65, 0.9] },
      crossbow: {
        pull: 'minecraft:crossbow/pull',
        thresholds: [0.58, 1.0],
        chargeType: 'minecraft:charge_type',
        arrow: 'arrow',
        rocket: 'rocket',
      },
    },
  },
  // blocks (ADR 0067 D2, D9): the MSM names of the set types and wood types block families
  // take, identical on both targets. Verified 2026-11-14 with javap over the Loom-cached
  // 26.4-snapshot-7 merged jar: `wood` is the runtime's `BlockSetType.DEFAULT_WOOD` (26.4 has
  // no per-wood set types), every other name a `BlockSetType` or `WoodType` constant of the same name in upper case.
  blocks: {
    setTypes: [
      'wood',
      'cherry',
      'bamboo',
      'crimson',
      'warped',
      'iron',
      'copper',
      'gold',
      'stone',
      'polished_blackstone',
    ],
    woodTypes: [
      'oak',
      'spruce',
      'birch',
      'acacia',
      'cherry',
      'jungle',
      'dark_oak',
      'pale_oak',
      'poplar',
      'crimson',
      'warped',
      'mangrove',
      'bamboo',
    ],
    // containerSounds and machineRecipeTypes (ADR 0074 D7, ADR 0075 D7; plugin API 1.12.0): a
    // container block opens and closes with the barrel's sounds by default, and a machine may take
    // the four cooking recipe types (the `AbstractCookingRecipe` types of `RecipeType`). Verified
    // 2026-11-14: both sound ids are in the vendored `registries.json` `sound_event` list and the
    // four types in its `recipe_type` list (asserted by `all/test/targets.test.ts`); `RecipeType`
    // constants checked with javap over the Loom-cached 26.4-snapshot-7 merged jar.
    containerSounds: {
      open: 'minecraft:block.barrel.open',
      close: 'minecraft:block.barrel.close',
    },
    machineRecipeTypes: [
      'minecraft:smelting',
      'minecraft:blasting',
      'minecraft:smoking',
      'minecraft:campfire_cooking',
    ],
    // portal (ADR 0077 D7; plugin API 1.13.0): a portal block's default sounds and particle, the
    // Nether portal's own. Verified 2026-11-14: the three sound ids are in the vendored
    // `registries.json` `sound_event` list and `portal` in its `particle_type` list (asserted by
    // `test/target.test.ts` and `all/test/targets.test.ts`); javap over the Loom-cached 26.4-snapshot-7
    // merged jar: `SoundEvents.PORTAL_AMBIENT`, `PORTAL_TRAVEL`, `PORTAL_TRIGGER` register these
    // ids and `ParticleTypes.PORTAL` is a `SimpleParticleType` (no options) named `portal`.
    portal: {
      ambientSound: 'minecraft:block.portal.ambient',
      travelSound: 'minecraft:block.portal.travel',
      triggerSound: 'minecraft:block.portal.trigger',
      particle: 'minecraft:portal',
    },
    // bedRules, dyeColours, stemTags, modelTemplates, defaultTorchParticle (ADR 0094 D2, D10,
    // D12; plugin API 1.17.0). Verified 2026-11-15 against the vendored data of this target:
    // both bed rule ids are in `registries.json` `environment_attribute`; the dye colours are
    // the values of the vendored mcdoc enum `::java::util::color::DyeColor` in its order; both
    // stem tags are in `registries.json` `tag/block` (vanilla's melon stem's, B440: the
    // pumpkin stem's `supports_pumpkin_stem` and `supports_pumpkin_stem_fruit` are there too);
    // `flame` is in `particle_type` (all asserted by `test/target.test.ts`). The model ids are
    // the parents the twenty block type lowerings name (ADR 0094 D10; the sign templates from
    // B440; the plant and pot types of ADR 0103 added 19 by name only at B515), each a
    // `assets/minecraft/models/block/<name>.json` of the 26.4-snapshot-7 client jar
    // (`test/model-templates.test.ts` reads the Loom-cached jar when present).
    bedRules: {
      bed: 'minecraft:gameplay/bed_rule',
      straw_bed: 'minecraft:gameplay/straw_bed_rule',
    },
    dyeColours: [
      'white',
      'orange',
      'magenta',
      'light_blue',
      'yellow',
      'lime',
      'pink',
      'gray',
      'light_gray',
      'cyan',
      'purple',
      'blue',
      'brown',
      'green',
      'red',
      'black',
    ],
    stemTags: {
      soil: 'minecraft:supports_melon_stem',
      fruitSoil: 'minecraft:supports_melon_stem_fruit',
    },
    modelTemplates: [
      // bed
      'minecraft:block/template_bed_head',
      'minecraft:block/template_bed_foot',
      // cake
      'minecraft:block/cake',
      'minecraft:block/cake_slice1',
      'minecraft:block/cake_slice2',
      'minecraft:block/cake_slice3',
      'minecraft:block/cake_slice4',
      'minecraft:block/cake_slice5',
      'minecraft:block/cake_slice6',
      // berry_bush, tall_plant
      'minecraft:block/cross',
      // ladder
      'minecraft:block/ladder',
      // torch
      'minecraft:block/template_torch',
      'minecraft:block/template_torch_wall',
      // lantern
      'minecraft:block/template_lantern',
      'minecraft:block/template_hanging_lantern',
      // chain
      'minecraft:block/template_chain',
      // sign
      'minecraft:block/template_sign_rot_0',
      'minecraft:block/template_sign_rot_1',
      'minecraft:block/template_sign_rot_2',
      'minecraft:block/template_sign_rot_3',
      'minecraft:block/template_wall_sign',
      // hanging_sign
      'minecraft:block/template_hanging_sign_rot_0',
      'minecraft:block/template_hanging_sign_rot_1',
      'minecraft:block/template_hanging_sign_rot_2',
      'minecraft:block/template_hanging_sign_rot_3',
      'minecraft:block/template_attached_hanging_sign_rot_0',
      'minecraft:block/template_attached_hanging_sign_rot_1',
      'minecraft:block/template_attached_hanging_sign_rot_2',
      'minecraft:block/template_attached_hanging_sign_rot_3',
      'minecraft:block/template_wall_hanging_sign',
      // potted_plant
      'minecraft:block/flower_pot_cross',
      // candle
      'minecraft:block/template_candle',
      'minecraft:block/template_two_candles',
      'minecraft:block/template_three_candles',
      'minecraft:block/template_four_candles',
      // sea_pickle
      'minecraft:block/sea_pickle',
      'minecraft:block/two_sea_pickles',
      'minecraft:block/three_sea_pickles',
      'minecraft:block/four_sea_pickles',
      'minecraft:block/dead_sea_pickle',
      'minecraft:block/two_dead_sea_pickles',
      'minecraft:block/three_dead_sea_pickles',
      'minecraft:block/four_dead_sea_pickles',
      // vine
      'minecraft:block/vine',
      // carpet
      'minecraft:block/carpet',
      // layers
      'minecraft:block/snow_height2',
      'minecraft:block/snow_height4',
      'minecraft:block/snow_height6',
      'minecraft:block/snow_height8',
      'minecraft:block/snow_height10',
      'minecraft:block/snow_height12',
      'minecraft:block/snow_height14',
      // layers: eight layers are a full block, as vanilla's snow block (B447)
      'minecraft:block/cube_all',
      // rod
      'minecraft:block/end_rod',
      // stem
      'minecraft:block/stem_growth0',
      'minecraft:block/stem_growth1',
      'minecraft:block/stem_growth2',
      'minecraft:block/stem_growth3',
      'minecraft:block/stem_growth4',
      'minecraft:block/stem_growth5',
      'minecraft:block/stem_growth6',
      'minecraft:block/stem_growth7',
      'minecraft:block/stem_fruit',
      // cocoa
      'minecraft:block/cocoa_stage0',
      'minecraft:block/cocoa_stage1',
      'minecraft:block/cocoa_stage2',
      // scaffolding
      'minecraft:block/scaffolding_stable',
      'minecraft:block/scaffolding_unstable',
      // flower_pot (ADR 0103 D2; B512)
      'minecraft:block/flower_pot',
      // column_plant: cactus, bamboo stalks by thickness and age, bamboo leaves (ADR 0103 D1; B511)
      'minecraft:block/cactus',
      'minecraft:block/bamboo1_age0',
      'minecraft:block/bamboo1_age1',
      'minecraft:block/bamboo2_age0',
      'minecraft:block/bamboo2_age1',
      'minecraft:block/bamboo3_age0',
      'minecraft:block/bamboo3_age1',
      'minecraft:block/bamboo4_age0',
      'minecraft:block/bamboo4_age1',
      'minecraft:block/bamboo_small_leaves',
      'minecraft:block/bamboo_large_leaves',
      // multiface
      'minecraft:block/glow_lichen',
      // dripleaf
      'minecraft:block/big_dripleaf',
      'minecraft:block/big_dripleaf_partial_tilt',
      'minecraft:block/big_dripleaf_full_tilt',
      'minecraft:block/big_dripleaf_stem',
      'minecraft:block/small_dripleaf_top',
      'minecraft:block/small_dripleaf_bottom',
    ],
    defaultTorchParticle: 'minecraft:flame',
    // fluidModel, fluidTags (ADR 0099 D4; plugin API 1.18.0): 26.4 registers a liquid as one fluid
    // (the vendored `registries.json` `fluid` list is `empty`, `lava`, `water`); the tags are the
    // vendored `tag/fluid` names a water-like or lava-like project fluid joins, with `swimmable` (the
    // swimming pose follows it on 26.4; B470). Verified 2026-11-15 against the vendored registries and
    // the Loom-cached 26.4-snapshot-7 client jar's fluid tags (`all/test/targets.test.ts`,
    // `all/test/villagers.test.ts`).
    fluidModel: 'one_fluid',
    fluidTags: {
      water: ['minecraft:water', 'minecraft:swimmable'],
      lava: ['minecraft:lava'],
    },
    // soundTypes, soundModel (ADR 0105 D1, D5, as amended after B503; plugin API 1.19.0): 26.4 has
    // no `SoundType` class (javap over the Loom-cached merged jar, 2026-11-22; checked by
    // `all/test/block-facts.test.ts` when the jar is present); a block names an entry of the
    // `block_sound_set` world registry (synchronised, read when a world loads; B503 X10). The names
    // are the 137 ids of the vendored `registries.json` `block_sound_set` list (B503 counted 138
    // entries in the running game: these and its own test entry).
    soundModel: 'block_sound_set',
    soundTypes: [
      'amethyst_block',
      'amethyst_cluster',
      'ancient_debris',
      'anvil',
      'azalea',
      'azalea_leaves',
      'bamboo',
      'bamboo_sapling',
      'bamboo_wood',
      'bamboo_wood_hanging_sign',
      'basalt',
      'big_dripleaf',
      'blue_ice',
      'bone_block',
      'brittle_ice',
      'cactus_flower',
      'calcite',
      'candle',
      'cave_vines',
      'chain',
      'cherry_leaves',
      'cherry_sapling',
      'cherry_wood',
      'cherry_wood_hanging_sign',
      'chiseled_bookshelf',
      'chiseled_soulshale',
      'cinnabar',
      'cobweb',
      'copper',
      'copper_bulb',
      'copper_golem_statue',
      'copper_grate',
      'coral_block',
      'creaking_heart',
      'crop',
      'decorated_pot',
      'decorated_pot_cracked',
      'deepslate',
      'deepslate_bricks',
      'deepslate_tiles',
      'dried_ghast',
      'dripstone_block',
      'flowering_azalea',
      'froglight',
      'frogspawn',
      'frosted_ice',
      'fungus',
      'gilded_blackstone',
      'glass',
      'glow_lichen',
      'grass',
      'gravel',
      'hanging_roots',
      'hanging_sign',
      'hard_crop',
      'heavy_core',
      'honey_block',
      'ice',
      'ice_crystal',
      'icicle',
      'iron',
      'ladder',
      'lantern',
      'large_amethyst_bud',
      'leaf_litter',
      'lily_pad',
      'lodestone',
      'mangrove_roots',
      'medium_amethyst_bud',
      'metal',
      'moss',
      'moss_carpet',
      'mud',
      'mud_bricks',
      'muddy_mangrove_roots',
      'nether_bricks',
      'nether_gold_ore',
      'nether_ore',
      'nether_sprouts',
      'nether_wart',
      'nether_wood',
      'nether_wood_hanging_sign',
      'netherite_block',
      'netherrack',
      'nylium',
      'packed_ice',
      'packed_mud',
      'pink_petals',
      'pointed_dripstone',
      'polished_deepslate',
      'polished_tuff',
      'poplar_leaves',
      'potent_sulfur',
      'powder_snow',
      'red_shrub',
      'resin',
      'resin_bricks',
      'rooted_dirt',
      'roots',
      'sand',
      'scaffolding',
      'sculk',
      'sculk_catalyst',
      'sculk_sensor',
      'sculk_shrieker',
      'sculk_vein',
      'shelf',
      'shelf_mushroom',
      'shroomlight',
      'slime_block',
      'small_amethyst_bud',
      'small_dripleaf',
      'snow',
      'soul_sand',
      'soul_soil',
      'spawner',
      'sponge',
      'spore_blossom',
      'stem',
      'stone',
      'straw_bed',
      'sulfur',
      'sulfur_spike',
      'suspicious_gravel',
      'suspicious_sand',
      'sweet_berry_bush',
      'trial_spawner',
      'tuff',
      'tuff_bricks',
      'vault',
      'vine',
      'wart_block',
      'weeping_vines',
      'wet_grass',
      'wet_sponge',
      'wood',
      'wool',
    ],
    // soundSetEvents (ADR 0105 D1, D5; plugin API 1.19.0): the events, volume and pitch of each of the
    // 137 sets, from the 26.4-snapshot-7 client jar's `data/minecraft/block_sound_set/*.json`
    // (`./sound-sets.ts`); lowering fills a block's own entry from its `sound_type`'s set.
    soundSetEvents,
    // vanillaPairs (ADR 0105 D4, D5; plugin API 1.19.0): strip, flatten and till are the rules of the
    // 26.4-snapshot-7 server jar's `data/minecraft/block_transformer/{axe,shovel,hoe}.json` (the shovel's and
    // hoe's block tags `turns_into_dirt_path` and `turns_into_farmland` expanded); wax and age are the
    // reverse of the axe's wax-off and scrape rules there, and equal the game's own `HoneycombItem.WAXABLES`
    // and `WeatheringCopper.NEXT_BY_BLOCK` maps as read by calling them (2026-11-22). Checked by
    // `all/test/block-facts.test.ts` against the Loom-cached jar when present.
    vanillaPairs: {
      strip: {
        'minecraft:acacia_log': 'minecraft:stripped_acacia_log',
        'minecraft:acacia_wood': 'minecraft:stripped_acacia_wood',
        'minecraft:bamboo_block': 'minecraft:stripped_bamboo_block',
        'minecraft:birch_log': 'minecraft:stripped_birch_log',
        'minecraft:birch_wood': 'minecraft:stripped_birch_wood',
        'minecraft:cherry_log': 'minecraft:stripped_cherry_log',
        'minecraft:cherry_wood': 'minecraft:stripped_cherry_wood',
        'minecraft:crimson_hyphae': 'minecraft:stripped_crimson_hyphae',
        'minecraft:crimson_stem': 'minecraft:stripped_crimson_stem',
        'minecraft:dark_oak_log': 'minecraft:stripped_dark_oak_log',
        'minecraft:dark_oak_wood': 'minecraft:stripped_dark_oak_wood',
        'minecraft:jungle_log': 'minecraft:stripped_jungle_log',
        'minecraft:jungle_wood': 'minecraft:stripped_jungle_wood',
        'minecraft:mangrove_log': 'minecraft:stripped_mangrove_log',
        'minecraft:mangrove_wood': 'minecraft:stripped_mangrove_wood',
        'minecraft:oak_log': 'minecraft:stripped_oak_log',
        'minecraft:oak_wood': 'minecraft:stripped_oak_wood',
        'minecraft:pale_oak_log': 'minecraft:stripped_pale_oak_log',
        'minecraft:pale_oak_wood': 'minecraft:stripped_pale_oak_wood',
        'minecraft:poplar_log': 'minecraft:stripped_poplar_log',
        'minecraft:poplar_wood': 'minecraft:stripped_poplar_wood',
        'minecraft:spruce_log': 'minecraft:stripped_spruce_log',
        'minecraft:spruce_wood': 'minecraft:stripped_spruce_wood',
        'minecraft:warped_hyphae': 'minecraft:stripped_warped_hyphae',
        'minecraft:warped_stem': 'minecraft:stripped_warped_stem',
      },
      flatten: {
        'minecraft:coarse_dirt': 'minecraft:dirt_path',
        'minecraft:dirt': 'minecraft:dirt_path',
        'minecraft:grass_block': 'minecraft:dirt_path',
        'minecraft:mycelium': 'minecraft:dirt_path',
        'minecraft:podzol': 'minecraft:dirt_path',
        'minecraft:rooted_dirt': 'minecraft:dirt_path',
      },
      till: {
        'minecraft:coarse_dirt': 'minecraft:dirt',
        'minecraft:dirt': 'minecraft:farmland',
        'minecraft:dirt_path': 'minecraft:farmland',
        'minecraft:grass_block': 'minecraft:farmland',
        'minecraft:rooted_dirt': 'minecraft:dirt',
      },
      wax: {
        'minecraft:chiseled_copper': 'minecraft:waxed_chiseled_copper',
        'minecraft:copper_bars': 'minecraft:waxed_copper_bars',
        'minecraft:copper_block': 'minecraft:waxed_copper_block',
        'minecraft:copper_bulb': 'minecraft:waxed_copper_bulb',
        'minecraft:copper_chain': 'minecraft:waxed_copper_chain',
        'minecraft:copper_chest': 'minecraft:waxed_copper_chest',
        'minecraft:copper_door': 'minecraft:waxed_copper_door',
        'minecraft:copper_golem_statue': 'minecraft:waxed_copper_golem_statue',
        'minecraft:copper_grate': 'minecraft:waxed_copper_grate',
        'minecraft:copper_lantern': 'minecraft:waxed_copper_lantern',
        'minecraft:copper_trapdoor': 'minecraft:waxed_copper_trapdoor',
        'minecraft:cut_copper': 'minecraft:waxed_cut_copper',
        'minecraft:cut_copper_slab': 'minecraft:waxed_cut_copper_slab',
        'minecraft:cut_copper_stairs': 'minecraft:waxed_cut_copper_stairs',
        'minecraft:exposed_chiseled_copper': 'minecraft:waxed_exposed_chiseled_copper',
        'minecraft:exposed_copper': 'minecraft:waxed_exposed_copper',
        'minecraft:exposed_copper_bars': 'minecraft:waxed_exposed_copper_bars',
        'minecraft:exposed_copper_bulb': 'minecraft:waxed_exposed_copper_bulb',
        'minecraft:exposed_copper_chain': 'minecraft:waxed_exposed_copper_chain',
        'minecraft:exposed_copper_chest': 'minecraft:waxed_exposed_copper_chest',
        'minecraft:exposed_copper_door': 'minecraft:waxed_exposed_copper_door',
        'minecraft:exposed_copper_golem_statue': 'minecraft:waxed_exposed_copper_golem_statue',
        'minecraft:exposed_copper_grate': 'minecraft:waxed_exposed_copper_grate',
        'minecraft:exposed_copper_lantern': 'minecraft:waxed_exposed_copper_lantern',
        'minecraft:exposed_copper_trapdoor': 'minecraft:waxed_exposed_copper_trapdoor',
        'minecraft:exposed_cut_copper': 'minecraft:waxed_exposed_cut_copper',
        'minecraft:exposed_cut_copper_slab': 'minecraft:waxed_exposed_cut_copper_slab',
        'minecraft:exposed_cut_copper_stairs': 'minecraft:waxed_exposed_cut_copper_stairs',
        'minecraft:exposed_lightning_rod': 'minecraft:waxed_exposed_lightning_rod',
        'minecraft:lightning_rod': 'minecraft:waxed_lightning_rod',
        'minecraft:oxidized_chiseled_copper': 'minecraft:waxed_oxidized_chiseled_copper',
        'minecraft:oxidized_copper': 'minecraft:waxed_oxidized_copper',
        'minecraft:oxidized_copper_bars': 'minecraft:waxed_oxidized_copper_bars',
        'minecraft:oxidized_copper_bulb': 'minecraft:waxed_oxidized_copper_bulb',
        'minecraft:oxidized_copper_chain': 'minecraft:waxed_oxidized_copper_chain',
        'minecraft:oxidized_copper_chest': 'minecraft:waxed_oxidized_copper_chest',
        'minecraft:oxidized_copper_door': 'minecraft:waxed_oxidized_copper_door',
        'minecraft:oxidized_copper_golem_statue': 'minecraft:waxed_oxidized_copper_golem_statue',
        'minecraft:oxidized_copper_grate': 'minecraft:waxed_oxidized_copper_grate',
        'minecraft:oxidized_copper_lantern': 'minecraft:waxed_oxidized_copper_lantern',
        'minecraft:oxidized_copper_trapdoor': 'minecraft:waxed_oxidized_copper_trapdoor',
        'minecraft:oxidized_cut_copper': 'minecraft:waxed_oxidized_cut_copper',
        'minecraft:oxidized_cut_copper_slab': 'minecraft:waxed_oxidized_cut_copper_slab',
        'minecraft:oxidized_cut_copper_stairs': 'minecraft:waxed_oxidized_cut_copper_stairs',
        'minecraft:oxidized_lightning_rod': 'minecraft:waxed_oxidized_lightning_rod',
        'minecraft:weathered_chiseled_copper': 'minecraft:waxed_weathered_chiseled_copper',
        'minecraft:weathered_copper': 'minecraft:waxed_weathered_copper',
        'minecraft:weathered_copper_bars': 'minecraft:waxed_weathered_copper_bars',
        'minecraft:weathered_copper_bulb': 'minecraft:waxed_weathered_copper_bulb',
        'minecraft:weathered_copper_chain': 'minecraft:waxed_weathered_copper_chain',
        'minecraft:weathered_copper_chest': 'minecraft:waxed_weathered_copper_chest',
        'minecraft:weathered_copper_door': 'minecraft:waxed_weathered_copper_door',
        'minecraft:weathered_copper_golem_statue': 'minecraft:waxed_weathered_copper_golem_statue',
        'minecraft:weathered_copper_grate': 'minecraft:waxed_weathered_copper_grate',
        'minecraft:weathered_copper_lantern': 'minecraft:waxed_weathered_copper_lantern',
        'minecraft:weathered_copper_trapdoor': 'minecraft:waxed_weathered_copper_trapdoor',
        'minecraft:weathered_cut_copper': 'minecraft:waxed_weathered_cut_copper',
        'minecraft:weathered_cut_copper_slab': 'minecraft:waxed_weathered_cut_copper_slab',
        'minecraft:weathered_cut_copper_stairs': 'minecraft:waxed_weathered_cut_copper_stairs',
        'minecraft:weathered_lightning_rod': 'minecraft:waxed_weathered_lightning_rod',
      },
      age: {
        'minecraft:chiseled_copper': 'minecraft:exposed_chiseled_copper',
        'minecraft:copper_bars': 'minecraft:exposed_copper_bars',
        'minecraft:copper_block': 'minecraft:exposed_copper',
        'minecraft:copper_bulb': 'minecraft:exposed_copper_bulb',
        'minecraft:copper_chain': 'minecraft:exposed_copper_chain',
        'minecraft:copper_chest': 'minecraft:exposed_copper_chest',
        'minecraft:copper_door': 'minecraft:exposed_copper_door',
        'minecraft:copper_golem_statue': 'minecraft:exposed_copper_golem_statue',
        'minecraft:copper_grate': 'minecraft:exposed_copper_grate',
        'minecraft:copper_lantern': 'minecraft:exposed_copper_lantern',
        'minecraft:copper_trapdoor': 'minecraft:exposed_copper_trapdoor',
        'minecraft:cut_copper': 'minecraft:exposed_cut_copper',
        'minecraft:cut_copper_slab': 'minecraft:exposed_cut_copper_slab',
        'minecraft:cut_copper_stairs': 'minecraft:exposed_cut_copper_stairs',
        'minecraft:exposed_chiseled_copper': 'minecraft:weathered_chiseled_copper',
        'minecraft:exposed_copper': 'minecraft:weathered_copper',
        'minecraft:exposed_copper_bars': 'minecraft:weathered_copper_bars',
        'minecraft:exposed_copper_bulb': 'minecraft:weathered_copper_bulb',
        'minecraft:exposed_copper_chain': 'minecraft:weathered_copper_chain',
        'minecraft:exposed_copper_chest': 'minecraft:weathered_copper_chest',
        'minecraft:exposed_copper_door': 'minecraft:weathered_copper_door',
        'minecraft:exposed_copper_golem_statue': 'minecraft:weathered_copper_golem_statue',
        'minecraft:exposed_copper_grate': 'minecraft:weathered_copper_grate',
        'minecraft:exposed_copper_lantern': 'minecraft:weathered_copper_lantern',
        'minecraft:exposed_copper_trapdoor': 'minecraft:weathered_copper_trapdoor',
        'minecraft:exposed_cut_copper': 'minecraft:weathered_cut_copper',
        'minecraft:exposed_cut_copper_slab': 'minecraft:weathered_cut_copper_slab',
        'minecraft:exposed_cut_copper_stairs': 'minecraft:weathered_cut_copper_stairs',
        'minecraft:exposed_lightning_rod': 'minecraft:weathered_lightning_rod',
        'minecraft:lightning_rod': 'minecraft:exposed_lightning_rod',
        'minecraft:weathered_chiseled_copper': 'minecraft:oxidized_chiseled_copper',
        'minecraft:weathered_copper': 'minecraft:oxidized_copper',
        'minecraft:weathered_copper_bars': 'minecraft:oxidized_copper_bars',
        'minecraft:weathered_copper_bulb': 'minecraft:oxidized_copper_bulb',
        'minecraft:weathered_copper_chain': 'minecraft:oxidized_copper_chain',
        'minecraft:weathered_copper_chest': 'minecraft:oxidized_copper_chest',
        'minecraft:weathered_copper_door': 'minecraft:oxidized_copper_door',
        'minecraft:weathered_copper_golem_statue': 'minecraft:oxidized_copper_golem_statue',
        'minecraft:weathered_copper_grate': 'minecraft:oxidized_copper_grate',
        'minecraft:weathered_copper_lantern': 'minecraft:oxidized_copper_lantern',
        'minecraft:weathered_copper_trapdoor': 'minecraft:oxidized_copper_trapdoor',
        'minecraft:weathered_cut_copper': 'minecraft:oxidized_cut_copper',
        'minecraft:weathered_cut_copper_slab': 'minecraft:oxidized_cut_copper_slab',
        'minecraft:weathered_cut_copper_stairs': 'minecraft:oxidized_cut_copper_stairs',
        'minecraft:weathered_lightning_rod': 'minecraft:oxidized_lightning_rod',
      },
    },
    // plantSoils (ADR 0103 D5, as amended after B503; plugin API 1.19.0): the block tags vanilla's
    // plants read. B503 (2026-11-22) saw sugar cane, cactus, bamboo and both dripleaves survive on a
    // block only through these tags, and cane's water check accept `supports_sugar_cane_adjacently`;
    // `cannot_support_kelp`, `support_override_cactus_flower` and `cave_vines` are read from the jar's
    // tags only (not observed in game). Every tag is in the vendored `registries.json` `tag/block`.
    plantSoils: {
      cane: 'minecraft:supports_sugar_cane',
      caneWater: 'minecraft:supports_sugar_cane_adjacently',
      cactus: 'minecraft:supports_cactus',
      cactusFlower: 'minecraft:support_override_cactus_flower',
      bamboo: 'minecraft:supports_bamboo',
      bigDripleaf: 'minecraft:supports_big_dripleaf',
      smallDripleaf: 'minecraft:supports_small_dripleaf',
      notKelp: 'minecraft:cannot_support_kelp',
      caveVines: 'minecraft:cave_vines',
    },
    // cauldrons (ADR 0108 D6; plugin API 1.20.0): every vendored `registries.json` `block` id
    // with `cauldron` in it, sorted: the empty cauldron and vanilla's three filled ones.
    cauldrons: [
      'minecraft:cauldron',
      'minecraft:lava_cauldron',
      'minecraft:powder_snow_cauldron',
      'minecraft:water_cauldron',
    ],
  },
  // entities (ADR 0070 D7, ADR 0071 D4): the vanilla items a ranged mob may fire and the tag the
  // vanilla saddle equips. Verified 2026-11-14 with javap over the Loom-cached 26.4-snapshot-7
  // merged jar: each id is registered in `Items` with a `ProjectileItem` class (`ArrowItem`,
  // `TippedArrowItem`, `SpectralArrowItem`, `SnowballItem`, `EggItem`, `ExperienceBottleItem`,
  // `FireChargeItem`, `FireworkRocketItem`, `SplashPotionItem`, `LingeringPotionItem`,
  // `TridentItem`, `WindChargeItem`, `IceBallItem`); every id is in the vendored `registries.json`
  // `item` list and `can_equip_saddle` in its `tag/entity_type` list (asserted by
  // `all/test/targets.test.ts`).
  entities: {
    projectileItems: [
      'minecraft:arrow',
      'minecraft:tipped_arrow',
      'minecraft:spectral_arrow',
      'minecraft:snowball',
      'minecraft:egg',
      'minecraft:blue_egg',
      'minecraft:brown_egg',
      'minecraft:experience_bottle',
      'minecraft:fire_charge',
      'minecraft:firework_rocket',
      'minecraft:splash_potion',
      'minecraft:lingering_potion',
      'minecraft:trident',
      'minecraft:wind_charge',
      'minecraft:ice_ball',
    ],
    saddleTag: 'minecraft:can_equip_saddle',
    // tradeSounds, vanillaJobSites, vanillaTradeSets (ADR 0098 D1, D2, D5; plugin API 1.18.0).
    // tradeSounds: vanilla villager sound events, each in the vendored `registries.json`
    // `sound_event` list. vanillaJobSites: one entry per vendored `point_of_interest_type` id, its
    // blocks the vanilla blocks of that kind (beds from the jar's `#minecraft:beds` plus
    // `straw_bed`, cauldrons from `#minecraft:cauldrons`, rods from `#minecraft:lightning_rods`);
    // which states each point of interest type holds is the game's code and was not read: the
    // block lists, `straw_bed` in `home` above all, are (verify at implementation) in a GameTest
    // with `PoiTypes.hasPoi`. vanillaTradeSets: every vendored `trade_set` id with the number of
    // distinct trades its trade tags resolve to and how many carry a `merchant_predicate` on
    // `minecraft:villager/variant`, counted 2026-11-15 from the Loom-cached 26.4-snapshot-7 client
    // jar's
    // `data/minecraft/trade_set`, `villager_trade` and `tags/villager_trade` (default data pack,
    // no experiments; `all/test/villagers.test.ts` recounts them when the jar is cached).
    tradeSounds: {
      yes: 'minecraft:entity.villager.yes',
      no: 'minecraft:entity.villager.no',
      trading: 'minecraft:entity.villager.trade',
    },
    vanillaJobSites: {
      'minecraft:armorer': ['minecraft:blast_furnace'],
      'minecraft:bee_nest': ['minecraft:bee_nest'],
      'minecraft:beehive': ['minecraft:beehive'],
      'minecraft:butcher': ['minecraft:smoker'],
      'minecraft:cartographer': ['minecraft:cartography_table'],
      'minecraft:cleric': ['minecraft:brewing_stand'],
      'minecraft:farmer': ['minecraft:composter'],
      'minecraft:fisherman': ['minecraft:barrel'],
      'minecraft:fletcher': ['minecraft:fletching_table'],
      'minecraft:home': [
        'minecraft:white_bed',
        'minecraft:orange_bed',
        'minecraft:magenta_bed',
        'minecraft:light_blue_bed',
        'minecraft:yellow_bed',
        'minecraft:lime_bed',
        'minecraft:pink_bed',
        'minecraft:gray_bed',
        'minecraft:light_gray_bed',
        'minecraft:cyan_bed',
        'minecraft:purple_bed',
        'minecraft:blue_bed',
        'minecraft:brown_bed',
        'minecraft:green_bed',
        'minecraft:red_bed',
        'minecraft:black_bed',
        'minecraft:straw_bed',
      ],
      'minecraft:leatherworker': [
        'minecraft:cauldron',
        'minecraft:water_cauldron',
        'minecraft:lava_cauldron',
        'minecraft:powder_snow_cauldron',
      ],
      'minecraft:librarian': ['minecraft:lectern'],
      'minecraft:lightning_rod': [
        'minecraft:lightning_rod',
        'minecraft:exposed_lightning_rod',
        'minecraft:weathered_lightning_rod',
        'minecraft:oxidized_lightning_rod',
        'minecraft:waxed_lightning_rod',
        'minecraft:waxed_exposed_lightning_rod',
        'minecraft:waxed_weathered_lightning_rod',
        'minecraft:waxed_oxidized_lightning_rod',
      ],
      'minecraft:lodestone': ['minecraft:lodestone'],
      'minecraft:mason': ['minecraft:stonecutter'],
      'minecraft:meeting': ['minecraft:bell'],
      'minecraft:nether_portal': ['minecraft:nether_portal'],
      'minecraft:shepherd': ['minecraft:loom'],
      'minecraft:test_instance': ['minecraft:test_instance_block'],
      'minecraft:toolsmith': ['minecraft:smithing_table'],
      'minecraft:weaponsmith': ['minecraft:grindstone'],
    },
    vanillaTradeSets: {
      'minecraft:armorer/level_1': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:armorer/level_2': { trades: 4, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:armorer/level_3': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:armorer/level_4': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:armorer/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:butcher/level_1': { trades: 4, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:butcher/level_2': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:butcher/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:butcher/level_4': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:butcher/level_5': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cartographer/level_1': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cartographer/level_2': { trades: 8, villagerOnlyTrades: 7, villagerOnly: true },
      'minecraft:cartographer/level_3': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cartographer/level_4': { trades: 16, villagerOnlyTrades: 15, villagerOnly: true },
      'minecraft:cartographer/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cleric/level_1': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cleric/level_2': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cleric/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cleric/level_4': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:cleric/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:farmer/level_1': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:farmer/level_2': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:farmer/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:farmer/level_4': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:farmer/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fisherman/level_1': { trades: 4, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fisherman/level_2': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fisherman/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fisherman/level_4': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fisherman/level_5': { trades: 6, villagerOnlyTrades: 5, villagerOnly: true },
      'minecraft:fletcher/level_1': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fletcher/level_2': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fletcher/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fletcher/level_4': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:fletcher/level_5': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:leatherworker/level_1': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:leatherworker/level_2': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:leatherworker/level_3': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:leatherworker/level_4': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:leatherworker/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:librarian/level_1': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:librarian/level_2': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:librarian/level_3': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:librarian/level_4': { trades: 4, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:librarian/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:mason/level_1': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:mason/level_2': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:mason/level_3': { trades: 7, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:mason/level_4': { trades: 33, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:mason/level_5': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:shepherd/level_1': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:shepherd/level_2': { trades: 37, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:shepherd/level_3': { trades: 21, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:shepherd/level_4': { trades: 22, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:shepherd/level_5': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:toolsmith/level_1': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:toolsmith/level_2': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:toolsmith/level_3': { trades: 5, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:toolsmith/level_4': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:toolsmith/level_5': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:wandering_trader/buying': {
        trades: 6,
        villagerOnlyTrades: 0,
        villagerOnly: false,
      },
      'minecraft:wandering_trader/common': {
        trades: 80,
        villagerOnlyTrades: 0,
        villagerOnly: false,
      },
      'minecraft:wandering_trader/uncommon': {
        trades: 16,
        villagerOnlyTrades: 0,
        villagerOnly: false,
      },
      'minecraft:weaponsmith/level_1': { trades: 3, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:weaponsmith/level_2': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:weaponsmith/level_3': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:weaponsmith/level_4': { trades: 2, villagerOnlyTrades: 0, villagerOnly: false },
      'minecraft:weaponsmith/level_5': { trades: 1, villagerOnlyTrades: 0, villagerOnly: false },
    },
    // villagerTypes (ADR 0107 D6; plugin API 1.20.0): the vendored `registries.json`
    // `villager_type` list, sorted; B524 registered a project type beside them on both versions.
    villagerTypes: ['desert', 'jungle', 'plains', 'savanna', 'snow', 'swamp', 'taiga'],
  },
  // particles (ADR 0080 D9; plugin API 1.14.0): the vanilla particle types that take options,
  // and the resource pack folders of particle descriptions and pictures. Verified 2026-11-14: the
  // list equals the keys of the vendored vanilla-mcdoc `minecraft:particle` dispatcher available
  // in this version (`%`-keys left out) and every id is in the vendored `registries.json`
  // `particle_type` list (asserted by `test/target.test.ts` and `all/test/targets.test.ts`); javap
  // over the Loom-cached 26.4-snapshot-7 merged jar: these are exactly the 22 `ParticleTypes` fields that are
  // not a `SimpleParticleType`. The jar's assets hold the descriptions in
  // `assets/minecraft/particles/*.json` and the pictures in `assets/minecraft/textures/particle/`
  // (`atlases/particles.json`: one `minecraft:directory` source `particle`).
  particles: {
    withOptions: [
      'minecraft:block',
      'minecraft:block_crumble',
      'minecraft:block_marker',
      'minecraft:dragon_breath',
      'minecraft:dust',
      'minecraft:dust_color_transition',
      'minecraft:dust_pillar',
      'minecraft:effect',
      'minecraft:entity_effect',
      'minecraft:falling_dust',
      'minecraft:flash',
      'minecraft:geyser',
      'minecraft:geyser_base',
      'minecraft:geyser_plume',
      'minecraft:geyser_poof',
      'minecraft:instant_effect',
      'minecraft:item',
      'minecraft:sculk_charge',
      'minecraft:shriek',
      'minecraft:tinted_leaves',
      'minecraft:trail',
      'minecraft:vibration',
    ],
    descriptionFolder: 'particles',
    textureFolder: 'particle',
  },
  // dev (ADR 0084 D10; plugin API 1.15.0): the test world's game rules and the data folders read
  // only when a world loads. Verified 2026-11-14: the four game rule ids are in the vendored
  // `registries.json` `game_rule` list and are literals of the vendored `commands.json` `gamerule`
  // node (asserted by `test/target.test.ts` and `all/test/targets.test.ts`). The world data
  // folders are the registries of `RegistryDataLoader.WORLD_REGISTRIES` and
  // `DIMENSION_REGISTRIES` (`dimension`) in the Loom-cached 26.4-snapshot-7 merged jar (javap of their static
  // initialiser, names from `core.registries.Registries`), 53 in all (26.4 adds `block_sound_set`); every one is in
  // the vendored `registries.json`. `RELOADABLE_REGISTRIES` (loot tables, predicates, item
  // modifiers, advancements, recipes and the like), functions and tags are left out: `/reload`
  // reads them.
  dev: {
    gameRules: {
      advanceTime: 'advance_time',
      advanceWeather: 'advance_weather',
      spawnMobs: 'spawn_mobs',
      keepInventory: 'keep_inventory',
    },
    worldDataFolders: [
      'banner_pattern',
      'block_sound_set',
      'block_transformer',
      'cat_sound_variant',
      'cat_variant',
      'chat_type',
      'chicken_sound_variant',
      'chicken_variant',
      'cow_sound_variant',
      'cow_variant',
      'damage_type',
      'decorated_pot_pattern',
      'dialog',
      'dimension',
      'dimension_type',
      'enchantment',
      'enchantment_provider',
      'frog_variant',
      'instrument',
      'jukebox_song',
      'painting_variant',
      'pig_sound_variant',
      'pig_variant',
      'sulfur_cube_archetype',
      'test_environment',
      'test_instance',
      'timeline',
      'trade_set',
      'trial_spawner',
      'trim_material',
      'trim_pattern',
      'villager_trade',
      'wolf_sound_variant',
      'wolf_variant',
      'world_clock',
      'worldgen/biome',
      'worldgen/block_state_provider',
      'worldgen/carver',
      'worldgen/density_function',
      'worldgen/feature',
      'worldgen/flat_level_generator_preset',
      'worldgen/material_condition',
      'worldgen/material_rule',
      'worldgen/multi_noise_biome_source_parameter_list',
      'worldgen/noise',
      'worldgen/noise_settings',
      'worldgen/placed_feature',
      'worldgen/processor_list',
      'worldgen/structure',
      'worldgen/structure_set',
      'worldgen/template_pool',
      'worldgen/world_preset',
      'zombie_nautilus_variant',
    ],
  },
  // controls (ADR 0088 D9; plugin API 1.16.0): key names, vanilla's default bindings, the
  // keyboard and mouse code tables and the runtime's vehicle keys, from B406's client dump
  // (`./controls.ts`).
  controls,
  // vehicles (ADR 0090 D3, D4, D13; plugin API 1.16.0): the five movement modes in the ADR's
  // order, and the speed cap in blocks a tick. B406 (2026-11-14) measured vanilla's move-vehicle
  // check on this version: 0.5 to 5 blocks a tick pass, 8 and more are sometimes refused, so the
  // cap of 3 holds with room for a packet carrying two steps.
  vehicles: {
    modes: ['ground', 'water', 'amphibious', 'air', 'hover'],
    maxSpeed: 3,
  },
  // commands (ADR 0096 D1, D6; plugin API 1.17.0): `vanillaNames` is every literal at the
  // root of the vendored `commands.json` (mcmeta 26.4-snapshot-7-summary), sorted, 94 names;
  // `argumentTypes` maps MSM's twelve argument names to a parser and its properties exactly as
  // argument nodes of that tree write them (each pair occurs in it; asserted by
  // `all/test/targets.test.ts`). Verified 2026-11-15. The 32 types of ADR 0111 D2 (plugin API
  // 1.20.0) are the ones B525 (2026-11-22) registered on both versions and saw in the client's
  // command tree before and after `/reload`; each parser is the vendored `command_argument_type`
  // id that the tree's own node for the same argument class writes (the dimension of `/execute
  // in`, the rotation of `/execute rotated`, the structure of `/place structure` and so on).
  // `angle` has no node in the vanilla tree (no vanilla command takes one) but is a registered
  // type. On this version vanilla's `/effect` takes `resource_or_tag` over mob effects, so the
  // `effect` pair (`resource` over `minecraft:mob_effect`) has no node in the tree either; B525
  // registered it and saw the client parse it. `keyOnly` marks the key types (`ResourceKeyArgument`, `ResourceOrTagKeyArgument`): B525
  // saw a registry-checked argument over structures disconnect every client, so structures,
  // advancements and recipes are key-only.
  commands: {
    vanillaNames: [
      'advancement',
      'attribute',
      'ban',
      'ban-ip',
      'banlist',
      'bossbar',
      'clear',
      'clone',
      'compute',
      'damage',
      'data',
      'datapack',
      'debug',
      'defaultgamemode',
      'deop',
      'dialog',
      'difficulty',
      'effect',
      'enchant',
      'execute',
      'experience',
      'fetchprofile',
      'fill',
      'fillbiome',
      'forceload',
      'function',
      'gamemode',
      'gamerule',
      'give',
      'help',
      'item',
      'jfr',
      'kick',
      'kill',
      'list',
      'locate',
      'loot',
      'me',
      'msg',
      'op',
      'pardon',
      'pardon-ip',
      'particle',
      'perf',
      'place',
      'playsound',
      'posteffect',
      'publish',
      'random',
      'recipe',
      'reload',
      'return',
      'ride',
      'rotate',
      'save-all',
      'save-off',
      'save-on',
      'say',
      'schedule',
      'scoreboard',
      'seed',
      'setblock',
      'setidletimeout',
      'setworldspawn',
      'spawnpoint',
      'spectate',
      'spreadplayers',
      'stop',
      'stopsound',
      'stopwatch',
      'summon',
      'swing',
      'tag',
      'team',
      'teammsg',
      'teleport',
      'tell',
      'tellraw',
      'test',
      'tick',
      'time',
      'title',
      'tm',
      'tp',
      'transfer',
      'trigger',
      'unpublish',
      'version',
      'w',
      'waypoint',
      'weather',
      'whitelist',
      'worldborder',
      'xp',
    ],
    argumentTypes: {
      integer: { parser: 'brigadier:integer' },
      number: { parser: 'brigadier:double' },
      word: { parser: 'brigadier:string', properties: { type: 'word' } },
      text: { parser: 'brigadier:string', properties: { type: 'greedy' } },
      boolean: { parser: 'brigadier:bool' },
      player: { parser: 'minecraft:entity', properties: { amount: 'single', type: 'players' } },
      players: { parser: 'minecraft:entity', properties: { amount: 'multiple', type: 'players' } },
      entity: { parser: 'minecraft:entity', properties: { amount: 'single', type: 'entities' } },
      position: { parser: 'minecraft:vec3' },
      block_position: { parser: 'minecraft:block_pos' },
      item: { parser: 'minecraft:item_stack' },
      block: { parser: 'minecraft:block_state' },
      // The 32 of ADR 0111 D2 (plugin API 1.20.0), in B525's order (see the note above `commands`).
      dimension: { parser: 'minecraft:dimension' },
      time: { parser: 'minecraft:time' },
      team_colour: { parser: 'minecraft:team_color' },
      hex_colour: { parser: 'minecraft:hex_color' },
      rotation: { parser: 'minecraft:rotation' },
      angle: { parser: 'minecraft:angle' },
      uuid: { parser: 'minecraft:uuid' },
      objective: { parser: 'minecraft:objective' },
      score_holder: { parser: 'minecraft:score_holder', properties: { amount: 'single' } },
      score_holders: { parser: 'minecraft:score_holder', properties: { amount: 'multiple' } },
      item_predicate: { parser: 'minecraft:item_predicate' },
      block_predicate: { parser: 'minecraft:block_predicate' },
      effect: { parser: 'minecraft:resource', properties: { registry: 'minecraft:mob_effect' } },
      enchantment: {
        parser: 'minecraft:resource',
        properties: { registry: 'minecraft:enchantment' },
      },
      biome: { parser: 'minecraft:resource', properties: { registry: 'minecraft:worldgen/biome' } },
      biome_or_tag: {
        parser: 'minecraft:resource_or_tag',
        properties: { registry: 'minecraft:worldgen/biome' },
      },
      structure: {
        parser: 'minecraft:resource_key',
        properties: { registry: 'minecraft:worldgen/structure' },
        keyOnly: true,
      },
      structure_or_tag: {
        parser: 'minecraft:resource_or_tag_key',
        properties: { registry: 'minecraft:worldgen/structure' },
        keyOnly: true,
      },
      entity_type: {
        parser: 'minecraft:resource',
        properties: { registry: 'minecraft:entity_type' },
      },
      particle: { parser: 'minecraft:particle' },
      game_mode: { parser: 'minecraft:gamemode' },
      text_component: { parser: 'minecraft:component' },
      int_range: { parser: 'minecraft:int_range' },
      identifier: { parser: 'minecraft:resource_location' },
      team: { parser: 'minecraft:team' },
      slot: { parser: 'minecraft:item_slot' },
      nbt: { parser: 'minecraft:nbt_compound_tag' },
      message: { parser: 'minecraft:message' },
      dialog: { parser: 'minecraft:dialog' },
      loot_table: { parser: 'minecraft:loot_table' },
      advancement: {
        parser: 'minecraft:resource_key',
        properties: { registry: 'minecraft:advancement' },
        keyOnly: true,
      },
      recipe: {
        parser: 'minecraft:resource_key',
        properties: { registry: 'minecraft:recipe' },
        keyOnly: true,
      },
    },
    // forms (ADR 0113 D8; plugin API 1.22.0): every line B547 ran on the dedicated server of this
    // version and the game accepted (docs/reference/spikes/b547/README.md Y3, Y9 to Y12;
    // results/server-<version>.json `forms`), with its values made placeholders. `worldborder set
    // <width> <n>` counts ticks, so the timed form writes seconds with `s`. The same on both targets.
    forms: {
      team_add: 'team add <team> <display_name>',
      team_colour: 'team modify <team> color <colour>',
      team_friendly_fire: 'team modify <team> friendlyFire <boolean>',
      team_see_invisible_friends: 'team modify <team> seeFriendlyInvisibles <boolean>',
      team_name_tags: 'team modify <team> nametagVisibility <name_tags>',
      team_collision: 'team modify <team> collisionRule <collision>',
      team_death_messages: 'team modify <team> deathMessageVisibility <death_messages>',
      team_prefix: 'team modify <team> prefix <text>',
      team_suffix: 'team modify <team> suffix <text>',
      team_display_name: 'team modify <team> displayName <text>',
      team_join: 'team join <team> <members>',
      team_leave: 'team leave <members>',
      objective_add: 'scoreboard objectives add <objective> <criterion> [display_name]',
      objective_display: 'scoreboard objectives setdisplay <slot> <objective>',
      objective_render_type: 'scoreboard objectives modify <objective> rendertype <render_type>',
      objective_number_format:
        'scoreboard objectives modify <objective> numberformat <number_format>',
      objective_display_name: 'scoreboard objectives modify <objective> displayname <text>',
      objective_auto_update: 'scoreboard objectives modify <objective> displayautoupdate <boolean>',
      score_set: 'scoreboard players set <holders> <objective> <score>',
      score_add: 'scoreboard players add <holders> <objective> <score>',
      score_get: 'scoreboard players get <holder> <objective>',
      score_enable: 'scoreboard players enable <holders> <objective>',
      score_display_name: 'scoreboard players display name <holders> <objective> <text>',
      score_number_format:
        'scoreboard players display numberformat <holders> <objective> <number_format>',
      bossbar_add: 'bossbar add <bossbar> <text>',
      bossbar_max: 'bossbar set <bossbar> max <max>',
      bossbar_value: 'bossbar set <bossbar> value <value>',
      bossbar_colour: 'bossbar set <bossbar> color <bossbar_colour>',
      bossbar_style: 'bossbar set <bossbar> style <bossbar_style>',
      bossbar_players: 'bossbar set <bossbar> players <players>',
      bossbar_visible: 'bossbar set <bossbar> visible <boolean>',
      bossbar_name: 'bossbar set <bossbar> name <text>',
      bossbar_remove: 'bossbar remove <bossbar>',
      bossbar_store_value: 'execute store result bossbar <bossbar> value run <command>',
      actionbar: 'title <players> actionbar <text>',
      worldborder_set: 'worldborder set <width>',
      worldborder_set_over_seconds: 'worldborder set <width> <seconds>s',
      worldborder_center: 'worldborder center <x> <z>',
      worldborder_warning_distance: 'worldborder warning distance <distance>',
      place_template:
        'place template <template> <x> <y> <z> [rotation] [mirror] [integrity] [seed]',
      place_structure: 'place structure <structure> <x> <y> <z>',
      forceload_add: 'forceload add <x1> <z1> <x2> <z2>',
      forceload_remove: 'forceload remove <x1> <z1> <x2> <z2>',
      forceload_query: 'forceload query <x> <z>',
      loot_spawn: 'loot spawn <x> <y> <z> loot <loot_table>',
      loot_give: 'loot give <players> loot <loot_table>',
      loot_insert: 'loot insert <x> <y> <z> loot <loot_table>',
      random_value: 'random value <min>..<max> [sequence]',
      random_roll: 'random roll <min>..<max>',
      // The Rules forms (ADR 0115 D1 to D3; plugin API 1.26.0), Rules' own fallbacks until then:
      // the first four run on this version's dedicated server by B547 ("Other findings"), and
      // `set_fire` (ADR 0127 D1: `Fire` is the entity's ticks of fire, a short) waits for its
      // in-game check.
      if_entity: 'execute if entity <entities>',
      if_score_run: 'execute if score <holder> <objective> matches <range> run <command>',
      set_world_spawn: 'setworldspawn <x> <y> <z>',
      spawn_point: 'spawnpoint <players> <x> <y> <z>',
      set_fire: 'data merge entity <entities> {Fire:<ticks>s}',
      // The game kits' other lines (plugin API 1.26.0), written as plain text from B551 to B562
      // and checked on both targets by the offline function checker; their words are walked down
      // this version's vendored command tree (`tp` through its redirect to `teleport`).
      run_function: 'function <function>',
      tag_add: 'tag <entities> add <tag>',
      tag_remove: 'tag <entities> remove <tag>',
      kill: 'kill <entities>',
      in_run: 'execute in <dimension> run <command>',
      as_run: 'execute as <entities> run <command>',
      as_at_if_predicate_run:
        'execute as <entities> at <anchor> if predicate <predicate> run <command>',
      unless_storage_run: 'execute unless data storage <storage> <nbt_path> run <command>',
      storage_set_value: 'data modify storage <storage> <nbt_path> set value <nbt>',
      unless_score_run: 'execute unless score <holder> <objective> matches <range> run <command>',
      if_score_if_score_run:
        'execute if score <holder> <objective> matches <range> if score <holder_2> <objective_2> matches <range_2> run <command>',
      in_if_block_run: 'execute in <dimension> if block <x> <y> <z> <block> run <command>',
      store_result_score_run: 'execute store result score <holder> <objective> run <command>',
      score_remove: 'scoreboard players remove <holders> <objective> <score>',
      setblock: 'setblock <x> <y> <z> <block>',
      summon: 'summon <entity_type> <x> <y> <z>',
      teleport: 'tp <entities> <x> <y> <z>',
      game_mode: 'gamemode <game_mode> <players>',
      default_game_mode: 'defaultgamemode <game_mode>',
      difficulty: 'difficulty <difficulty>',
      game_rule: 'gamerule <rule> <rule_value>',
      give: 'give <players> <item> <count>',
      item_replace_entity: 'item replace entity <entities> <item_slot> with <item> <count>',
      effect_give: 'effect give <entities> <effect> <seconds> <amplifier> <hide_particles>',
      tellraw: 'tellraw <players> <text>',
      dialog_show: 'dialog show <players> <dialog>',
      // The community game types' lines (ADR 0132; plugin API 1.27.0), each run and answered on
      // this version's dedicated server by the B720 spike (`docs/reference/spikes/b720/README.md`,
      // K2 to K16, `results/server-<version>.json`) and checked by the offline function checker.
      // `spreadplayers` and `schedule` were not run: left out (verify at implementation).
      attribute_base_set: 'attribute <entity> <attribute> base set <value>',
      attribute_modifier_add:
        'attribute <entity> <attribute> modifier add <modifier> <amount> <operation>',
      attribute_modifier_remove: 'attribute <entity> <attribute> modifier remove <modifier>',
      attribute_get: 'attribute <entity> <attribute> get',
      trigger: 'trigger <objective>',
      trigger_add: 'trigger <objective> add <value>',
      trigger_set: 'trigger <objective> set <value>',
      time_query_gametime: 'time query gametime',
      store_result_storage_run:
        'execute store result storage <storage> <nbt_path> int <scale> run <command>',
      function_with_storage: 'function <function> with storage <storage>',
      storage_set_from_entity:
        'data modify storage <storage> <nbt_path> set from entity <entity> <source_path>',
      storage_set_from_block:
        'data modify storage <storage> <nbt_path> set from block <x> <y> <z> <block_path>',
      data_get_entity: 'data get entity <entity> <source_path>',
      data_get_storage: 'data get storage <storage> <nbt_path>',
      loot_replace_block: 'loot replace block <x> <y> <z> <block_slot> loot <loot_table>',
      on_attacker_run: 'execute on attacker run <command>',
      at_run: 'execute at <entities> run <command>',
      as_at_run: 'execute as <entities> at <anchor> run <command>',
      if_entity_run: 'execute if entity <entities> run <command>',
      if_items_run:
        'execute if items entity <entities> <item_slots> <item_predicate> run <command>',
      if_block_if_block_run:
        'execute if block <x> <y> <z> <block_predicate> if block <x_2> <y_2> <z_2> <block_predicate_2> run <command>',
      unless_block_run: 'execute unless block <x> <y> <z> <block_predicate> run <command>',
      if_score_compare_run:
        'execute if score <holder> <objective> <comparison> <holder_2> <objective_2> run <command>',
      unless_score_compare_run:
        'execute unless score <holder> <objective> <comparison> <holder_2> <objective_2> run <command>',
      as_if_score_compare_run:
        'execute as <entities> if score <holder> <objective> <comparison> <holder_2> <objective_2> run <command>',
      as_unless_score_compare_run:
        'execute as <entities> unless score <holder> <objective> <comparison> <holder_2> <objective_2> run <command>',
      store_result_score_if_entity:
        'execute store result score <holder> <objective> if entity <entities>',
      score_operation:
        'scoreboard players operation <holders> <objective> <score_operation> <holder_2> <objective_2>',
      score_reset: 'scoreboard players reset <holders> <objective>',
      item_modify_entity: 'item modify entity <entities> <item_slot> <item_modifier>',
      clear: 'clear <players> <item_predicate> <max_count>',
      effect_clear: 'effect clear <entities> <effect>',
      fill: 'fill <x1> <y1> <z1> <x2> <y2> <z2> <block>',
      team_empty: 'team empty <team>',
      advancement_revoke_only: 'advancement revoke <players> only <advancement>',
      summon_item:
        'summon minecraft:item <x> <y> <z> {Item:{id:"<item>",count:<count>},Motion:[0.0d,0.0d,0.0d]}',
      summon_trader:
        'summon minecraft:villager <x> <y> <z> {Tags:["<tag>"],NoAI:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b,VillagerData:{profession:"<profession>",level:5,type:"<villager_type>"},Offers:{Recipes:[<offers>]}}',
    },
    // The pieces the game types put into a form's placeholder (plugin API 1.27.0), as B720 ran
    // them: a trader's offers (K13: shown on the merchant screen with their components) and the
    // compass's inline modifier (K7: the tracker in the main and the off hand).
    fragments: {
      trade_offer: '{buy:<buy>,sell:<sell>,maxUses:2147483647,rewardExp:0b,xp:0}',
      trade_offer_two: '{buy:<buy>,buyB:<buy_b>,sell:<sell>,maxUses:2147483647,rewardExp:0b,xp:0}',
      lodestone_tracker_modifier:
        '{type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"<dimension>",pos:[I;<x>,<y>,<z>]},tracked:false}}}',
    },
  },
  // gameRules (ADR 0111 D5, D8, as amended after B525; plugin API 1.20.0): vanilla's two kinds of
  // value; the categories are the public static `GameRuleCategory` fields in declaration order
  // (javap over the Loom-cached merged jar, field names only, 2026-11-22; B525 registered a rule in
  // `player`, `mobs` and `misc`); `vanillaNames` is the vendored `registries.json` `game_rule` list
  // (59 ids), sorted.
  gameRules: {
    kinds: ['boolean', 'integer'],
    categories: ['player', 'mobs', 'spawning', 'drops', 'updates', 'chat', 'misc'],
    vanillaNames: [
      'advance_time',
      'advance_weather',
      'allow_entering_nether_using_portals',
      'block_drops',
      'block_explosion_drop_decay',
      'command_block_output',
      'command_blocks_work',
      'drowning_damage',
      'elytra_movement_check',
      'ender_pearls_vanish_on_death',
      'entity_drops',
      'fall_damage',
      'fire_damage',
      'fire_spread_radius_around_player',
      'forgive_dead_players',
      'freeze_damage',
      'global_sound_events',
      'immediate_respawn',
      'keep_inventory',
      'lava_source_conversion',
      'limited_crafting',
      'locator_bar',
      'log_admin_commands',
      'max_block_modifications',
      'max_command_forks',
      'max_command_sequence_length',
      'max_entity_cramming',
      'max_minecart_speed',
      'max_snow_accumulation_height',
      'mob_drops',
      'mob_explosion_drop_decay',
      'mob_griefing',
      'natural_health_regeneration',
      'player_movement_check',
      'players_nether_portal_creative_delay',
      'players_nether_portal_default_delay',
      'players_sleeping_percentage',
      'projectiles_can_break_blocks',
      'pvp',
      'raids',
      'random_tick_speed',
      'reduced_debug_info',
      'respawn_radius',
      'send_command_feedback',
      'show_advancement_messages',
      'show_death_messages',
      'spawn_mobs',
      'spawn_monsters',
      'spawn_patrols',
      'spawn_phantoms',
      'spawn_wandering_traders',
      'spawn_wardens',
      'spawner_blocks_work',
      'spectators_generate_chunks',
      'spread_vines',
      'tnt_explodes',
      'tnt_explosion_drop_decay',
      'universal_anger',
      'water_source_conversion',
    ],
    // The rules the community game types set (ADR 0132; plugin API 1.27.0): each set and read
    // back on this version's dedicated server by B720 (K10: `block_drops`, the camel-case
    // `doTileDrops` refused; K11: `immediate_respawn`, `doImmediateRespawn` refused).
    forGames: [
      'block_drops',
      'immediate_respawn',
      'keep_inventory',
      'natural_health_regeneration',
      'pvp',
      'show_death_messages',
      'spawn_mobs',
      'spawn_monsters',
    ],
  },
  // stats (ADR 0111 D6, D8, as amended after B525; plugin API 1.20.0): the formatters ADR 0111
  // offers (the game's `StatFormatter` also has `DIVIDE_BY_TEN`, left out by limit N22); B525 saw
  // the criterion `minecraft.custom:<ns>.<path>` count in a scoreboard; `vanillaCustomStats` is the
  // vendored `registries.json` `custom_stat` list (78 ids), sorted.
  stats: {
    formats: ['default', 'distance', 'time'],
    criterionPrefix: 'minecraft.custom:',
    vanillaCustomStats: [
      'animals_bred',
      'aviate_one_cm',
      'bell_ring',
      'boat_one_cm',
      'clean_armor',
      'clean_banner',
      'clean_shulker_box',
      'climb_one_cm',
      'crouch_one_cm',
      'damage_absorbed',
      'damage_blocked_by_shield',
      'damage_dealt',
      'damage_dealt_absorbed',
      'damage_dealt_resisted',
      'damage_resisted',
      'damage_taken',
      'deaths',
      'drop',
      'eat_cake_slice',
      'enchant_item',
      'fall_one_cm',
      'fill_cauldron',
      'fish_caught',
      'fly_one_cm',
      'happy_ghast_one_cm',
      'horse_one_cm',
      'inspect_dispenser',
      'inspect_dropper',
      'inspect_hopper',
      'interact_with_anvil',
      'interact_with_beacon',
      'interact_with_blast_furnace',
      'interact_with_brewingstand',
      'interact_with_campfire',
      'interact_with_cartography_table',
      'interact_with_crafting_table',
      'interact_with_furnace',
      'interact_with_grindstone',
      'interact_with_lectern',
      'interact_with_loom',
      'interact_with_smithing_table',
      'interact_with_smoker',
      'interact_with_stonecutter',
      'jump',
      'leave_game',
      'minecart_one_cm',
      'mob_kills',
      'nautilus_one_cm',
      'open_barrel',
      'open_chest',
      'open_enderchest',
      'open_shulker_box',
      'pig_one_cm',
      'play_noteblock',
      'play_record',
      'play_time',
      'player_kills',
      'pot_flower',
      'raid_trigger',
      'raid_win',
      'sleep_in_bed',
      'sleep_in_straw_bed',
      'sneak_time',
      'sprint_one_cm',
      'strider_one_cm',
      'swim_one_cm',
      'talked_to_villager',
      'target_hit',
      'time_since_death',
      'time_since_rest',
      'total_world_time',
      'traded_with_villager',
      'trigger_trapped_chest',
      'tune_noteblock',
      'use_cauldron',
      'walk_on_water_one_cm',
      'walk_one_cm',
      'walk_under_water_one_cm',
    ],
  },
  // worlds (ADR 0113 D8; plugin API 1.22.0), measured by B547 (2026-11-22,
  // docs/reference/spikes/b547/README.md): the vendored `worldgen/structure_placement` registry
  // (Y1 placed `dimension_origin`); `the_void` (Y6, Y7); `floating_islands` as a noise dimension
  // (Y1); `fixed_placement` positions as `[x, y, z]` (Y8; B547 Y8: this version refuses `"positions": []` ("List must have contents")); the
  // first-join advancement on `minecraft:tick` (Y4). The End-like noise settings were not
  // measured and stay out.
  worlds: {
    structurePlacements: [
      'minecraft:concentric_rings',
      'minecraft:dimension_origin',
      'minecraft:random_spread',
    ],
    voidBiome: 'minecraft:the_void',
    floatingIslandsSettings: 'minecraft:floating_islands',
    fixedPlacementShape: { type: 'minecraft:fixed_placement', minPositions: 1 },
    firstJoinCriterion: 'minecraft:tick',
  },
  // scoreboard (ADR 0113 D8; plugin API 1.22.0): `criteria` the three plain criteria B547 Y10 ran
  // (`dummy`, `health`, `playerKillCount`); `statTypes` the vendored `stat_type` registry (Y10 ran
  // `minecraft.mined:minecraft.stone`); the display slots, render types, number formats and team
  // option values of the vendored command tree, each value of which Y10 ran at least once
  // (`sidebar.team.red`); the team colours of the vendored mcdoc `TextColor` enum, which the
  // `minecraft:team_color` argument takes (Y10 ran `color red`). The same on both targets.
  scoreboard: {
    // B720 K1 (plugin API 1.27.0) added `deathCount`, `totalKillCount` and `trigger`, the team
    // criteria (run with `red` and `blue`) and four custom statistics, all moved at the death
    // or leaving itself, before that tick's tick function; `health` is the health points
    // rounded up to a whole number and moves a tick later.
    criteria: ['deathCount', 'dummy', 'health', 'playerKillCount', 'totalKillCount', 'trigger'],
    teamCriteria: ['killedByTeam', 'teamkill'],
    customStatCriteria: [
      'minecraft.custom:minecraft.deaths',
      'minecraft.custom:minecraft.leave_game',
      'minecraft.custom:minecraft.player_kills',
      'minecraft.custom:minecraft.time_since_death',
    ],
    statTypes: [
      'broken',
      'crafted',
      'custom',
      'dropped',
      'killed',
      'killed_by',
      'mined',
      'picked_up',
      'used',
    ],
    displaySlots: [
      'list',
      'sidebar',
      'below_name',
      'sidebar.team.black',
      'sidebar.team.dark_blue',
      'sidebar.team.dark_green',
      'sidebar.team.dark_aqua',
      'sidebar.team.dark_red',
      'sidebar.team.dark_purple',
      'sidebar.team.gold',
      'sidebar.team.gray',
      'sidebar.team.dark_gray',
      'sidebar.team.blue',
      'sidebar.team.green',
      'sidebar.team.aqua',
      'sidebar.team.red',
      'sidebar.team.light_purple',
      'sidebar.team.yellow',
      'sidebar.team.white',
    ],
    renderTypes: ['integer', 'hearts'],
    numberFormats: ['blank', 'fixed', 'styled'],
    teamColours: [
      'black',
      'dark_blue',
      'dark_green',
      'dark_aqua',
      'dark_red',
      'dark_purple',
      'gold',
      'gray',
      'dark_gray',
      'blue',
      'green',
      'aqua',
      'red',
      'light_purple',
      'yellow',
      'white',
    ],
    nameTagVisibility: ['always', 'hideForOtherTeams', 'hideForOwnTeam', 'never'],
    collisionRules: ['always', 'never', 'pushOtherTeams', 'pushOwnTeam'],
    deathMessageVisibility: ['always', 'hideForOtherTeams', 'hideForOwnTeam', 'never'],
  },
  // Verified 2026-11-05: meta.fabricmc.net lists Loader 0.20.1 for 26.4-snapshot-7, and
  // 0.165.4+26.4 is the newest Fabric API for 26.4 on maven.fabricmc.net (ADR 0037 D2). Loom
  // 1.19.3 handles the snapshot (B151).
  // dyes (ADR 0121 D5; plugin API 1.25.0): the sixteen dye colours a banner or shield pattern
  // layer is multiplied by, in the order of `blocks.dyeColours`. Verified 2026-11-23 by the B619
  // spike: 26.4-snapshot-7's `DyeColor` has no colour accessor, so these are 26.3's
  // values, which this version's banners draw within 5.2 of 255 on all sixteen dyes (3S6,
  // `docs/reference/spikes/b619/results/3s5-3s6-looks-26.4.json`).
  dyes: {
    white: '#f9fffe',
    orange: '#f9801d',
    magenta: '#c74ebd',
    light_blue: '#3ab3da',
    yellow: '#fed83d',
    lime: '#80c71f',
    pink: '#f38baa',
    gray: '#474f52',
    light_gray: '#9d9d97',
    cyan: '#169c9c',
    purple: '#8932b8',
    blue: '#3c44aa',
    brown: '#835432',
    green: '#5e7c16',
    red: '#b02e26',
    black: '#1d1d21',
  },
  // dataForms (ADR 0132; plugin API 1.27.0): the JSON the community game types write, as the
  // B720 spike loaded and fired it on this version's dedicated server (K3: the one-condition
  // `entity` form and the sub-predicate map; the short `{"type": ...}` form and the list form stop
  // the whole server loading; K4: `consume_item` with a `custom_data` predicate, the string form;
  // K4: the player head entry whose `modifier` fills the head). The victim's criterion
  // `entity_killed_player` is left out: the spike wrote its condition under `killing_entity`, a
  // field the vendored mcdoc does not have (its condition is `entity`), and killed players with
  // players only, so the condition was never shown to filter (verify at implementation).
  dataForms: {
    entity_is_type: {
      type: 'minecraft:entity_properties',
      entity: 'this',
      predicate: { 'minecraft:entity_type': '<entity_type>' },
    },
    player_killed_entity: {
      trigger: 'minecraft:player_killed_entity',
      conditions: { entity: '<entity_condition>' },
    },
    consume_item_with_data: {
      trigger: 'minecraft:consume_item',
      conditions: {
        item: { items: '<item>', predicates: { 'minecraft:custom_data': '<custom_data>' } },
      },
    },
    player_head_of_this: {
      type: 'minecraft:item',
      name: 'minecraft:player_head',
      modifier: [{ type: 'minecraft:fill_player_head', entity: 'this' }],
    },
  },
  fabric: {
    loader: '0.20.1',
    api: '0.165.4+26.4',
    // apiModrinth: verified 2026-11-06 against the Modrinth API (project P7dR8mSH); its SHA-512
    // equals the Fabric Maven .sha512 of the same version (ADR 0046 D7).
    apiModrinth: {
      versionId: 'Nl1jzKeV',
      fileName: 'fabric-api-0.165.4+26.4.jar',
      url: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/Nl1jzKeV/fabric-api-0.165.4%2B26.4.jar',
      sha1: '0278ce4be6e1068cac25bbc8aab30ae5ebef0929',
      sha512:
        '22cc60830cd50017b6406199fda38c44648ae6313da838c17b7c53b42cbb7753f560573ebe0b37fb33ad879ea3c28a05dd286c23715d23ff4008cd35049930c0',
      size: 1739107,
    },
    loom: '1.19.3',
    // minecraftDependency: Fabric Loader reports the snapshot as `26.4-alpha.7`; B151 found
    // that this range loads on the 26.4-snapshot-7 server (`~26.4` does not) and it also
    // admits the 26.4 release (ADR 0037 Status).
    minecraftDependency: '>=26.4- <26.5-',
    // gradle: equals engine-mod/gradle/wrapper/gradle-wrapper.properties, as for 26.3.
    gradle: '9.8.2',
  },
  // No geckolib: Modrinth lists no GeckoLib build for any 26.4 snapshot (checked 2026-11-05,
  // ADR 0037). Mobs still work here: the runtime draws `renderer: auto` mobs with its built-in
  // renderer (ADR 0072), and only `renderer: geckolib` mobs report export.no-geckolib-target.
  // No javaProject or loadJavaProject: the 26.3 generator's Java does not compile against 26.4 (B151: SoundType
  // is gone, block sounds are the data-driven `block_sound_set` registry; entity renderers
  // register through the client registry), so the java-project exporter reports
  // export.no-java-project-target for this target (ADR 0037 D2).
  // Moving a project from mc-26.3: removed ids and known renames (ADR 0037 D3), and noise
  // settings reshaped without default_block (ADR 0036 D8).
  migrateFrom: createMigrateFrom(migrationTables(ID, MC_VERSION, NOISE_SETTINGS_DEFAULT_BLOCK)),
};
