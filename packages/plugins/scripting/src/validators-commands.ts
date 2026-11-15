/**
 * Cross-element checks of `msm:command` elements (ADR 0096 D1; format B443). Every validator is
 * pure and reads only the project's elements and the target's command facts
 * (`TargetFacts.commands`, plugin API 1.17.0). Codes:
 *
 * - `commands.bad-name` (error): a `name`, alias or argument name that is not lower case
 *   `[a-z0-9_]`, or two arguments of one command with the same name.
 * - `commands.name-clash` (error): a `name` or alias that a vanilla command of the target has
 *   (skipped when the target has no command facts), that another project command has, or that
 *   the same command lists twice. Reported on every command involved.
 * - `commands.optional-not-last` (error): a required argument after an optional one; optional
 *   arguments come only at the end.
 * - `commands.text-not-last` (error): a `text` argument that is not the last one; it takes the
 *   rest of the line.
 * - `commands.range-not-number` (error): `min` or `max` on an argument that is not an `integer`
 *   or a `number`.
 * - `commands.min-above-max` (error): an argument whose `min` is above its `max`.
 * - `commands.function-and-event` (error): a command with both `function` and `event`; it runs
 *   one of them.
 * - `commands.unknown-event` (error): an `event`, or a `trigger_event` action of the command's
 *   events, naming an event the command does not declare.
 * - `commands.nothing-to-run` (error, or a warning when a script subscribes to the `command`
 *   event and names the command): a command with neither `function` nor `event`. Scripts are
 *   read as text: a script subscribes when it contains `msm.events.on("command"` and names the
 *   command when it contains the command's name in quotes.
 * - `commands.runs-as-player` (info): a permission 0 command (the default) that runs a function;
 *   every player can run it, and the function runs with operator rights.
 * - `commands.raw-text` (info): a `text` argument passed to a function: the text goes into the
 *   function's macro as it is typed, so a `"` or `\` in it can break a quoted `"$(name)"`.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { COMMAND_KIND, SCRIPT_KIND } from './kinds';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const COMMAND_PROBLEM_CODES = Object.freeze([
  'commands.bad-name',
  'commands.name-clash',
  'commands.optional-not-last',
  'commands.text-not-last',
  'commands.range-not-number',
  'commands.min-above-max',
  'commands.function-and-event',
  'commands.unknown-event',
  'commands.nothing-to-run',
  'commands.runs-as-player',
  'commands.raw-text',
] as const);

/** The literal rule of command names, aliases and argument names (ADR 0096 D1). */
export const COMMAND_NAME_PATTERN = /^[a-z0-9_]+$/;

/** The argument types `min` and `max` apply to. */
export const RANGED_ARGUMENT_TYPES: readonly string[] = Object.freeze(['integer', 'number']);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const commands = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === COMMAND_KIND);

/** One argument with its index. */
interface Argument {
  index: number;
  fields: JsonObject;
}

function argumentsOf(data: JsonObject): Argument[] {
  const list = data.arguments;
  if (!Array.isArray(list)) return [];
  const found: Argument[] = [];
  list.forEach((entry, index) => {
    if (isRecord(entry)) found.push({ index, fields: entry });
  });
  return found;
}

/** One literal of a command: its `name` or an alias, with the pointer to it. */
export interface CommandLiteral {
  name: string;
  path: string;
}

/** The command's `name` and aliases, in order. */
export function commandLiterals(element: Element): CommandLiteral[] {
  const data = dataOf(element);
  const found: CommandLiteral[] = [];
  const name = text(data.name);
  if (name !== undefined) found.push({ name, path: '/name' });
  if (Array.isArray(data.aliases)) {
    data.aliases.forEach((alias, index) => {
      if (typeof alias === 'string' && alias.length > 0) {
        found.push({ name: alias, path: pointer('aliases', index) });
      }
    });
  }
  return found;
}

const problem = (
  severity: Problem['severity'],
  code: (typeof COMMAND_PROBLEM_CODES)[number],
  element: Element,
  path: string,
  message: string,
): Problem => ({ severity, code, elementId: element.id, path, message });

