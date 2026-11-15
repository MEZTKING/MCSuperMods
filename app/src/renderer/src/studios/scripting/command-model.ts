/**
 * Pure helpers of the Command Studio (ADR 0096 D1, ADR 0101 D1) for `msm:command` element data:
 * the argument types and permission levels in plain words, the chat line preview
 * (`/name <arg> [optional]`), the argument rows (add, remove, move, change type) and what the
 * command runs (an event, a function or nothing). Every helper returns new data, so one call
 * is one edit and one undo step. No DOM, so it runs in Node tests.
 *
 * Field paths (B456): `/name`, `/aliases/i`, `/arguments/i/{name,type,min,max,optional}`,
 * `/function`, `/event`, `/permission`, `/feedback_text`.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { COMMAND_NAME_PATTERN, RANGED_ARGUMENT_TYPES } from '@msm/plugin-scripting';

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objectOf = (value: Json | undefined): JsonObject => (isObject(value) ? value : {});

/** The argument types of the format (ADR 0096 D1), in the order the picker lists them. */
export const ARGUMENT_TYPES = [
  'word',
  'text',
  'integer',
  'number',
  'boolean',
  'player',
  'players',
  'entity',
  'position',
  'block_position',
  'item',
  'block',
] as const;

/** An argument type. */
export type ArgumentType = (typeof ARGUMENT_TYPES)[number];

/** Each argument type in plain words, for the type picker. */
export const ARGUMENT_TYPE_LABELS: Readonly<Record<ArgumentType, string>> = Object.freeze({
  word: 'One word',
  text: 'Some text (the rest of the line)',
  integer: 'A whole number',
  number: 'A number (may have a decimal point)',
  boolean: 'Yes or no (true or false)',
  player: 'One player',
  players: 'One or more players',
  entity: 'One mob or player',
  position: 'A place (x y z)',
  block_position: 'A block position (x y z)',
  item: 'An item',
  block: 'A block',
});

/** The plain words of argument type `type` (the type itself when it is unknown). */
export function argumentTypeLabel(type: Json | undefined): string {
  return typeof type === 'string' && Object.hasOwn(ARGUMENT_TYPE_LABELS, type)
    ? ARGUMENT_TYPE_LABELS[type as ArgumentType]
    : String(type ?? '');
}

/** Whether `type` takes `min` and `max` (`integer` and `number`). */
export function isRangedType(type: Json | undefined): boolean {
  return typeof type === 'string' && RANGED_ARGUMENT_TYPES.includes(type);
}

/** The permission levels 0 to 4 in plain words (ADR 0096 D1: 0 is every player, 2 operators). */
export const PERMISSION_LABELS: readonly string[] = Object.freeze([
  'Every player',
  'Trusted players (level 1)',
  'Operators, as for cheat commands like /give (level 2)',
  'Server admins (level 3)',
  'The server owner only (level 4)',
]);

/** The permission of `data` (0 when absent or out of range). */
export function permissionOf(data: Json | undefined): number {
  const value = objectOf(data).permission;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4
    ? value
    : 0;
}

/** The arguments of `data` as objects, in order (non-objects become `{}`). */
export function argumentsOf(data: Json | undefined): JsonObject[] {
  const list = objectOf(data).arguments;
  return Array.isArray(list) ? list.map((entry) => objectOf(entry)) : [];
}

/** The aliases of `data` as strings, in order. */
export function aliasesOf(data: Json | undefined): string[] {
  const list = objectOf(data).aliases;
  return Array.isArray(list) ? list.map((entry) => (typeof entry === 'string' ? entry : '')) : [];
}

/** The most arguments and aliases the format allows. */
export const MAX_ARGUMENTS = 8;
export const MAX_ALIASES = 4;

/** One argument as it is typed in chat: `<name>`, or `[name]` when optional. */
export function argumentUsage(argument: Json | undefined): string {
  const object = objectOf(argument);
  const name = typeof object.name === 'string' && object.name !== '' ? object.name : 'argument';
  return object.optional === true ? `[${name}]` : `<${name}>`;
}

/**
 * How the command is typed in chat: `/name <arg> [optional]` (`/command` while it has no name).
 */
export function commandUsage(data: Json | undefined): string {
  const object = objectOf(data);
  const name = typeof object.name === 'string' && object.name !== '' ? object.name : 'command';
  return [`/${name}`, ...argumentsOf(data).map(argumentUsage)].join(' ');
}

