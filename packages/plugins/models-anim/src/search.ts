/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * mob model and animation kinds and templates, where their titles do not carry them, and the
 * words of the area (GeckoLib models, bones, animations, poses), loaded lazily through
 * `searchData()`. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions`.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'animation',
        same: ['animations', 'animate', 'animated', 'moves', 'movement'],
        near: ['walk cycle', 'idle', 'pose', 'keyframes'],
        slang: ['anim', 'anims'],
        misspellings: ['animaton', 'aniamtion', 'animtion'],
      },
      {
        idea: 'geckolib',
        same: ['gecko lib', 'geo model', 'geo models', 'bedrock model'],
        near: ['blockbench'],
        slang: ['gecko'],
      },
      {
        idea: 'bone',
        same: ['bones', 'rig', 'rigging', 'skeleton', 'parts'],
        near: ['pivot', 'joints'],
      },
    ],
  },
  keywords: {
    'msm:geo_model': [
      'mob model',
      'creature model',
      'geckolib',
      'blockbench',
      'bones',
      '3d model',
      'body',
    ],
    'msm:animation': ['animation', 'walk', 'idle', 'attack animation', 'keyframes', 'moves'],
    msm_geo_model_cube_creature: ['cube mob', 'slime-like', 'simple mob model', 'box body'],
    msm_geo_model_biped: ['humanoid', 'two legs', 'person', 'zombie-like', 'arms and legs'],
    msm_animation_idle_walk: ['walk cycle', 'idle', 'breathing', 'legs swing', 'moves'],
  },
};
