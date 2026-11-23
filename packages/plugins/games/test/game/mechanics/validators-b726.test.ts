/**
 * The checks of the mechanics `elimination`, `fall_out`, `floor`, `team_base`, `generators`,
 * `shop`, `border` and `kit_on` (B726): one case per code, the samples free of problems, and
 * every code listed by its file.
 */
import type { Element, Json, JsonObject, Problem, ValidationInput } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { gameValidator } from '../../../src/index';
import { BORDER_PROBLEM_CODES } from '../../../src/validators-mechanics/border';
import { ELIMINATION_PROBLEM_CODES } from '../../../src/validators-mechanics/elimination';
import { FALL_OUT_PROBLEM_CODES } from '../../../src/validators-mechanics/fall-out';
import { FLOOR_PROBLEM_CODES } from '../../../src/validators-mechanics/floor';
import { GENERATORS_PROBLEM_CODES } from '../../../src/validators-mechanics/generators';
import { KIT_ON_PROBLEM_CODES } from '../../../src/validators-mechanics/kit-on';
import { SHOP_PROBLEM_CODES } from '../../../src/validators-mechanics/shop';
import { TEAM_BASE_PROBLEM_CODES } from '../../../src/validators-mechanics/team-base';
import { element } from '../../pieces-support';
import { KIT_SAMPLES, PIECES, sampleElement } from '../samples';
import { B726_PIECES, expandedSamples } from './samples-b726';

const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');

const OTHERS = [...KIT_SAMPLES, ...PIECES, ...B726_PIECES].map(sampleElement);

function validate(elements: readonly Element[]): Problem[] {
  const input = { elements, target: bundle?.target, registry: {} } as unknown as ValidationInput;
  return gameValidator.validate(input) as Problem[];
}

/** The codes of the problems of one game with `mechanics` (and `data` over the default). */
function codesOf(mechanics: readonly JsonObject[], data: Record<string, Json> = {}): string[] {
  const game = element('msm:game', 'demo:g', {
    type: 'custom',
    name: 'G',
    players: { min: 2, max: 8 },
    round: {
      kind: 'rounds',
      start: 'command',
      countdown: 0,
      win: [{ type: 'last_standing', by: 'players' }],
      after: 'stay',
    },
    mechanics: [...mechanics],
    ...data,
  });
  return validate([game, ...OTHERS]).map((problem) => problem.code);
}

const ALL_CODES = [
  ...ELIMINATION_PROBLEM_CODES,
  ...FALL_OUT_PROBLEM_CODES,
  ...FLOOR_PROBLEM_CODES,
  ...TEAM_BASE_PROBLEM_CODES,
  ...GENERATORS_PROBLEM_CODES,
  ...SHOP_PROBLEM_CODES,
  ...BORDER_PROBLEM_CODES,
  ...KIT_ON_PROBLEM_CODES,
];

const FLOOR: JsonObject = {
  type: 'floor',
  area: 'demo:snow_floor',
  block: 'minecraft:snow_block',
  tool: 'minecraft:diamond_shovel',
  drops: false,
};
const FALL: JsonObject = { type: 'fall_out', below_y: 60, action: 'out' };
const LOBBY: Json = { spawn: [0, 100, 0], teams: 'auto' };

