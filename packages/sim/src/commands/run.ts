/**
 * Running a line from Try it's chat box (B463, Q29: commands are logged, not shown), in the
 * runtime's order (B454 `MsmCommands`): the function it runs, then its event, whose actions Try
 * it runs like any other (self and other the player who typed it), then the `command` listeners
 * of scripts (Rules made for a command that runs a function, B458), then the feedback line. A
 * line that does not read gets the game's error and nothing runs.
 *
 * Functions and the game's own commands (B606, ADR 0120 D8): once the local source hands the
 * runner its {@link ChatFunctions}, a command's function runs with the arguments as its macro
 * values (players as the preview player's UUID, as the runtime writes them), and a line of the
 * game's own commands (`/give`, `/function`, `/execute`, ...) runs through them; a command the
 * preview does not run is said out loud. Without them both are "Only in Minecraft", as before.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { type EventContext, PLAYER } from '../events/actions.js';
import type { EventOwner } from '../events/definitions.js';
import type { SimLog, SimOrigin, Vec3 } from '../types.js';
import { type CommandsTarget, readCommands, type SimCommand, usageOf } from './catalogue.js';
import type { VanillaChatAnswer } from './functions.js';
import {
  type CommandContext,
  type CommandParse,
  type CommandValue,
  PREVIEW_PLAYER_NAME,
  parseCommandLine,
  valueWords,
} from './parse.js';
import { PREVIEW_PLAYER_UUID, VANILLA_COMMANDS } from './vanilla.js';

/** What the runner works with. */
export interface CommandHost {
  readonly log: SimLog;
  /** Where the player's feet are. */
  readonly feet: () => Vec3;
  /** Whether an item or block id is known (`undefined`: only the game knows). */
  readonly knowsItem: (id: string) => boolean | undefined;
  readonly knowsBlock: (id: string) => boolean | undefined;
  /** Runs an event of an owner (the trigger engine's `fireOwned`). */
  readonly fire: (owner: EventOwner, eventId: string, ctx: EventContext, sentence: string) => void;
  /**
   * The script listeners of the `command` event (`WorldEvents.commandRan`, or the area's scripts,
   * B400), with the name typed and the arguments' values.
   */
  readonly listeners: (
    id: string,
    sentence: string,
    used: { readonly name: string; readonly args: Readonly<Record<string, CommandValue>> },
  ) => void;
  /** A line that is not a command was said in the chat (the `player.chat` event, B400). */
  readonly said?: (text: string) => void;
}

/** The functions and the game's own commands, from the local source (B606). */
export interface ChatFunctions {
  /** Runs a line of the game's own commands (with its `/`). */
  runLine(line: string): VanillaChatAnswer;
  /** Runs a function as the player with macro values; returns the lines to show. */
  runFunction(id: string, args: JsonObject, origin: SimOrigin): readonly string[];
}

/** A command's argument values as macro values (players as UUIDs, as the runtime writes them). */
export function macroValues(args: Readonly<Record<string, CommandValue>>): JsonObject {
  const out: Record<string, Json> = {};
  for (const [name, value] of Object.entries(args)) {
    if (value === `${PREVIEW_PLAYER_NAME}'s UUID`) out[name] = PREVIEW_PLAYER_UUID;
    else if (Array.isArray(value)) out[name] = [...value];
    else out[name] = value as Json;
  }
  return out;
}

/** One line of the chat box's own history: what was typed and what came back. */
export interface ChatLine {
  readonly typed: string;
  /** `ran`, `error` or `game` (a vanilla command, run only in the game). */
  readonly result: 'ran' | 'error' | 'game';
  /** The answer in the game's words (the feedback, or the error and its pointer). */
  readonly answer: readonly string[];
}

/** The most chat lines kept. */
export const CHAT_HISTORY = 50;

/** The chat box's commands and history; see the module comment. */
export class CommandRunner {
  private commandsNow: SimCommand[];
  private vanilla: readonly string[];
  private readonly host: CommandHost;
  private readonly history: ChatLine[] = [];
  private readonly saidPermission = new Set<string>();
  private functions: ChatFunctions | null = null;

  constructor(
    files: Parameters<typeof readCommands>[0],
    target: CommandsTarget,
    host: CommandHost,
  ) {
    this.commandsNow = readCommands(files, target);
    this.vanilla = target.commands?.vanillaNames ?? [];
    this.host = host;
  }

  /** The project's commands. */
  get commands(): readonly SimCommand[] {
    return this.commandsNow;
  }

  /** What was typed and answered, oldest first. */
  get lines(): readonly ChatLine[] {
    return this.history;
  }

  /** Reads the commands of new files (a live edit). */
  setFiles(files: Parameters<typeof readCommands>[0], target: CommandsTarget): void {
    this.commandsNow = readCommands(files, target);
    this.vanilla = target.commands?.vanillaNames ?? [];
  }

