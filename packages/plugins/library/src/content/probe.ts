/**
 * The context the library builds bundles with to work out their kinds (`requiresKinds`).
 * Any valid namespace gives the same set of kinds; the target holds neutral placeholder
 * facts (no version), since library `src/` may not import `@msm/targets`.
 */
import type { BundleContext, TargetFacts } from '@msm/plugin-api';

/** A version-neutral target; folder names equal their keys. */
export const PROBE_TARGET: TargetFacts = Object.freeze({
  id: 'mc-probe',
  mcVersion: 'probe',
  channel: 'release',
  java: 0,
  packFormats: { resource: { major: 0, minor: 0 }, data: { major: 0, minor: 0 } },
  mcdocRef: '0'.repeat(40),
  mcmetaRef: 'probe',
  folders: {
    resource: {
      model: 'model',
      block_definition: 'block_definition',
      item_definition: 'item_definition',
      lang: 'lang',
      sounds_file: 'sounds_file',
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
  dataVersion: 0,
  worldgen: { featureSteps: [] },
});

/** The bundle context used to work out a starter's or example's kinds. */
export const PROBE_CONTEXT: BundleContext = Object.freeze({
  namespace: 'probe',
  projectName: 'Probe',
  target: PROBE_TARGET,
  values: Object.freeze({}),
});
