/**
 * Pure edits of a rule book (ADR 0082 D2) for the Rule book Studio: each function takes the book
 * data and returns the next one (never changing its input), so the Studio sends every edit as one
 * undoable `onChange('', next)`. Also what the cards need to know: new rules and steps with their
 * defaults, the actors in scope, the caps, and where a problem's pointer shows on a card.
 *
 * @packageDocumentation
 */

import { type Json, parseJsonPointer, toJsonPointer } from '@msm/core';
import {
  type Actor,
  CONDITIONS,
  type ConditionEntry,
  conditionById,
  MAX_DEPTH,
  MAX_STEPS,
  PLACES,
  type PlaceEntry,
  type SlotSpec,
  STEPS,
  type StepEntry,
  stepById,
  type TriggerEntry,
  triggerById,
  VALUES,
  type ValueEntry,
  WHO,
  type WhoEntry,
} from '@msm/plugin-rules';

/** A JSON object. */
export type JsonObject = { [key: string]: Json };

/** A rule book's data, as the Studio edits it. */
export type RuleBookData = JsonObject;

/** `value` as a JSON object, or undefined. */
export const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** `value` as an array, or an empty one. */
export const asArray = (value: Json | undefined): readonly Json[] =>
  Array.isArray(value) ? value : [];

/** The rule key pattern (ADR 0082 D2). */
export const RULE_KEY_PATTERN = /^[a-z0-9_]{1,32}$/;
/** The counter name pattern (the plugin validator's `rules.bad-counter-name`). */
export const COUNTER_NAME_PATTERN = /^[a-z0-9_]{1,32}$/;

/** Whether `data` looks like a rule book the Studio can edit (an object whose `rules` is a list). */
export function isRuleBookData(data: Json): boolean {
  const object = asObject(data);
  return object !== undefined && (object.rules === undefined || Array.isArray(object.rules));
}

/** The rules of a book (non-objects kept as they are). */
export const rulesOf = (book: RuleBookData): readonly Json[] => asArray(book.rules);

// ---------------------------------------------------------------------------------------------
// Pointers
// ---------------------------------------------------------------------------------------------

/** The pointer of a book path. */
export const pointerOf = (...tokens: (string | number)[]): string => toJsonPointer(tokens);

/** The pointer of rule `index`. */
export const rulePointer = (index: number): string => pointerOf('rules', index);

