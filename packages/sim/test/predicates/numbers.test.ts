/**
 * Number providers and level-based values (B604): plain, named and typed numbers, the draws
 * B600 checked (`uniform`, `binomial`, `weighted_list`, `number_dispatcher`) and the arithmetic
 * written from the fields; the types only the game knows answer unknown with a note.
 */
import type { Json, Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Unsupported } from '../../src/index.js';
import type { Env } from '../../src/predicates/env.js';
import { floatValue, intValue, levelValue } from '../../src/predicates/numbers.js';
import { contextFor, targetsOnce } from './helpers.js';

let target: Target;
beforeAll(async () => {
  target = (await targetsOnce())[0] as Target;
});

const envFor = (seed = 1, level?: number): Env => {
  const ctx = contextFor(
    target,
    {
      context_int_provider: { 'x:three': 3, 'x:loop': 'x:loop' },
      context_float_provider: { 'x:half': { type: 'minecraft:constant', value: 0.5 } },
    },
    {},
    seed,
  );
  const unsupported: Unsupported[] = [];
  return level === undefined
    ? { situation: { context: 'minecraft:generic' }, ctx, unsupported, refs: [] }
    : { situation: { context: 'minecraft:generic' }, ctx, unsupported, refs: [], level };
};

const int = (value: Json, env = envFor()) => intValue(value, '', env)?.value;
const float = (value: Json, env = envFor()) => floatValue(value, '', env)?.value;

describe('whole numbers', () => {
  it('works out plain, named and arithmetic numbers', () => {
    expect(int(4)).toBe(4);
    expect(int(4.7)).toBe(4);
    expect(int('x:three')).toBe(3);
    expect(int({ type: 'minecraft:constant', value: 2 })).toBe(2);
    expect(int({ type: 'add', inputs: [1, 2, 'x:three'] })).toBe(6);
    expect(int({ type: 'mul', inputs: [2, 3] })).toBe(6);
    expect(int({ type: 'min', inputs: [2, 3] })).toBe(2);
    expect(int({ type: 'max', inputs: [2, 3] })).toBe(3);
    expect(int({ type: 'avg', inputs: [2, 3] })).toBe(2);
    expect(int({ type: 'sub', left: 2, right: 5 })).toBe(-3);
    expect(int({ type: 'div', left: -7, right: 2 })).toBe(-3);
    expect(int({ type: 'floor_div', left: -7, right: 2 })).toBe(-4);
    expect(int({ type: 'mod', left: -7, right: 3 })).toBe(-1);
    expect(int({ type: 'floor_mod', left: -7, right: 3 })).toBe(2);
    expect(int({ type: 'pow', base: 2, exponent: 5 })).toBe(32);
    expect(int({ type: 'abs', input: -3 })).toBe(3);
    expect(int({ type: 'negate', input: 3 })).toBe(-3);
    expect(int({ type: 'from_float', input: 2.9 })).toBe(2);
    expect(
      int({ type: 'conditional', condition: { type: 'random_chance', chance: 1 }, on_true: 5 }),
    ).toBe(5);
    expect(
      int({ type: 'conditional', condition: { type: 'random_chance', chance: 0 }, on_true: 5 }),
    ).toBe(0);
    expect(
      int({
        type: 'number_dispatcher',
        cases: [
          { condition: { type: 'random_chance', chance: 0 }, value: 1 },
          { condition: { type: 'random_chance', chance: 1 }, value: 2 },
        ],
        default: 9,
      }),
    ).toBe(2);
  });

  it('draws uniform, binomial and weighted numbers from the seed', () => {
    const env = envFor(11);
    const counts = new Map<number, number>();
    for (let i = 0; i < 30_000; i++) {
      const n = int({ type: 'uniform', min: 1, max: 3 }, env) as number;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3]);
    for (const count of counts.values())
      expect(Math.abs(count / 30_000 - 1 / 3)).toBeLessThan(0.02);
    let sum = 0;
    for (let i = 0; i < 20_000; i++) sum += int({ type: 'binomial', n: 4, p: 0.25 }, env) as number;
    expect(sum / 20_000).toBeCloseTo(1, 1);
    let ones = 0;
    for (let i = 0; i < 20_000; i++) {
      const n = int(
        {
          type: 'weighted_list',
          distribution: [
            { data: 1, weight: 3 },
            { data: 7, weight: 1 },
          ],
        },
        env,
      );
      if (n === 1) ones++;
    }
    expect(Math.abs(ones / 20_000 - 0.75)).toBeLessThan(0.02);
    expect(intValue({ type: 'uniform', min: 0, max: 1 }, '', env)?.random).toBe(true);
    const a = envFor(4);
    const b = envFor(4);
    const draws = (env: Env) =>
      Array.from({ length: 10 }, () => int({ type: 'uniform', min: 0, max: 99 }, env));
    expect(draws(a)).toEqual(draws(b));
  });

  it('answers unknown with a note for what only the game holds or a missing file', () => {
    for (const [value, type, reason] of [
      [{ type: 'minecraft:score', target: 'this', score: 'x' }, 'score', 'needs_world'],
      [{ type: 'storage', storage: 'x:y', path: 'a' }, 'storage', 'needs_world'],
      [{ type: 'environment_attribute', attribute: 'x' }, 'environment_attribute', 'needs_world'],
      [{ type: 'made_up' }, 'made_up', 'not_supported'],
      [{ type: 'div', left: 1, right: 0 }, 'div', 'not_supported'],
    ] as const) {
      const env = envFor();
      expect(intValue(value as Json, '', env)).toBeUndefined();
      expect(env.unsupported[0]).toMatchObject({ kind: 'number', type, reason });
    }
    const missing = envFor();
    expect(intValue('x:nope', '', missing)).toBeUndefined();
    expect(missing.unsupported[0]).toMatchObject({
      kind: 'reference',
      type: 'x:nope',
      reason: 'missing_file',
    });
    const loop = envFor();
    expect(intValue('x:loop', '', loop)).toBeUndefined();
    expect(loop.unsupported[0]).toMatchObject({ kind: 'reference', type: 'x:loop' });
  });
});

