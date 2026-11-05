/**
 * Verified facts for Minecraft Java 26.3 (checked 2026-11-04; sources in `CHANGES.md`).
 */

import type { Target } from '@msm/plugin-api';

export const target: Target = {
  id: 'mc-26.3',
  mcVersion: '26.3',
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
  },
  // Verified 2026-11-05 against maven.fabricmc.net and the FabricMC example mod's 26.3
  // branch (ADR 0027).
  fabric: {
    loader: '0.20.1',
    api: '0.165.2+26.3',
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
};