  /** Runs functions and the game's own commands through these from now on (B606). */
  useFunctions(functions: ChatFunctions | null): void {
    this.functions = functions;
  }

  /** Forgets the history ("Clear the area"). */
  clear(): void {
    this.history.length = 0;
  }

  /** Reads a line without running it (for the chat box's hint). */
  check(line: string): CommandParse {
    return parseCommandLine(line, this.commandsNow, this.vanilla, this.context());
  }

  /** Runs a typed line; returns what the chat box shows. */
  run(line: string): ChatLine {
    const typed = line.trim();
    if (typed === '') return this.keep({ typed, result: 'error', answer: [] });
    if (!typed.startsWith('/')) {
      this.host.log.info(`You said "${typed}" in the chat.`);
      this.host.said?.(typed);
      return this.keep({ typed, result: 'ran', answer: [`<${PREVIEW_PLAYER_NAME}> ${typed}`] });
    }
    const literal = typed.slice(1).split(' ', 1)[0] ?? '';
    const functions = this.functions;
    const ours = this.commandsNow.some(
      (one) => one.name === literal || one.aliases.includes(literal),
    );
    if (
      functions !== null &&
      !ours &&
      (VANILLA_COMMANDS.includes(literal) || this.vanilla.includes(literal))
    ) {
      const done = functions.runLine(typed);
      return this.keep({ typed, result: done.result, answer: done.answer });
    }
    const parsed = this.check(typed);
    if (!parsed.ok) {
      if (parsed.vanilla === true) {
        this.host.log.onlyInMinecraft(
          `the game's own commands, such as /${parsed.literal} (the chat box runs your mod's commands)`,
        );
        return this.keep({
          typed,
          result: 'game',
          answer: [
            `/${parsed.literal} is one of the game's own commands; it runs only in Minecraft.`,
          ],
        });
      }
      const answer = [parsed.error, ...(parsed.context === undefined ? [] : [parsed.context])];
      this.host.log.info(`The command ${typed} did not run: ${parsed.error}.`);
      return this.keep({ typed, result: 'error', answer });
    }
    const { command } = parsed;
    const origin: SimOrigin = command.origin;
    const values = Object.entries(parsed.args).map(
      ([name, value]) => `${name} = ${valueWords(value)}`,
    );
    const sentence = `You typed ${typed}`;
    this.host.log.info(
      `${sentence}${values.length === 0 ? '' : ` (${values.join(', ')})`}.`,
      origin,
    );
    if (command.permission > 0 && !this.saidPermission.has(command.id)) {
      this.saidPermission.add(command.id);
      this.host.log.onlyInMinecraft(
        `who may use /${command.name} (permission level ${command.permission}); the preview lets you`,
        origin,
      );
    }
    for (const what of parsed.unchecked) this.host.log.onlyInMinecraft(what, origin);
    const ran: string[] = [];
    if (command.function !== undefined && functions !== null) {
      ran.push(
        ...functions.runFunction(command.function, macroValues(parsed.args), {
          ...origin,
          pointer: '/function',
        }),
      );
    } else if (command.function !== undefined) {
      this.host.log.onlyInMinecraft(
        `run function ${command.function}${values.length === 0 ? '' : ` with ${values.join(', ')}`}`,
        { ...origin, pointer: '/function' },
      );
    }
    if (command.event !== undefined) {
      const owner: EventOwner = {
        id: command.id,
        kind: 'item',
        displayName: `/${command.name}`,
        events: command.events,
        triggers: new Map(),
        origin,
      };
      const feet = this.host.feet();
      const ctx: EventContext = {
        source: 'item',
        base: { x: Math.floor(feet.x), y: Math.floor(feet.y), z: Math.floor(feet.z) },
        origin: feet,
        player: true,
        other: PLAYER,
      };
      this.host.fire(owner, command.event, ctx, sentence);
    }
    this.host.listeners(command.id, sentence, { name: parsed.literal, args: parsed.args });
    const answer = command.feedback === undefined ? ran : [...ran, command.feedback];
    if (command.feedback !== undefined)
      this.host.log.info(`/${command.name} answered: ${command.feedback}`, origin);
    if (command.function === undefined && command.event === undefined) {
      this.host.log.info(`/${command.name} has nothing to run.`, origin);
    }
    return this.keep({ typed, result: 'ran', answer });
  }

  /** The usage lines of every command, for the chat box's help. */
  usages(): string[] {
    return this.commandsNow.map(usageOf);
  }

  private context(): CommandContext {
    return {
      feet: this.host.feet(),
      knowsItem: this.host.knowsItem,
      knowsBlock: this.host.knowsBlock,
    };
  }

  private keep(line: ChatLine): ChatLine {
    const frozen = Object.freeze({ ...line, answer: Object.freeze([...line.answer]) });
    this.history.push(frozen);
    if (this.history.length > CHAT_HISTORY)
      this.history.splice(0, this.history.length - CHAT_HISTORY);
    return frozen;
  }
}
