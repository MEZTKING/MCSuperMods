/**
 * Reading a line typed in Try it's chat box against the project's commands (B463), checked as
 * the runtime's Brigadier tree checks it (B454: `CommandBuilder`, `CommandArguments`): the
 * literal (the name or an alias), then each argument in order, read by its type, separated by one
 * space; optional arguments only at the end; integers and numbers within `min` and `max`; a
 * trailing word or a missing argument refused. The messages are the game's own wording, with the
 * game's `<--[HERE]` pointer.
 *
 * Values follow the runtime's script values (the `command` event's `args`): numbers, text and
 * booleans as they are, `players` as names, positions as three numbers (whole x and z of a
 * position centred on the block, as the game does), items and blocks as ids. The preview's world
 * has one player, named {@link PREVIEW_PLAYER_NAME}; every selector and that name find them.
 */
import type { Vec3 } from '../types.js';
import type { CommandArgument, SimCommand } from './catalogue.js';

/** The name the preview's player answers to in commands. */
export const PREVIEW_PLAYER_NAME = 'Player';

/** One argument's value. */
export type CommandValue =
  | number
  | string
  | boolean
  | readonly string[]
  | readonly [number, number, number];

/** What the parser needs from the area. */
export interface CommandContext {
  /** Where the player's feet are (for `~` coordinates). */
  readonly feet: Vec3;
  /** Whether an item id is known: `true`, `false`, or `undefined` when only the game knows. */
  readonly knowsItem: (id: string) => boolean | undefined;
  /** The same for block ids. */
  readonly knowsBlock: (id: string) => boolean | undefined;
}

/** A line that reads as a project command. */
export interface ParsedCommand {
  readonly ok: true;
  readonly command: SimCommand;
  /** The literal typed (the name or an alias). */
  readonly literal: string;
  /** The values of the arguments given, by name. */
  readonly args: Readonly<Record<string, CommandValue>>;
  /** How many arguments were given. */
  readonly present: number;
  /** Things the preview could not check (said out loud by the runner). */
  readonly unchecked: readonly string[];
}

/** A line that does not read. */
export interface CommandError {
  readonly ok: false;
  /** The game's message. */
  readonly error: string;
  /** The line up to where it went wrong, ending in `<--[HERE]`, when there is a place. */
  readonly context?: string;
  /** The literal is one of the game's own commands (it runs only in the game). */
  readonly vanilla?: boolean;
  /** The literal typed. */
  readonly literal?: string;
}

/** What {@link parseCommandLine} gives. */
export type CommandParse = ParsedCommand | CommandError;

const NUMBER_CHARS = /[0-9.-]/;
const WORD_CHARS = /[0-9A-Za-z_\-.+]/;
const ID_CHARS = /[a-z0-9_.\-:/]/;
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const SELECTOR = /^@[parse](\[.*\])?$/;

/** A cursor over the typed line. */
class Reader {
  readonly text: string;
  at: number;

  constructor(text: string, at = 0) {
    this.text = text;
    this.at = at;
  }

  get done(): boolean {
    return this.at >= this.text.length;
  }

  peek(): string {
    return this.text[this.at] ?? '';
  }

  read(allowed: RegExp): string {
    const start = this.at;
    while (!this.done && allowed.test(this.peek())) this.at += 1;
    return this.text.slice(start, this.at);
  }

  /** Reads to the next space outside brackets and braces. */
  readToken(): string {
    const start = this.at;
    let depth = 0;
    while (!this.done) {
      const c = this.peek();
      if (c === '[' || c === '{') depth += 1;
      else if (c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === ' ' && depth === 0) break;
      this.at += 1;
    }
    return this.text.slice(start, this.at);
  }

  rest(): string {
    const out = this.text.slice(this.at);
    this.at = this.text.length;
    return out;
  }
}

/** The game's pointer: up to ten characters before the place, then `<--[HERE]`. */
export function hereContext(text: string, at: number): string {
  const start = Math.max(0, at - 10);
  return `${start > 0 ? '...' : ''}${text.slice(start, at)}<--[HERE]`;
}

class ArgumentError extends Error {
  readonly at: number;
  constructor(message: string, at: number) {
    super(message);
    this.at = at;
  }
}