function badNames(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of commands(elements)) {
    for (const literal of commandLiterals(element)) {
      if (COMMAND_NAME_PATTERN.test(literal.name)) continue;
      problems.push(
        problem(
          'error',
          'commands.bad-name',
          element,
          literal.path,
          `The command name "${literal.name}" may use only lower case letters, digits and "_", without the slash.`,
        ),
      );
    }
    const seen = new Set<string>();
    for (const { index, fields } of argumentsOf(dataOf(element))) {
      const name = text(fields.name);
      if (name === undefined) continue;
      const path = pointer('arguments', index, 'name');
      if (!COMMAND_NAME_PATTERN.test(name)) {
        problems.push(
          problem(
            'error',
            'commands.bad-name',
            element,
            path,
            `The argument name "${name}" may use only lower case letters, digits and "_".`,
          ),
        );
      } else if (seen.has(name)) {
        problems.push(
          problem(
            'error',
            'commands.bad-name',
            element,
            path,
            `Two arguments are called "${name}"; give each argument its own name.`,
          ),
        );
      }
      seen.add(name);
    }
  }
  return problems;
}

function nameClashes(elements: readonly Element[], vanilla: ReadonlySet<string>): Problem[] {
  const problems: Problem[] = [];
  const owners = new Map<string, Element[]>();
  for (const element of commands(elements)) {
    const own = new Set<string>();
    for (const literal of commandLiterals(element)) {
      if (vanilla.has(literal.name)) {
        problems.push(
          problem(
            'error',
            'commands.name-clash',
            element,
            literal.path,
            `"/${literal.name}" is a Minecraft command; pick another name so the game does not refuse this command.`,
          ),
        );
        continue;
      }
      if (own.has(literal.name)) {
        problems.push(
          problem(
            'error',
            'commands.name-clash',
            element,
            literal.path,
            `This command lists "/${literal.name}" twice; remove the repeated name.`,
          ),
        );
        continue;
      }
      own.add(literal.name);
      const list = owners.get(literal.name) ?? [];
      list.push(element);
      owners.set(literal.name, list);
    }
  }
  for (const element of commands(elements)) {
    for (const literal of commandLiterals(element)) {
      const list = owners.get(literal.name) ?? [];
      if (list.length < 2 || !list.includes(element)) continue;
      const others = list
        .filter((other) => other !== element)
        .map((other) => other.id)
        .sort()
        .join(', ');
      problems.push(
        problem(
          'error',
          'commands.name-clash',
          element,
          literal.path,
          `"/${literal.name}" is also a name of ${others}; each command needs its own names.`,
        ),
      );
    }
  }
  return problems;
}

function argumentOrder(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of commands(elements)) {
    const list = argumentsOf(dataOf(element));
    const total = Array.isArray(dataOf(element).arguments)
      ? (dataOf(element).arguments as Json[]).length
      : 0;
    let optionalSeen = false;
    for (const { index, fields } of list) {
      const optional = fields.optional === true;
      if (!optional && optionalSeen) {
        problems.push(
          problem(
            'error',
            'commands.optional-not-last',
            element,
            pointer('arguments', index),
            `The argument "${text(fields.name) ?? index}" is needed but comes after one that may be left out; optional arguments go at the end.`,
          ),
        );
      }
      if (optional) optionalSeen = true;
      if (fields.type === 'text' && index < total - 1) {
        problems.push(
          problem(
            'error',
            'commands.text-not-last',
            element,
            pointer('arguments', index, 'type'),
            `The text argument "${text(fields.name) ?? index}" takes the rest of the line, so it must be the last argument.`,
          ),
        );
      }
    }
  }
  return problems;
}

function ranges(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of commands(elements)) {
    for (const { index, fields } of argumentsOf(dataOf(element))) {
      const name = text(fields.name) ?? String(index);
      const type = text(fields.type) ?? '';
      const hasMin = typeof fields.min === 'number';
      const hasMax = typeof fields.max === 'number';
      if (!RANGED_ARGUMENT_TYPES.includes(type)) {
        for (const bound of ['min', 'max'] as const) {
          if (fields[bound] === undefined) continue;
          problems.push(
            problem(
              'error',
              'commands.range-not-number',
              element,
              pointer('arguments', index, bound),
              `The argument "${name}" is not a number, so it cannot have a ${bound === 'min' ? 'lowest' : 'highest'} value; remove "${bound}" or make it an integer or a number.`,
            ),
          );
        }
        continue;
      }
      if (hasMin && hasMax && (fields.min as number) > (fields.max as number)) {
        problems.push(
          problem(
            'error',
            'commands.min-above-max',
            element,
            pointer('arguments', index, 'min'),
            `The argument "${name}" has a lowest value (${fields.min}) above its highest value (${fields.max}).`,
          ),
        );
      }
    }
  }
  return problems;
}

/** The names of the command's declared events. */
const declaredEvents = (data: JsonObject): Set<string> =>
  new Set(isRecord(data.events) ? Object.keys(data.events) : []);

