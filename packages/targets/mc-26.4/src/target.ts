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
  },
  // Verified 2026-11-05: meta.fabricmc.net lists Loader 0.20.1 for 26.4-snapshot-7, and
  // 0.165.4+26.4 is the newest Fabric API for 26.4 on maven.fabricmc.net (ADR 0037 D2). Loom
  // 1.19.3 handles the snapshot (B151).
  fabric: {
    loader: '0.20.1',
    api: '0.165.4+26.4',
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