const range = (
  value: number,
  argument: CommandArgument,
  kind: 'Integer' | 'Double',
  at: number,
): void => {
  const min =
    argument.min === undefined
      ? undefined
      : kind === 'Integer'
        ? Math.trunc(argument.min)
        : argument.min;
  const max =
    argument.max === undefined
      ? undefined
      : kind === 'Integer'
        ? Math.trunc(argument.max)
        : argument.max;
  if (min !== undefined && value < min) {
    throw new ArgumentError(`${kind} must not be less than ${min}, found ${value}`, at);
  }
  if (max !== undefined && value > max) {
    throw new ArgumentError(`${kind} must not be more than ${max}, found ${value}`, at);
  }
};

/** Reads one coordinate: `~`, `~n`, `^n` or a number. */
function coordinate(
  reader: Reader,
  base: number,
  whole: boolean,
  centre: boolean,
): { value: number; local: boolean } {
  const start = reader.at;
  const sign = reader.peek();
  if (sign === '~' || sign === '^') {
    reader.at += 1;
    const raw = reader.read(NUMBER_CHARS);
    const offset = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(offset)) throw new ArgumentError(`Invalid double '${raw}'`, start);
    return { value: (whole ? Math.floor(base) : base) + offset, local: sign === '^' };
  }
  const raw = reader.read(NUMBER_CHARS);
  if (raw === '') throw new ArgumentError('Expected a coordinate', start);
  if (whole && !/^-?\d+$/.test(raw)) throw new ArgumentError('Expected integer', start);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ArgumentError(`Invalid double '${raw}'`, start);
  return { value: centre && /^-?\d+$/.test(raw) ? value + 0.5 : value, local: false };
}

function coordinates(
  reader: Reader,
  feet: Vec3,
  whole: boolean,
): readonly [number, number, number] {
  const start = reader.at;
  const values: number[] = [];
  const locals: boolean[] = [];
  const bases = [feet.x, feet.y, feet.z];
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      if (reader.peek() !== ' ')
        throw new ArgumentError('Incomplete (expected 3 coordinates)', start);
      reader.at += 1;
    }
    const one = coordinate(reader, bases[i] as number, whole, !whole && i !== 1);
    values.push(one.value);
    locals.push(one.local);
  }
  if (locals.some(Boolean) && !locals.every(Boolean)) {
    throw new ArgumentError(
      'Cannot mix world & local coordinates (everything must either use ^ or not)',
      start,
    );
  }
  return Object.freeze([values[0], values[1], values[2]]) as readonly [number, number, number];
}

/** Reads one argument at the reader; throws an {@link ArgumentError} with the game's words. */
function readArgument(
  reader: Reader,
  argument: CommandArgument,
  ctx: CommandContext,
  unchecked: string[],
): CommandValue {
  const start = reader.at;
  switch (argument.type) {
    case 'integer': {
      const raw = reader.read(NUMBER_CHARS);
      if (raw === '') throw new ArgumentError('Expected integer', start);
      if (!/^-?\d+$/.test(raw)) throw new ArgumentError(`Invalid integer '${raw}'`, start);
      const value = Number(raw);
      range(value, argument, 'Integer', start);
      return value;
    }
    case 'number': {
      const raw = reader.read(NUMBER_CHARS);
      if (raw === '') throw new ArgumentError('Expected double', start);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ArgumentError(`Invalid double '${raw}'`, start);
      range(value, argument, 'Double', start);
      return value;
    }
    case 'word': {
      const raw = reader.read(WORD_CHARS);
      if (raw === '') throw new ArgumentError('Expected a word', start);
      return raw;
    }
    case 'text':
      return reader.rest();
    case 'boolean': {
      const raw = reader.read(WORD_CHARS);
      if (raw === '') throw new ArgumentError('Expected bool', start);
      if (raw !== 'true' && raw !== 'false') {
        throw new ArgumentError(`Invalid bool, expected true or false but found '${raw}'`, start);
      }
      return raw === 'true';
    }
    case 'player':
    case 'players':
    case 'entity': {
      const raw = reader.readToken();
      if (raw === '') throw new ArgumentError('Expected a name or a selector', start);
      if (raw.startsWith('@')) {
        if (!SELECTOR.test(raw)) throw new ArgumentError('Unknown selector type', start);
        const kind = raw[1];
        if (argument.type !== 'entity' && kind === 'e') {
          throw new ArgumentError(
            'Only players may be affected by this command, but the provided selector includes entities',
            start,
          );
        }
        if (argument.type !== 'players' && (kind === 'a' || kind === 'e')) {
          throw new ArgumentError(
            argument.type === 'player'
              ? 'Only one player is allowed, but the provided selector allows more than one'
              : 'Only one entity is allowed, but the provided selector allows more than one',
            start,
          );
        }
        if (raw.includes('[')) unchecked.push(`the selector ${raw}'s filters`);
      } else if (!NAME.test(raw)) {
        throw new ArgumentError('Invalid name or UUID', start);
      } else if (raw !== PREVIEW_PLAYER_NAME) {
        throw new ArgumentError(
          argument.type === 'entity' ? 'No entity was found' : 'No player was found',
          start,
        );
      }
      return argument.type === 'players'
        ? Object.freeze([PREVIEW_PLAYER_NAME])
        : `${PREVIEW_PLAYER_NAME}'s UUID`;
    }
    case 'position':
    case 'block_position': {
      const whole = argument.type === 'block_position';
      const value = coordinates(reader, ctx.feet, whole);
      if (reader.text.slice(start, reader.at).includes('^')) {
        unchecked.push(
          'local coordinates (^) along your look; the preview counts them from your feet',
        );
      }
      return value;
    }
    case 'item':
    case 'block': {
      const raw = reader.read(ID_CHARS);
      if (raw === '')
        throw new ArgumentError(
          argument.type === 'item' ? 'Expected an item' : 'Expected a block',
          start,
        );
      const id = raw.includes(':') ? raw : `minecraft:${raw}`;
      const known = argument.type === 'item' ? ctx.knowsItem(id) : ctx.knowsBlock(id);
      if (known === false) {
        throw new ArgumentError(
          argument.type === 'item' ? `Unknown item '${id}'` : `Unknown block type '${id}'`,
          start,
        );
      }
      if (known === undefined) unchecked.push(`whether ${id} exists`);
      // Components, a block state or data in brackets are read and passed over, as the runtime
      // passes on only the id (B454).
      if (reader.peek() === '[' || reader.peek() === '{') {
        reader.readToken();
        unchecked.push(`the ${argument.type === 'item' ? 'components' : 'state'} given with ${id}`);
      }
      return id;
    }
  }
}

