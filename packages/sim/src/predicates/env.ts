/**
 * What the condition and number evaluators share (B604): the situation, the context, the notes
 * of what could not be worked out, and the three-valued logic (yes, no, unknown; unknown is never
 * turned into no, ADR 0120 D4).
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { bareName } from '../tags/lookup.js';
import type { Answer, EvalContext, PartResult, Situation, Unsupported } from './api.js';

/** One evaluation's state. */
export interface Env {
  readonly situation: Situation;
  readonly ctx: EvalContext;
  /** Every part that could not be worked out (filled as the evaluation goes). */
  readonly unsupported: Unsupported[];
  /** The predicate and number files being evaluated, to stop a file that names itself. */
  readonly refs: readonly string[];
  /**
   * The enchantment level, inside an enchantment's effects (`enchantment_level` numbers); not
   * known in a plain situation.
   */
  readonly level?: number;
}

/** Notes a part that could not be worked out (never dropped silently). */
export function report(
  env: Env,
  kind: Unsupported['kind'],
  type: string,
  path: string,
  reason: Unsupported['reason'],
): void {
  env.unsupported.push({ kind, type, path, reason });
}

/** A JSON object, or `undefined`. */
export function objectOf(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

/** The type id of a typed object without `minecraft:` (`type`, or the older `condition`). */
export function typeOf(value: JsonObject): string | undefined {
  const type = value.type ?? value.condition;
  return typeof type === 'string' ? bareName(type) : undefined;
}

/** Yes when every answer is yes; no when any is no; else unknown. */
export function allOf(answers: readonly Answer[]): Answer {
  if (answers.includes('no')) return 'no';
  return answers.includes('unknown') ? 'unknown' : 'yes';
}

/** Yes when any answer is yes; no when every answer is no; else unknown. */
export function anyOf(answers: readonly Answer[]): Answer {
  if (answers.includes('yes')) return 'yes';
  return answers.includes('unknown') ? 'unknown' : 'no';
}

/** Yes for no, no for yes; unknown stays unknown. */
export function not(answer: Answer): Answer {
  if (answer === 'unknown') return answer;
  return answer === 'yes' ? 'no' : 'yes';
}

/** Yes or no from a boolean. */
export function answerOf(value: boolean): Answer {
  return value ? 'yes' : 'no';
}

/** The chance of yes of every part together, the parts drawn independently. */
export function chanceAllOf(parts: readonly PartResult[]): number | undefined {
  if (parts.some((part) => part.chance === 0)) return 0;
  let chance = 1;
  for (const part of parts) {
    if (part.chance === undefined) return undefined;
    chance *= part.chance;
  }
  return chance;
}

/** The chance of yes of any part, the parts drawn independently. */
export function chanceAnyOf(parts: readonly PartResult[]): number | undefined {
  if (parts.some((part) => part.chance === 1)) return 1;
  let none = 1;
  for (const part of parts) {
    if (part.chance === undefined) return undefined;
    none *= 1 - part.chance;
  }
  return 1 - none;
}

/** A part's result; `chance` is left out when it is not known. */
export function part(
  path: string,
  type: string,
  answer: Answer,
  parts: readonly PartResult[] = [],
  chance?: number,
): PartResult {
  return chance === undefined
    ? { path, type, answer, parts }
    : { path, type, answer, parts, chance };
}

/** The chance of a part that does not draw: 1 for yes, 0 for no. */
export function fixedChance(answer: Answer): number | undefined {
  if (answer === 'unknown') return undefined;
  return answer === 'yes' ? 1 : 0;
}

/** Escapes a key for an RFC 6901 pointer. */
export function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}
