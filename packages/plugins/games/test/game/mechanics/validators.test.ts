/**
 * The checks of the mechanics `hearts`, `tracker` and `head_start` (B725), run through the game
 * validator: one case per code of `HEARTS_PROBLEM_CODES`, `TRACKER_PROBLEM_CODES` and
 * `HEAD_START_PROBLEM_CODES`, the samples quiet, and the hearts checks the game validator already
 * makes (B724) not made twice.
 */
import type { Json, JsonObject, Problem, ValidationInput } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { gameValidator } from '../../../src/index';
import { HEAD_START_PROBLEM_CODES } from '../../../src/validators-mechanics/head-start';
import { HEARTS_PROBLEM_CODES, shapedRecipeFaults } from '../../../src/validators-mechanics/hearts';
import { TRACKER_PROBLEM_CODES } from '../../../src/validators-mechanics/tracker';
import { element } from '../../pieces-support';
import { PIECES, sampleElement } from '../samples';
import { MECHANIC_SAMPLES } from './samples';

const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');

const PIECE_ELEMENTS = PIECES.map(sampleElement);

function problemsOf(data: Record<string, Json>, mechanics: readonly JsonObject[]): Problem[] {
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
    roles: [
      { id: 'runner', name: 'Runner', count: 1 },
      { id: 'hunter', name: 'Hunters', count: 'rest' },
    ],
    mechanics: [...mechanics],
    ...data,
  });
  const input = {
    elements: [game, ...PIECE_ELEMENTS],
    target: bundle?.target,
    registry: {},
  } as unknown as ValidationInput;
  return gameValidator.validate(input) as Problem[];
}

const codes = (problems: readonly Problem[]): string[] =>
  problems.map((problem) => `${problem.code} ${problem.path ?? ''}`);

const HEARTS: JsonObject = {
  type: 'hearts',
  start: 10,
  most: 20,
  per_kill: 1,
  at_zero: 'spectate',
  withdraw: false,
};

describe('the checks of hearts, tracker and head start', () => {
  it('have codes of the games plugin', () => {
    for (const code of [
      ...HEARTS_PROBLEM_CODES,
      ...TRACKER_PROBLEM_CODES,
      ...HEAD_START_PROBLEM_CODES,
    ]) {
      expect(code.startsWith('games.')).toBe(true);
    }
  });

  it('find nothing in the samples', () => {
    for (const sample of MECHANIC_SAMPLES) {
      const game = sampleElement(sample);
      const input = {
        elements: [game, ...PIECE_ELEMENTS],
        target: bundle?.target,
        registry: {},
      } as unknown as ValidationInput;
      const found = (gameValidator.validate(input) as Problem[]).filter(
        (problem) => problem.severity !== 'info',
      );
      expect(codes(found), sample.name).toEqual([]);
    }
  });

  it('hearts: most below start, above the most, out for good, recipes, same items', () => {
    expect(codes(problemsOf({}, [{ ...HEARTS, start: 12, most: 10 }]))).toEqual([
      'games.hearts.most-below-start /mechanics/0/most',
    ]);
    expect(
      codes(
        problemsOf({}, [
          {
            ...HEARTS,
            at_zero: 'start_again',
            start_again_hearts: 30,
            revive: { item: { item: 'minecraft:beacon', name: 'Revive' }, hearts: 25 },
          },
        ]),
      ),
    ).toEqual([
      'games.hearts.above-most /mechanics/0/start_again_hearts',
      'games.hearts.above-most /mechanics/0/revive/hearts',
    ]);
    expect(
      codes(
        problemsOf(
          {
            round: { kind: 'endless', start: 'world_start', countdown: 0, win: [], after: 'stay' },
          },
          [HEARTS],
        ),
      ),
    ).toEqual(['games.hearts.out-for-good /mechanics/0/at_zero']);
    const heart = {
      item: 'minecraft:red_dye',
      name: 'Heart',
      recipe: { pattern: ['DD', 'D'], key: { D: 'minecraft:diamond', X: 'minecraft:stone' } },
    };
    const found = problemsOf({}, [
      { ...HEARTS, heart_item: heart, revive: { item: heart, hearts: 3 } },
    ]);
    expect(codes(found)).toEqual([
      'games.hearts.recipe /mechanics/0/heart_item/recipe',
      'games.hearts.recipe /mechanics/0/revive/item/recipe',
      'games.hearts.same-item /mechanics/0/revive/item',
    ]);
    expect(found[0]?.message).toContain('"X" has an item but is not in the pattern');
    expect(shapedRecipeFaults({ pattern: ['AB '], key: { A: 'x', B: 'y' } })).toEqual([]);
    expect(shapedRecipeFaults({ pattern: ['AC'], key: { A: 'x' } })).toEqual([
      '"C" in the pattern has no item',
    ]);
  });

  it('hearts: the game validator’s own checks are not made twice', () => {
    const found = codes(problemsOf({}, [{ ...HEARTS, withdraw: true, at_zero: 'kept_out' }]));
    expect(found).toEqual([
      'games.game.withdraw-needs-heart /mechanics/0/withdraw',
      'games.game.at-zero-needs /mechanics/0/kept_out_seconds',
    ]);
  });

  it('tracker: unknown roles, a role tracking itself, several targets', () => {
    const tracker = { type: 'tracker', every_seconds: 1, other_dimension: 'last_place' };
    expect(codes(problemsOf({}, [{ ...tracker, holder: 'seeker', target: 'runner' }]))).toEqual([
      'games.tracker.unknown-role /mechanics/0/holder',
    ]);
    expect(codes(problemsOf({}, [{ ...tracker, holder: 'runner', target: 'runner' }]))).toEqual([
      'games.tracker.same-role /mechanics/0/target',
    ]);
    const many = problemsOf({}, [{ ...tracker, holder: 'runner', target: 'hunter' }]);
    expect(codes(many)).toEqual(['games.tracker.many-targets /mechanics/0/target']);
    expect(many[0]?.severity).toBe('info');
  });

  it('head start: an unknown role, longer than the round', () => {
    expect(
      codes(problemsOf({}, [{ type: 'head_start', held: 'ghost', seconds: 10, blind: false }])),
    ).toEqual(['games.head-start.unknown-role /mechanics/0/held']);
    expect(
      codes(
        problemsOf(
          {
            round: {
              kind: 'rounds',
              start: 'command',
              countdown: 0,
              length: 60,
              win: [{ type: 'last_standing', by: 'players' }],
              after: 'stay',
            },
          },
          [{ type: 'head_start', held: 'hunter', seconds: 60, blind: false }],
        ),
      ),
    ).toEqual(['games.head-start.longer-than-round /mechanics/0/seconds']);
  });
});
