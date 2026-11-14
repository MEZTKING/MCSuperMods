/**
 * Reading rule book data (ADR 0082 D2) defensively: the compiler and the sentences run on books
 * that may be hand-edited and not yet valid, so every field is read through these helpers rather
 * than trusted.
 */
import type { Json, JsonObject } from '@msm/plugin-api';

/** `value` as a JSON object, or undefined. */
export const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** `value` as an array, or an empty one. */
export const asArray = (value: Json | undefined): readonly Json[] =>
  Array.isArray(value) ? value : [];

/** A string field, or undefined. */
export const str = (object: JsonObject | undefined, name: string): string | undefined => {
  const value = object?.[name];
  return typeof value === 'string' ? value : undefined;
};

/** A finite number field, or undefined. */
export const num = (object: JsonObject | undefined, name: string): number | undefined => {
  const value = object?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

/** A boolean field, or undefined. */
export const bool = (object: JsonObject | undefined, name: string): boolean | undefined => {
  const value = object?.[name];
  return typeof value === 'boolean' ? value : undefined;
};

/** A counter declared in a book. */
export interface CounterDeclaration {
  readonly name: string;
  readonly scope: 'player' | 'mob' | 'world';
  readonly start: number;
}

const SCOPES = new Set(['player', 'mob', 'world']);

/** The counters a book declares. */
export function bookCounters(book: JsonObject): CounterDeclaration[] {
  const counters: CounterDeclaration[] = [];
  for (const entry of asArray(book.counters)) {
    const counter = asObject(entry);
    const name = str(counter, 'name');
    const scope = str(counter, 'scope');
    if (name === undefined || scope === undefined || !SCOPES.has(scope)) continue;
    counters.push({
      name,
      scope: scope as CounterDeclaration['scope'],
      start: num(counter, 'start') ?? 0,
    });
  }
  return counters;
}

/** The rules of a book with their index, as objects (non-objects are skipped). */
export function bookRules(book: JsonObject): { rule: JsonObject; index: number }[] {
  const rules: { rule: JsonObject; index: number }[] = [];
  asArray(book.rules).forEach((entry, index) => {
    const rule = asObject(entry);
    if (rule !== undefined) rules.push({ rule, index });
  });
  return rules;
}

/** The `do` (or `else`) steps of a rule or logic step, as objects with their index. */
export function stepList(owner: JsonObject, field = 'do'): { step: JsonObject; index: number }[] {
  const steps: { step: JsonObject; index: number }[] = [];
  asArray(owner[field]).forEach((entry, index) => {
    const step = asObject(entry);
    if (step !== undefined) steps.push({ step, index });
  });
  return steps;
}

/** Whether a rule is enabled (absent `enabled` means yes). */
export const ruleEnabled = (rule: JsonObject): boolean => bool(rule, 'enabled') !== false;

/** The conditions of a rule's `only_if` or an `if` step, as objects with their index. */
export function conditionList(owner: JsonObject | undefined): {
  match: 'all' | 'any';
  conditions: { condition: JsonObject; index: number }[];
} {
  const conditions: { condition: JsonObject; index: number }[] = [];
  asArray(owner?.conditions).forEach((entry, index) => {
    const condition = asObject(entry);
    if (condition !== undefined) conditions.push({ condition, index });
  });
  return { match: str(owner, 'match') === 'any' ? 'any' : 'all', conditions };
}

/** RFC 6901 escaping of one pointer token. */
export const pointerToken = (token: string | number): string =>
  String(token).replace(/~/g, '~0').replace(/\//g, '~1');

/** `base` extended by `tokens`. */
export const pointer = (base: string, ...tokens: (string | number)[]): string =>
  base + tokens.map((token) => `/${pointerToken(token)}`).join('');
