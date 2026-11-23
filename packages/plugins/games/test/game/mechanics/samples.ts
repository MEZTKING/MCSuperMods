/**
 * Hand-written games for the tests of the mechanics `hearts`, `tracker` and `head_start` (B725):
 * a Lifesteal server with every heart setting (kept out, the Heart item with its recipe,
 * withdraw, the revive item), Lifesteal in rounds for the two other endings at zero, and hunts
 * with a tracker in each mode and a head start. Each mechanic appears at least once with its
 * optional fields and once without.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import type { GameSample } from '../samples';

const HEART_ITEM: JsonObject = {
  item: 'minecraft:red_dye',
  name: 'Heart',
  model: 'minecraft:heart_of_the_sea',
  recipe: {
    pattern: ['DND', 'NTN', 'DND'],
    key: {
      D: 'minecraft:diamond_block',
      N: 'minecraft:netherite_scrap',
      T: 'minecraft:totem_of_undying',
    },
  },
};

const REVIVE_ITEM: JsonObject = {
  item: 'minecraft:beacon',
  name: 'Revive beacon',
  recipe: {
    pattern: ['HHH', 'HBH', 'HHH'],
    key: { H: 'minecraft:red_dye', B: 'minecraft:beacon' },
  },
};

const round = (kind: 'rounds' | 'endless'): JsonObject =>
  kind === 'endless'
    ? { kind, start: 'world_start', countdown: 0, win: [], after: 'stay' }
    : {
        kind,
        start: 'command',
        countdown: 0,
        length: 900,
        win: [{ type: 'last_standing', by: 'players' }],
        after: 'stay',
      };

const game = (
  name: string,
  id: string,
  data: Record<string, Json>,
  mechanics: readonly JsonObject[],
): GameSample => ({
  name,
  kind: 'msm:game',
  id,
  data: {
    type: 'custom',
    name: name.replace(/^./, (c) => c.toUpperCase()),
    players: { min: 2, max: 16 },
    round: round('rounds'),
    mechanics: [...mechanics],
    ...data,
  },
});

const HUNT_ROLES: Json = [
  { id: 'runner', name: 'Runner', count: 1 },
  { id: 'hunter', name: 'Hunters', count: 'rest' },
];

/** The games, one per mechanic setting worth pinning. */
export const MECHANIC_SAMPLES: readonly GameSample[] = [
  game('lifesteal', 'demo:lifesteal', { type: 'lifesteal', round: round('endless') }, [
    {
      type: 'hearts',
      start: 10,
      most: 20,
      per_kill: 1,
      at_zero: 'kept_out',
      kept_out_seconds: 3600,
      heart_item: HEART_ITEM,
      withdraw: true,
      revive: { item: REVIVE_ITEM, hearts: 3 },
    },
  ]),
  game('spectate', 'demo:spectate', { type: 'lifesteal' }, [
    {
      type: 'hearts',
      start: 5,
      most: 10,
      per_kill: 2,
      other_deaths: 'keep',
      at_zero: 'spectate',
      withdraw: false,
    },
  ]),
  game('again', 'demo:again', { type: 'lifesteal' }, [
    {
      type: 'hearts',
      start: 10,
      most: 15,
      per_kill: 1,
      at_zero: 'start_again',
      start_again_hearts: 3,
      heart_item: { item: 'minecraft:apple', name: 'Heart' },
      withdraw: false,
    },
  ]),
  game('hunt', 'demo:hunt', { type: 'manhunt', roles: HUNT_ROLES }, [
    {
      type: 'tracker',
      holder: 'hunter',
      target: 'runner',
      every_seconds: 1,
      other_dimension: 'last_place',
      name: 'Tracker',
    },
    { type: 'head_start', held: 'hunter', seconds: 30, blind: true },
  ]),
  game('spin', 'demo:spin', { type: 'manhunt', roles: HUNT_ROLES, dimension: 'demo:arena' }, [
    {
      type: 'tracker',
      holder: 'hunter',
      target: 'runner',
      every_seconds: 5,
      other_dimension: 'spin',
    },
    { type: 'head_start', held: 'runner', seconds: 10, blind: false },
  ]),
];

/** The ids the samples use that no sample lowers. */
export const MECHANIC_EXTRA_IDS: Readonly<Record<string, readonly string[]>> = {
  dimension: ['demo:arena'],
};
