/**
 * The project's commands (B463, ADR 0096 D1, B456 lowering, B454 runtime) as Try it's chat box
 * reads them from the lowered `msm/<ns>/command/<path>.json`: the name and aliases, the
 * permission, the arguments in order with their type, range and whether they are optional, the
 * function or event it runs, its events and its feedback text (`command.<ns>.<path>.feedback`).
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import type { SimFiles, SimOrigin } from '../types.js';

/** MSM's twelve argument types (ADR 0096 D1). */
export const COMMAND_ARGUMENT_TYPES = Object.freeze([
  'integer',
  'number',
  'word',
  'text',
  'boolean',
  'player',
  'players',
  'entity',
  'position',
  'block_position',
  'item',
  'block',
] as const);

/** One argument type. */
export type CommandArgumentType = (typeof COMMAND_ARGUMENT_TYPES)[number];

/** One argument of a command. */
export interface CommandArgument {
  readonly name: string;
  readonly type: CommandArgumentType;
  readonly min?: number;
  readonly max?: number;
  readonly optional: boolean;
}

/** One project command. */
export interface SimCommand {
  /** The element id, e.g. `mymod:greet`. */
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** The permission level 0 to 4 (0 for everyone). */
  readonly permission: number;
  readonly arguments: readonly CommandArgument[];
  /** The function it runs, when it runs one. */
  readonly function?: string;
  /** The event it fires, when it fires one. */
  readonly event?: string;
  /** Its events by id: each an ordered list of actions. */
  readonly events: ReadonlyMap<string, readonly JsonObject[]>;
  /** The feedback text the player sees, from the language file. */
  readonly feedback?: string;
  readonly origin: SimOrigin;
}

/** The facts the commands read from a target: folder names and the game's own command names. */
export interface CommandsTarget {
  readonly folders: TargetFacts['folders'];
  readonly commands?: TargetFacts['commands'];
}

const PATH = /^msm\/([a-z0-9_.-]+)\/command\/(.+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

function argumentOf(value: Json): CommandArgument | undefined {
  if (!isRecord(value)) return undefined;
  const name = text(value.name);
  const type = text(value.type);
  if (name === undefined || type === undefined) return undefined;
  if (!(COMMAND_ARGUMENT_TYPES as readonly string[]).includes(type)) return undefined;
  return Object.freeze({
    name,
    type: type as CommandArgumentType,
    ...(typeof value.min === 'number' ? { min: value.min } : {}),
    ...(typeof value.max === 'number' ? { max: value.max } : {}),
    optional: value.optional === true,
  });
}

function eventsOf(definition: JsonObject): Map<string, readonly JsonObject[]> {
  const out = new Map<string, readonly JsonObject[]>();
  const events = isRecord(definition.events) ? definition.events : {};
  for (const [id, event] of Object.entries(events)) {
    const actions = isRecord(event) && Array.isArray(event.actions) ? event.actions : [];
    out.set(id, Object.freeze(actions.filter((one: Json): one is JsonObject => isRecord(one))));
  }
  return out;
}

/** The project's commands, by element id, read from the lowered files. */
export function readCommands(files: SimFiles, target: CommandsTarget): SimCommand[] {
  const lang = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let found = lang.get(namespace);
    if (found === undefined) {
      const json = readJsonFile(
        files,
        `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
      );
      found = isRecord(json) ? json : {};
      lang.set(namespace, found);
    }
    return found;
  };
  const out: SimCommand[] = [];
  for (const path of [...files.keys()].filter((one) => PATH.test(one)).sort()) {
    const match = PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const commandPath = match[2] as string;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) continue;
    const name = text(definition.name);
    if (name === undefined) continue;
    const id = `${namespace}:${commandPath}`;
    const feedbackKey =
      text(definition.feedback) ??
      `command.${namespace}.${commandPath.replaceAll('/', '.')}.feedback`;
    const feedback = text(langOf(namespace)[feedbackKey]);
    const fn = text(definition.function);
    const event = text(definition.event);
    out.push(
      Object.freeze({
        id,
        name,
        aliases: Object.freeze(
          Array.isArray(definition.aliases)
            ? definition.aliases.filter((one: Json): one is string => typeof one === 'string')
            : [],
        ),
        permission:
          typeof definition.permission === 'number'
            ? Math.min(4, Math.max(0, Math.floor(definition.permission)))
            : 0,
        arguments: Object.freeze(
          (Array.isArray(definition.arguments) ? definition.arguments : []).flatMap((one: Json) => {
            const argument = argumentOf(one);
            return argument === undefined ? [] : [argument];
          }),
        ),
        ...(fn === undefined ? {} : { function: fn }),
        ...(event === undefined ? {} : { event }),
        events: eventsOf(definition),
        ...(feedback === undefined ? {} : { feedback }),
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  return out;
}

/** The usage line of a command, as the game's help shows it: `/kit <who> [<count>]`. */
export function usageOf(command: SimCommand): string {
  const parts = command.arguments.map((one) =>
    one.optional ? `[<${one.name}>]` : `<${one.name}>`,
  );
  return [`/${command.name}`, ...parts].join(' ');
}
