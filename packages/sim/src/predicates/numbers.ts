/**
 * Number providers by type id (B604): `context_int_provider` and `context_float_provider`, each a
 * plain number, a named provider (a data file) or an object with a required `type` (B600's 2S1),
 * and the enchantments' level-based values. Seeded: every draw comes from the context's random.
 * Checked on the real server: plain, `uniform`, `binomial`, `weighted_list`, `number_dispatcher`;
 * the arithmetic, `conditional`, `constant` and the level-based values other than `linear` are
 * written from the fields (about right). `score`, `storage` and `environment_attribute` need the
 * world: only the game knows.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { normaliseId } from '../tags/lookup.js';
import type { Answer } from './api.js';
import { testCondition } from './conditions.js';
import { type Env, objectOf, pointer, report, typeOf } from './env.js';

/** A worked-out number; `random` when a draw went into it. */
export interface NumberValue {
  readonly value: number;
  readonly random: boolean;
}

/** Whole or decimal numbers. */
export type NumberSort = 'int' | 'float';

/** Plain words for the number types only the game works out. */
export const NUMBERS_ONLY_IN_THE_GAME: Readonly<Record<string, string>> = {
  score: 'A score on the scoreboard: only the game holds it.',
  storage: 'A value in command storage: only the game holds it.',
  environment_attribute:
    'An environment attribute of the world at a place: only the game knows it.',
};

/** Every number type handled here, whole and decimal (the schema walk checks the lists). */
export const INT_NUMBER_TYPES: readonly string[] = [
  'abs',
  'add',
  'avg',
  'binomial',
  'conditional',
  'constant',
  'div',
  'floor_div',
  'floor_mod',
  'from_float',
  'max',
  'min',
  'mod',
  'mul',
  'negate',
  'number_dispatcher',
  'pow',
  'sub',
  'uniform',
  'weighted_list',
];

/** Every decimal number type handled here. */
export const FLOAT_NUMBER_TYPES: readonly string[] = [
  'abs',
  'add',
  'avg',
  'ceil',
  'conditional',
  'constant',
  'cos',
  'div',
  'enchantment_level',
  'floor',
  'from_int',
  'length',
  'max',
  'min',
  'mod',
  'mul',
  'negate',
  'number_dispatcher',
  'pow',
  'round',
  'sin',
  'sqrt',
  'sub',
  'truncate',
  'uniform',
  'weighted_list',
];

/** Every level-based value type handled here. */
export const LEVEL_VALUE_TYPES: readonly string[] = [
  'clamped',
  'exponent',
  'fraction',
  'levels_squared',
  'linear',
  'lookup',
];

const fixed = (value: number): NumberValue => ({ value, random: false });

/** A whole number (`IntRef`): `undefined` when it cannot be worked out (noted in `env`). */
export function intValue(value: Json | undefined, path: string, env: Env): NumberValue | undefined {
  return numberValue(value, 'int', path, env);
}

/** A decimal number (`FloatRef`): `undefined` when it cannot be worked out (noted in `env`). */
export function floatValue(
  value: Json | undefined,
  path: string,
  env: Env,
): NumberValue | undefined {
  return numberValue(value, 'float', path, env);
}

/** A whole or decimal number provider. */
export function numberValue(
  value: Json | undefined,
  sort: NumberSort,
  path: string,
  env: Env,
): NumberValue | undefined {
  if (typeof value === 'number') return fixed(sort === 'int' ? Math.trunc(value) : value);
  if (typeof value === 'string') return named(value, sort, path, env);
  const object = objectOf(value);
  const type = object === undefined ? undefined : typeOf(object);
  if (object === undefined || type === undefined) {
    report(env, 'number', type ?? 'missing', path, 'not_supported');
    return undefined;
  }
  const result = provider(object, type, sort, path, env);
  if (result === undefined) return undefined;
  if (sort === 'int') return { value: Math.trunc(result.value), random: result.random };
  return result;
}

