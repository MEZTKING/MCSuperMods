/**
 * Numbers in loot data (B605): the `context_int_provider` and `context_float_provider` types and
 * enchantments' level-based values are worked out by B604's evaluator (`predicates/numbers.ts`);
 * this module takes over its notes into the roll (a number it cannot work out counts 0 and marks
 * the stacks uncertain) and records each type's fidelity for the view. The world generation int
 * providers that enchantment providers use are worked out here. Seeded throughout.
 *
 * Fidelity (B600 2S1): plain, `uniform`, `binomial`, `weighted_list` and `number_dispatcher` are
 * checked on the real server; the arithmetic types, `constant`, `conditional` and level-based
 * values other than `linear` are about right (written from their fields); `score`, `storage`,
 * `environment_attribute` and `enchantment_level` (outside an enchantment) need the game: they
 * are reported, and a `fallback` is used where the data gives one.
 */

import type { Json } from '@msm/plugin-api';
import type { Env } from '../predicates/env.js';
import {
  floatValue as floatOf,
  intValue as intOf,
  levelValue as levelOf,
  type NumberValue,
} from '../predicates/numbers.js';
import {
  asNumber,
  asObject,
  type LootFidelity,
  nextInt,
  type RollState,
  report,
  typeName,
  use,
} from './state.js';

/** The int provider types and how close each is. */
export const INT_NUMBER_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  abs: 'about_right',
  add: 'about_right',
  avg: 'about_right',
  binomial: 'checked',
  conditional: 'about_right',
  constant: 'about_right',
  div: 'about_right',
  environment_attribute: 'only_in_game',
  floor_div: 'about_right',
  floor_mod: 'about_right',
  from_float: 'about_right',
  max: 'about_right',
  min: 'about_right',
  mod: 'about_right',
  mul: 'about_right',
  negate: 'about_right',
  number_dispatcher: 'checked',
  pow: 'about_right',
  score: 'only_in_game',
  storage: 'only_in_game',
  sub: 'about_right',
  uniform: 'checked',
  weighted_list: 'checked',
};

/** The float provider types and how close each is. */
export const FLOAT_NUMBER_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  abs: 'about_right',
  add: 'about_right',
  avg: 'about_right',
  ceil: 'about_right',
  conditional: 'about_right',
  constant: 'about_right',
  cos: 'about_right',
  div: 'about_right',
  enchantment_level: 'only_in_game',
  environment_attribute: 'only_in_game',
  floor: 'about_right',
  from_int: 'about_right',
  length: 'about_right',
  max: 'about_right',
  min: 'about_right',
  mod: 'about_right',
  mul: 'about_right',
  negate: 'about_right',
  number_dispatcher: 'about_right',
  pow: 'about_right',
  round: 'about_right',
  sin: 'about_right',
  sqrt: 'about_right',
  storage: 'only_in_game',
  sub: 'about_right',
  truncate: 'about_right',
  uniform: 'checked',
  weighted_list: 'about_right',
};

/** Enchantments' level-based value types and how close each is. */
export const LEVEL_VALUE_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  clamped: 'about_right',
  exponent: 'about_right',
  fraction: 'about_right',
  levels_squared: 'about_right',
  linear: 'checked',
  lookup: 'about_right',
};

/** World generation int provider types (enchantment providers' levels and costs). */
export const INT_PROVIDER_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  clamped: 'about_right',
  constant: 'about_right',
  uniform: 'about_right',
  weighted_list: 'about_right',
};

/** A fresh evaluation state of B604's number evaluator over the roll's situation. */
function envOf(state: RollState): Env {
  return { situation: state.situation, ctx: state.ctx, unsupported: [], refs: [] };
}

/** Takes over B604's notes; a number it could not work out counts 0, marked uncertain. */
function adopt(state: RollState, env: Env, value: NumberValue | number | undefined): number {
  for (const note of env.unsupported) report(state, note.kind, note.type, note.path, note.reason);
  if (value === undefined) {
    state.taint = true;
    return 0;
  }
  return typeof value === 'number' ? value : value.value;
}

