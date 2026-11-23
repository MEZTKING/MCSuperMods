/**
 * Hand-written games and kits for the round engine's tests (B724): a hunt (roles, a lobby with
 * its area and building, a role that dies, an advancement), a floor game (enough players, a
 * countdown, last standing, a timer, the next round), a team battle (picked and split teams,
 * last team standing, a team score and the highest score when the time is up) and an endless
 * game (the world's start, late joiners dealt in). The goldens pin the round engine's own files
 * (`roundFiles`, `lobbyFiles`, `rolesFiles`), not the mechanics' (B725, B726): the battle's team
 * bases are there for the teams they name. The pieces they name are in {@link PIECES}.
 */
import type { Element, Json } from '@msm/plugin-api';
import { element } from '../pieces-support';

/** A sample game, kit or piece. */
export interface GameSample {
  readonly name: string;
  readonly kind: string;
  readonly id: string;
  readonly data: Json;
}

export const GAME_SAMPLES: readonly GameSample[] = [
  {
    name: 'hunt',
    kind: 'msm:game',
    id: 'demo:hunt',
    data: {
      type: 'manhunt',
      name: 'Hunt',
      players: { min: 2, max: 8 },
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 10,
        win: [
          { type: 'role_dies', role: 'runner', winner: 'hunter' },
          { type: 'advancement', advancement: 'minecraft:end/kill_dragon', role: 'runner' },
        ],
        after: 'lobby',
      },
      lobby: {
        spawn: [0, 65, 0],
        area: 'demo:lobby',
        building: { structure: 'demo:lobby_hut', at: [-4, 64, -4] },
        teams: 'none',
      },
      roles: [
        { id: 'runner', name: 'Runner', count: 1, team: 'demo:runners', kit: 'demo:runner_kit' },
        {
          id: 'hunter',
          name: 'Hunter',
          count: 'rest',
          team: 'demo:hunters',
          kit: 'demo:hunter_kit',
        },
      ],
      mechanics: [],
    },
  },
  {
    name: 'floor',
    kind: 'msm:game',
    id: 'demo:floor',
    data: {
      type: 'spleef',
      name: 'Floor',
      players: { min: 2, max: 16 },
      round: {
        kind: 'rounds',
        start: 'enough_players',
        countdown: 5,
        length: 300,
        win: [
          { type: 'last_standing', by: 'players' },
          { type: 'timer_ends', timer: 'demo:round_clock', winner: 'still_in' },
        ],
        after: 'next_round',
      },
      lobby: { spawn: [100, 70, 100], teams: 'none' },
      mechanics: [],
    },
  },
  {
    name: 'battle',
    kind: 'msm:game',
    id: 'demo:battle',
    data: {
      type: 'custom',
      name: 'Battle',
      players: { min: 2, max: 12 },
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 0,
        length: 600,
        win: [
          { type: 'last_standing', by: 'teams' },
          { type: 'score_target', objective: 'demo:kills', target: 10, by: 'teams' },
          { type: 'timer_ends', winner: 'top_score', objective: 'demo:kills' },
        ],
        after: 'lobby',
      },
      lobby: { spawn: [0, 100, 0], teams: 'pick' },
      roles: [{ id: 'captain', name: 'Captain', count: 2, kit: 'demo:captain_kit' }],
      mechanics: [
        {
          type: 'team_base',
          bases: [
            { team: 'demo:red', bed: [10, 64, 0], spawn: [10, 65, 2] },
            { team: 'demo:blue', bed: [-10, 64, 0], spawn: [-10, 65, 2] },
          ],
          respawn_seconds: 5,
        },
      ],
    },
  },
  {
    name: 'endless',
    kind: 'msm:game',
    id: 'demo:forever',
    data: {
      type: 'lifesteal',
      name: 'Forever',
      players: { min: 2, max: 100 },
      round: {
        kind: 'endless',
        start: 'world_start',
        countdown: 0,
        win: [{ type: 'score_target', objective: 'demo:kills', target: 50, by: 'players' }],
        after: 'stay',
      },
      roles: [{ id: 'player', name: 'Player', count: 'rest' }],
      mechanics: [],
    },
  },
];

export const KIT_SAMPLES: readonly GameSample[] = [
  {
    name: 'runner',
    kind: 'msm:kit',
    id: 'demo:runner_kit',
    data: {
      name: 'Runner',
      items: [
        { item: 'minecraft:stone_axe', count: 1, slot: 'hotbar.0' },
        { item: 'minecraft:bread', count: 16 },
        {
          item: 'minecraft:compass',
          count: 1,
          components: { 'minecraft:custom_name': { text: 'Finder', color: 'gold' } },
        },
      ],
      armour: { feet: { item: 'minecraft:leather_boots' } },
      off_hand: { item: 'minecraft:shield' },
      effects: [{ effect: 'minecraft:speed', seconds: 30, amplifier: 1, hide_particles: true }],
      clear_first: true,
    },
  },
  {
    name: 'hunter',
    kind: 'msm:kit',
    id: 'demo:hunter_kit',
    data: {
      name: 'Hunter',
      items: [
        {
          item: 'minecraft:iron_sword',
          count: 1,
          slot: 'hotbar.0',
          components: {
            'minecraft:enchantments': { 'minecraft:sharpness': 2 },
            'minecraft:unbreakable': {},
          },
        },
      ],
      armour: {
        head: { item: 'minecraft:iron_helmet' },
        chest: { item: 'minecraft:iron_chestplate' },
      },
      clear_first: false,
    },
  },
  {
    name: 'captain',
    kind: 'msm:kit',
    id: 'demo:captain_kit',
    data: {
      name: 'Captain',
      items: [
        {
          item: 'minecraft:diamond_shovel',
          count: 1,
          slot: 'inventory.3',
          components: { 'minecraft:can_break': { blocks: 'minecraft:snow_block' } },
        },
      ],
      clear_first: true,
    },
  },
];

/** The pieces the sample games name. */
export const PIECES: readonly GameSample[] = [
  {
    name: 'runners',
    kind: 'msm:team',
    id: 'demo:runners',
    data: { name: 'Runners', colour: 'green' },
  },
  {
    name: 'hunters',
    kind: 'msm:team',
    id: 'demo:hunters',
    data: { name: 'Hunters', colour: 'red' },
  },
  { name: 'red', kind: 'msm:team', id: 'demo:red', data: { name: 'Red', colour: 'red' } },
  { name: 'blue', kind: 'msm:team', id: 'demo:blue', data: { name: 'Blue', colour: 'blue' } },
  {
    name: 'kills',
    kind: 'msm:objective',
    id: 'demo:kills',
    data: { criterion: 'playerKillCount', name: 'Kills', display: 'sidebar', render: 'integer' },
  },
  {
    name: 'round_clock',
    kind: 'msm:timer',
    id: 'demo:round_clock',
    data: {
      seconds: 120,
      count: 'down',
      show: 'boss_bar',
      colour: 'white',
      repeat: false,
      starts: 'manual',
    },
  },
  {
    name: 'lobby',
    kind: 'msm:area',
    id: 'demo:lobby',
    data: { name: 'Lobby', dimension: 'minecraft:overworld', from: [-8, 60, -8], to: [8, 80, 8] },
  },
];

/** The ids the samples use that no sample lowers. */
export const SAMPLE_EXTRA_IDS: Readonly<Record<string, readonly string[]>> = {
  structure: ['demo:lobby_hut'],
};

/** A sample as an element. */
export const sampleElement = (sample: GameSample): Element =>
  element(sample.kind, sample.id, sample.data);
