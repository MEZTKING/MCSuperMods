/**
 * Verified facts for Minecraft Java 26.4, pinned to 26.4-snapshot-7 until the release lands
 * (checked 2026-11-05; sources in `CHANGES.md`; ADR 0037).
 */

import type { Target } from '@msm/plugin-api';
import { createMigrateFrom, migrationTables } from './migrate';

const ID = 'mc-26.4';
const MC_VERSION = '26.4-snapshot-7';

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
    },
  },
  dataVersion: 5127,
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
    // noise_settings lost default_block (`until 26.4` in the vendored mcdoc; ADR 0036 D8).
    noiseSettingsDefaultBlock: false,
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
  // ADR 0037); the entities export reports export.no-geckolib-target for this target.
  // No javaProject: the 26.3 generator's Java does not compile against 26.4 (B151: SoundType
  // is gone, block sounds are the data-driven `block_sound_set` registry; entity renderers
  // register through the client registry), so the java-project exporter reports
  // export.no-java-project-target for this target (ADR 0037 D2).
  // Moving a project from mc-26.3: removed ids and known renames (ADR 0037 D3).
  migrateFrom: createMigrateFrom(migrationTables(ID, MC_VERSION)),
};
