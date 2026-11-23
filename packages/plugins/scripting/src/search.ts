/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * script, command, game rule and statistic kinds and of the plugin's templates, where their
 * titles do not carry them, and the words of the area (scripts and code, slash commands, game
 * rules, statistics, creative tabs), loaded lazily through `searchData()`. Every line is data;
 * `test/search.test.ts` checks it with `validateSearchContributions` and checks every vanilla id
 * against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'script',
        same: ['scripts', 'scripting', 'code', 'coding', 'program', 'programming'],
        near: ['typescript', 'javascript', 'logic', 'api'],
        slang: ['js', 'ts'],
        misspellings: ['scirpt', 'scrpit', 'sript'],
      },
      {
        idea: 'command',
        same: ['commands', 'slash command', 'slash commands', 'chat command'],
        near: ['type in chat', 'cmd'],
        slang: ['cmds'],
        misspellings: ['comand', 'commnad', 'comamnd'],
      },
      {
        idea: 'argument',
        same: ['arguments', 'parameter', 'parameters', 'option', 'options'],
        slang: ['args', 'arg'],
      },
      {
        idea: 'permission',
        same: ['permissions', 'op', 'operator', 'admin only'],
        near: ['cheats', 'who can use'],
      },
      {
        idea: 'gamerule',
        same: ['game rule', 'game rules', 'gamerules', 'world rule', 'world rules'],
        near: ['keep inventory', 'mob griefing', 'daylight cycle', 'world setting'],
        vanillaIds: ['minecraft:keep_inventory', 'minecraft:mob_griefing'],
      },
      {
        idea: 'statistic',
        same: ['statistics', 'stat', 'stats', 'counted', 'tracked number'],
        near: ['how many times', 'record'],
      },
    ],
  },
  keywords: {
    // Kinds.
    'msm:script': ['script', 'code', 'typescript', 'javascript', 'program', 'logic'],
    'msm:command': ['slash command', 'chat command', '/command', 'custom command', 'type in chat'],
    'msm:game_rule': ['game rule', 'gamerule', 'world setting', 'on or off', 'option'],
    'msm:stat': ['statistic', 'stats', 'counter', 'tracked', 'how many times', 'record'],
    // Templates.
    msm_script_block_interaction: ['right click', 'use a block', 'click block', 'interact'],
    msm_script_entity_hurt: ['damage', 'hit', 'when hurt', 'mob hurt'],
    msm_script_scheduled_effect: ['timer', 'later', 'delay', 'after some time', 'schedule'],
    msm_script_action_handler: ['run_script', 'handler', 'event handler', 'action'],
    msm_script_full_set_bonus: ['armour set bonus', 'armor set', 'wear all four', 'set bonus'],
    msm_script_boss_bar_countdown: ['boss bar', 'countdown', 'timer', 'progress'],
    msm_command_help: ['help', 'info', 'how to use', 'message'],
    msm_command_hop: ['jump', 'hop', 'launch', 'fun command'],
    msm_creative_tab: ['creative tab', 'creative inventory', 'item group', 'tab'],
    msm_creative_tab_by_hand: ['order', 'sort', 'arrange', 'hand-picked', 'tab'],
    msm_game_rule_switch: ['on or off', 'toggle', 'true or false', 'boolean'],
    msm_game_rule_number: ['number', 'amount', 'integer', 'value'],
    msm_stat_counter: ['count', 'how many times', 'counter'],
    msm_stat_time: ['time', 'how long', 'play time', 'minutes'],
  },
};