function named(id: string, sort: NumberSort, path: string, env: Env): NumberValue | undefined {
  if (id.startsWith('#')) {
    report(env, 'reference', id, path, 'not_supported');
    return undefined;
  }
  const full = normaliseId(id);
  const folderKey = sort === 'int' ? 'context_int_provider' : 'context_float_provider';
  const folder = env.ctx.types.folders.data[folderKey];
  const key = `${folderKey}:${full}`;
  if (env.refs.includes(key)) {
    report(env, 'reference', full, path, 'not_supported');
    return undefined;
  }
  const file = env.ctx.lookup(folder, full);
  if (file === undefined) {
    report(env, 'reference', full, path, 'missing_file');
    return undefined;
  }
  return numberValue(file, sort, `${full}#`, { ...env, refs: [...env.refs, key] });
}

/** The operands of an aggregate: a provider, a named provider or a list. */
function operands(value: Json | undefined): readonly Json[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function provider(
  object: JsonObject,
  type: string,
  sort: NumberSort,
  path: string,
  env: Env,
): NumberValue | undefined {
  const sub = (key: string, as: NumberSort = sort): NumberValue | undefined =>
    numberValue(object[key], as, pointer(path, key), env);
  const handled = sort === 'int' ? INT_NUMBER_TYPES : FLOAT_NUMBER_TYPES;
  if (!handled.includes(type)) {
    const reason = type in NUMBERS_ONLY_IN_THE_GAME ? 'needs_world' : 'not_supported';
    report(env, 'number', type, path, reason);
    return undefined;
  }
  switch (type) {
    case 'constant': {
      const value = object.value;
      if (typeof value !== 'number') {
        report(env, 'number', type, path, 'not_supported');
        return undefined;
      }
      return fixed(value);
    }
    case 'uniform': {
      const min = sub('min');
      const max = sub('max');
      if (min === undefined || max === undefined) return undefined;
      if (sort === 'int') {
        const value = max.value < min.value ? min.value : env.ctx.random.int(min.value, max.value);
        return { value, random: true };
      }
      return { value: env.ctx.random.range(min.value, max.value), random: true };
    }
    case 'binomial': {
      const n = sub('n', 'int');
      const p = sub('p', 'float');
      if (n === undefined || p === undefined) return undefined;
      let count = 0;
      for (let i = 0; i < n.value; i++) if (env.ctx.random.next() < p.value) count++;
      return { value: count, random: true };
    }
    case 'weighted_list': {
      const list = Array.isArray(object.distribution) ? object.distribution : [];
      const entries = list
        .map((entry, i) => ({ entry: objectOf(entry), i }))
        .filter((e) => e.entry !== undefined && typeof e.entry.weight === 'number');
      const total = entries.reduce((sum, e) => sum + (e.entry?.weight as number), 0);
      if (total <= 0) {
        report(env, 'number', type, path, 'not_supported');
        return undefined;
      }
      let pick = Math.floor(env.ctx.random.next() * total);
      for (const { entry, i } of entries) {
        pick -= entry?.weight as number;
        if (pick < 0) {
          const chosen = numberValue(
            entry?.data,
            sort,
            pointer(pointer(pointer(path, 'distribution'), i), 'data'),
            env,
          );
          return chosen === undefined ? undefined : { value: chosen.value, random: true };
        }
      }
      return undefined;
    }
    case 'number_dispatcher': {
      const cases = Array.isArray(object.cases) ? object.cases : [];
      let random = false;
      for (const [i, raw] of cases.entries()) {
        const entry = objectOf(raw);
        if (entry === undefined) continue;
        const casePath = pointer(pointer(path, 'cases'), i);
        const result = testCondition(entry.condition, pointer(casePath, 'condition'), env);
        if (result.chance === undefined || (result.chance !== 0 && result.chance !== 1)) {
          random = true;
        }
        if (result.answer === 'unknown') return undefined;
        if (result.answer === 'yes') {
          const value = numberValue(entry.value, sort, pointer(casePath, 'value'), env);
          return value === undefined
            ? undefined
            : { value: value.value, random: random || value.random };
        }
      }
      if (object.default === undefined) return { value: 0, random };
      const value = sub('default');
      return value === undefined
        ? undefined
        : { value: value.value, random: random || value.random };
    }
    case 'conditional': {
      const result = testCondition(object.condition, pointer(path, 'condition'), env);
      const drew = result.chance !== 0 && result.chance !== 1;
      const pick = (answer: Answer): NumberValue | undefined => {
        if (answer === 'yes') return sub('on_true');
        return object.on_false === undefined ? fixed(0) : sub('on_false');
      };
      if (result.answer === 'unknown') return undefined;
      const value = pick(result.answer);
      return value === undefined ? undefined : { value: value.value, random: drew || value.random };
    }
    case 'abs':
    case 'negate':
    case 'ceil':
    case 'floor':
    case 'round':
    case 'truncate':
    case 'sqrt':
    case 'sin':
    case 'cos': {
      const input = sub('input');
      if (input === undefined) return undefined;
      return { value: unary(type, input.value), random: input.random };
    }
    case 'from_float':
    case 'from_int': {
      const input = sub('input', type === 'from_float' ? 'float' : 'int');
      if (input === undefined) return undefined;
      // About right: a decimal becomes whole by rounding down.
      return {
        value: type === 'from_float' ? Math.floor(input.value) : input.value,
        random: input.random,
      };
    }
    case 'add':
    case 'mul':
    case 'min':
    case 'max':
    case 'avg':
    case 'length': {
      const values: NumberValue[] = [];
      for (const [i, operand] of operands(object.inputs).entries()) {
        const operandPath = Array.isArray(object.inputs)
          ? pointer(pointer(path, 'inputs'), i)
          : pointer(path, 'inputs');
        const value = numberValue(operand, sort, operandPath, env);
        if (value === undefined) return undefined;
        values.push(value);
      }
      if (values.length === 0) {
        report(env, 'number', type, path, 'not_supported');
        return undefined;
      }
      return {
        value: aggregate(
          type,
          values.map((v) => v.value),
          sort,
        ),
        random: values.some((v) => v.random),
      };
    }
    case 'sub':
    case 'div':
    case 'mod':
    case 'floor_div':
    case 'floor_mod': {
      const left = sub('left');
      const right = sub('right');
      if (left === undefined || right === undefined) return undefined;
      if (type !== 'sub' && right.value === 0) {
        report(env, 'number', type, pointer(path, 'right'), 'not_supported');
        return undefined;
      }
      return {
        value: binary(type, left.value, right.value, sort),
        random: left.random || right.random,
      };
    }
    case 'pow': {
      const base = sub('base');
      const exponent = sub('exponent');
      if (base === undefined || exponent === undefined) return undefined;
      return { value: base.value ** exponent.value, random: base.random || exponent.random };
    }
    case 'enchantment_level': {
      if (env.level === undefined) {
        report(env, 'number', type, path, 'needs_world');
        return undefined;
      }
      const value = levelValue(object.amount, env.level, pointer(path, 'amount'), env);
      return value === undefined ? undefined : fixed(value);
    }
    default:
      report(env, 'number', type, path, 'not_supported');
      return undefined;
  }
}

function unary(type: string, x: number): number {
  switch (type) {
    case 'abs':
      return Math.abs(x);
    case 'negate':
      return -x;
    case 'ceil':
      return Math.ceil(x);
    case 'floor':
      return Math.floor(x);
    case 'round':
      return Math.round(x);
    case 'truncate':
      return Math.trunc(x);
    case 'sqrt':
      return Math.sqrt(x);
    case 'sin':
      return Math.sin(x);
    default:
      return Math.cos(x);
  }
}

function aggregate(type: string, values: readonly number[], sort: NumberSort): number {
  switch (type) {
    case 'add':
      return values.reduce((a, b) => a + b, 0);
    case 'mul':
      return values.reduce((a, b) => a * b, 1);
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'avg': {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return sort === 'int' ? Math.trunc(mean) : mean;
    }
    default:
      return Math.sqrt(values.reduce((a, b) => a + b * b, 0));
  }
}

function binary(type: string, a: number, b: number, sort: NumberSort): number {
  switch (type) {
    case 'sub':
      return a - b;
    case 'div':
      return sort === 'int' ? Math.trunc(a / b) : a / b;
    case 'mod':
      return a % b;
    case 'floor_div':
      return Math.floor(a / b);
    default:
      return ((a % b) + b) % b;
  }
}

/**
 * An enchantment's level-based value at `level`: a plain number, or `linear`, `clamped`,
 * `exponent`, `fraction`, `levels_squared` and `lookup` (only `linear` was checked by B600; the
 * rest are written from the fields).
 */
export function levelValue(
  value: Json | undefined,
  level: number,
  path: string,
  env: Env,
): number | undefined {
  if (typeof value === 'number') return value;
  const object = objectOf(value);
  const type = object === undefined ? undefined : typeOf(object);
  if (object === undefined || type === undefined) {
    report(env, 'level_value', type ?? 'missing', path, 'not_supported');
    return undefined;
  }
  const num = (key: string): number | undefined => {
    const field = object[key];
    return typeof field === 'number' ? field : undefined;
  };
  const inner = (key: string): number | undefined =>
    levelValue(object[key], level, pointer(path, key), env);
  switch (type) {
    case 'linear': {
      const base = num('base');
      const per = num('per_level_above_first');
      if (base === undefined || per === undefined) break;
      return base + per * (level - 1);
    }
    case 'clamped': {
      const v = inner('value');
      const min = num('min');
      const max = num('max');
      if (v === undefined || min === undefined || max === undefined) return undefined;
      return Math.min(max, Math.max(min, v));
    }
    case 'exponent': {
      const base = inner('base');
      const power = inner('power');
      if (base === undefined || power === undefined) return undefined;
      return base ** power;
    }
    case 'fraction': {
      const numerator = inner('numerator');
      const denominator = inner('denominator');
      if (numerator === undefined || denominator === undefined) return undefined;
      return denominator === 0 ? 0 : numerator / denominator;
    }
    case 'levels_squared': {
      const added = num('added');
      if (added === undefined) break;
      return level * level + added;
    }
    case 'lookup': {
      const values = Array.isArray(object.values) ? object.values : [];
      if (level >= 1 && level <= values.length) {
        return levelValue(
          values[level - 1],
          level,
          pointer(pointer(path, 'values'), level - 1),
          env,
        );
      }
      return inner('fallback');
    }
    default:
      report(env, 'level_value', type, path, 'not_supported');
      return undefined;
  }
  report(env, 'level_value', type, path, 'not_supported');
  return undefined;
}

/** Whether a number lies in a range (`IntRange`/`FloatRange`: a number, or `min`/`max`). */
export function inRange(
  value: number,
  range: Json | undefined,
  sort: NumberSort,
  path: string,
  env: Env,
): { readonly answer: Answer; readonly random: boolean } {
  const object = objectOf(range);
  if (object !== undefined && typeOf(object) === undefined) {
    let random = false;
    let answer: Answer = 'yes';
    for (const key of ['min', 'max'] as const) {
      if (object[key] === undefined) continue;
      const bound = numberValue(object[key], sort, pointer(path, key), env);
      if (bound === undefined) {
        answer = answer === 'no' ? 'no' : 'unknown';
        continue;
      }
      random ||= bound.random;
      const fits = key === 'min' ? value >= bound.value : value <= bound.value;
      if (!fits) answer = 'no';
    }
    return { answer, random };
  }
  const exact = numberValue(range, sort, path, env);
  if (exact === undefined) return { answer: 'unknown', random: false };
  return { answer: value === exact.value ? 'yes' : 'no', random: exact.random };
}

/** Whether a number lies in plain bounds (`MinMaxBounds`: a number, or `min`/`max`). */
export function inBounds(value: number, bounds: Json | undefined): boolean {
  if (typeof bounds === 'number') return value === bounds;
  const object = objectOf(bounds);
  if (object === undefined) return true;
  if (typeof object.min === 'number' && value < object.min) return false;
  if (typeof object.max === 'number' && value > object.max) return false;
  return true;
}