describe('the checks of B726’s mechanics', () => {
  it('find nothing in the samples', () => {
    for (const game of expandedSamples([...PIECES, ...KIT_SAMPLES])) {
      expect(validate([game, ...OTHERS]), game.id).toEqual([]);
    }
  });

  it('have their own codes, each met below', () => {
    expect(ALL_CODES.every((code) => code.startsWith('games.'))).toBe(true);
    expect(new Set(ALL_CODES).size).toBe(ALL_CODES.length);
  });

  it('elimination', () => {
    expect(codesOf([{ type: 'elimination', lives: 2, out: 'lobby', announce: true }])).toEqual([
      'games.elimination.no-lobby',
    ]);
    expect(
      codesOf([{ type: 'elimination', lives: 2, out: 'lobby', announce: true }], { lobby: LOBBY }),
    ).toEqual([]);
    expect(
      codesOf([{ type: 'elimination', lives: 2, out: 'spectate', announce: true }], {
        round: { kind: 'endless', start: 'command', countdown: 0, win: [], after: 'stay' },
      }),
    ).toEqual(['games.elimination.endless']);
  });

  it('fall_out', () => {
    // The floor is at 64: a fall below 70 counts players standing on it.
    const floor = { ...FLOOR, from: [0, 64, 0], to: [31, 64, 31] };
    expect(codesOf([floor, { ...FALL, below_y: 70 }])).toEqual(['games.fall-out.above-floor']);
    expect(codesOf([floor, { ...FALL, below_y: 65 }])).toEqual([]);
    expect(
      codesOf([{ ...FALL, action: 'back' }], {
        round: { kind: 'endless', start: 'command', countdown: 0, win: [], after: 'stay' },
      }),
    ).toEqual(['games.fall-out.back-endless']);
  });

  it('floor', () => {
    const box = { from: [0, 64, 0], to: [31, 64, 31] };
    expect(codesOf([{ ...FLOOR, ...box }, FALL])).toEqual([]);
    expect(codesOf([{ ...FLOOR, area: 'demo:nowhere' }, FALL])).toEqual([
      'games.floor.unknown-area',
    ]);
    expect(codesOf([FLOOR, FALL])).toEqual(['games.floor.not-rebuilt']);
    expect(codesOf([{ ...FLOOR, ...box }])).toEqual(['games.floor.no-fall-out']);
    expect(
      codesOf([
        { ...FLOOR, ...box, area: 'demo:nether_floor' },
        { ...FALL, below_y: 30 },
      ]),
    ).toEqual(['games.floor.other-dimension']);
    // The lobby's area is 21 blocks tall.
    expect(codesOf([{ ...FLOOR, ...box, area: 'demo:lobby' }, FALL])).toEqual(['games.floor.tall']);
  });

  it('team_base', () => {
    const base = (team: string, spawn: number[] = [0, 65, 2]): JsonObject => ({
      team,
      bed: [0, 64, 0],
      spawn,
    });
    const bases = (...list: JsonObject[]): JsonObject[] => [
      { type: 'team_base', bases: list, respawn_seconds: 5 },
    ];
    expect(codesOf(bases(base('demo:red'), base('demo:blue')), { lobby: LOBBY })).toEqual([]);
    expect(codesOf(bases(base('demo:purple')), { lobby: LOBBY })).toEqual([
      'games.team-base.unknown-team',
    ]);
    expect(codesOf(bases(base('demo:red'), base('demo:red')), { lobby: LOBBY })).toEqual([
      'games.team-base.duplicate-team',
    ]);
    expect(codesOf(bases(base('demo:red', [0, 64, 0])), { lobby: LOBBY })).toEqual([
      'games.team-base.spawn-on-bed',
    ]);
    expect(
      codesOf(bases(base('demo:red')), { lobby: { spawn: [0, 100, 0], teams: 'none' } }),
    ).toEqual(['games.team-base.no-teams']);
    // A role that puts its players on the team gives them the base.
    expect(
      codesOf(bases(base('demo:red')), {
        lobby: { spawn: [0, 100, 0], teams: 'none' },
        roles: [{ id: 'red', name: 'Red', count: 'rest', team: 'demo:red' }],
      }),
    ).toEqual([]);
  });

  it('generators', () => {
    const generator = (extra: Record<string, Json> = {}): JsonObject => ({
      at: [0, 64, 0],
      item: 'minecraft:iron_ingot',
      every_seconds: 1,
      cap: 16,
      ...extra,
    });
    expect(
      codesOf([{ type: 'generators', generators: [generator({ team: 'demo:red' })] }]),
    ).toEqual([]);
    expect(
      codesOf([{ type: 'generators', generators: [generator({ team: 'demo:purple' })] }]),
    ).toEqual(['games.generators.unknown-team']);
    expect(codesOf([{ type: 'generators', generators: [generator(), generator()] }])).toEqual([
      'games.generators.same-place',
    ]);
  });

  it('shop', () => {
    const offer: JsonObject = {
      cost: { item: 'minecraft:iron_ingot', count: 4 },
      gives: { item: 'minecraft:stone_sword', count: 1 },
    };
    const shop = (extra: Record<string, Json> = {}): JsonObject => ({
      name: 'Shop',
      at: [0, 65, 0],
      way: 'menu',
      offers: [offer],
      ...extra,
    });
    expect(codesOf([{ type: 'shop', shops: [shop({ team: 'demo:red' })] }])).toEqual([]);
    expect(codesOf([{ type: 'shop', shops: [shop({ team: 'demo:purple' })] }])).toEqual([
      'games.shop.unknown-team',
    ]);
    expect(codesOf([{ type: 'shop', shops: [shop({ team: 'demo:red', way: 'trader' })] }])).toEqual(
      ['games.shop.trader-team'],
    );
    expect(codesOf([{ type: 'shop', shops: [shop(), shop()] }])).toEqual(['games.shop.same-place']);
    expect(
      codesOf([{ type: 'shop', shops: [shop({ offers: [{ cost: offer.cost as Json }] })] }]),
    ).toEqual(['games.shop.no-offers']);
  });

  it('border', () => {
    expect(codesOf([{ type: 'border', size: 100, shrink: { to: 20, seconds: 60 } }])).toEqual([]);
    expect(codesOf([{ type: 'border', size: 100, shrink: { to: 200, seconds: 60 } }])).toEqual([
      'games.border.grows',
    ]);
    expect(
      codesOf(
        [{ type: 'border', size: 100, shrink: { to: 20, seconds: 60, after_seconds: 300 } }],
        {
          round: {
            kind: 'rounds',
            start: 'command',
            countdown: 0,
            length: 300,
            win: [],
            after: 'stay',
          },
        },
      ),
    ).toEqual(['games.border.after-round']);
  });

  it('kit_on', () => {
    expect(codesOf([{ type: 'kit_on', start: 'demo:hunter_kit' }])).toEqual([]);
    expect(codesOf([{ type: 'kit_on', start: 'demo:nothing' }])).toEqual([
      'games.kit-on.unknown-kit',
    ]);
    expect(codesOf([{ type: 'kit_on' }])).toEqual(['games.kit-on.nothing']);
    expect(
      codesOf([{ type: 'kit_on', respawn: 'demo:hunter_kit' }], {
        roles: [{ id: 'all', name: 'All', count: 'rest', kit: 'demo:runner_kit' }],
      }),
    ).toEqual(['games.kit-on.roles-have-kits']);
  });
});
