/**
 * The game and kit validators (B724; ADR 0132 D1 to D3, D6): one case per code of
 * `GAME_PROBLEM_CODES` and `KIT_PROBLEM_CODES`, cases that must stay quiet, the samples free of
 * problems, and the validators listed by the plugin now that the kinds are.
 */
import type { Element, Json, Problem, ValidationInput } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { gameValidator, kitValidator } from '../../src/index';
import { GAME_PROBLEM_CODES } from '../../src/validators-game';
import { KIT_PROBLEM_CODES, playerSlot } from '../../src/validators-kit';
import { element } from '../pieces-support';
import { GAME_SAMPLES, KIT_SAMPLES, PIECES, sampleElement } from './samples';

const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');

const ALL = [...GAME_SAMPLES, ...KIT_SAMPLES, ...PIECES].map(sampleElement);
const PIECE_ELEMENTS = [...KIT_SAMPLES, ...PIECES].map(sampleElement);

function validate(elements: readonly Element[]): Problem[] {
  const input = { elements, target: bundle?.target, registry: {} } as unknown as ValidationInput;
  return [
    ...(gameValidator.validate(input) as Problem[]),
    ...(kitValidator.validate(input) as Problem[]),
  ];
}

/** The problems of one game made from `data` over the default game, with the pieces. */
function gameProblems(data: Record<string, Json>, extra: readonly Element[] = []): Problem[] {
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
    mechanics: [],
    ...data,
  });
  return validate([game, ...PIECE_ELEMENTS, ...extra]);
}

const codes = (problems: readonly Problem[]): string[] => problems.map((problem) => problem.code);

const round = (extra: Record<string, Json>): Json => ({
  kind: 'rounds',
  start: 'command',
  countdown: 0,
  win: [],
  after: 'stay',
  ...extra,
});

