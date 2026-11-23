/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D7, D13; B655): the words of the
 * Rules catalogue's triggers, steps, conditions and values (`search/words.ts`), the behaviour
 * phrases of made things as one rule each (`search/behaviours.ts`), and the plain words of the
 * rule book kind and its templates, loaded lazily through `searchData()`. Every line is data;
 * `test/search.test.ts` checks it with `validateSearchContributions`, checks every vanilla id
 * against both targets and validates and compiles every behaviour's rule.
 */

import type { PluginSearchData } from '@msm/plugin-api';
import { RULES_BEHAVIOURS } from './search/behaviours';
import { RULES_WORDS } from './search/words';

export const SEARCH: PluginSearchData = {
  vocabulary: { words: RULES_WORDS },
  behaviours: RULES_BEHAVIOURS,
  keywords: {
    'msm:rules': [
      'rule book',
      'rules',
      'when then',
      'if this then that',
      'triggers',
      'events',
      'logic',
      'no code',
      'behaviour',
    ],
    msm_rules_welcome_message: ['greeting', 'join message', 'welcome title', 'hello', 'on join'],
    msm_rules_jump_pad: ['launch pad', 'bounce pad', 'trampoline', 'slime block', 'boost'],
    msm_rules_lucky_block: ['lucky', 'gamble', 'random drops', 'surprise', 'chance'],
    msm_rules_healing_spring: ['heal in water', 'regeneration', 'healing pool', 'health spring'],
    msm_rules_click_counter: ['count clicks', 'counter', 'score', 'tally', 'how many times'],
    msm_rules_mob_reward: ['kill reward', 'mob drops', 'bounty', 'reward for killing', 'loot'],
  },
};