/** The value at `pointer` in `book`, or undefined. */
export function getAt(book: Json, pointer: string): Json | undefined {
  let current: Json | undefined = book;
  for (const token of parseJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else {
      current = asObject(current)?.[token];
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/** A copy of `container` with `token` set to `value` (deleted when undefined). */
function withMember(container: Json | undefined, token: string, value: Json | undefined): Json {
  if (Array.isArray(container)) {
    const index = token === '-' ? container.length : Number(token);
    const next = [...container];
    if (value === undefined) next.splice(index, 1);
    else next[index] = value;
    return next;
  }
  const next: JsonObject = { ...(asObject(container) ?? {}) };
  if (value === undefined) delete next[token];
  else next[token] = value;
  return next;
}

/**
 * A copy of `book` with the value at `pointer` set (missing objects are created) or deleted
 * (`undefined`; array items are spliced out). The empty pointer is not allowed.
 */
export function setAt(book: RuleBookData, pointer: string, value: Json | undefined): RuleBookData {
  const tokens = parseJsonPointer(pointer);
  if (tokens.length === 0) throw new Error('Cannot replace the whole book through setAt.');
  const set = (current: Json | undefined, depth: number): Json => {
    const token = tokens[depth] as string;
    if (depth === tokens.length - 1) return withMember(current, token, value);
    const child = Array.isArray(current) ? current[Number(token)] : asObject(current)?.[token];
    return withMember(current, token, set(child, depth + 1));
  };
  return set(book, 0) as RuleBookData;
}

// ---------------------------------------------------------------------------------------------
// Keys and new rules
// ---------------------------------------------------------------------------------------------

/** The keys used in a book. */
function keysOf(book: RuleBookData): Set<string> {
  const keys = new Set<string>();
  for (const rule of rulesOf(book)) {
    const key = asObject(rule)?.key;
    if (typeof key === 'string') keys.add(key);
  }
  return keys;
}

/** A key from `base` (made safe) not yet used in `book`: `base`, `base_2`, `base_3`, ... */
export function uniqueKey(book: RuleBookData, base = 'rule'): string {
  const safe =
    base
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'rule';
  const keys = keysOf(book);
  if (!keys.has(safe)) return safe;
  for (let n = 2; ; n += 1) {
    const key = `${safe}_${n}`;
    if (!keys.has(key)) return key;
  }
}

/** The trigger a new rule starts with when nothing is given. */
export const DEFAULT_TRIGGER = 'player_joined';

/** A new rule: a fresh key, the trigger (with `subject` when given), no conditions, no steps. */
export function newRule(
  book: RuleBookData,
  init: { trigger?: string; subject?: string } = {},
): JsonObject {
  const trigger = init.trigger ?? DEFAULT_TRIGGER;
  const when: JsonObject = { trigger };
  if (init.subject !== undefined) when.subject = init.subject;
  return { do: [], key: uniqueKey(book, 'rule'), when };
}

/** `book` with `rule` added at the end. */
export function addRule(book: RuleBookData, rule: JsonObject): RuleBookData {
  return { ...book, rules: [...rulesOf(book), rule] };
}

/** `book` without rule `index`. */
export function removeRule(book: RuleBookData, index: number): RuleBookData {
  return setAt(book, rulePointer(index), undefined);
}

/** `book` with rule `index` moved by `delta` (clamped to the list). */
export function moveRule(book: RuleBookData, index: number, delta: number): RuleBookData {
  return moveItem(book, rulePointer(index), delta);
}

/** `book` with a copy of rule `index` after it: a new key, the name with " (copy)". */
export function duplicateRule(book: RuleBookData, index: number): RuleBookData {
  const rule = asObject(rulesOf(book)[index]);
  if (rule === undefined) return book;
  const copy: JsonObject = structuredClone(rule);
  copy.key = uniqueKey(book, typeof rule.key === 'string' ? rule.key : 'rule');
  if (typeof rule.name === 'string' && rule.name.length > 0) copy.name = `${rule.name} (copy)`;
  const rules = [...rulesOf(book)];
  rules.splice(index + 1, 0, copy);
  return { ...book, rules };
}

/** `book` with rule `index` turned on (no `enabled` field) or off (`enabled: false`). */
export function setRuleEnabled(book: RuleBookData, index: number, enabled: boolean): RuleBookData {
  return setAt(book, pointerOf('rules', index, 'enabled'), enabled ? undefined : false);
}

/** Whether a rule is turned on. */
export const ruleEnabled = (rule: Json | undefined): boolean => asObject(rule)?.enabled !== false;

// ---------------------------------------------------------------------------------------------
// Lists of steps and conditions
// ---------------------------------------------------------------------------------------------

/** Splits an item pointer into its list pointer and index. */
function splitItem(pointer: string): { list: string; index: number } {
  const tokens = parseJsonPointer(pointer);
  const index = Number(tokens.pop());
  return { list: toJsonPointer(tokens), index };
}

/** `book` with the list item at `pointer` moved by `delta` (clamped; no change at the ends). */
export function moveItem(book: RuleBookData, pointer: string, delta: number): RuleBookData {
  const { list, index } = splitItem(pointer);
  const items = [...asArray(getAt(book, list))];
  const to = Math.max(0, Math.min(items.length - 1, index + delta));
  if (to === index || index < 0 || index >= items.length) return book;
  const [item] = items.splice(index, 1);
  items.splice(to, 0, item as Json);
  return setAt(book, list, items);
}

/** `book` without the list item at `pointer`. */
export function removeItem(book: RuleBookData, pointer: string): RuleBookData {
  return setAt(book, pointer, undefined);
}

/** `book` with a copy of the list item at `pointer` right after it. */
export function duplicateItem(book: RuleBookData, pointer: string): RuleBookData {
  const { list, index } = splitItem(pointer);
  const items = [...asArray(getAt(book, list))];
  const item = items[index];
  if (item === undefined) return book;
  items.splice(index + 1, 0, structuredClone(item));
  return setAt(book, list, items);
}

/** `book` with `item` appended to the list at `listPointer` (created when missing). */
export function appendItem(book: RuleBookData, listPointer: string, item: Json): RuleBookData {
  return setAt(book, listPointer, [...asArray(getAt(book, listPointer)), item]);
}

/** Step slots that take only a literal number, never a reading (`step.slot`). */
const LITERAL_SLOTS = new Set([
  'wait.seconds',
  'give_effect.level',
  'spawn_particles.count',
  'spawn_particles.spread',
  'spawn_particles.speed',
  'play_sound.volume',
  'play_sound.pitch',
  'repeat.times',
  'for_each_player.radius',
]);

/** Text slots stored as one plain string rather than a list of pieces. */
const PLAIN_TEXT_SLOTS = new Set(['animation', 'controller', 'bar', 'message_contains']);

/** Whether a number slot of a step or condition may hold a reading (ADR 0082 D2). */
export function acceptsReadings(owner: string, slot: string): boolean {
  return !LITERAL_SLOTS.has(`${owner}.${slot}`);
}

/** Whether a text slot holds a plain string (`animation`, `bar`) rather than text pieces. */
export const isPlainText = (slot: string): boolean => PLAIN_TEXT_SLOTS.has(slot);

/** The value a required slot starts with in a new step or condition, or undefined for none. */
function slotDefault(slot: SlotSpec, owner: string): Json | undefined {
  if (slot.optional === true) return undefined;
  switch (slot.type) {
    case 'number':
      if (owner === 'explode' && slot.name === 'power') return 2;
      if (owner === 'heal' || owner === 'hurt') return 2;
      return Math.max(slot.min ?? 1, 1);
    case 'seconds':
      return Math.max(slot.min ?? 1, 1);
    case 'percent':
      return 50;
    case 'text':
      if (isPlainText(slot.name)) return undefined;
      return owner === 'run_command' ? [''] : ['Hello!'];
    case 'choice': {
      if (slot.name === 'compare') return 'at_least';
      const first = slot.choices?.[0]?.value;
      return first === undefined ? undefined : first;
    }
    case 'place':
      return 'here';
    default:
      // Things and counters are picked; who defaults through the catalogue.
      return undefined;
  }
}

/** A new step of `id` with its required slots filled where a default makes sense. */
export function newStep(id: string): JsonObject {
  const step: JsonObject = { step: id };
  if (id === 'if') return { conditions: [], do: [], match: 'all', step: id };
  if (id === 'repeat') return { do: [], step: id, times: 2 };
  if (id === 'for_each_player') return { do: [], step: id };
  const entry = stepById(id);
  for (const slot of entry?.slots ?? []) {
    const value = slotDefault(slot, id);
    if (value !== undefined) step[slot.name] = value;
  }
  return step;
}

/** A new condition of `id` with its required slots filled where a default makes sense. */
export function newCondition(id: string): JsonObject {
  const condition: JsonObject = { condition: id };
  for (const slot of conditionById(id)?.slots ?? []) {
    const value = slotDefault(slot, id);
    if (value !== undefined) condition[slot.name] = value;
  }
  return condition;
}

/** A new reading of `id` with its fields filled. */
export function newValue(id: string): JsonObject {
  switch (id) {
    case 'random':
      return { max: 10, min: 1, value: id };
    case 'player_position':
      return { axis: 'y', value: id };
    case 'math':
      return { a: 1, b: 1, op: '+', value: id };
    case 'counter':
      return { counter: 'count', scope: 'world', value: id };
    case 'command_argument':
      return { name: '', value: id };
    default:
      return { value: id };
  }
}

/** The number of steps in a rule or step, nested ones included (the 50-step cap counts these). */
export function countSteps(owner: Json | undefined): number {
  const object = asObject(owner);
  if (object === undefined) return 0;
  let count = 0;
  for (const field of ['do', 'else']) {
    for (const step of asArray(object[field])) count += 1 + countSteps(step);
  }
  return count;
}

/**
 * The nesting level of the step list at `listPointer` (`/rules/0/do` is level 1, a list inside
 * a logic step there is level 2). Logic steps may be added only below {@link MAX_DEPTH}.
 */
export function listLevel(listPointer: string): number {
  const tokens = parseJsonPointer(listPointer);
  return tokens.filter((token, index) => index >= 2 && (token === 'do' || token === 'else')).length;
}

/** Whether a logic step may be added to the list at `listPointer`. */
export const canNestHere = (listPointer: string): boolean => listLevel(listPointer) < MAX_DEPTH;

/** Whether the rule at `ruleIndex` can take another step (under {@link MAX_STEPS}). */
export function canAddStep(book: RuleBookData, ruleIndex: number): boolean {
  return countSteps(rulesOf(book)[ruleIndex]) < MAX_STEPS;
}

/** The rule index a book pointer is inside, or -1. */
export function ruleIndexOf(pointer: string): number {
  const tokens = parseJsonPointer(pointer);
  if (tokens[0] !== 'rules' || tokens.length < 2) return -1;
  const index = Number(tokens[1]);
  return Number.isInteger(index) ? index : -1;
}

// ---------------------------------------------------------------------------------------------
// Triggers and scope
// ---------------------------------------------------------------------------------------------

/**
 * `book` with rule `index`'s trigger changed to `triggerId`: the subject stays when the new
 * trigger takes the same sort of subject, the options are dropped.
 */
export function setTrigger(book: RuleBookData, index: number, triggerId: string): RuleBookData {
  const rule = asObject(rulesOf(book)[index]);
  if (rule === undefined) return book;
  const before = asObject(rule.when);
  const old = triggerById(typeof before?.trigger === 'string' ? before.trigger : '');
  const next = triggerById(triggerId);
  const when: JsonObject = { trigger: triggerId };
  const subject = before?.subject;
  if (
    typeof subject === 'string' &&
    next !== undefined &&
    next.subject !== 'none' &&
    old?.subject === next.subject &&
    (next.subjectOptional || old.subjectKinds.join() === next.subjectKinds.join())
  ) {
    when.subject = subject;
  }
  return setAt(book, pointerOf('rules', index, 'when'), when);
}

/** Who and where a part of a rule can use: the trigger's actors, and whether "here" exists. */
export interface RuleScope {
  readonly trigger: TriggerEntry | undefined;
  readonly actors: ReadonlySet<Actor>;
  readonly here: boolean;
}

/** The scope of a rule's `when`. An unknown trigger allows everything (nothing is hidden). */
export function ruleScope(trigger: TriggerEntry | undefined): RuleScope {
  if (trigger === undefined) {
    return { trigger, actors: new Set<Actor>(['player', 'mob', 'other']), here: true };
  }
  return { trigger, actors: new Set(trigger.actors), here: trigger.hasPlace };
}

/** The scope inside a logic step: "for each player" adds the player. */
export function innerScope(scope: RuleScope, stepId: string): RuleScope {
  if (stepId !== 'for_each_player') return scope;
  return { ...scope, actors: new Set([...scope.actors, 'player']) };
}

const allows = (scope: RuleScope, needs: Actor | undefined): boolean =>
  needs === undefined || scope.actors.has(needs);

/** What the pickers offer in Very easy mode or not. */
export interface OfferOptions {
  /** Very easy hides entries with `veryEasy: false` (run a command, offsets). */
  readonly veryEasy: boolean;
}

/** The steps the Do picker offers in `scope` for a list at `listPointer`. */
export function offeredSteps(
  scope: RuleScope,
  listPointer: string,
  options: OfferOptions,
): StepEntry[] {
  const nest = canNestHere(listPointer);
  return STEPS.filter(
    (entry) =>
      (!options.veryEasy || entry.veryEasy) &&
      (nest || !entry.logic) &&
      allows(scope, entry.needsActor) &&
      (entry.id !== 'stop_normal_action' ||
        scope.trigger === undefined ||
        scope.trigger.cancellable),
  );
}

/** The conditions offered in `scope`. */
export function offeredConditions(scope: RuleScope, options: OfferOptions): ConditionEntry[] {
  return CONDITIONS.filter(
    (entry) => (!options.veryEasy || entry.veryEasy) && allows(scope, entry.needsActor),
  );
}

/**
 * The readings offered in `scope`; `plainOnly` inside `math`. Readings in words (`facing`) are
 * offered only with `text` (a text slot).
 */
export function offeredValues(
  scope: RuleScope,
  options: OfferOptions & { plainOnly?: boolean; text?: boolean },
): ValueEntry[] {
  return VALUES.filter(
    (entry) =>
      (!options.veryEasy || entry.veryEasy) &&
      allows(scope, entry.needsActor) &&
      // A reading for some triggers only ("What the player typed", ADR 0111 D1).
      (entry.triggers === undefined ||
        (scope.trigger !== undefined && entry.triggers.includes(scope.trigger.id))) &&
      (options.plainOnly !== true || entry.plain) &&
      (entry.words !== true || options.text === true),
  );
}

/** The places offered in `scope`. */
export function offeredPlaces(scope: RuleScope, options: OfferOptions): PlaceEntry[] {
  return PLACES.filter(
    (entry) =>
      (!options.veryEasy || entry.veryEasy) &&
      allows(scope, entry.needsActor) &&
      (!entry.needsHere || scope.here),
  );
}

/** The "who" offered in `scope`; `single` leaves out the many (the `mob_is` condition). */
export function offeredWho(
  scope: RuleScope,
  options: OfferOptions & { single?: boolean },
): WhoEntry[] {
  return WHO.filter(
    (entry) =>
      (!options.veryEasy || entry.veryEasy) &&
      allows(scope, entry.needsActor) &&
      (!entry.needsHere || scope.here) &&
      (options.single !== true || !entry.many),
  );
}

/** The counter scopes offered in `scope` (a player's counter needs a player, a mob's a mob). */
export function offeredCounterScopes(scope: RuleScope): ('player' | 'mob' | 'world')[] {
  const out: ('player' | 'mob' | 'world')[] = [];
  if (scope.actors.has('player')) out.push('player');
  if (scope.actors.has('mob')) out.push('mob');
  out.push('world');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------------------------

/** A counter a book declares. */
export interface CounterInfo {
  readonly name: string;
  readonly scope: 'player' | 'mob' | 'world';
  readonly start: number;
}

/** The counters a book declares. */
export function countersOf(book: RuleBookData): CounterInfo[] {
  const out: CounterInfo[] = [];
  for (const entry of asArray(book.counters)) {
    const counter = asObject(entry);
    const name = counter?.name;
    const scope = counter?.scope;
    if (typeof name !== 'string') continue;
    if (scope !== 'player' && scope !== 'mob' && scope !== 'world') continue;
    out.push({ name, scope, start: typeof counter?.start === 'number' ? counter.start : 0 });
  }
  return out;
}

/** `book` with counter `name` of `scope` declared (start 0), unless it already is. */
export function declareCounter(
  book: RuleBookData,
  name: string,
  scope: 'player' | 'mob' | 'world',
): RuleBookData {
  if (countersOf(book).some((counter) => counter.name === name && counter.scope === scope)) {
    return book;
  }
  return { ...book, counters: [...asArray(book.counters), { name, scope, start: 0 }] };
}

/**
 * `book` with the counter fields of the object at `pointer` (a counter step or condition, or a
 * counter reading) set to `name` and `scope`, and the counter declared on first use (ADR 0082 D6).
 */
export function setCounter(
  book: RuleBookData,
  pointer: string,
  name: string,
  scope: 'player' | 'mob' | 'world',
): RuleBookData {
  const object = asObject(getAt(book, pointer)) ?? {};
  const next = setAt(book, pointer, { ...object, counter: name, scope });
  return declareCounter(next, name, scope);
}

// ---------------------------------------------------------------------------------------------
// Problems on the card
// ---------------------------------------------------------------------------------------------

const slotNames = (slots: readonly SlotSpec[] | undefined): Set<string> =>
  new Set((slots ?? []).map((slot) => slot.name));

/**
 * Where a problem at `path` (an RFC 6901 pointer into the book) shows: the deepest chip, step,
 * condition, `when` or rule that the Studio draws for it. `''` is the book itself (shown above
 * the cards). Pointers into a value inside a slot show at the slot; a counter's `scope` shows at
 * its `counter` chip; anything not drawn shows at the nearest drawn owner.
 */
export function problemAnchor(book: RuleBookData, path: string | undefined): string {
  if (path === undefined || path === '') return '';
  let tokens: string[];
  try {
    tokens = parseJsonPointer(path);
  } catch {
    return '';
  }
  if (tokens[0] !== 'rules' || tokens.length < 2) return '';
  const ruleIndex = Number(tokens[1]);
  const rule = asObject(rulesOf(book)[ruleIndex]);
  if (rule === undefined) return '';
  const base = ['rules', String(ruleIndex)];
  const rest = tokens.slice(2);
  const head = rest[0];
  if (head === 'when') {
    const when = asObject(rule.when);
    const trigger = triggerById(typeof when?.trigger === 'string' ? when.trigger : '');
    if (rest[1] === 'subject') return toJsonPointer([...base, 'when', 'subject']);
    if (rest[1] === 'options' && rest[2] !== undefined && slotNames(trigger?.slots).has(rest[2])) {
      return toJsonPointer([...base, 'when', 'options', rest[2]]);
    }
    return toJsonPointer([...base, 'when']);
  }
  if (head === 'only_if')
    return conditionsAnchor(rule.only_if, [...base, 'only_if'], rest.slice(1));
  if (head === 'do') return stepsAnchor(rule, [...base], rest);
  return toJsonPointer(base);
}

/** The anchor inside a conditions owner at `base` (an `only_if` or an `if` step). */
function conditionsAnchor(owner: Json | undefined, base: string[], rest: string[]): string {
  if (rest[0] !== 'conditions' || rest[1] === undefined) return toJsonPointer(base);
  const index = Number(rest[1]);
  const condition = asObject(asArray(asObject(owner)?.conditions)[index]);
  if (condition === undefined) return toJsonPointer(base);
  const at = [...base, 'conditions', String(index)];
  const entry = conditionById(typeof condition.condition === 'string' ? condition.condition : '');
  const slot = rest[2];
  if (slot === undefined || entry === undefined) return toJsonPointer(at);
  const names = slotNames(entry.slots);
  if (slot === 'scope' && names.has('counter')) return toJsonPointer([...at, 'counter']);
  return names.has(slot) ? toJsonPointer([...at, slot]) : toJsonPointer(at);
}

/** The anchor inside a step list of `owner` at `base`; `rest` starts with `do` or `else`. */
function stepsAnchor(owner: JsonObject, base: string[], rest: string[]): string {
  const field = rest[0] as string;
  if (rest[1] === undefined) return toJsonPointer(base);
  const index = Number(rest[1]);
  const step = asObject(asArray(owner[field])[index]);
  if (step === undefined) return toJsonPointer(base);
  const at = [...base, field, String(index)];
  const id = typeof step.step === 'string' ? step.step : '';
  const entry = stepById(id);
  const next = rest[2];
  if (next === undefined || entry === undefined) return toJsonPointer(at);
  if ((next === 'do' || next === 'else') && entry.logic)
    return stepsAnchor(step, at, rest.slice(2));
  if (id === 'if' && (next === 'conditions' || next === 'match')) {
    return conditionsAnchor(step, at, rest.slice(2));
  }
  const names = slotNames(entry.slots);
  if (next === 'scope' && names.has('counter')) return toJsonPointer([...at, 'counter']);
  return names.has(next) ? toJsonPointer([...at, next]) : toJsonPointer(at);
}

/** The problems of a book by anchor (see {@link problemAnchor}). */
export function problemsByAnchor<P extends { path?: string | undefined }>(
  book: RuleBookData,
  problems: readonly P[],
): Map<string, P[]> {
  const out = new Map<string, P[]>();
  for (const problem of problems) {
    const anchor = problemAnchor(book, problem.path);
    const list = out.get(anchor) ?? [];
    list.push(problem);
    out.set(anchor, list);
  }
  return out;
}

/**
 * Whether a thing with `data` lacks the list a trigger's event goes into: a required list of the
 * data (a vehicle's `weapons` for "The vehicle fires") that is absent or empty.
 */
export function lacksTriggerList(trigger: TriggerEntry, data: Json | undefined): boolean {
  const definition = trigger.definition;
  if (definition?.list === undefined || definition.required !== true) return false;
  const list = asObject(data)?.[definition.list];
  return !Array.isArray(list) || list.length === 0;
}
