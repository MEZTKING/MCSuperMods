/**
 * Verified facts for Minecraft Java 26.3 (checked 2026-11-04; sources in `CHANGES.md`).
 */

import type { Target } from '@msm/plugin-api';
import { javaProjectGenerator } from './java-project/index';

export const target: Target = {
  id: 'mc-26.3',
  mcVersion: '26.3',
  channel: 'release',
  java: 25,
  packFormats: {
    resource: { major: 97, minor: 1 },
    data: { major: 121, minor: 0 },
  },
  mcdocRef: '0ca060a4f1631f9d5eb7198cfe94c7b77a773d32',
  mcmetaRef: '26.3',
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
    },
  },
  dataVersion: 5023,
  worldgen: {
    featureSteps: [
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
    ],
    biomeAttributes: {
      colours: [
        'minecraft:visual/sky_color',
        'minecraft:visual/fog_color',
        'minecraft:visual/water_fog_color',
      ],
      skyColour: 'minecraft:visual/sky_color',
      naturalMobSpawns: 'minecraft:gameplay/natural_mob_spawns',
    },
    // noise_settings still require default_block (vendored mcdoc; ADR 0036 D8).
    noiseSettingsDefaultBlock: true,
  },
  // items.armorMaterials: the ArmorMaterials constants in lower case, verified 2026-11-05 with
  // javap over the Loom-cached 26.3 merged jar (ADR 0042 D4).
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
    // misode/mcmeta 26.3-summary item_components/data.min.json (attack damage = 1 + the attack_damage
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
    // rangedPull: verified 2026-11-06 against mcmeta's 26.3-assets assets/minecraft/items/bow.json
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
  // Verified 2026-11-05 against maven.fabricmc.net and the FabricMC example mod's 26.3
  // branch (ADR 0027).
  fabric: {
    loader: '0.20.1',
    api: '0.165.2+26.3',
    // apiModrinth: verified 2026-11-06 against the Modrinth API (project P7dR8mSH); its SHA-512
    // equals the Fabric Maven .sha512 of the same version (ADR 0046 D7).
    apiModrinth: {
      versionId: 'nJlcvFfj',
      fileName: 'fabric-api-0.165.2+26.3.jar',
      url: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/nJlcvFfj/fabric-api-0.165.2%2B26.3.jar',
      sha1: '2e364989e3f6efb97e1dbd12d80d835c7ab8c26c',
      sha512:
        '21ce87863ed73c4c871e072f13c5a7b00bd148a098c5064a5f381479d1ddd7c54b0f40ef7d17ce2ae5712deb647c5fcaf12cb72fb663fe8d958188e870b33de0',
      size: 1779306,
    },
    loom: '1.19.3',
    // minecraftDependency: the fabric.mod.json range (verify at implementation).
    minecraftDependency: '~26.3',
    // gradle: verified 2026-11-05 against services.gradle.org/versions/current (9.8.2 is
    // current); equals engine-mod/gradle/wrapper/gradle-wrapper.properties, and the two move
    // together (ADR 0034).
    gradle: '9.8.2',
  },
  // Verified 2026-11-05 against the Modrinth API and CDN (project geckolib, Fabric build for
  // 26.3; jar downloaded and hashed). ADR 0030.
  geckolib: {
    version: '5.5.7',
    modId: 'geckolib',
    dependency: '>=5.5.7',
    fileName: 'geckolib-fabric-26.3-5.5.7.jar',
    url: 'https://cdn.modrinth.com/data/8BmcQJ2H/versions/kSxHvs99/geckolib-fabric-26.3-5.5.7.jar',
    sha512:
      'c7c89bd6c5f2801ef1575e2e1212202f5a3eff480d73503beff12b1d60dfb751112fccf36e36c243b26b6b492261cef12d8b2c1a92a734bb0b621daa8c158fc5',
    modrinthVersionId: 'kSxHvs99',
  },
  javaProject: javaProjectGenerator,
};