/** The usage line with each alias in place of the name, for "Also typed as". */
export function aliasUsages(data: Json | undefined): string[] {
  const rest = argumentsOf(data).map(argumentUsage);
  return aliasesOf(data)
    .filter((alias) => alias !== '')
    .map((alias) => [`/${alias}`, ...rest].join(' '));
}

/** Whether `name` is a valid command, alias or argument name (`[a-z0-9_]+`). */
export function isValidCommandName(name: string): boolean {
  return COMMAND_NAME_PATTERN.test(name);
}

/** The first free argument name `value`, `value_2`, … among `existing`. */
export function newArgumentName(existing: readonly JsonObject[]): string {
  const names = new Set(existing.map((entry) => entry.name));
  if (!names.has('value')) return 'value';
  for (let n = 2; ; n++) {
    const candidate = `value_${n}`;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * The arguments with a new `word` argument at the end. A new argument after an optional one is
 * optional too, so optionals stay last.
 */
export function withArgumentAdded(list: readonly JsonObject[]): JsonObject[] {
  const last = list[list.length - 1];
  const argument: JsonObject = { name: newArgumentName(list), type: 'word' };
  if (last?.optional === true) argument.optional = true;
  return [...list, argument];
}

/** The arguments without the one at `index`. */
export function withArgumentRemoved(list: readonly JsonObject[], index: number): JsonObject[] {
  return list.filter((_, at) => at !== index);
}

/** The arguments with the one at `from` moved to `to` (unchanged when either is out of range). */
export function withArgumentMoved(
  list: readonly JsonObject[],
  from: number,
  to: number,
): JsonObject[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/** The argument with type `type`; `min` and `max` are dropped when the type has no range. */
export function withArgumentType(argument: JsonObject, type: string): JsonObject {
  const next: JsonObject = { ...argument, type };
  if (!isRangedType(type)) {
    delete next.min;
    delete next.max;
  }
  return next;
}

/** What a command runs when typed. */
export type CommandRuns = 'event' | 'function' | 'nothing';

/** What `data` runs: its event, its function, or nothing (a script handles it). */
export function commandRuns(data: Json | undefined): CommandRuns {
  const object = objectOf(data);
  if (typeof object.event === 'string') return 'event';
  if (typeof object.function === 'string') return 'function';
  return 'nothing';
}

/** The plain words of each choice of "What it does". */
export const RUNS_LABELS: Readonly<Record<CommandRuns, string>> = Object.freeze({
  event: 'Do the steps of an event',
  function: 'Run a function',
  nothing: 'Nothing here (a script listens for it)',
});

/** A new event id for the command `name`: `<name>`, `<name>_2`, … among `existing`. */
export function newCommandEventId(name: string, existing: readonly string[]): string {
  const base = name !== '' && isValidCommandName(name) ? name : 'run';
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/**
 * The data with "What it does" set to `runs`, in one edit: `event` drops `function` (picking the
 * first event, or creating an empty one named after the command), `function` drops `event` (the
 * function id stays empty for the user to fill: `functionId`), `nothing` drops both. The events
 * themselves are kept, so switching back finds them again.
 */
export function withRuns(data: Json | undefined, runs: CommandRuns, functionId = ''): JsonObject {
  const next: JsonObject = { ...objectOf(data) };
  delete next.event;
  delete next.function;
  if (runs === 'function') {
    next.function = functionId;
  } else if (runs === 'event') {
    const events = objectOf(next.events);
    const names = Object.keys(events);
    const first = names[0];
    if (first !== undefined) {
      next.event = first;
    } else {
      const id = newCommandEventId(typeof next.name === 'string' ? next.name : '', names);
      next.events = { ...events, [id]: { actions: [] } };
      next.event = id;
    }
  }
  return next;
}

/**
 * The events editor's rename for a command (its `event` field is at the top level, not in a
 * component, so `renameEvent` leaves it): when `after` lost the event `before` ran and gained
 * exactly one new event, `event` follows it. Any other edit is returned unchanged.
 */
export function followEventRename(before: Json | undefined, after: Json): Json {
  if (!isObject(after)) return after;
  const ran = objectOf(before).event;
  if (typeof ran !== 'string' || after.event !== ran) return after;
  const oldNames = Object.keys(objectOf(objectOf(before).events));
  const newNames = Object.keys(objectOf(after.events));
  if (!oldNames.includes(ran) || newNames.includes(ran)) return after;
  const added = newNames.filter((name) => !oldNames.includes(name));
  if (added.length !== 1 || newNames.length !== oldNames.length) return after;
  return { ...after, event: added[0] as string };
}