/** Notes the provider type a value uses, for the fidelity line. */
function noteType(
  state: RollState,
  value: Json | undefined,
  table: Readonly<Record<string, LootFidelity>>,
  kind: 'number' | 'level_value',
): void {
  const type = typeName(asObject(value)?.type);
  const fidelity = table[type];
  if (fidelity) use(state, kind, type, fidelity);
}

/**
 * The two commonest numbers worked out here for speed, with the same draws as B604's evaluator:
 * a plain number, and `uniform` with plain bounds. Anything else is `undefined`.
 */
function quick(state: RollState, value: Json | undefined, isInt: boolean): number | undefined {
  if (typeof value === 'number') return isInt ? Math.trunc(value) : value;
  const object = asObject(value);
  if (!object || typeName(object.type) !== 'uniform') return undefined;
  const { min, max } = object;
  if (typeof min !== 'number' || typeof max !== 'number') return undefined;
  use(state, 'number', 'uniform', 'checked');
  if (!isInt) return state.random.range(min, max);
  const lo = Math.trunc(min);
  const hi = Math.trunc(max);
  return hi < lo ? lo : state.random.int(lo, hi);
}

/** An int number provider's value (B604's evaluator; 0 and uncertain when it cannot say). */
export function intValue(state: RollState, value: Json | undefined, path: string): number {
  const fast = quick(state, value, true);
  if (fast !== undefined) return fast;
  noteType(state, value, INT_NUMBER_SUPPORT, 'number');
  const env = envOf(state);
  return Math.trunc(adopt(state, env, intOf(value, path, env)));
}

/** A float number provider's value (B604's evaluator; 0 and uncertain when it cannot say). */
export function floatValue(state: RollState, value: Json | undefined, path: string): number {
  const fast = quick(state, value, false);
  if (fast !== undefined) return fast;
  noteType(state, value, FLOAT_NUMBER_SUPPORT, 'number');
  const env = envOf(state);
  return adopt(state, env, floatOf(value, path, env));
}

/** An enchantment's level-based value at `level` (B604's evaluator). */
export function levelValue(
  state: RollState,
  value: Json | undefined,
  level: number,
  path: string,
): number {
  noteType(state, value, LEVEL_VALUE_SUPPORT, 'level_value');
  const env = envOf(state);
  return adopt(state, env, levelOf(value, level, path, env));
}

/** A world generation int provider's value (enchantment providers' `level` and `cost`). */
export function intProvider(state: RollState, value: Json | undefined, path: string): number {
  if (typeof value === 'number') return Math.trunc(value);
  const object = asObject(value);
  if (!object) {
    report(state, 'number', 'missing', path, 'not_supported');
    return 0;
  }
  const type = typeName(object.type);
  const min = asNumber(object.min_inclusive);
  const max = asNumber(object.max_inclusive);
  const fidelity = INT_PROVIDER_SUPPORT[type];
  if (fidelity) use(state, 'number', type, fidelity);
  switch (type) {
    case 'constant':
      return Math.trunc(asNumber(object.value) ?? 0);
    case 'uniform': {
      const lo = min ?? 0;
      const hi = max ?? lo;
      return hi < lo ? lo : lo + nextInt(state.random, hi - lo + 1);
    }
    case 'weighted_list': {
      const items = Array.isArray(object.distribution) ? object.distribution : [];
      let total = 0;
      for (const item of items) total += Math.max(0, asNumber(asObject(item)?.weight) ?? 0);
      let x = nextInt(state.random, total);
      for (const [i, item] of items.entries()) {
        const entry = asObject(item);
        x -= Math.max(0, asNumber(entry?.weight) ?? 0);
        if (x < 0) return intProvider(state, entry?.data, `${path}/distribution/${i}/data`);
      }
      return 0;
    }
    case 'clamped': {
      const v = intProvider(state, object.source, `${path}/source`);
      return Math.min(max ?? v, Math.max(min ?? v, v));
    }
    default:
      // biased_to_bottom, clamped_normal, trapezoid: shapes this evaluator does not draw; the
      // middle of the range stands in, marked uncertain.
      report(state, 'number', type || 'no type', path, 'not_supported');
      return min !== undefined && max !== undefined ? Math.round((min + max) / 2) : (min ?? 0);
  }
}
