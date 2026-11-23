/**
 * "New element" templates of the game pieces (ADR 0113 D3 to D7): one blocks, teams, objectives,
 * timers and areas, in the category "Games". Only vanilla ids are named; nothing needs the mod
 * jar.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { gameTemplates } from './game';

const CATEGORY = 'Games';

export const piecesTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_games_one_block_classic',
    kind: 'msm:one_block',
    category: CATEGORY,
    title: 'One block in three phases',
    description:
      'One block at 0 64 0 that turns into the next block each time it is broken: plains, then underground with ores, then the Nether, with a chest and an animal now and then; after the last phase it starts again.',
    defaultName: 'one_block',
    data: (): Json => ({
      at: [0, 64, 0],
      phases: [
        {
          name: 'Plains',
          breaks: 100,
          blocks: [
            { block: 'minecraft:grass_block', weight: 4 },
            { block: 'minecraft:dirt', weight: 4 },
            { block: 'minecraft:oak_log', weight: 3 },
            { block: 'minecraft:oak_leaves', weight: 1 },
          ],
          mobs: [
            { mob: 'minecraft:cow', weight: 1 },
            { mob: 'minecraft:sheep', weight: 1 },
            { mob: 'minecraft:chicken', weight: 1 },
          ],
          mob_chance: 0.05,
          chest_chance: 0.02,
          chest_loot: 'minecraft:chests/village/village_plains_house',
        },
        {
          name: 'Underground',
          breaks: 200,
          blocks: [
            { block: 'minecraft:stone', weight: 10 },
            { block: 'minecraft:coal_ore', weight: 3 },
            { block: 'minecraft:iron_ore', weight: 2 },
            { block: 'minecraft:copper_ore', weight: 2 },
            { block: 'minecraft:gold_ore', weight: 1 },
          ],
          mob_chance: 0,
          chest_chance: 0.02,
          chest_loot: 'minecraft:chests/simple_dungeon',
        },
        {
          name: 'The Nether',
          breaks: 200,
          blocks: [
            { block: 'minecraft:netherrack', weight: 10 },
            { block: 'minecraft:nether_quartz_ore', weight: 2 },
            { block: 'minecraft:glowstone', weight: 1 },
            { block: 'minecraft:soul_sand', weight: 2 },
          ],
          mobs: [{ mob: 'minecraft:piglin', weight: 1 }],
          mob_chance: 0.02,
          chest_chance: 0.01,
          chest_loot: 'minecraft:chests/nether_bridge',
        },
      ],
      loop: true,
      announce: true,
    }),
  },
  {
    id: 'msm_games_team_red',
    kind: 'msm:team',
    category: CATEGORY,
    title: 'Red team',
    description:
      'A team with red names and a [Red] tag before them; team mates cannot hurt each other and see each other when invisible.',
    defaultName: 'red',
    data: (): Json => ({
      name: 'Red',
      colour: 'red',
      friendly_fire: false,
      see_invisible_friends: true,
      name_tags: 'always',
      collision: 'pushOtherTeams',
      prefix: '[Red] ',
    }),
  },
  {
    id: 'msm_games_team_blue',
    kind: 'msm:team',
    category: CATEGORY,
    title: 'Blue team',
    description:
      'A team with blue names and a [Blue] tag before them; team mates cannot hurt each other and see each other when invisible.',
    defaultName: 'blue',
    data: (): Json => ({
      name: 'Blue',
      colour: 'blue',
      friendly_fire: false,
      see_invisible_friends: true,
      name_tags: 'always',
      collision: 'pushOtherTeams',
      prefix: '[Blue] ',
    }),
  },
  {
    id: 'msm_games_objective_points',
    kind: 'msm:objective',
    category: CATEGORY,
    title: 'Points on the sidebar',
    description:
      'A score shown on the right of the screen, changed only by commands and Rules (for goals, coins or rounds won), with gold numbers.',
    defaultName: 'points',
    data: (): Json => ({
      criterion: 'dummy',
      name: 'Points',
      display: 'sidebar',
      render: 'integer',
      number_format: { type: 'styled', colour: 'gold' },
    }),
  },
  {
    id: 'msm_games_objective_kills',
    kind: 'msm:objective',
    category: CATEGORY,
    title: 'Player kills in the player list',
    description:
      'Counts how many players each player has defeated, shown beside the names in the player list (Tab).',
    defaultName: 'kills',
    data: (): Json => ({
      criterion: 'playerKillCount',
      name: 'Kills',
      display: 'list',
      render: 'integer',
    }),
  },
  {
    id: 'msm_games_timer_countdown',
    kind: 'msm:timer',
    category: CATEGORY,
    title: 'Five-minute countdown',
    description:
      'Counts down from five minutes on a red boss bar at the top of the screen, started by a Rules step or a function.',
    defaultName: 'round',
    data: (): Json => ({
      name: 'Time left',
      seconds: 300,
      count: 'down',
      show: 'boss_bar',
      colour: 'red',
      repeat: false,
      starts: 'manual',
    }),
  },
  {
    id: 'msm_games_timer_stopwatch',
    kind: 'msm:timer',
    category: CATEGORY,
    title: 'Stopwatch for a race',
    description:
      'Counts the seconds up to an hour above the hotbar, for races and parkour; started by a Rules step or a function.',
    defaultName: 'stopwatch',
    data: (): Json => ({
      name: 'Time',
      seconds: 3600,
      count: 'up',
      show: 'action_bar',
      colour: 'white',
      repeat: false,
      starts: 'manual',
    }),
  },
  {
    id: 'msm_games_area_arena',
    kind: 'msm:area',
    category: CATEGORY,
    title: 'Arena',
    description:
      'A 32 by 16 by 32 box of the Overworld that knows when players walk in or out; add structures under Reset to rebuild it.',
    defaultName: 'arena',
    data: (): Json => ({
      name: 'Arena',
      dimension: 'minecraft:overworld',
      from: [0, 64, 0],
      to: [31, 79, 31],
    }),
  },
  // The Game and map Studio's game and kit (ADR 0132), listed once their kinds are (B722).
  ...gameTemplates,
]);
