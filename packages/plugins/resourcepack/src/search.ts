/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * resource pack kinds and templates, where their titles do not carry them, and the words of the
 * area (textures, models, sounds, languages, fonts, shaders), loaded lazily through
 * `searchData()`. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions` and checks every vanilla id against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'resourcepack',
        same: ['resource pack', 'texture pack', 'resource packs', 'texture packs'],
        slang: ['rp', 'respack', 'texturepack'],
        misspellings: ['resorce pack', 'resourse pack'],
      },
      {
        idea: 'texture',
        same: ['textures', 'picture', 'image', 'png', 'sprite'],
        near: ['look', 'skin', 'appearance', 'pixel art'],
        slang: ['tex', 'txt'],
        misspellings: ['texure', 'textrue', 'tecture'],
      },
      {
        idea: 'model',
        same: ['models', '3d model', 'mesh'],
        near: ['shape', 'elements', 'cuboids'],
        slang: ['bbmodel'],
        misspellings: ['modle', 'modal'],
      },
      {
        idea: 'blockstate',
        same: ['block state', 'block states', 'blockstates', 'block definition'],
        near: ['multipart', 'rotation'],
      },
      {
        idea: 'translation',
        same: ['translations', 'language', 'languages', 'lang', 'localisation'],
        near: ['display name', 'item name', 'text'],
        phrases: ['en_us', 'language file'],
      },
      {
        idea: 'sound',
        same: ['sounds', 'audio', 'sfx', 'sound effect', 'sound effects'],
        near: ['music'],
        slang: ['ogg'],
        misspellings: ['sond', 'soud'],
      },
      {
        idea: 'font',
        same: ['fonts', 'glyph', 'glyphs', 'typeface', 'characters'],
        near: ['emoji', 'icons in text', 'unicode'],
      },
      {
        idea: 'shader',
        same: ['shaders', 'glsl', 'shader program'],
        near: ['graphics', 'filter', 'post processing', 'post effect'],
        phrases: ['vertex shader', 'fragment shader'],
        misspellings: ['shadder', 'shadr'],
      },
      {
        idea: 'atlas',
        same: ['atlases', 'texture atlas', 'sprite sheet', 'spritesheet'],
      },
      {
        idea: 'waypoint',
        same: ['waypoints', 'locator bar', 'marker'],
        near: ['map marker', 'locator'],
      },
    ],
  },
  keywords: {
    // Kinds.
    'minecraft:model': [
      'model',
      '3d model',
      'block model',
      'item model',
      'json model',
      'shape',
      'cube',
    ],
    'minecraft:block_definition': [
      'blockstate',
      'block states',
      'variants',
      'multipart',
      'rotation',
      'which model',
    ],
    'minecraft:item_definition': [
      'item model definition',
      'item look',
      'how an item looks',
      'custom model data',
      'items folder',
    ],
    'minecraft:lang': [
      'language',
      'translation',
      'names',
      'display name',
      'en_us',
      'localisation',
      'text',
    ],
    'minecraft:sounds': ['sounds.json', 'sound', 'audio', 'sound event', 'ogg', 'noise', 'sfx'],
    'minecraft:pack_mcmeta': [
      'pack.mcmeta',
      'pack format',
      'pack description',
      'pack metadata',
      'version',
    ],
    'minecraft:equipment': [
      'armour look',
      'armour texture',
      'worn texture',
      'equipment asset',
      'armour layers',
      'wings look',
    ],
    'minecraft:atlas': ['texture atlas', 'sprite sheet', 'sprites', 'texture sources'],
    'minecraft:font': [
      'font',
      'glyphs',
      'characters',
      'emoji',
      'icons in chat',
      'unicode',
      'bitmap font',
    ],
    'minecraft:particle': [
      'particle texture',
      'particle look',
      'particle sprites',
      'retexture particle',
    ],
    'minecraft:post_effect': [
      'post effect',
      'screen effect',
      'screen filter',
      'shader',
      'post processing',
    ],
    'minecraft:waypoint_style': ['waypoint', 'locator bar', 'marker icon', 'player marker'],
    'minecraft:shader': [
      'shader',
      'glsl',
      'vertex shader',
      'fragment shader',
      'vsh',
      'fsh',
      'core shader',
    ],
    // Templates.
    block_model: ['cube model', 'cube all', 'full block model', 'block texture'],
    model_block_column: ['pillar model', 'log model', 'top and side', 'cube column'],
    model_block_cross: ['plant model', 'flower model', 'x shape', 'cross model', 'grass model'],
    item_model: ['flat item', 'generated item', 'item texture', 'icon'],
    model_item_handheld: ['tool model', 'sword model', 'held item', 'handheld'],
    'equipment-humanoid': [
      'armor',
      'armour look',
      'helmet',
      'chestplate',
      'leggings',
      'boots',
      'worn',
    ],
    blockstate: ['one model', 'block definition', 'variants'],
    blockstate_facing: ['rotating', 'faces the player', 'directional', 'facing', 'horizontal'],
    blockstate_slab: ['slab', 'half block', 'top and bottom', 'double slab'],
    item_definition: ['item look', 'item model'],
    item_definition_condition: [
      'while using',
      'pulling',
      'bow model',
      'changes when used',
      'charging',
    ],
    item_definition_select: [
      'in hand',
      'in inventory',
      'display context',
      'gui model',
      'different in hand',
    ],
    lang: ['names', 'translation', 'en_us', 'item names', 'block names'],
    sounds: ['sound event', 'ogg', 'audio', 'custom sound', 'music'],
    font_icons: ['emoji', 'icons in chat', 'symbols', 'custom characters', 'unicode'],
    particle_retexture: [
      'particle texture',
      'change particle',
      'new particle look',
      'reskin particle',
    ],
    post_effect_creeper: [
      'creeper vision',
      'green screen',
      'spectator shader',
      'screen filter',
      'post effect',
    ],
    shader_program: ['glsl', 'vertex shader', 'fragment shader', 'core shader', 'graphics'],
    waypoint_style: ['locator bar', 'marker', 'waypoint icon', 'player dots'],
    pack: ['pack.mcmeta', 'pack format', 'description', 'pack icon', 'metadata'],
  },
};
