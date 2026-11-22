/**
 * "New element" templates of game rules and statistics (ADR 0111 D5, D6): an on or off game
 * rule, a number game rule with a range, a counted statistic and a timed one. They name no ids;
 * the texts say how a rule or a script reads them.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { GAME_RULE_KIND, STAT_KIND } from '../kinds';

const GAME_RULE_CATEGORY = 'Game rules';
const STAT_CATEGORY = 'Statistics';

export const gameRuleTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_game_rule_switch',
    kind: GAME_RULE_KIND,
    category: GAME_RULE_CATEGORY,
    title: 'On or off game rule',
    description:
      'A world setting that is on or off, on in a new world, listed under Mobs in the game rule screen and set with /gamerule <namespace>:mob_sparkles. A rule reads it with "The game rule is", a script with world.gameRule.',
    defaultName: 'mob_sparkles',
    data: (): Json => ({
      format: 1,
      kind: 'boolean',
      default: true,
      category: 'mobs',
      display_name: 'Mob sparkles',
      description: 'Whether your mobs leave sparkles where they walk.',
    }),
  },
  {
    id: 'msm_game_rule_number',
    kind: GAME_RULE_KIND,
    category: GAME_RULE_CATEGORY,
    title: 'Number game rule',
    description:
      'A world setting that holds a whole number from 0 to 10, 3 in a new world, listed under Player in the game rule screen. /gamerule refuses numbers outside the range.',
    defaultName: 'bonus_hearts',
    data: (): Json => ({
      format: 1,
      kind: 'integer',
      default: 3,
      min: 0,
      max: 10,
      category: 'player',
      display_name: 'Bonus hearts',
      description: 'How many extra hearts a player gets from your mod.',
    }),
  },
  {
    id: 'msm_stat_counter',
    kind: STAT_KIND,
    category: STAT_CATEGORY,
    title: 'Counted statistic',
    description:
      'A number counted for each player and shown in the Statistics screen, such as how many times something happened. A rule adds to it with "Add to a statistic"; a scoreboard objective can follow it with the criterion minecraft.custom:<namespace>.ores_found.',
    defaultName: 'ores_found',
    data: (): Json => ({ format: 1, formatter: 'default', display_name: 'Ores found' }),
  },
  {
    id: 'msm_stat_time',
    kind: STAT_KIND,
    category: STAT_CATEGORY,
    title: 'Timed statistic',
    description:
      'A time counted for each player in ticks (20 a second) and shown in the Statistics screen as seconds, minutes, hours or days. Add 20 to it every second the player spends somewhere.',
    defaultName: 'time_in_caves',
    data: (): Json => ({ format: 1, formatter: 'time', display_name: 'Time in caves' }),
  },
] satisfies ElementTemplate[]);