function eventReferences(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of commands(elements)) {
    const data = dataOf(element);
    const declared = declaredEvents(data);
    const hasFunction = text(data.function) !== undefined;
    const event = text(data.event);
    if (hasFunction && event !== undefined) {
      problems.push(
        problem(
          'error',
          'commands.function-and-event',
          element,
          '/event',
          'A command runs either a function or an event, not both; remove one of them.',
        ),
      );
    }
    if (event !== undefined && !declared.has(event)) {
      problems.push(
        problem(
          'error',
          'commands.unknown-event',
          element,
          '/event',
          `The command runs the event "${event}", which it does not declare in "events".`,
        ),
      );
    }
    const events = isRecord(data.events) ? data.events : {};
    for (const [name, value] of Object.entries(events)) {
      const actions = isRecord(value) ? value.actions : undefined;
      if (!Array.isArray(actions)) continue;
      actions.forEach((action, index) => {
        if (!isRecord(action) || action.type !== 'trigger_event') return;
        const target = text(action.event);
        if (target === undefined || declared.has(target)) return;
        problems.push(
          problem(
            'error',
            'commands.unknown-event',
            element,
            pointer('events', name, 'actions', index, 'event'),
            `The action runs the event "${target}", which the command does not declare.`,
          ),
        );
      });
    }
  }
  return problems;
}

const SUBSCRIBE_PATTERN = /msm\s*\.\s*events\s*\.\s*on\s*\(\s*(["'])command\1/;

/** The text of every script that subscribes to the `command` event. */
function commandScripts(elements: readonly Element[]): string[] {
  const texts: string[] = [];
  for (const element of elements) {
    if (element.kind !== SCRIPT_KIND) continue;
    const lines = dataOf(element).lines;
    if (!Array.isArray(lines)) continue;
    const source = lines.filter((line) => typeof line === 'string').join('\n');
    if (SUBSCRIBE_PATTERN.test(source)) texts.push(source);
  }
  return texts;
}

function nothingToRun(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  const scripts = commandScripts(elements);
  for (const element of commands(elements)) {
    const data = dataOf(element);
    if (text(data.function) !== undefined || text(data.event) !== undefined) continue;
    const name = text(data.name) ?? '';
    const handled =
      name.length > 0 &&
      scripts.some((source) => source.includes(`"${name}"`) || source.includes(`'${name}'`));
    problems.push(
      handled
        ? problem(
            'warning',
            'commands.nothing-to-run',
            element,
            '/function',
            `The command runs no function or event; only the script that handles "${name}" does something when it is used.`,
          )
        : problem(
            'error',
            'commands.nothing-to-run',
            element,
            '/function',
            'The command does nothing: give it a function or an event to run, or handle it in a script.',
          ),
    );
  }
  return problems;
}

function playerNotes(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of commands(elements)) {
    const data = dataOf(element);
    if (text(data.function) === undefined) continue;
    const permission = typeof data.permission === 'number' ? data.permission : 0;
    if (permission === 0) {
      problems.push(
        problem(
          'info',
          'commands.runs-as-player',
          element,
          '/permission',
          'Every player can use this command, and its function runs with operator rights. Set the permission to 2 to keep it for operators.',
        ),
      );
    }
    for (const { index, fields } of argumentsOf(data)) {
      if (fields.type !== 'text') continue;
      problems.push(
        problem(
          'info',
          'commands.raw-text',
          element,
          pointer('arguments', index, 'type'),
          `The function gets "${text(fields.name) ?? index}" exactly as it is typed: a " or \\ in it can break a quoted "$(${text(fields.name) ?? 'name'})" in the function.`,
        ),
      );
    }
  }
  return problems;
}

export const commandValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.scripting.command-names',
    kinds: [COMMAND_KIND],
    validate: ({ elements, target }) => [
      ...badNames(elements),
      ...nameClashes(elements, new Set(target.commands?.vanillaNames ?? [])),
    ],
  },
  {
    id: 'msm.scripting.command-arguments',
    kinds: [COMMAND_KIND],
    validate: ({ elements }) => [...argumentOrder(elements), ...ranges(elements)],
  },
  {
    id: 'msm.scripting.command-actions',
    kinds: [COMMAND_KIND, SCRIPT_KIND],
    validate: ({ elements }) => [
      ...eventReferences(elements),
      ...nothingToRun(elements),
      ...playerNotes(elements),
    ],
  },
] satisfies ProjectValidator[]);