describe('decimal numbers', () => {
  it('works out the decimal-only types', () => {
    expect(float('x:half')).toBe(0.5);
    expect(float({ type: 'ceil', input: 1.2 })).toBe(2);
    expect(float({ type: 'floor', input: 1.8 })).toBe(1);
    expect(float({ type: 'round', input: 1.5 })).toBe(2);
    expect(float({ type: 'truncate', input: -1.5 })).toBe(-1);
    expect(float({ type: 'sqrt', input: 9 })).toBe(3);
    expect(float({ type: 'sin', input: 0 })).toBe(0);
    expect(float({ type: 'cos', input: 0 })).toBe(1);
    expect(float({ type: 'length', inputs: [3, 4] })).toBe(5);
    expect(float({ type: 'from_int', input: 3 })).toBe(3);
    expect(float({ type: 'div', left: 1, right: 4 })).toBe(0.25);
    const u = float({ type: 'uniform', min: 2, max: 3 }) as number;
    expect(u).toBeGreaterThanOrEqual(2);
    expect(u).toBeLessThan(3);
  });

  it('reads the enchantment level only inside an enchantment', () => {
    const value = {
      type: 'enchantment_level',
      amount: { type: 'linear', base: 2, per_level_above_first: 1 },
    };
    expect(float(value, envFor(1, 3))).toBe(4);
    const plain = envFor();
    expect(floatValue(value, '', plain)).toBeUndefined();
    expect(plain.unsupported[0]).toMatchObject({
      type: 'enchantment_level',
      reason: 'needs_world',
    });
  });
});

describe('level-based values', () => {
  it('works out each type', () => {
    const env = envFor();
    expect(levelValue(2, 5, '', env)).toBe(2);
    expect(
      levelValue({ type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 }, 3, '', env),
    ).toBe(2);
    expect(
      levelValue(
        {
          type: 'clamped',
          value: { type: 'linear', base: 1, per_level_above_first: 1 },
          min: 0,
          max: 2,
        },
        5,
        '',
        env,
      ),
    ).toBe(2);
    expect(levelValue({ type: 'exponent', base: 2, power: 3 }, 1, '', env)).toBe(8);
    expect(levelValue({ type: 'fraction', numerator: 1, denominator: 4 }, 1, '', env)).toBe(0.25);
    expect(levelValue({ type: 'levels_squared', added: 1 }, 3, '', env)).toBe(10);
    expect(levelValue({ type: 'lookup', values: [5, 6], fallback: 9 }, 2, '', env)).toBe(6);
    expect(levelValue({ type: 'lookup', values: [5, 6], fallback: 9 }, 3, '', env)).toBe(9);
    expect(env.unsupported).toEqual([]);
    expect(levelValue({ type: 'made_up' }, 1, '', env)).toBeUndefined();
    expect(env.unsupported[0]).toMatchObject({ kind: 'level_value', type: 'made_up' });
  });
});
