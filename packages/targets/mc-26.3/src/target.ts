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
    },
  },
  // fabric and geckolib are not set until Phase 4/5 (verify at implementation then).
};
