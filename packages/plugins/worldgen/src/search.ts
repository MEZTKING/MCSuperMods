/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * world generation kinds and templates, where their titles do not carry them, and the words of
 * the area (biomes, features and their placement, terrain shape, noise, carvers, superflat and
 * world presets, the surface), loaded lazily through `searchData()`. The words of the things the
 * Make a world flows make (worlds, islands, mountains, caves, dimensions) are the library's.
 * Every line is data; `test/search.test.ts` checks it with `validateSearchContributions` and
 * checks every vanilla id against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'worldgen',
        same: ['world generation', 'world gen', 'terrain generation', 'generation'],
        slang: ['wg'],
        misspellings: ['wordgen', 'worldgne'],
      },
      {
        idea: 'biome',
        same: ['biomes', 'climate zone'],
        near: ['forest', 'desert', 'jungle', 'plains', 'swamp', 'taiga', 'savanna', 'tundra'],
        misspellings: ['bioem', 'boime', 'byome'],
        vanillaIds: ['minecraft:plains', 'minecraft:forest', 'minecraft:desert'],
      },
      {
        idea: 'feature',
        same: ['features', 'configured feature', 'decoration', 'decorations'],
        near: ['trees', 'flowers', 'ores', 'boulders', 'patches'],
      },
      {
        idea: 'placement',
        same: ['placed feature', 'placed features', 'how many per chunk', 'rarity', 'per chunk'],
        near: ['height range'],
      },
      {
        idea: 'terrain',
        same: ['landscape', 'land', 'ground shape', 'heightmap', 'height map'],
        near: ['hills', 'mountains', 'valleys', 'flat'],
      },
      {
        idea: 'noise',
        same: ['noise settings', 'perlin', 'octaves'],
        near: ['smoothness'],
      },
      {
        idea: 'density',
        same: ['density function', 'density functions', 'noise router'],
        near: ['shape of the land', 'overhangs'],
      },
      {
        idea: 'carver',
        same: ['carvers', 'carve', 'carved', 'ravine', 'canyon'],
        near: ['tunnels', 'caves'],
      },
      {
        idea: 'superflat',
        same: ['super flat', 'flat world', 'flat preset', 'flat layers', 'layers'],
        slang: ['flatworld', 'flatland'],
        vanillaIds: ['minecraft:classic_flat'],
      },
      {
        idea: 'preset',
        same: ['world preset', 'world type', 'world types', 'presets'],
        near: ['amplified', 'large biomes', 'create world'],
        vanillaIds: ['minecraft:amplified', 'minecraft:large_biomes'],
      },
      {
        idea: 'surface',
        same: ['surface rule', 'surface rules', 'material rule', 'top block', 'ground cover'],
        near: ['grass', 'dirt', 'sand', 'top layer'],
      },
      {
        idea: 'climate',
        same: ['temperature', 'humidity', 'continentalness', 'erosion', 'weirdness'],
        near: ['hot', 'cold', 'dry', 'wet'],
      },
    ],
  },
  keywords: {
    // Kinds.
    'minecraft:worldgen/biome': [
      'biome',
      'forest',
      'desert',
      'grass colour',
      'sky colour',
      'mob spawns',
      'climate',
    ],
    'minecraft:worldgen/feature': [
      'feature',
      'tree',
      'ore vein',
      'flowers',
      'boulder',
      'decoration',
      'configured feature',
    ],
    'minecraft:worldgen/placed_feature': [
      'placement',
      'how many per chunk',
      'height range',
      'rarity',
      'where it generates',
    ],
    'minecraft:dimension': ['dimension', 'new world', 'realm', 'generator', 'biome source'],
    'minecraft:worldgen/world_preset': [
      'world type',
      'world preset',
      'create world',
      'amplified',
      'custom world type',
    ],
    'minecraft:worldgen/noise_settings': [
      'terrain',
      'land shape',
      'sea level',
      'default block',
      'hills',
      'mountains',
    ],
    'minecraft:worldgen/density_function': ['density', 'terrain shape', 'noise router', 'math'],
    'minecraft:worldgen/noise': ['noise', 'perlin', 'octaves', 'randomness'],
    'minecraft:worldgen/carver': ['caves', 'ravines', 'canyons', 'tunnels', 'carve'],
    'minecraft:worldgen/flat_level_generator_preset': [
      'superflat',
      'flat world',
      'layers',
      'flat preset',
    ],
    'minecraft:worldgen/multi_noise_biome_source_parameter_list': [
      'biome map',
      'biome layout',
      'climate',
      'where biomes go',
    ],
    'minecraft:worldgen/block_state_provider': ['block mix', 'random blocks', 'which block'],
    'minecraft:worldgen/material_condition': [
      'surface condition',
      'above sea level',
      'if',
      'depth',
    ],
    'minecraft:worldgen/material_rule': [
      'surface rule',
      'top block',
      'grass and dirt',
      'ground cover',
    ],
    // Templates.
    biome_temperate_forest: ['forest', 'woods', 'oak', 'birch', 'green'],
    biome_desert: ['sand', 'dry', 'hot', 'dunes', 'cactus'],
    feature_ore_vein: ['ore', 'ores', 'mineral', 'underground', 'vein'],
    feature_tree: ['oak tree', 'trees', 'wood', 'leaves'],
    feature_sapling_tree: ['sapling', 'grows into a tree', 'tree from sapling'],
    feature_flower_patch: ['flowers', 'grass patch', 'plants', 'meadow'],
    feature_single_block: ['one block', 'scatter blocks', 'boulder'],
    placed_feature_ore: ['ore spawn rate', 'ore height', 'veins per chunk'],
    placed_feature_tree: ['trees per chunk', 'forest density'],
    placed_feature_patch: ['patches per chunk', 'flower spread'],
    dimension_multi_noise: ['overworld-like', 'normal world', 'many biomes'],
    dimension_single_biome: ['one biome', 'single biome', 'same biome everywhere'],
    world_preset: ['world type', 'create world', 'custom world'],
    dimension_type_moon: ['moon', 'low gravity', 'space', 'night sky', 'stars'],
    dimension_type_nether_like: ['nether', 'hell', 'underworld', 'ceiling', 'no sky'],
    noise_settings: ['hills', 'gentle terrain', 'rolling hills', 'land shape'],
    density_function: ['terrain math', 'noise'],
    noise: ['perlin', 'randomness'],
    carver: ['caves', 'tunnels', 'cave carver'],
    flat_level_generator_preset: ['superflat', 'flat world', 'layers'],
    multi_noise_biome_source_parameter_list: ['biome map', 'climate', 'biome layout'],
    block_state_provider: ['random stone', 'block mix', 'mixed blocks'],
    material_condition: ['sea level', 'above water', 'surface condition'],
    material_rule: ['grass', 'dirt', 'surface rule', 'top layer'],
    noise_settings_islands: ['islands', 'archipelago', 'ocean world', 'sea'],
    noise_settings_mountains: ['mountains', 'peaks', 'cliffs', 'amplified', 'tall'],
    noise_settings_caves: ['caves', 'underground', 'cave world', 'no surface'],
    noise_settings_empty: ['void', 'empty', 'skyblock', 'nothing', 'air'],
  },
};
