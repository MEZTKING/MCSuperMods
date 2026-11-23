/**
 * Samples of the game pieces (B552) for the goldens, the checker and the data pack checks: each
 * kind's default, its templates, and samples that reach every branch of its lowering.
 */
import type { Json } from '@msm/plugin-api';
import { areaKind, objectiveKind, oneBlockKind, teamKind, timerKind } from '../src/index';
import { piecesTemplates } from '../src/templates/pieces';

export interface Sample {
  /** The golden's file name. */
  name: string;
  kind: string;
  folder: string;
  id: string;
  data: Json;
}

const templateData = (id: string): Json => {
  const template = piecesTemplates.find((entry) => entry.id === id);
  if (template === undefined) throw new Error(`no template ${id}`);
  return template.data({} as never) as Json;
};

export const SAMPLES: readonly Sample[] = [
  {
    name: 'default',
    kind: 'msm:one_block',
    folder: 'one_block',
    id: 'demo:one_block',
    data: oneBlockKind.defaultData as Json,
  },
  {
    name: 'classic',
    kind: 'msm:one_block',
    folder: 'one_block',
    id: 'demo:islands/classic',
    data: templateData('msm_games_one_block_classic'),
  },
  {
    name: 'always_chest_no_loop',
    kind: 'msm:one_block',
    folder: 'one_block',
    id: 'demo:nether_block',
    data: {
      at: [-3, 70, 12],
      dimension: 'minecraft:the_nether',
      phases: [
        {
          name: 'Start',
          breaks: 5,
          blocks: [{ block: 'minecraft:netherrack', weight: 1 }],
          mobs: [{ mob: 'minecraft:strider', weight: 1 }],
          mob_chance: 1,
          chest_chance: 1,
          chest_loot: 'minecraft:chests/nether_bridge',
        },
        {
          name: 'End',
          breaks: 1,
          blocks: [
            { block: 'minecraft:blackstone', weight: 2 },
            { block: 'minecraft:basalt', weight: 1 },
          ],
          mob_chance: 0,
          chest_chance: 0,
        },
      ],
      loop: false,
      announce: false,
    },
  },
  {
    name: 'default',
    kind: 'msm:team',
    folder: 'team',
    id: 'demo:my_team',
    data: teamKind.defaultData as Json,
  },
  {
    name: 'red',
    kind: 'msm:team',
    folder: 'team',
    id: 'demo:teams/red',
    data: templateData('msm_games_team_red'),
  },
  {
    name: 'default',
    kind: 'msm:objective',
    folder: 'objective',
    id: 'demo:score',
    data: objectiveKind.defaultData as Json,
  },
  {
    name: 'points',
    kind: 'msm:objective',
    folder: 'objective',
    id: 'demo:points',
    data: templateData('msm_games_objective_points'),
  },
  {
    name: 'kills',
    kind: 'msm:objective',
    folder: 'objective',
    id: 'demo:kills',
    data: templateData('msm_games_objective_kills'),
  },
  {
    name: 'mined_fixed_team_sidebar',
    kind: 'msm:objective',
    folder: 'objective',
    id: 'demo:scores/stone',
    data: {
      criterion: 'minecraft.mined:minecraft.stone',
      name: 'Stone mined',
      display: 'sidebar.team.red',
      render: 'integer',
      number_format: { type: 'fixed', text: '-' },
    },
  },
  {
    name: 'hearts_blank_hidden',
    kind: 'msm:objective',
    folder: 'objective',
    id: 'demo:health',
    data: {
      criterion: 'health',
      name: 'Health',
      display: 'none',
      render: 'hearts',
      number_format: { type: 'blank' },
    },
  },
  {
    name: 'default',
    kind: 'msm:timer',
    folder: 'timer',
    id: 'demo:timer',
    data: timerKind.defaultData as Json,
  },
  {
    name: 'stopwatch',
    kind: 'msm:timer',
    folder: 'timer',
    id: 'demo:race/stopwatch',
    data: templateData('msm_games_timer_stopwatch'),
  },
  {
    name: 'repeat_world_start',
    kind: 'msm:timer',
    folder: 'timer',
    id: 'demo:waves',
    data: {
      name: 'Next wave',
      seconds: 90,
      count: 'down',
      show: 'boss_bar',
      colour: 'purple',
      on_end: 'demo:spawn_wave',
      repeat: true,
      starts: 'world_start',
    },
  },
  {
    name: 'hidden',
    kind: 'msm:timer',
    folder: 'timer',
    id: 'demo:quiet',
    data: {
      seconds: 10,
      count: 'down',
      show: 'none',
      colour: 'white',
      repeat: false,
      starts: 'manual',
    },
  },
  {
    name: 'default',
    kind: 'msm:area',
    folder: 'area',
    id: 'demo:my_area',
    data: areaKind.defaultData as Json,
  },
  {
    name: 'arena_reset',
    kind: 'msm:area',
    folder: 'area',
    id: 'demo:arenas/north',
    data: {
      name: 'North arena',
      dimension: 'minecraft:overworld',
      from: [100, 60, -40],
      to: [131, 75, -9],
      reset: {
        structures: [
          { structure: 'minecraft:igloo/top', at: [100, 60, -40] },
          { structure: 'demo:arena_floor', at: [110, 60, -30] },
        ],
      },
    },
  },
  {
    name: 'nether',
    kind: 'msm:area',
    folder: 'area',
    id: 'demo:fortress_gate',
    data: {
      name: 'Fortress gate',
      dimension: 'minecraft:the_nether',
      from: [-8, 64, -8],
      to: [7, 70, 7],
    },
  },
];

/** The kinds of the samples, by id. */
export const PIECE_KINDS = Object.fromEntries(
  [oneBlockKind, teamKind, objectiveKind, timerKind, areaKind].map((kind) => [kind.id, kind]),
);

/** Ids the samples reference as if they were project content. */
export const SAMPLE_PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  function: ['demo:spawn_wave'],
  structure: ['demo:arena_floor'],
};
