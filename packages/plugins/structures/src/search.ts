/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * structure kinds and templates, where their titles do not carry them, and the words of the area
 * (structures and buildings, jigsaw pieces, pools, spacing, processors), loaded lazily through
 * `searchData()`. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions` and checks every vanilla id against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'structure',
        same: ['structures', 'building', 'buildings', 'build', 'schematic', 'schematics'],
        near: ['house', 'tower', 'castle', 'dungeon', 'ruin', 'ruins', 'temple', 'hut', 'base'],
        slang: ['schem', 'nbt', 'litematic'],
        misspellings: ['structur', 'stucture', 'strucutre', 'sturcture'],
        vanillaIds: ['minecraft:structure_block'],
      },
      {
        idea: 'jigsaw',
        same: ['jigsaw block', 'jigsaw piece', 'jigsaw pieces', 'pieces'],
        near: ['connector', 'puzzle'],
        vanillaIds: ['minecraft:jigsaw'],
      },
      {
        idea: 'pool',
        same: ['template pool', 'pools', 'piece pool'],
        near: ['random pieces', 'weights'],
      },
      {
        idea: 'spacing',
        same: ['structure set', 'spread', 'separation', 'how often'],
        near: ['rare', 'frequency', 'how far apart'],
      },
      {
        idea: 'processor',
        same: ['processors', 'processor list', 'decay'],
        near: ['mossy', 'cracked', 'ruined', 'rot', 'random blocks'],
      },
      {
        idea: 'village',
        same: ['villages', 'town', 'settlement'],
        near: ['houses', 'streets'],
      },
    ],
  },
  keywords: {
    // Kinds.
    'minecraft:structure_template': [
      'structure',
      'building',
      'schematic',
      'nbt',
      'schem',
      'saved build',
      'structure block',
    ],
    'minecraft:worldgen/template_pool': ['template pool', 'jigsaw pool', 'pieces', 'random pieces'],
    'minecraft:worldgen/structure': [
      'structure',
      'building in the world',
      'generates',
      'village',
      'dungeon',
      'temple',
    ],
    'minecraft:worldgen/structure_set': ['how often', 'spacing', 'separation', 'rarity', 'spread'],
    'minecraft:worldgen/processor_list': [
      'processor',
      'decay',
      'mossy',
      'cracked',
      'ruined',
      'random blocks',
    ],
    // Templates.
    structure_template_platform: ['floor', 'platform', 'base', 'small build', 'island'],
    structure_template_jigsaw_hut: ['house', 'hut', 'jigsaw piece', 'village house', 'cabin'],
    structure_template_path: ['road', 'street', 'path', 'corridor', 'jigsaw piece'],
    template_pool: ['jigsaw pool', 'random pieces', 'start pool'],
    template_pool_terminators: ['end pieces', 'dead ends', 'caps', 'terminator'],
    structure_jigsaw: ['village', 'generated structure', 'jigsaw', 'town', 'dungeon'],
    structure_set_random_spread: ['spacing', 'how often', 'separation', 'rarity'],
    processor_list_mossify_rot: ['mossy', 'ruined', 'old', 'decay', 'abandoned'],
    processor_list_block_ignore: ['ignore air', 'keep blocks', 'structure void', 'skip blocks'],
  },
};