/**
 * Reads a line typed in the chat box (with or without its leading `/`) against the project's
 * commands. `vanillaNames` are the game's own literals (`TargetFacts.commands.vanillaNames`).
 */
export function parseCommandLine(
  line: string,
  commands: readonly SimCommand[],
  vanillaNames: readonly string[],
  ctx: CommandContext,
): CommandParse {
  const text = line.startsWith('/') ? line.slice(1) : line;
  const reader = new Reader(text);
  const literal = reader.read(/[^ ]/);
  if (literal === '')
    return {
      ok: false,
      error: 'Unknown or incomplete command, see below for error',
      context: '<--[HERE]',
    };
  const command = commands.find((one) => one.name === literal || one.aliases.includes(literal));
  if (command === undefined) {
    if (vanillaNames.includes(literal)) return { ok: false, error: '', vanilla: true, literal };
    return {
      ok: false,
      error: 'Unknown or incomplete command, see below for error',
      context: hereContext(text, literal.length),
      literal,
    };
  }
  const args: Record<string, CommandValue> = {};
  const unchecked: string[] = [];
  let present = 0;
  for (const argument of command.arguments) {
    if (reader.done) {
      if (argument.optional) break;
      return {
        ok: false,
        error: 'Unknown or incomplete command, see below for error',
        context: hereContext(text, text.length),
        literal,
      };
    }
    if (reader.peek() !== ' ') {
      return {
        ok: false,
        error: 'Expected whitespace to end one argument, but found trailing data',
        context: hereContext(text, reader.at),
        literal,
      };
    }
    reader.at += 1;
    try {
      args[argument.name] = readArgument(reader, argument, ctx, unchecked);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
      return { ok: false, error: error.message, context: hereContext(text, error.at), literal };
    }
    present += 1;
  }
  if (!reader.done) {
    return {
      ok: false,
      error:
        reader.peek() === ' '
          ? 'Incorrect argument for command'
          : 'Expected whitespace to end one argument, but found trailing data',
      context: hereContext(text, reader.at),
      literal,
    };
  }
  return { ok: true, command, literal, args: Object.freeze(args), present, unchecked };
}

/** An argument value in words for the log: `count = 5`, `where = 1.5 64 -2.5`. */
export function valueWords(value: CommandValue): string {
  if (Array.isArray(value))
    return value.join(value.length === 3 && typeof value[0] === 'number' ? ' ' : ', ');
  return typeof value === 'string' ? `"${value}"` : String(value);
}
