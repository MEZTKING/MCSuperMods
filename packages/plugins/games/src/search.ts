/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the words of game modes
 * (skyblock, one block, teams, the scoreboard, countdowns and stopwatches, zones and arenas, the
 * world's start), the plain words of the games kinds and templates, where their titles do not
 * carry them, and extra doors for game modes known by their own names, loaded lazily through
 * `searchData()`. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions` and checks every vanilla id against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'skyblock',
        same: ['sky block', 'skyblocks', 'void island'],
        near: ['island in the sky', 'survival island'],
        slang: ['sb'],
        misspellings: ['skyblok', 'skybock', 'skyblcok'],
      },
      {
        idea: 'one block',
        same: ['oneblock', 'one-block', 'single block', 'lucky one block'],
        near: ['block that refills', 'phases'],
        misspellings: ['oneblok', 'one blok'],
      },
      {
        idea: 'minigame',
        same: ['minigames', 'mini game', 'mini games', 'party game', 'map game'],
        near: ['challenge', 'map', 'adventure map', 'arena game'],
      },
      {
        idea: 'team',
        same: ['teams', 'side', 'squad', 'faction', 'clan', 'party'],
        near: ['red team', 'blue team', 'friendly fire'],
      },
      {
        idea: 'scoreboard',
        same: ['score board', 'objective', 'objectives', 'sidebar', 'leaderboard'],
        misspellings: ['scorebord', 'scoreborad'],
      },
      {
        idea: 'score',
        same: ['scores', 'points', 'point'],
      },
      {
        idea: 'timer',
        same: ['timers', 'countdown', 'count down', 'stopwatch', 'clock'],
        near: ['time limit', 'race', 'round'],
        misspellings: ['timmer', 'countdwon'],
      },
      {
        idea: 'area',
        same: ['areas', 'zone', 'zones', 'region', 'arena', 'box', 'region of the world'],
        near: ['boundary', 'spawn area', 'safe zone'],
      },
      {
        idea: 'spawn point',
        same: ['spawnpoint', 'world spawn', 'respawn point', 'start point'],
        near: ['start island', 'where players start'],
      },
      {
        idea: 'kit',
        same: ['starter kit', 'starting items', 'starter items', 'kit items'],
        near: ['what you start with'],
      },
      {
        idea: 'world border',
        same: ['border', 'worldborder', 'world edge', 'map edge'],
        vanillaIds: ['minecraft:barrier'],
      },
    ],
  },
  entries: [
    {
      id: 'skyblock-world',
      title: 'Skyblock world',
      sentence: 'An empty sky with a start island, the classic skyblock game.',
      words: ['skyblock', 'sky block', 'void world', 'island in the sky'],
      opens: { type: 'template', id: 'world_setup_empty_sky' },
    },
    {
      id: 'one-block-game',
      title: 'One block game',
      sentence: 'One block that refills when it is broken, phase by phase.',
      words: ['one block', 'oneblock', 'lucky block game'],
      opens: { type: 'template', id: 'msm_games_one_block_classic' },
    },
    {
      id: 'scoreboard-sidebar',
      title: 'Scoreboard',
      sentence: 'Points shown on the sidebar, as an objective.',
      words: ['scoreboard', 'leaderboard', 'sidebar', 'points'],
      opens: { type: 'template', id: 'msm_games_objective_points' },
    },
    {
      id: 'countdown-timer',
      title: 'Countdown timer',
      sentence: 'A timer that counts down on a boss bar and ends the round.',
      words: ['countdown', 'time limit', 'timer'],
      opens: { type: 'template', id: 'msm_games_timer_countdown' },
    },
  ],
  keywords: {
    // Kinds.
    'msm:world_setup': [
      'world setup',
      'game setup',
      'skyblock',
      'void world',
      'start',
      'kit',
      'game mode',
      'spawn',
    ],
    'msm:one_block': ['one block', 'oneblock', 'phases', 'refills', 'lucky block', 'skyblock'],
    'msm:team': ['team', 'teams', 'side', 'faction', 'colour', 'friendly fire', 'name tag'],
    'msm:objective': [
      'scoreboard',
      'objective',
      'score',
      'points',
      'sidebar',
      'kills',
      'leaderboard',
    ],
    'msm:timer': ['timer', 'countdown', 'stopwatch', 'clock', 'time limit', 'boss bar', 'seconds'],
    'msm:area': ['area', 'zone', 'region', 'arena', 'box', 'enter', 'leave', 'reset'],
    // The Game and map Studio's kinds (ADR 0132; B724).
    'msm:game': [
      'game',
      'game mode',
      'minigame',
      'round',
      'lobby',
      'roles',
      'win',
      'last one standing',
    ],
    'msm:kit': ['kit', 'starter kit', 'loadout', 'gear', 'items', 'armour', 'class'],
    // Templates.
    msm_games_one_block_classic: ['oneblock', 'one block', 'skyblock', 'phases', 'refills'],
    msm_games_team_red: ['red', 'team', 'side', 'faction'],
    msm_games_team_blue: ['blue', 'team', 'side', 'faction'],
    msm_games_objective_points: ['scoreboard', 'sidebar', 'leaderboard', 'score'],
    msm_games_objective_kills: ['kills', 'pvp', 'scoreboard', 'tab list', 'kill count'],
    msm_games_timer_countdown: ['countdown', 'time limit', 'timer', 'round', 'boss bar'],
    msm_games_timer_stopwatch: ['stopwatch', 'race', 'time trial', 'speedrun', 'timer'],
    msm_games_area_arena: ['arena', 'zone', 'pvp', 'battle', 'reset', 'area'],
    msm_games_game_empty: ['game', 'empty game', 'minigame', 'round', 'lobby', 'game mode'],
    msm_games_kit_empty: ['kit', 'loadout', 'starter kit', 'gear', 'class'],
    world_setup_empty_sky: ['skyblock', 'void', 'empty', 'sky island', 'start island', 'nothing'],
    world_setup_flat_build: ['flat', 'superflat', 'creative', 'build', 'flat world'],
    world_setup_sky_islands: ['floating islands', 'sky islands', 'islands in the sky', 'skylands'],
    world_setup_adventure: ['adventure', 'normal world', 'vanilla world', 'adventure map', 'kit'],
  },
};