describe('the game and kit validators', () => {
  it('are listed by the plugin, with their own codes', () => {
    expect(plugin.contributes.validators).toContain(gameValidator);
    expect(plugin.contributes.validators).toContain(kitValidator);
    expect(
      [...GAME_PROBLEM_CODES, ...KIT_PROBLEM_CODES].every((code) => code.startsWith('games.')),
    ).toBe(true);
    expect(gameValidator.kinds).toContain('msm:game');
    expect(kitValidator.kinds).toEqual(['msm:kit']);
  });

  it('find nothing in the samples, but one game too many', () => {
    for (const sample of GAME_SAMPLES) {
      expect(validate([sampleElement(sample), ...PIECE_ELEMENTS]), sample.name).toEqual([]);
    }
    const together = validate(ALL);
    expect(codes(together)).toEqual([
      'games.too-many-games',
      'games.too-many-games',
      'games.too-many-games',
    ]);
    expect(together.map((problem) => problem.elementId)).toEqual([
      'demo:floor',
      'demo:battle',
      'demo:forever',
    ]);
  });

  it('games.game.players', () => {
    expect(codes(gameProblems({ players: { min: 9, max: 8 } }))).toContain('games.game.players');
    expect(codes(gameProblems({ players: { min: 8, max: 8 } }))).toEqual([]);
  });

  it('games.game.never-ends', () => {
    expect(codes(gameProblems({ round: round({}) }))).toEqual(['games.game.never-ends']);
    expect(codes(gameProblems({ round: round({ length: 60 }) }))).toEqual([]);
    expect(codes(gameProblems({ round: round({ kind: 'endless' }) }))).toEqual([]);
  });

  it('checks roles: ids, twice, rest twice, too many', () => {
    const role = (id: string, count: Json, extra: Record<string, Json> = {}): Json => ({
      id,
      name: id,
      count,
      ...extra,
    });
    expect(codes(gameProblems({ roles: [role('Runner', 1)] }))).toEqual(['games.game.role-id']);
    expect(codes(gameProblems({ roles: [role('a', 1), role('a', 1)] }))).toEqual([
      'games.game.duplicate-role',
    ]);
    expect(codes(gameProblems({ roles: [role('a', 'rest'), role('b', 'rest')] }))).toEqual([
      'games.game.rest-twice',
    ]);
    const tooMany = gameProblems({ roles: [role('a', 5), role('b', 4)] });
    expect(tooMany.map((problem) => [problem.code, problem.severity])).toEqual([
      ['games.game.too-many-roles', 'error'],
    ]);
    const more = gameProblems({ roles: [role('a', 2), role('b', 1)] });
    expect(more.map((problem) => [problem.code, problem.severity])).toEqual([
      ['games.game.too-many-roles', 'warning'],
    ]);
    expect(codes(gameProblems({ roles: [role('a', 2), role('b', 'rest')] }))).toEqual([]);
  });

  it('games.game.unknown-reference and games.game.unknown-role', () => {
    const problems = gameProblems({
      roles: [{ id: 'a', name: 'A', count: 1, team: 'demo:nope', kit: 'demo:runners' }],
      round: round({
        play_area: 'demo:nowhere',
        win: [
          { type: 'role_dies', role: 'a', winner: 'zzz' },
          { type: 'score_target', objective: 'demo:nothing', target: 1, by: 'players' },
          { type: 'timer_ends', timer: 'demo:none', winner: 'nobody' },
        ],
      }),
      lobby: { spawn: [0, 64, 0], area: 'demo:missing', teams: 'none' },
    });
    expect(
      problems
        .filter((problem) => problem.code.startsWith('games.game.unknown'))
        .map((problem) => `${problem.code} ${problem.path}`),
    ).toEqual([
      'games.game.unknown-reference /roles/0/team',
      'games.game.unknown-reference /roles/0/kit',
      'games.game.unknown-reference /round/play_area',
      'games.game.unknown-role /round/win/0/winner',
      'games.game.unknown-reference /round/win/1/objective',
      'games.game.unknown-reference /round/win/2/timer',
      'games.game.unknown-reference /lobby/area',
    ]);
  });

  it('games.game.time-up-winner and games.game.time-up-never', () => {
    expect(
      codes(
        gameProblems({
          round: round({ length: 5, win: [{ type: 'timer_ends', winner: 'top_score' }] }),
        }),
      ),
    ).toEqual(['games.game.time-up-winner']);
    expect(
      codes(
        gameProblems({
          round: round({ length: 5, win: [{ type: 'timer_ends', winner: 'role' }] }),
        }),
      ),
    ).toEqual(['games.game.time-up-winner']);
    expect(
      codes(gameProblems({ round: round({ win: [{ type: 'timer_ends', winner: 'still_in' }] }) })),
    ).toEqual(['games.game.time-up-never']);
    expect(
      codes(
        gameProblems({
          round: round({
            win: [{ type: 'timer_ends', timer: 'demo:round_clock', winner: 'still_in' }],
          }),
        }),
      ),
    ).toEqual([]);
  });

  it('games.game.no-teams, games.game.no-lobby and games.game.play-area-unused', () => {
    expect(
      codes(gameProblems({ round: round({ win: [{ type: 'last_standing', by: 'teams' }] }) })),
    ).toEqual(['games.game.no-teams']);
    expect(
      codes(
        gameProblems({
          round: round({ win: [{ type: 'last_standing', by: 'teams' }] }),
          roles: [{ id: 'a', name: 'A', count: 'rest', team: 'demo:red' }],
        }),
      ),
    ).toEqual([]);
    expect(codes(gameProblems({ round: round({ length: 9, after: 'lobby' }) }))).toEqual([
      'games.game.no-lobby',
    ]);
    const spread = gameProblems({ round: round({ length: 9, play_area: 'demo:lobby' }) });
    expect(spread.map((problem) => [problem.code, problem.severity])).toEqual([
      ['games.game.play-area-unused', 'info'],
    ]);
  });

  it('games.game.lobby-spawn-outside', () => {
    expect(
      codes(gameProblems({ lobby: { spawn: [20, 64, 0], area: 'demo:lobby', teams: 'none' } })),
    ).toEqual(['games.game.lobby-spawn-outside']);
    expect(
      codes(gameProblems({ lobby: { spawn: [8, 60, -8], area: 'demo:lobby', teams: 'none' } })),
    ).toEqual([]);
  });

  it('checks mechanics: twice, unknown, and the hearts fields', () => {
    const hearts = (extra: Record<string, Json>): Json => ({
      type: 'hearts',
      start: 10,
      most: 20,
      per_kill: 1,
      at_zero: 'spectate',
      withdraw: false,
      ...extra,
    });
    expect(codes(gameProblems({ mechanics: [hearts({}), hearts({})] }))).toEqual([
      'games.game.duplicate-mechanic',
    ]);
    expect(codes(gameProblems({ mechanics: [{ type: 'jetpack' }] }))).toEqual([
      'games.game.unknown-mechanic',
    ]);
    expect(
      gameProblems({ mechanics: [hearts({ withdraw: true })] }).map(
        (problem) => `${problem.code} ${problem.path}`,
      ),
    ).toEqual(['games.game.withdraw-needs-heart /mechanics/0/withdraw']);
    expect(
      codes(
        gameProblems({
          mechanics: [
            hearts({ withdraw: true, heart_item: { item: 'minecraft:red_dye', name: 'Heart' } }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      gameProblems({ mechanics: [hearts({ at_zero: 'kept_out' })] }).map(
        (problem) => `${problem.code} ${problem.path}`,
      ),
    ).toEqual(['games.game.at-zero-needs /mechanics/0/kept_out_seconds']);
    expect(
      gameProblems({ mechanics: [hearts({ at_zero: 'start_again' })] }).map(
        (problem) => `${problem.code} ${problem.path}`,
      ),
    ).toEqual(['games.game.at-zero-needs /mechanics/0/start_again_hearts']);
    expect(
      codes(gameProblems({ mechanics: [hearts({ at_zero: 'kept_out', kept_out_seconds: 60 })] })),
    ).toEqual([]);
  });

  it('games.game.reserved-name, only with a game in the project', () => {
    const taken = element('msm:objective', 'demo:msm_game', { criterion: 'dummy', name: 'X' });
    expect(codes(gameProblems({}, [taken]))).toEqual(['games.game.reserved-name']);
    expect(codes(validate([taken]))).toEqual([]);
  });

  it('every game code has a case above', () => {
    // Pinned so a new code without a case fails here.
    expect(GAME_PROBLEM_CODES).toHaveLength(20);
  });
});

describe('the kit validator', () => {
  const kit = (data: Record<string, Json>): Problem[] =>
    validate([element('msm:kit', 'demo:k', { name: 'K', items: [], clear_first: false, ...data })]);

  it('games.kit.bad-slot', () => {
    expect(
      codes(kit({ items: [{ item: 'minecraft:stone', count: 1, slot: 'hotbar.9' }] })),
    ).toEqual(['games.kit.bad-slot']);
    expect(codes(kit({ items: [{ item: 'minecraft:stone', count: 1, slot: 'chest' }] }))).toEqual([
      'games.kit.bad-slot',
    ]);
    for (const slot of [
      'hotbar.0',
      'inventory.26',
      'container.35',
      'armor.feet',
      'weapon',
      'weapon.offhand',
      'enderchest.3',
    ]) {
      expect(codes(kit({ items: [{ item: 'minecraft:stone', count: 1, slot }] })), slot).toEqual(
        [],
      );
    }
  });

  it('games.kit.slot-twice', () => {
    expect(
      codes(
        kit({
          items: [
            { item: 'minecraft:stone', count: 1, slot: 'hotbar.2' },
            { item: 'minecraft:dirt', count: 1, slot: 'container.2' },
          ],
        }),
      ),
    ).toEqual(['games.kit.slot-twice']);
    expect(
      codes(
        kit({
          items: [{ item: 'minecraft:shield', count: 1, slot: 'weapon.offhand' }],
          off_hand: { item: 'minecraft:totem_of_undying' },
          armour: { head: { item: 'minecraft:iron_helmet' } },
        }),
      ),
    ).toEqual(['games.kit.slot-twice']);
  });

  it('games.kit.empty', () => {
    expect(codes(kit({}))).toEqual(['games.kit.empty']);
    expect(codes(kit({ effects: [{ effect: 'minecraft:speed', seconds: 5 }] }))).toEqual([]);
  });

  it('names a slot one way', () => {
    expect(playerSlot('hotbar.3')).toBe('container.3');
    expect(playerSlot('inventory.0')).toBe('container.9');
    expect(playerSlot('weapon')).toBe('weapon.mainhand');
    expect(playerSlot('armor.body')).toBeUndefined();
    expect(KIT_PROBLEM_CODES).toHaveLength(3);
  });
});
