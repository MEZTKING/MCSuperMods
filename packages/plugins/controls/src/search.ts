/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the words of key binds
 * and the HUD (keys, hotkeys, controls; the screen, overlay, bars and counters) and the plain
 * words of the plugin's kinds and templates, where their titles do not carry them, loaded
 * lazily through `searchData()`. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions`.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'key',
        same: [
          'keys',
          'key bind',
          'key binds',
          'keybind',
          'keybinds',
          'hotkey',
          'hotkeys',
          'shortcut',
        ],
        near: ['button', 'keyboard'],
        slang: ['kb', 'bind'],
        misspellings: ['keybing', 'kebind'],
      },
      {
        idea: 'controls',
        same: ['control', 'key binding', 'key bindings', 'input', 'inputs'],
        near: ['keyboard', 'mouse'],
      },
      {
        idea: 'hud',
        same: ['overlay', 'on screen', 'heads-up display', 'screen'],
        near: ['gui', 'ui', 'interface', 'display'],
        misspellings: ['hude'],
      },
      {
        idea: 'bar',
        same: ['bars', 'meter', 'gauge'],
      },
      {
        idea: 'mana',
        same: ['magic points', 'magic power', 'mp'],
        near: ['spell points', 'energy'],
      },
      {
        idea: 'stamina',
        same: ['endurance', 'energy bar', 'sprint meter'],
        near: ['tired', 'running out'],
      },
      {
        idea: 'coordinates',
        same: ['coords', 'xyz', 'x y z', 'location'],
        near: ['where am i', 'gps'],
      },
      {
        idea: 'dash',
        same: ['dashes', 'dodge', 'lunge', 'sprint burst', 'quick step'],
        near: ['boost'],
      },
      {
        idea: 'ability',
        same: ['abilities', 'power', 'powers', 'skill', 'special move', 'superpower'],
        near: ['spell', 'cast'],
      },
    ],
  },
  keywords: {
    'msm:key_bind': ['key', 'hotkey', 'keybind', 'shortcut', 'controls', 'press a key', 'button'],
    'msm:hud': ['hud', 'overlay', 'on screen', 'bar', 'meter', 'counter', 'text on screen', 'gui'],
    msm_key_bind_dash: ['dash', 'dodge', 'boost', 'press to dash', 'quick move'],
    msm_key_bind_ability: ['ability', 'power', 'skill', 'cooldown', 'special move', 'spell'],
    msm_hud_mana_bar: ['mana', 'magic', 'energy', 'blue bar', 'meter'],
    msm_hud_stamina_bar: ['stamina', 'energy', 'sprint', 'meter', 'tired'],
    msm_hud_coordinates: ['coords', 'position', 'xyz', 'where am i', 'location'],
    msm_hud_score_counter: ['score', 'points', 'counter', 'kills', 'number on screen'],
  },
};
