/**
 * Verified facts for Minecraft Java 26.4, pinned to 26.4-snapshot-7 until the release lands
 * (checked 2026-11-05; sources in `CHANGES.md`; ADR 0037).
 */

import type { Target } from '@msm/plugin-api';
import featureOrder from '../vendor/worldgen/feature-order.json' with { type: 'json' };
import { controls } from './controls';
import { createMigrateFrom, migrationTables } from './migrate';

const ID = 'mc-26.4';
const MC_VERSION = '26.4-snapshot-7';

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
    // noise_settings lost default_block (`until 26.4` in the vendored mcdoc; ADR 0036 D8).
    noiseSettingsDefaultBlock: false,
    vanillaFeatureOrder,
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
    // derive it again from the mcdoc and must agree.
    dataPackComponents: [
      'banner_patterns',
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
    // B440), each a `assets/minecraft/models/block/<name>.json` of the 26.4-snapshot-7 client jar
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
    ],
    defaultTorchParticle: 'minecraft:flame',
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
  // `test/target.test.ts`). Verified 2026-11-15.
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
    },
  },
  // Verified 2026-11-05: meta.fabricmc.net lists Loader 0.20.1 for 26.4-snapshot-7, and
  // 0.165.4+26.4 is the newest Fabric API for 26.4 on maven.fabricmc.net (ADR 0037 D2). Loom
  // 1.19.3 handles the snapshot (B151).
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
  // No javaProject: the 26.3 generator's Java does not compile against 26.4 (B151: SoundType
  // is gone, block sounds are the data-driven `block_sound_set` registry; entity renderers
  // register through the client registry), so the java-project exporter reports
  // export.no-java-project-target for this target (ADR 0037 D2).
  // Moving a project from mc-26.3: removed ids and known renames (ADR 0037 D3).
  migrateFrom: createMigrateFrom(migrationTables(ID, MC_VERSION)),
};
