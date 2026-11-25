/**
 * The game's own commands that Try it honours (ADR 0120 D8; B601 stub, B606 fills it). The list is
 * B600's (2S7): `give`, `clear`, `setblock`, `fill`, `clone`, `summon` (project mobs), `kill`,
 * `tp`/`teleport`, `effect`, `say`, `tellraw`, `title`, `playsound`, `particle`, `time`,
 * `function`, `schedule`, `scoreboard players set|add|remove` (and `reset`, `get`, `operation`),
 * `scoreboard objectives add|remove|setdisplay`, `tag`, `return`, `data get entity` (named
 * paths) and `data get storage`, `dialog show`, and `execute` with `as`, `at`, `positioned`,
 * `align`, `rotated`, `in`, `if|unless block|score|predicate|entity|dimension`,
 * `store result|success score` and `run`. Macro lines are filled in by the function runner
 * (`functions.ts`) before they reach this module.
 *
 * B558 (ADR 0117 D4, games): `random value|roll` (from the area's seeded source) and `place
 * template` (through the host's `placeTemplate`, the project's templates) run too, and absolute
 * positions are the world's: `CommandState.corner` is where the area's block 0, 0, 0 stands
 * (0, 0, 0 but on a games ground), so the games kinds' functions, written for world positions,
 * work in the area.
 *
 * The game flows (B557) write `team`, `spawnpoint` and `advancement` into project functions, so
 * they run too: teams with their options and members (score holders) in `CommandState.teams` and
 * `teamOf`, and the selector filter `team=`; spawn points kept per player (Try it's player never
 * respawns there since B727); `advancement grant|revoke` with `only`
 * (and a criterion), `until`, `from`, `through` and `everything` over the project's advancements
 * (read by the function engine), the criteria kept in `CommandState.advancements`, an advancement
 * done said in the chat and its reward function run as the player at once, as the game does.
 *
 * B727 (the commands games use, `games-commands.ts`): `gamemode`, `attribute`, `bossbar`,
 * `worldborder`, `spreadplayers`, `item`, `trigger`, `gamerule`, `weather` and `difficulty`;
 * `scoreboard players enable` and `objectives modify`; `execute store ... storage|bossbar`,
 * `execute if items`, `execute on`; a condition at the end of `execute store` stores 0 when it
 * fails and its count when it holds; `data modify|merge|remove storage` and NBT paths with
 * indexes and filters; `give` and `item` keep components; the selector filters `gamemode=`,
 * `nbt=` and `advancements=`; `kill` of the player is a death (death scores, a respawn a second
 * later at the spawn point; `@e` does not find a dead player); `summon` of anything but the
 * project's mobs keeps a thing commands see; positions in entity data are the world's.
 *
 * Every other command, and every form of a listed command the preview does not run (`clone
 * from`, `data modify entity`, `execute store ... entity`, a selector filter such as `level=`),
 * is one "Only in Minecraft" line naming it, never silent. The behaviour is written from the command
 * syntax (the vendored command trees of both targets agree on every form here) and B600's
 * observations, never from the game's code; numbers the preview cannot know (health, hunger) are
 * named when they are used.
 *
 * A line is read once ({@link compileLine}) into something that runs against a {@link
 * RunContext}; `understands` and {@link lineSupport} only read, so the Function editor's gutter
 * asks without running anything.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { BlockCatalogue } from '../blocks/catalogue.js';
import { updateNeighbours } from '../blocks/neighbours.js';
import { plainEntityName } from '../entities/catalogue.js';
import type { EntityWorld } from '../entities/entity-world.js';
import type { SimRandom } from '../entities/wander.js';
import { type ItemStack, PLAYER, parseBlockState, type SimInventory } from '../events/actions.js';
import type { PlayerController } from '../player/controller.js';
import { lookDirection } from '../player/pick.js';
import { type CommandActor, isPlayerActor } from '../players/actor.js';
import type { PracticeState } from '../players/roster.js';
import type { Answer, Situation } from '../predicates/api.js';
import type { BlockPos, BlockState, SimEffect, SimLog, SimOrigin, Vec3 } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import {
  type CommandKit,
  FIRST_THING_ID,
  GAMES_COMMAND_NAMES,
  GamesCommandState,
  gamesCommands,
  getAtPath,
  inventoryOf,
  KILL_CREDIT_TICKS,
  type NbtStep,
  nbtMatches,
  playerDies,
  playerStacks,
  putStack,
  readItemPredicate,
  readItemStackArg,
  readNbtPath,
  readSlots,
  removeAtPath,
  type SimThing,
  setAtPath,
  stackIn,
  stackMatches,
  storedNumber,
} from './games-commands.js';
import { PREVIEW_PLAYER_NAME } from './parse.js';

/**
 * The command names Try it runs since B606 (some forms of them are still said; see the module
 * comment). The AI helper's prompt names these (`TRY_IT_PROMPT_COMMANDS`, pinned by
 * `app/test/ai-prompt-truth.test.ts`); B727's commands for games are
 * {@link GAMES_COMMAND_NAMES}, which the prompt gains with its games topic (B738).
 */
export const VANILLA_COMMANDS: readonly string[] = Object.freeze([
  'advancement',
  'clear',
  'clone',
  'data',
  'dialog',
  'effect',
  'execute',
  'fill',
  'function',
  'give',
  'kill',
  'particle',
  'place',
  'playsound',
  'random',
  'return',
  'say',
  'schedule',
  'scoreboard',
  'setblock',
  'spawnpoint',
  'summon',
  'tag',
  'team',
  'teleport',
  'tellraw',
  'time',
  'title',
  'tp',
]);

/** The preview player's UUID in commands and macro values (the same as the scripts' shim). */
export const PREVIEW_PLAYER_UUID = '00000000-0000-4000-8000-000000000000';

/** The one dimension the area stands in. */
export const AREA_DIMENSION = 'minecraft:overworld';

/** The most blocks `fill` and `clone` change at once (the game's default limit). */
export const BLOCK_LIMIT = 32_768;

/** The most particles one `particle` command shows. */
export const PARTICLE_LIMIT = 1000;

/** Ticks in a day. */
const DAY_TICKS = 24_000;

const PLAYER_TYPE = 'minecraft:player';
const AIR_IDS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const DISPLAY_SLOT = /^(list|sidebar|below_name|sidebar\.team\.[a-z_]+)$/;
const ID = /^#?([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

// ---------------------------------------------------------------------------------------------
// Types shared with the function runner.

/** Where and as whom a command runs (the game's command source). */
export interface Source {
  /** `@s`: the player, a mob, or nobody (the server, as load and tick functions run). */
  readonly executor: CommandActor | null;
  readonly pos: Vec3;
  /** Degrees, as the player's look. */
  readonly yaw: number;
  readonly pitch: number;
  readonly dimension: string;
  /** Where log lines about this command point (the function and its line). */
  readonly origin?: SimOrigin;
}

/** A function a command asks the runner to run (`function`, `execute ... run function`). */
export interface FunctionCall {
  /** A function id, or `#` and a function tag id. */
  readonly id: string;
  readonly source: Source;
  /** The macro arguments. */
  readonly args?: JsonObject;
  /** Called once the function ends: its `return` value, or `undefined` when it had none. */
  readonly onDone?: (result: number | undefined, success: boolean) => void;
  /** `return run function ...`: the calling function ends with this one's result. */
  readonly returnFromCaller?: boolean;
}

/** What running one command gave. */
export interface Outcome {
  readonly success: boolean;
  /** The command's result (a count, a score, a value). */
  readonly result: number;
  /** Functions to run next, in order, before the following line. */
  readonly calls?: readonly FunctionCall[];
  /** `return`: the current function ends (with {@link result} unless calls follow). */
  readonly returned?: boolean;
}

/** What a predicate answered in a situation (the local source asks B604's evaluator). */
export interface PredicateAnswer {
  readonly answer: Answer;
  /** Why parts could not be worked out, in plain words. */
  readonly why: readonly string[];
}

/** What the commands work on. */
export interface VanillaHost {
  readonly log: SimLog;
  readonly world: SimWorld;
  catalogue(): BlockCatalogue;
  readonly player: PlayerController;
  readonly entities: EntityWorld;
  inventory(): SimInventory;
  /** Sends an effect (particle, sound, chip) to the view. */
  effect(effect: SimEffect): void;
  /** An item's name in plain words. */
  itemName(id: string): string;
  /** The seeded source `@r`, `sort=random` and particle spread draw from. */
  readonly random: SimRandom;
  /** The game time (ticks run). */
  now(): number;
  /** The area's time of day, 0 to 23999. */
  timeOfDay(): number;
  /** Moves the area's time of day on. */
  passTime(ticks: number): void;
  /** Tries a predicate by id; `undefined` when no file defines it. */
  predicate(id: string, situation: Situation): PredicateAnswer | undefined;
  /** The block ids of a block tag; `undefined` when the tag does not resolve. */
  blockTag(id: string): readonly string[] | undefined;
  /**
   * Places a structure template with its corner at `corner` (area positions, B558's
   * `place template`): the blocks placed, or `undefined` when no template of that id is known.
   * Without it `place template` runs only in the game.
   */
  placeTemplate?(id: string, corner: BlockPos, origin: SimOrigin | undefined): number | undefined;
  /**
   * Applies an item modifier (inline, a list, or an id) to a stack through the loot evaluator
   * (B727's `item modify`): the stack after it and what only the game does, in words; without
   * it the commands read the inline `set_components` and `set_count` themselves.
   */
  modifyItem?(
    modifier: Json,
    stack: ItemStack,
  ): { readonly stack: ItemStack; readonly unsupported: readonly string[] } | undefined;
  /**
   * A player died (B728): Try it's own or a practice player, with the player who killed them
   * when there is one. The local source fires the scripts' `entity.death` and the killer's
   * advancements from it.
   */
  playerDied?(
    victim: CommandActor,
    killer: CommandActor | undefined,
    origin: SimOrigin | undefined,
  ): void;
}

/** What a running command reports to and asks of the runner. */
export interface RunContext {
  readonly host: VanillaHost;
  readonly state: CommandState;
  /** The command's own answer (the chat box shows it; the log unless the run is quiet). */
  feedback(text: string, origin?: SimOrigin): void;
  /** A line the game shows in the chat or on the screen (`say`, `tellraw`, `title`): logged. */
  chat(text: string, origin?: SimOrigin): void;
  /** Says once that something happens only in Minecraft. */
  only(what: string, origin?: SimOrigin): void;
  /** Whether a function (or `#` and a function tag) exists. */
  functionExists(id: string): boolean;
  /** An advancement by id (the project's, else one the data lookup finds), or `undefined`. */
  advancement?(id: string): SimAdvancement | undefined;
  /** The project's advancements, parents before children. */
  advancements?(): readonly SimAdvancement[];
}

/** A scoreboard objective. */
export interface Objective {
  readonly name: string;
  readonly criterion: string;
  readonly displayName: string;
  /** Score holder (a name, `#fake`, or a mob's UUID) to score. */
  readonly scores: Map<string, number>;
}

/** A team (`team add`, `team modify`): its options as the game keeps them, text as plain words. */
export interface SimTeam {
  readonly name: string;
  displayName: string;
  /** A chat colour name (`red`, `dark_aqua`, ...) or `reset`. */
  colour: string;
  prefix: string;
  suffix: string;
  friendlyFire: boolean;
  seeFriendlyInvisibles: boolean;
  nametagVisibility: string;
  deathMessageVisibility: string;
  collisionRule: string;
}

/** A player's respawn point (`spawnpoint`), in world positions. */
export interface SpawnPoint {
  readonly pos: BlockPos;
  readonly yaw: number;
  readonly pitch: number;
  readonly dimension: string;
}

/** An advancement as `advancement grant|revoke` needs it (read from the project's files). */
export interface SimAdvancement {
  readonly id: string;
  readonly parent: string | undefined;
  /** Its criteria, in the file's order. */
  readonly criteria: readonly string[];
  /** Groups of criteria: done when each group has one done (every criterion its own by default). */
  readonly requirements: readonly (readonly string[])[];
  /** The title the game names it by (`[Title]`), or the id when it has no display. */
  readonly title: string;
  /** `task`, `goal` or `challenge`, or `undefined` when it has no display (no chat line). */
  readonly frame: string | undefined;
  /** Whether finishing it is said in the chat (`announce_to_chat`). */
  readonly announce: boolean;
  /** The reward function, run as the player when it is done. */
  readonly rewardFunction: string | undefined;
  /** Rewards only the game gives (experience, loot, recipes), in words. */
  readonly otherRewards: readonly string[];
  /**
   * Each criterion's trigger and conditions (B728: Try it fires `player_killed_entity`,
   * `entity_killed_player` and `consume_item` for practice players and you).
   */
  readonly triggers?: Readonly<
    Record<string, { readonly trigger: string; readonly conditions: JsonObject }>
  >;
}

/** A function waiting for its tick (`schedule`). */
export interface Scheduled {
  readonly id: string;
  readonly due: number;
}

/** What commands remember: scores, tags, storage, effects, schedules and the last dialog. */
export class CommandState {
  readonly objectives = new Map<string, Objective>();
  /** Display slot to objective name. */
  readonly display = new Map<string, string>();
  /** Holder key to its tags (`tag`). */
  readonly tags = new Map<string, Set<string>>();
  /** Command storage by id. */
  readonly storage = new Map<string, JsonObject>();
  /** Holder key to effect id to its amplifier and the tick it ends. */
  readonly effects = new Map<string, Map<string, { amplifier: number; until: number }>>();
  readonly scheduled: Scheduled[] = [];
  /** The last dialog `dialog show` opened (B611's view can show it), or `null`. */
  dialog: { readonly id: string; readonly tick: number } | null = null;
  /**
   * Where the area's corner (its block 0, 0, 0) stands in the world (B558): absolute positions
   * in commands, selectors' `x=`, `y=` and `z=`, and the positions predicates see are the
   * world's. A games ground moves it so the lowered functions' world positions land in the
   * area; every other ground leaves it at 0, 0, 0. "Clear the area" keeps it.
   */
  corner: Vec3 = { x: 0, y: 0, z: 0 };
  /** Teams by name (`team`). */
  readonly teams = new Map<string, SimTeam>();
  /** Score holder key (the player's name, a mob's UUID, a fake name) to its team's name. */
  readonly teamOf = new Map<string, string>();
  /** Holder key to its respawn point (`spawnpoint`); the preview's player never dies. */
  readonly spawnPoints = new Map<string, SpawnPoint>();
  /** Holder key to advancement id to the criteria done (`advancement grant|revoke`). */
  readonly advancements = new Map<string, Map<string, Set<string>>>();
  /** What the commands games use keep (B727, `games-commands.ts`). */
  readonly games = new GamesCommandState();

  /** Forgets everything ("Clear the area"). */
  clear(): void {
    this.games.clear();
    this.teams.clear();
    this.teamOf.clear();
    this.spawnPoints.clear();
    this.advancements.clear();
    this.objectives.clear();
    this.display.clear();
    this.tags.clear();
    this.storage.clear();
    this.effects.clear();
    this.scheduled.length = 0;
    this.dialog = null;
  }

  /** A holder's score, or `undefined` when none is set. */
  score(holder: string, objective: string): number | undefined {
    return this.objectives.get(objective)?.scores.get(holder);
  }

  /** The team a holder is on, or `undefined`. */
  teamOfHolder(holder: string): SimTeam | undefined {
    const name = this.teamOf.get(holder);
    return name === undefined ? undefined : this.teams.get(name);
  }

  /** Whether a holder has every requirement of an advancement done. */
  advancementDone(holder: string, advancement: SimAdvancement): boolean {
    const done = this.advancements.get(holder)?.get(advancement.id);
    if (done === undefined) return false;
    return advancement.requirements.every((group) => group.some((one) => done.has(one)));
  }

  /** Every score of a holder, by objective. */
  scoresOf(holder: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const objective of this.objectives.values()) {
      const value = objective.scores.get(holder);
      if (value !== undefined) out[objective.name] = value;
    }
    return out;
  }
}

/** A mob's UUID in commands: made from its id. */
export function mobUuid(id: number): string {
  return `00000000-0000-4000-8000-${id.toString(16).padStart(12, '0')}`;
}

/**
 * The score holder (and tag owner) key of an actor: the player's name, a practice player's name
 * (B728) or a mob's UUID.
 */
export function holderOf(actor: CommandActor): string {
  if (actor.kind === 'player') return PREVIEW_PLAYER_NAME;
  if (actor.kind === 'practice') return actor.name;
  return mobUuid(actor.id);
}

// ---------------------------------------------------------------------------------------------
// Reading.

/** A line the game would not read. */
class BadLine extends Error {}

/** A form of a command only the game runs (named in the "Only in Minecraft" line). */
class NotHere extends Error {
  readonly form: string;

  constructor(form: string) {
    super(form);
    this.form = form;
  }
}

/** A command that reads but fails when run (the game's error message). */
class Failed extends Error {}

interface Token {
  readonly text: string;
  readonly at: number;
}

const QUOTE_AFTER = new Set(['', ' ', '{', '[', ',', ':', '=']);

/** Splits a line at spaces outside quotes, brackets and braces. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === ' ') {
      i += 1;
      continue;
    }
    const start = i;
    let depth = 0;
    let quote = '';
    while (i < text.length) {
      const c = text[i] as string;
      if (quote !== '') {
        if (c === '\\') i += 1;
        else if (c === quote) quote = '';
      } else if ((c === '"' || c === "'") && QUOTE_AFTER.has(text[i - 1] ?? '')) quote = c;
      else if (c === '[' || c === '{') depth += 1;
      else if (c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === ' ' && depth === 0) break;
      i += 1;
    }
    out.push({ text: text.slice(start, i), at: start });
  }
  return out;
}

/** A cursor over a line's tokens. */
class Cursor {
  private readonly text: string;
  private readonly tokens: readonly Token[];
  private index = 0;

  constructor(text: string) {
    this.text = text;
    this.tokens = tokenize(text);
  }

  get done(): boolean {
    return this.index >= this.tokens.length;
  }

  peek(): string | undefined {
    return this.tokens[this.index]?.text;
  }

  next(what: string): string {
    const token = this.tokens[this.index];
    if (token === undefined) throw new BadLine(`Expected ${what}`);
    this.index += 1;
    return token.text;
  }

  optional(): string | undefined {
    const token = this.tokens[this.index];
    if (token !== undefined) this.index += 1;
    return token?.text;
  }

  /** The raw rest of the line from the next token on. */
  rest(): string {
    const token = this.tokens[this.index];
    this.index = this.tokens.length;
    return token === undefined ? '' : this.text.slice(token.at);
  }

  end(): void {
    if (!this.done) throw new BadLine('Incorrect argument for command');
  }

  int(what: string, min = -2147483648, max = 2147483647): number {
    const text = this.next(what);
    if (!/^-?\d+$/.test(text)) throw new BadLine(`Invalid integer '${text}'`);
    const value = Number(text);
    if (value < min) throw new BadLine(`Integer must not be less than ${min}, found ${value}`);
    if (value > max) throw new BadLine(`Integer must not be more than ${max}, found ${value}`);
    return value;
  }

  float(what: string, min = -Infinity): number {
    const text = this.next(what);
    const value = Number(text);
    if (text === '' || !Number.isFinite(value)) throw new BadLine(`Invalid float '${text}'`);
    if (value < min) throw new BadLine(`Float must not be less than ${min}, found ${value}`);
    return value;
  }

  bool(what: string): boolean {
    const text = this.next(what);
    if (text !== 'true' && text !== 'false') throw new BadLine(`Invalid boolean '${text}'`);
    return text === 'true';
  }

  id(what: string): string {
    const text = this.next(what);
    if (!ID.test(text)) throw new BadLine(`Invalid ${what} '${text}'`);
    return normalise(text);
  }
}

/** `stone` is `minecraft:stone`; `#logs` is `#minecraft:logs`. */
function normalise(id: string): string {
  const tag = id.startsWith('#');
  const bare = tag ? id.slice(1) : id;
  const full = bare.includes(':') ? bare : `minecraft:${bare}`;
  return tag ? `#${full}` : full;
}

/** A time argument (`10`, `10t`, `2s`, `1d`) in ticks. */
function readTime(text: string): number {
  const match = /^(\d+(?:\.\d+)?|\.\d+)([dst]?)$/.exec(text);
  if (match === null) throw new BadLine(`Invalid unit or time '${text}'`);
  const unit = match[2] === 'd' ? DAY_TICKS : match[2] === 's' ? 20 : 1;
  return Math.round(Number(match[1]) * unit);
}

// SNBT (and JSON, which it includes) -------------------------------------------------------------

/** Reads SNBT (or JSON) into a JSON value; numbers lose their type suffix. */
export function parseSnbt(text: string): Json {
  let i = 0;
  const fail = (): never => {
    throw new BadLine(`Invalid NBT at position ${i}: ${text.slice(0, 40)}`);
  };
  const space = (): void => {
    while (i < text.length && /\s/.test(text[i] as string)) i += 1;
  };
  const quoted = (): string => {
    const quote = text[i];
    i += 1;
    let out = '';
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') {
        i += 1;
        const c = text[i] ?? '';
        out += c === 'n' ? '\n' : c === 't' ? '\t' : c;
      } else out += text[i];
      i += 1;
    }
    if (i >= text.length) fail();
    i += 1;
    return out;
  };
  const bare = (): string => {
    const start = i;
    while (i < text.length && /[0-9A-Za-z_\-.+]/.test(text[i] as string)) i += 1;
    if (start === i) fail();
    return text.slice(start, i);
  };
  const value = (): Json => {
    space();
    const c = text[i];
    if (c === '{') {
      i += 1;
      const out: Record<string, Json> = {};
      space();
      if (text[i] === '}') {
        i += 1;
        return out;
      }
      for (;;) {
        space();
        const key = text[i] === '"' || text[i] === "'" ? quoted() : bare();
        space();
        if (text[i] !== ':') fail();
        i += 1;
        out[key] = value();
        space();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === '}') {
          i += 1;
          return out;
        }
        fail();
      }
    }
    if (c === '[') {
      i += 1;
      if (/^[BIL];/.test(text.slice(i, i + 2))) i += 2;
      const out: Json[] = [];
      space();
      if (text[i] === ']') {
        i += 1;
        return out;
      }
      for (;;) {
        out.push(value());
        space();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          return out;
        }
        fail();
      }
    }
    if (c === '"' || c === "'") return quoted();
    const word = bare();
    if (word === 'true') return true;
    if (word === 'false') return false;
    const number = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)[bslfdBSLFD]?$/.exec(word);
    if (number !== null) return Number(number[1]);
    return word;
  };
  const out = value();
  space();
  if (i < text.length) fail();
  return out;
}

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A JSON value as a macro or chat shows it. */
export function snbtWords(value: Json): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// Coordinates ------------------------------------------------------------------------------------

interface Coord {
  readonly rel: '' | '~' | '^';
  readonly n: number;
  /** Written without a decimal point (an absolute whole number is centred on its block). */
  readonly whole: boolean;
}

type Vec3Spec = readonly [Coord, Coord, Coord];

function readCoord(text: string): Coord {
  const rel = text.startsWith('~') ? '~' : text.startsWith('^') ? '^' : '';
  const rest = rel === '' ? text : text.slice(1);
  if (rest === '') return { rel, n: 0, whole: false };
  const n = Number(rest);
  if (!Number.isFinite(n) || /[^0-9.+-]/.test(rest)) {
    throw new BadLine(`Expected a coordinate, found '${text}'`);
  }
  return { rel, n, whole: !rest.includes('.') };
}

function readVec3(cur: Cursor): Vec3Spec {
  const spec = [
    readCoord(cur.next('a position')),
    readCoord(cur.next('a position')),
    readCoord(cur.next('a position')),
  ] as const;
  const local = spec.filter((c) => c.rel === '^').length;
  if (local !== 0 && local !== 3) throw new BadLine('Cannot mix world & local coordinates');
  return spec;
}

function resolveVec3(rc: RunContext, spec: Vec3Spec, src: Source, centre: boolean): Vec3 {
  const [a, b, c] = spec;
  if (a.rel === '^') {
    const forward = lookDirection(src.yaw, src.pitch);
    const y = (src.yaw * Math.PI) / 180;
    const p = (src.pitch * Math.PI) / 180;
    const left = { x: Math.cos(y), y: 0, z: Math.sin(y) };
    const up = { x: -Math.sin(y) * Math.sin(p), y: Math.cos(p), z: Math.cos(y) * Math.sin(p) };
    return {
      x: src.pos.x + left.x * a.n + up.x * b.n + forward.x * c.n,
      y: src.pos.y + left.y * a.n + up.y * b.n + forward.y * c.n,
      z: src.pos.z + left.z * a.n + up.z * b.n + forward.z * c.n,
    };
  }
  // An absolute coordinate is the world's: the area's corner stands at `state.corner` (B558).
  const { corner } = rc.state;
  const axis = (coord: Coord, base: number, centred: boolean, shift: number): number =>
    coord.rel === '~' ? base + coord.n : coord.n - shift + (centred && coord.whole ? 0.5 : 0);
  return {
    x: axis(a, src.pos.x, centre, corner.x),
    y: axis(b, src.pos.y, false, corner.y),
    z: axis(c, src.pos.z, centre, corner.z),
  };
}

const blockOf = (pos: Vec3): BlockPos => ({
  x: Math.floor(pos.x),
  y: Math.floor(pos.y),
  z: Math.floor(pos.z),
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

const posWords = (pos: Vec3 | BlockPos): string => [pos.x, pos.y, pos.z].map(round2).join(', ');

/** A rotation argument: two of `~n` or `n`. */
function readRotation(cur: Cursor): (src: Source) => { yaw: number; pitch: number } {
  const yaw = readCoord(cur.next('a rotation'));
  const pitch = readCoord(cur.next('a rotation'));
  if (yaw.rel === '^' || pitch.rel === '^') throw new BadLine('Local coordinates are not allowed');
  return (src) => ({
    yaw: yaw.rel === '~' ? src.yaw + yaw.n : yaw.n,
    pitch: pitch.rel === '~' ? src.pitch + pitch.n : pitch.n,
  });
}

// Ranges -----------------------------------------------------------------------------------------

interface Range {
  readonly min: number | undefined;
  readonly max: number | undefined;
}

function readRange(text: string): Range {
  const parts = text.split('..');
  const num = (part: string | undefined): number | undefined => {
    if (part === undefined || part === '') return undefined;
    const n = Number(part);
    if (!Number.isFinite(n)) throw new BadLine(`Invalid range '${text}'`);
    return n;
  };
  if (parts.length === 1) {
    const n = num(parts[0]);
    if (n === undefined) throw new BadLine(`Invalid range '${text}'`);
    return { min: n, max: n };
  }
  if (parts.length !== 2 || (parts[0] === '' && parts[1] === '')) {
    throw new BadLine(`Invalid range '${text}'`);
  }
  return { min: num(parts[0]), max: num(parts[1]) };
}

const inRange = (value: number, range: Range): boolean =>
  (range.min === undefined || value >= range.min) &&
  (range.max === undefined || value <= range.max);

// Selectors --------------------------------------------------------------------------------------

interface Filters {
  readonly types: readonly { readonly id: string; readonly not: boolean }[];
  readonly tags: readonly { readonly tag: string; readonly not: boolean }[];
  readonly names: readonly { readonly name: string; readonly not: boolean }[];
  /** `team=`: a team name, `''` for no team (`team=!` any team). */
  readonly teams: readonly { readonly team: string; readonly not: boolean }[];
  readonly limit: number | undefined;
  readonly sort: 'nearest' | 'furthest' | 'random' | 'arbitrary' | undefined;
  readonly distance: Range | undefined;
  readonly scores: Readonly<Record<string, Range>>;
  readonly at: Readonly<Partial<Record<'x' | 'y' | 'z' | 'dx' | 'dy' | 'dz', number>>>;
  /** `gamemode=` (B727): only players match, by their game mode. */
  readonly gameModes: readonly { readonly mode: string; readonly not: boolean }[];
  /** `nbt=` (B727): the entity's data holds the compound. */
  readonly nbt: readonly { readonly value: Json; readonly not: boolean }[];
  /** `advancements=` (B727): advancement id to done, or to criteria done. */
  readonly advancements: Readonly<Record<string, boolean | Readonly<Record<string, boolean>>>>;
}

interface Selector {
  /** `s`, `p`, `a`, `r`, `e`, `n`, or `name` for a player name or UUID. */
  readonly kind: string;
  readonly name?: string;
  readonly filters: Filters;
  readonly text: string;
}

const NO_FILTERS: Filters = {
  types: [],
  tags: [],
  names: [],
  teams: [],
  limit: undefined,
  sort: undefined,
  distance: undefined,
  scores: {},
  at: {},
  gameModes: [],
  nbt: [],
  advancements: {},
};

/** Splits `a=1,b={c=2,d=3}` at its top-level commas. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== '') {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((part) => part.trim()).filter((part) => part !== '');
}

function readSelector(text: string): Selector {
  const match = /^@([parsen])(?:\[(.*)\])?$/s.exec(text);
  if (match === null) {
    if (/^[0-9a-fA-F]{1,8}(-[0-9a-fA-F]{1,4}){3}-[0-9a-fA-F]{1,12}$/.test(text)) {
      return { kind: 'name', name: text.toLowerCase(), filters: NO_FILTERS, text };
    }
    if (!/^[^\s@]{1,40}$/.test(text)) throw new BadLine(`Invalid name or UUID '${text}'`);
    return { kind: 'name', name: text, filters: NO_FILTERS, text };
  }
  const kind = match[1] as string;
  const types: { id: string; not: boolean }[] = [];
  const tags: { tag: string; not: boolean }[] = [];
  const names: { name: string; not: boolean }[] = [];
  const teams: { team: string; not: boolean }[] = [];
  let limit: number | undefined;
  let sort: Filters['sort'];
  let distance: Range | undefined;
  const scores: Record<string, Range> = {};
  const at: Partial<Record<'x' | 'y' | 'z' | 'dx' | 'dy' | 'dz', number>> = {};
  const gameModes: { mode: string; not: boolean }[] = [];
  const nbt: { value: Json; not: boolean }[] = [];
  const advancements: Record<string, boolean | Record<string, boolean>> = {};
  for (const pair of splitTop(match[2] ?? '')) {
    const eq = pair.indexOf('=');
    if (eq < 0) throw new BadLine(`Expected value for option '${pair}'`);
    const key = pair.slice(0, eq).trim();
    const raw = pair.slice(eq + 1).trim();
    const not = raw.startsWith('!');
    const value = not ? raw.slice(1).trim() : raw;
    switch (key) {
      case 'type':
        if (value.startsWith('#')) throw new NotHere('a selector with an entity type tag');
        types.push({ id: normalise(value), not });
        break;
      case 'tag':
        tags.push({ tag: value, not });
        break;
      case 'name':
        names.push({ name: value.replace(/^["']|["']$/g, ''), not });
        break;
      case 'team':
        teams.push({ team: value, not });
        break;
      case 'limit': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) throw new BadLine('Limit must be at least 1');
        limit = n;
        break;
      }
      case 'sort':
        if (!['nearest', 'furthest', 'random', 'arbitrary'].includes(value)) {
          throw new BadLine(`Invalid or unknown sort type '${value}'`);
        }
        sort = value as Filters['sort'];
        break;
      case 'distance':
        distance = readRange(value);
        break;
      case 'scores': {
        const inner = /^\{(.*)\}$/s.exec(value);
        if (inner === null) throw new BadLine('Expected { for scores');
        for (const score of splitTop(inner[1] ?? '')) {
          const [objective, range] = score.split('=').map((part) => part.trim());
          if (objective === undefined || range === undefined) {
            throw new BadLine(`Invalid scores '${value}'`);
          }
          scores[objective] = readRange(range);
        }
        break;
      }
      case 'x':
      case 'y':
      case 'z':
      case 'dx':
      case 'dy':
      case 'dz': {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new BadLine(`Invalid ${key} '${value}'`);
        at[key] = n;
        break;
      }
      case 'gamemode':
        if (!['survival', 'creative', 'adventure', 'spectator'].includes(value)) {
          throw new BadLine(`Invalid or unknown game mode '${value}'`);
        }
        gameModes.push({ mode: value, not });
        break;
      case 'nbt':
        nbt.push({ value: parseSnbt(value), not });
        break;
      case 'advancements': {
        const inner = /^\{(.*)\}$/s.exec(value);
        if (inner === null) throw new BadLine('Expected { for advancements');
        for (const entry of splitTop(inner[1] ?? '')) {
          const eq = entry.indexOf('=');
          if (eq < 0) throw new BadLine(`Invalid advancements '${value}'`);
          const id = normalise(entry.slice(0, eq).trim());
          const rest = entry.slice(eq + 1).trim();
          if (rest === 'true' || rest === 'false') advancements[id] = rest === 'true';
          else {
            const criteria = /^\{(.*)\}$/s.exec(rest);
            if (criteria === null) throw new BadLine(`Invalid advancements '${value}'`);
            const out: Record<string, boolean> = {};
            for (const one of splitTop(criteria[1] ?? '')) {
              const [name, done] = one.split('=').map((part) => part.trim());
              if (name === undefined || (done !== 'true' && done !== 'false')) {
                throw new BadLine(`Invalid advancements '${value}'`);
              }
              out[name] = done === 'true';
            }
            advancements[id] = out;
          }
        }
        break;
      }
      default:
        throw new NotHere(`the selector filter ${key}=`);
    }
  }
  return {
    kind,
    filters: {
      types,
      tags,
      names,
      teams,
      limit,
      sort,
      distance,
      scores,
      at,
      gameModes,
      nbt,
      advancements,
    },
    text,
  };
}

/** Whether a selector can only find players (`give`, `tellraw`). */
function onlyPlayers(selector: Selector): boolean {
  if (selector.kind === 'name') return true;
  if (selector.kind === 'p' || selector.kind === 'a' || selector.kind === 'r') return true;
  return selector.filters.types.some((type) => !type.not && type.id === PLAYER_TYPE);
}

/** Whether a selector finds at most one. */
function single(selector: Selector): boolean {
  return (
    selector.kind === 'name' ||
    selector.kind === 's' ||
    selector.kind === 'p' ||
    selector.kind === 'r' ||
    selector.kind === 'n' ||
    selector.filters.limit === 1
  );
}

/** What the actor helpers read: the host and the state (things that are not mobs, B727). */
interface Seen {
  readonly host: VanillaHost;
  readonly state: CommandState;
}

/** A thing that is not a project mob (B727), when the actor is one. */
function thingOf(rc: Seen, actor: CommandActor): SimThing | undefined {
  return actor.kind === 'mob' && actor.id >= FIRST_THING_ID
    ? rc.state.games.things.get(actor.id)
    : undefined;
}

/** A practice player in the game (B728), when the actor is one. */
function practiceOf(rc: Seen, actor: CommandActor): PracticeState | undefined {
  if (actor.kind !== 'practice') return undefined;
  const one = rc.state.games.practice.get(actor.name);
  return one?.online === true ? one : undefined;
}

function positionOf(rc: Seen, actor: CommandActor): Vec3 | undefined {
  if (actor.kind === 'player') return rc.host.player.position;
  if (actor.kind === 'practice') return practiceOf(rc, actor)?.pos;
  return rc.host.entities.entity(actor.id)?.position ?? thingOf(rc, actor)?.pos;
}

function typeOf(rc: Seen, actor: CommandActor): string | undefined {
  if (actor.kind === 'player' || actor.kind === 'practice') return PLAYER_TYPE;
  return rc.host.entities.entity(actor.id)?.kind.id ?? thingOf(rc, actor)?.type;
}

/** An actor's facing: the player's look, a practice player's or a mob's yaw. */
function yawOf(rc: Seen, actor: CommandActor): number {
  if (actor.kind === 'player') return rc.host.player.yaw;
  if (actor.kind === 'practice') return practiceOf(rc, actor)?.yaw ?? 0;
  return rc.host.entities.entity(actor.id)?.yaw ?? 0;
}

function pitchOf(rc: Seen, actor: CommandActor): number {
  if (actor.kind === 'player') return rc.host.player.pitch;
  if (actor.kind === 'practice') return practiceOf(rc, actor)?.pitch ?? 0;
  return 0;
}

/** An actor's name in the chat and the log. */
function actorName(rc: Seen, actor: CommandActor): string {
  if (actor.kind === 'player') return PREVIEW_PLAYER_NAME;
  if (actor.kind === 'practice') return actor.name;
  const thing = thingOf(rc, actor);
  if (thing !== undefined) return plainEntityName(thing.type);
  return rc.host.entities.entity(actor.id)?.kind.displayName ?? `mob ${actor.id}`;
}

/** Whether an actor is still there (a removed mob or thing is not, nor a player who left). */
function present(rc: Seen, actor: CommandActor): boolean {
  return actor.kind === 'player' || positionOf(rc, actor) !== undefined;
}

/**
 * The players selectors look through (B728): Try it's own player unless watching from outside
 * the game, then the practice players in the game. `living` leaves the dead out: the game's
 * `@p`, `@r`, `@e` and `@n` find only living players, `@a` every player.
 */
function players(rc: Seen, living: boolean): CommandActor[] {
  const { games } = rc.state;
  const out: CommandActor[] = [];
  if (!games.practice.userAway && !(living && games.dead.has(PREVIEW_PLAYER_NAME))) {
    out.push(PLAYER);
  }
  for (const one of games.practice.online()) {
    if (!(living && games.dead.has(one.name))) out.push(one.actor);
  }
  return out;
}

/**
 * Every living entity `@e` and `@n` look through: the players (unless dead: the game's `@e`
 * finds only living entities, `@a` every player), the project's mobs and the things.
 */
function everyone(rc: Seen): CommandActor[] {
  const out = players(rc, true);
  out.push(...rc.host.entities.entities().map((mob) => ({ kind: 'mob' as const, id: mob.id })));
  for (const id of rc.state.games.things.keys()) out.push({ kind: 'mob', id });
  return out;
}

const distanceBetween = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The actors a selector finds from a source. */
function select(rc: RunContext, selector: Selector, src: Source): CommandActor[] {
  const { host } = rc;
  if (selector.kind === 'name') {
    const name = selector.name ?? '';
    if (name === PREVIEW_PLAYER_NAME || name === PREVIEW_PLAYER_UUID) {
      return rc.state.games.practice.userAway ? [] : [PLAYER];
    }
    const practice = rc.state.games.practice.get(name);
    if (practice !== undefined) return practice.online ? [practice.actor] : [];
    const mob = host.entities.entities().find((one) => mobUuid(one.id) === name);
    if (mob !== undefined) return [{ kind: 'mob', id: mob.id }];
    const thing = [...rc.state.games.things.keys()].find((id) => mobUuid(id) === name);
    return thing === undefined ? [] : [{ kind: 'mob', id: thing }];
  }
  if (selector.kind === 's') {
    const self = src.executor;
    if (self === null) return [];
    if (!present(rc, self)) return [];
    return matches(rc, selector.filters, src, self) ? [self] : [];
  }
  const f = selector.filters;
  // `x=`, `y=` and `z=` are world positions (B558: the area's corner is `state.corner`).
  const { corner } = rc.state;
  const base: Vec3 = {
    x: f.at.x === undefined ? src.pos.x : f.at.x - corner.x,
    y: f.at.y === undefined ? src.pos.y : f.at.y - corner.y,
    z: f.at.z === undefined ? src.pos.z : f.at.z - corner.z,
  };
  let found =
    selector.kind === 'e' || selector.kind === 'n'
      ? everyone(rc)
      : players(rc, selector.kind !== 'a');
  found = found.filter((actor) => matches(rc, f, { ...src, pos: base }, actor));
  const sort =
    f.sort ??
    (selector.kind === 'p' || selector.kind === 'n'
      ? 'nearest'
      : selector.kind === 'r'
        ? 'random'
        : 'arbitrary');
  const dist = (actor: CommandActor): number => {
    const pos = positionOf(rc, actor);
    return pos === undefined ? Infinity : distanceBetween(pos, base);
  };
  if (sort === 'nearest') found.sort((a, b) => dist(a) - dist(b));
  else if (sort === 'furthest') found.sort((a, b) => dist(b) - dist(a));
  else if (sort === 'random') {
    for (let i = found.length - 1; i > 0; i -= 1) {
      const j = Math.floor(host.random.next() * (i + 1));
      const swap = found[i] as CommandActor;
      found[i] = found[j] as CommandActor;
      found[j] = swap;
    }
  }
  const limit =
    f.limit ??
    (selector.kind === 'p' || selector.kind === 'r' || selector.kind === 'n' ? 1 : undefined);
  return limit === undefined ? found : found.slice(0, limit);
}

function matches(rc: RunContext, f: Filters, src: Source, actor: CommandActor): boolean {
  const { state } = rc;
  const type = typeOf(rc, actor);
  const pos = positionOf(rc, actor);
  if (type === undefined || pos === undefined) return false;
  for (const one of f.types) if ((one.id === type) === one.not) return false;
  const own = state.tags.get(holderOf(actor)) ?? new Set<string>();
  for (const one of f.tags) {
    const has = one.tag === '' ? own.size > 0 : own.has(one.tag);
    // `tag=` means no tags at all; `tag=!` means any tag.
    if (one.tag === '' ? has !== one.not : has === one.not) return false;
  }
  for (const one of f.names) {
    const named =
      (actor.kind === 'player' && one.name === PREVIEW_PLAYER_NAME) ||
      (actor.kind === 'practice' && one.name === actor.name);
    if (named === one.not) return false;
  }
  const team = state.teamOf.get(holderOf(actor));
  for (const one of f.teams) {
    // `team=` means on no team; `team=!` means on any team.
    const has = one.team === '' ? team !== undefined : team === one.team;
    if (one.team === '' ? has !== one.not : has === one.not) return false;
  }
  if (f.distance !== undefined && !inRange(distanceBetween(pos, src.pos), f.distance)) {
    return false;
  }
  for (const [objective, range] of Object.entries(f.scores)) {
    const value = state.score(holderOf(actor), objective);
    if (value === undefined || !inRange(value, range)) return false;
  }
  const { dx, dy, dz } = f.at;
  if (dx !== undefined || dy !== undefined || dz !== undefined) {
    const inside = (p: number, start: number, d: number | undefined): boolean => {
      const span = d ?? 0;
      const lo = Math.min(start, start + span);
      const hi = Math.max(start, start + span) + 1;
      return p >= lo && p < hi;
    };
    if (
      !inside(pos.x, src.pos.x, dx) ||
      !inside(pos.y, src.pos.y, dy) ||
      !inside(pos.z, src.pos.z, dz)
    ) {
      return false;
    }
  }
  // B727: game modes (only players have one; anything else fails, negated or not), data and
  // advancements.
  for (const one of f.gameModes) {
    if (!isPlayerActor(actor)) return false;
    if ((state.games.gameMode(holderOf(actor)) === one.mode) === one.not) return false;
  }
  if (f.nbt.length > 0) {
    const data = entityCompound(rc, actor, src.origin);
    for (const one of f.nbt) if (nbtMatches(data, one.value) === one.not) return false;
  }
  for (const [id, wanted] of Object.entries(f.advancements)) {
    if (!isPlayerActor(actor)) return false;
    const advancement = rc.advancement?.(id);
    const holder = holderOf(actor);
    if (typeof wanted === 'boolean') {
      const done = advancement !== undefined && state.advancementDone(holder, advancement);
      if (done !== wanted) return false;
      continue;
    }
    const doneCriteria = state.advancements.get(holder)?.get(id) ?? new Set<string>();
    for (const [criterion, want] of Object.entries(wanted)) {
      if (doneCriteria.has(criterion) !== want) return false;
    }
  }
  return true;
}

/** A selector that must find at least one: the game's errors otherwise. */
function selectSome(
  rc: RunContext,
  selector: Selector,
  src: Source,
  players: boolean,
): CommandActor[] {
  const found = select(rc, selector, src);
  const kept = players ? found.filter(isPlayerActor) : found;
  if (kept.length === 0) throw new Failed(players ? 'No player was found' : 'No entity was found');
  return kept;
}

/** Reads a selector argument; `players` refuses selectors that can find other entities. */
function readTargets(cur: Cursor, what: string, players = false, one = false): Selector {
  const selector = readSelector(cur.next(what));
  if (players && !onlyPlayers(selector) && selector.kind !== 's') {
    throw new BadLine(
      'Only players may be affected by this command, but the provided selector includes entities',
    );
  }
  if (one && !single(selector)) {
    throw new BadLine('Only one entity is allowed, but the provided selector allows more than one');
  }
  return selector;
}

// Score holders ----------------------------------------------------------------------------------

type Holders = { readonly all: true } | { readonly all: false; readonly selector: Selector };

function readHolders(cur: Cursor): Holders {
  const text = cur.next('a score holder');
  if (text === '*') return { all: true };
  if (text.startsWith('@')) return { all: false, selector: readSelector(text) };
  return { all: false, selector: { kind: 'name', name: text, filters: NO_FILTERS, text } };
}

/** The holder keys a holder argument names (`*`: everyone with a score in `objective`). */
function holders(rc: RunContext, spec: Holders, src: Source, objective?: Objective): string[] {
  if (spec.all) return objective === undefined ? [] : [...objective.scores.keys()];
  const { selector } = spec;
  if (selector.kind === 'name') {
    const name = selector.name ?? '';
    if (name === PREVIEW_PLAYER_UUID) return [PREVIEW_PLAYER_NAME];
    return [name];
  }
  const found = select(rc, selector, src).map(holderOf);
  if (found.length === 0) throw new Failed('No entity was found');
  return found;
}

/** A holder key in words. */
function holderWords(host: VanillaHost, key: string): string {
  const mob = host.entities.entities().find((one) => mobUuid(one.id) === key);
  return mob === undefined ? key : mob.kind.displayName;
}

function objectiveOf(rc: RunContext, name: string): Objective {
  const objective = rc.state.objectives.get(name);
  if (objective === undefined) throw new Failed(`Unknown scoreboard objective '${name}'`);
  return objective;
}

const int32 = (n: number): number => Math.trunc(n) | 0;

// Blocks -----------------------------------------------------------------------------------------

interface BlockPredicate {
  readonly id: string;
  readonly tag: boolean;
  readonly properties: Readonly<Record<string, string>>;
  readonly nbt: boolean;
}

function readBlockPredicate(text: string): BlockPredicate {
  const match = /^(#?[a-z0-9_.:/-]+)(\[[^\]]*\])?(\{.*\})?$/s.exec(text);
  if (match === null) throw new BadLine(`Unknown block type '${text}'`);
  const id = normalise(match[1] as string);
  const properties: Record<string, string> = {};
  const list = match[2]?.slice(1, -1).trim() ?? '';
  if (list !== '') {
    for (const pair of list.split(',')) {
      const [key, value] = pair.split('=').map((part) => part.trim());
      if (key === undefined || value === undefined || key === '' || value === '') {
        throw new BadLine(`Invalid block state '${text}'`);
      }
      properties[key] = value;
    }
  }
  const tag = id.startsWith('#');
  return { id: tag ? id.slice(1) : id, tag, properties, nbt: match[3] !== undefined };
}

/** The block at a position for tests; the floor and places outside the area answer `undefined`. */
function blockAt(rc: RunContext, pos: BlockPos): BlockState | undefined {
  const { world } = rc.host;
  if (world.isFloor(pos)) {
    rc.only("the area's floor, which is not a Minecraft block (tests on it fail)");
    return undefined;
  }
  if (!world.inBounds(pos)) {
    rc.only('blocks outside the test area (tests there fail)');
    return undefined;
  }
  return world.get(pos) ?? { name: 'minecraft:air', properties: {} };
}

function blockMatches(rc: RunContext, predicate: BlockPredicate, state: BlockState): boolean {
  if (predicate.nbt) rc.only('block entity data in a block test (the preview checks the block)');
  if (predicate.tag) {
    const members = rc.host.blockTag(predicate.id);
    if (members === undefined) {
      rc.only(`the block tag #${predicate.id} (no file of it is known here)`);
      return false;
    }
    if (!members.includes(state.name)) return false;
  } else if (predicate.id !== state.name) {
    return false;
  }
  return Object.entries(predicate.properties).every(
    ([key, value]) => state.properties[key] === value,
  );
}

interface BlockArg {
  readonly state: BlockState;
  readonly nbt: boolean;
}

function readBlockArg(text: string): BlockArg {
  const brace = /\{.*\}$/s.exec(text);
  const stateText = brace === null ? text : text.slice(0, brace.index);
  const state = parseBlockState(stateText);
  if (state === null) throw new BadLine(`Unknown block type '${text}'`);
  return { state, nbt: brace !== null };
}

/**
 * Sets one cell from a block argument (`null` for air). Returns whether it changed; a block
 * neither the project nor Minecraft's props have is said and left.
 */
function setCell(
  rc: RunContext,
  pos: BlockPos,
  block: BlockState | null,
  update: boolean,
  origin: SimOrigin | undefined,
): boolean {
  const { world } = rc.host;
  const catalogue = rc.host.catalogue();
  const before = world.get(pos);
  if (block === null || AIR_IDS.has(block.name)) {
    if (before === null) return false;
    world.set(pos, null);
  } else {
    const normal = catalogue.normalise(block);
    if (normal === null || catalogue.blockFor(block.name) === undefined) {
      rc.only(`the block ${block.name} (neither your project nor the props have it)`, origin);
      return false;
    }
    const state = catalogue.withProperties(normal, block.properties);
    if (
      before !== null &&
      before.name === state.name &&
      Object.entries(state.properties).every(([k, v]) => before.properties[k] === v)
    ) {
      return false;
    }
    world.set(pos, state);
  }
  if (update) updateNeighbours(world, catalogue, pos);
  return true;
}

function blockName(rc: RunContext, id: string): string {
  return rc.host.catalogue().blockFor(id)?.displayName ?? plainEntityName(id);
}

interface Box3 {
  readonly min: BlockPos;
  readonly max: BlockPos;
}

const boxOf = (a: BlockPos, b: BlockPos): Box3 => ({
  min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
  max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
});

const volume = (box: Box3): number =>
  (box.max.x - box.min.x + 1) * (box.max.y - box.min.y + 1) * (box.max.z - box.min.z + 1);

function* cells(box: Box3): Generator<BlockPos> {
  for (let y = box.min.y; y <= box.max.y; y += 1) {
    for (let z = box.min.z; z <= box.max.z; z += 1) {
      for (let x = box.min.x; x <= box.max.x; x += 1) yield { x, y, z };
    }
  }
}

function checkVolume(box: Box3): void {
  const size = volume(box);
  if (size > BLOCK_LIMIT) {
    throw new Failed(
      `Too many blocks in the specified area (maximum ${BLOCK_LIMIT}, specified ${size})`,
    );
  }
}

// Text components --------------------------------------------------------------------------------

/** A text component as plain text (scores and selectors filled in from the source). */
function componentText(rc: RunContext, value: Json, src: Source): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((part) => componentText(rc, part, src)).join('');
  if (!isRecord(value)) return '';
  let text = '';
  if (typeof value.text === 'string') text = value.text;
  else if (typeof value.translate === 'string') {
    const fallback = typeof value.fallback === 'string' ? value.fallback : value.translate;
    const withArgs = Array.isArray(value.with) ? value.with : [];
    let n = 0;
    text = fallback.replace(/%(\d+\$)?s/g, (_whole, index: string | undefined) => {
      const at = index === undefined ? n++ : Number(index.slice(0, -1)) - 1;
      const arg = withArgs[at];
      return arg === undefined ? '' : componentText(rc, arg, src);
    });
  } else if (isRecord(value.score)) {
    const name = typeof value.score.name === 'string' ? value.score.name : '';
    const objective = typeof value.score.objective === 'string' ? value.score.objective : '';
    let holder = name;
    if (name.startsWith('@')) {
      const found = select(rc, readSelector(name), src);
      holder = found[0] === undefined ? '' : holderOf(found[0]);
    }
    const score = rc.state.score(holder, objective);
    text = score === undefined ? '' : String(score);
  } else if (typeof value.selector === 'string') {
    text = select(rc, readSelector(value.selector), src)
      .map((actor) => actorName(rc, actor))
      .join(', ');
  } else if (typeof value.keybind === 'string') {
    text = `[${value.keybind}]`;
  } else if (value.nbt !== undefined) {
    rc.only('NBT values in text');
  }
  if (Array.isArray(value.extra)) {
    text += value.extra.map((part) => componentText(rc, part, src)).join('');
  }
  return text;
}

/** `say` and `msg` text: selectors in it become names. */
function expandSelectors(rc: RunContext, text: string, src: Source): string {
  return text.replace(/@[parsen](\[[^\]]*\])?/g, (found) => {
    try {
      return select(rc, readSelector(found), src)
        .map((actor) => actorName(rc, actor))
        .join(', ');
    } catch {
      return found;
    }
  });
}

function sourceName(rc: RunContext, src: Source): string {
  return src.executor === null ? 'Server' : actorName(rc, src.executor);
}

// Effects ----------------------------------------------------------------------------------------

const roman = (amplifier: number): string =>
  ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][amplifier] ?? String(amplifier + 1);

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function chip(
  rc: RunContext,
  text: string,
  actor: CommandActor,
  origin: SimOrigin | undefined,
): void {
  // A practice player's chips are not drawn (B728); the chat line says it.
  if (actor.kind === 'practice') return;
  rc.host.effect({
    kind: 'chip',
    id: text,
    target: actor.kind === 'player' ? 'player' : actor.id,
    ...(origin === undefined ? {} : { origin }),
  });
}

/**
 * Who a chat line is for, when that is not you nor everyone (B728): "To Alex: " before a line
 * the functions send a practice player alone, so What happened says whose screen shows it.
 */
function addressed(rc: RunContext, found: readonly CommandActor[]): string {
  if (found.some((actor) => actor.kind === 'player')) return '';
  if (found.length >= players(rc, false).length) return '';
  return `To ${found.map((actor) => actorName(rc, actor)).join(', ')}: `;
}

// Inventory --------------------------------------------------------------------------------------

/** Takes items matching `test` from a player's slots, at most `max`; how many (or would). */
function takeItems(
  rc: RunContext,
  actor: CommandActor,
  test: (stack: ItemStack) => boolean,
  max: number | undefined,
): number {
  const held = playerStacks(rc, actor).filter(({ stack }) => test(stack));
  const total = held.reduce((sum, { stack }) => sum + stack.count, 0);
  if (max === 0) return total;
  let left = max ?? Infinity;
  for (const { slot, stack } of held) {
    if (left <= 0) break;
    const take = Math.min(left, stack.count);
    left -= take;
    putStack(rc, actor, slot, stack.count > take ? { ...stack, count: stack.count - take } : null);
  }
  return Math.min(total, max ?? Infinity);
}

// ---------------------------------------------------------------------------------------------
// The commands.

type Run = (rc: RunContext, src: Source) => Outcome;
type Compile = (cur: Cursor, head: string) => Run;

const ok = (result = 1): Outcome => ({ success: true, result });
const fail: Outcome = { success: false, result: 0 };

/** `teleport` and `tp`: the player moves; mobs are said. */
function teleport(cur: Cursor): Run {
  const first = cur.next('a target or a position');
  const rest: string[] = [];
  while (!cur.done) rest.push(cur.next('an argument'));
  // tp <destination> | tp <x y z> | tp <targets> <destination> | tp <targets> <x y z> [...]
  let targets: Selector | 'self';
  let to: { entity: Selector } | { pos: Vec3Spec };
  let turned = false;
  if (rest.length === 0) {
    targets = 'self';
    to = { entity: readSelector(first) };
  } else if (rest.length === 2 && !first.startsWith('@') && /^[~^\-.\d]/.test(first)) {
    targets = 'self';
    to = { pos: readVec3(new Cursor([first, ...rest].join(' '))) };
  } else {
    targets = readSelector(first);
    if (rest.length === 1) to = { entity: readSelector(rest[0] as string) };
    else {
      const more = new Cursor(rest.join(' '));
      to = { pos: readVec3(more) };
      if (!more.done) {
        const word = more.peek();
        if (word === 'facing') throw new NotHere('/teleport ... facing');
        readRotation(more);
        more.end();
        turned = true;
      }
    }
  }
  return (rc, src) => {
    const movers =
      targets === 'self' ? (src.executor === null ? [] : [src.executor]) : select(rc, targets, src);
    if (movers.length === 0) throw new Failed('No entity was found');
    let where: Vec3;
    if ('entity' in to) {
      const found = select(rc, to.entity, src);
      const target = found[0];
      if (target === undefined) throw new Failed('No entity was found');
      where = positionOf(rc, target) ?? src.pos;
    } else where = resolveVec3(rc, to.pos, src, true);
    let moved = 0;
    for (const actor of movers) {
      const thing = thingOf(rc, actor);
      if (thing !== undefined) {
        thing.pos = where;
        moved += 1;
        continue;
      }
      if (actor.kind === 'mob') {
        rc.only('moving mobs with /teleport (the preview moves only you)', src.origin);
        continue;
      }
      if (rc.state.games.dead.has(holderOf(actor))) {
        rc.feedback(`${actorName(rc, actor)} is dead and cannot be moved.`, src.origin);
        continue;
      }
      const practice = practiceOf(rc, actor);
      if (practice !== undefined) {
        // B728: a practice player goes anywhere (outside the area's columns it stands where it
        // is put, with no ground to fall to).
        practice.pos = where;
        practice.walkTo = null;
        practice.fall = 0;
        rc.feedback(`Teleported ${practice.name} to ${posWords(where)}.`, src.origin);
        moved += 1;
        continue;
      }
      const cell = blockOf(where);
      if (!rc.host.world.inBounds({ ...cell, y: Math.max(0, cell.y) }) || where.y < 0) {
        rc.feedback(`${posWords(where)} is outside the test area; you stay where you are.`);
        continue;
      }
      rc.host.player.teleport(where);
      if (turned) rc.only('turning you with /teleport', src.origin);
      rc.feedback(`Teleported ${PREVIEW_PLAYER_NAME} to ${posWords(where)}.`, src.origin);
      moved += 1;
    }
    if (moved === 0) return fail;
    return ok(moved);
  };
}

// Teams, spawn points and advancements (B557's game flows write them) ---------------------------

/** The colours `team modify ... color` takes (`minecraft:team_color`), and `reset`. */
export const TEAM_COLOURS: readonly string[] = Object.freeze([
  'black',
  'dark_blue',
  'dark_green',
  'dark_aqua',
  'dark_red',
  'dark_purple',
  'gold',
  'gray',
  'dark_gray',
  'blue',
  'green',
  'aqua',
  'red',
  'light_purple',
  'yellow',
  'white',
  'reset',
]);

const TEAM_NAME = /^[A-Za-z0-9_.+-]+$/;
const VISIBILITIES = ['always', 'never', 'hideForOtherTeams', 'hideForOwnTeam'];
const COLLISION_RULES = ['always', 'never', 'pushOtherTeams', 'pushOwnTeam'];

/** A team argument (`minecraft:team`): an unquoted name. */
function readTeamName(cur: Cursor): string {
  const name = cur.next('a team');
  if (!TEAM_NAME.test(name)) throw new BadLine(`Invalid team name '${name}'`);
  return name;
}

function teamOf(rc: RunContext, name: string): SimTeam {
  const team = rc.state.teams.get(name);
  if (team === undefined) throw new Failed(`Unknown team '${name}'`);
  return team;
}

/** A team in the game's answers: its display name in brackets. */
const teamWords = (team: SimTeam): string => `[${team.displayName}]`;

/** A text component argument read now and turned to words when it runs. */
function readComponent(cur: Cursor, what: string): (rc: RunContext, src: Source) => string {
  const raw = cur.rest();
  if (raw === '') throw new BadLine(`Expected ${what}`);
  let value: Json;
  try {
    value = parseSnbt(raw);
  } catch {
    throw new BadLine(`Invalid text component '${raw}'`);
  }
  return (rc, src) => componentText(rc, value, src);
}

/** Every score holder the scoreboard knows (`*` as team members). */
function allHolders(rc: RunContext): string[] {
  const out = new Set<string>();
  for (const objective of rc.state.objectives.values()) {
    for (const holder of objective.scores.keys()) out.add(holder);
  }
  return [...out];
}

/** Team members: `*`, names and selectors (score holders); a selector must find someone. */
function memberKeys(rc: RunContext, spec: Holders, src: Source): string[] {
  if (spec.all) return allHolders(rc);
  return holders(rc, spec, src);
}

const membersWords = (rc: RunContext, keys: readonly string[]): string =>
  keys.map((key) => holderWords(rc.host, key)).join(', ');

/** `team modify <team> <option> ...`. */
function teamModify(cur: Cursor): Run {
  const name = readTeamName(cur);
  const option = cur.next('an option');
  const choice = (allowed: readonly string[]): string => {
    const value = cur.next('a value');
    if (!allowed.includes(value)) throw new BadLine(`Incorrect argument for command '${value}'`);
    cur.end();
    return value;
  };
  const what =
    'what team options do to players (friendly fire, seeing invisible team-mates, name tags, death messages, pushing)';
  switch (option) {
    case 'color': {
      const colour = cur.next('a colour');
      cur.end();
      if (!TEAM_COLOURS.includes(colour)) throw new BadLine(`Unknown color '${colour}'`);
      return (rc, src) => {
        const team = teamOf(rc, name);
        if (team.colour === colour) {
          throw new Failed('Nothing changed. That team already has that color');
        }
        team.colour = colour;
        rc.feedback(`Updated the color for team ${teamWords(team)} to ${colour}.`, src.origin);
        return ok();
      };
    }
    case 'displayName': {
      const text = readComponent(cur, 'a display name');
      return (rc, src) => {
        const team = teamOf(rc, name);
        const value = text(rc, src);
        if (team.displayName === value) {
          throw new Failed('Nothing changed. That team already has that name');
        }
        team.displayName = value;
        rc.feedback(`Updated the name of team ${teamWords(team)}.`, src.origin);
        return ok();
      };
    }
    case 'prefix':
    case 'suffix': {
      const text = readComponent(cur, `a ${option}`);
      return (rc, src) => {
        const team = teamOf(rc, name);
        const value = text(rc, src);
        team[option] = value;
        rc.feedback(`Team ${option} set to ${value}.`, src.origin);
        return ok();
      };
    }
    case 'friendlyFire':
    case 'seeFriendlyInvisibles': {
      const allowed = cur.bool('true or false');
      cur.end();
      return (rc, src) => {
        const team = teamOf(rc, name);
        if (team[option] === allowed) {
          throw new Failed(
            option === 'friendlyFire'
              ? `Nothing changed. Friendly fire is already ${allowed ? 'enabled' : 'disabled'} for that team`
              : allowed
                ? 'Nothing changed. That team can already see invisible teammates'
                : "Nothing changed. That team already can't see invisible teammates",
          );
        }
        team[option] = allowed;
        rc.only(what, src.origin);
        rc.feedback(
          option === 'friendlyFire'
            ? `${allowed ? 'Enabled' : 'Disabled'} friendly fire for team ${teamWords(team)}.`
            : `Updated team ${teamWords(team)} to ${allowed ? 'see' : 'no longer see'} invisible teammates.`,
          src.origin,
        );
        return ok();
      };
    }
    case 'nametagVisibility':
    case 'deathMessageVisibility':
    case 'collisionRule': {
      const value = choice(option === 'collisionRule' ? COLLISION_RULES : VISIBILITIES);
      const words =
        option === 'nametagVisibility'
          ? 'Nametag visibility'
          : option === 'deathMessageVisibility'
            ? 'Death message visibility'
            : 'Collision rule';
      return (rc, src) => {
        const team = teamOf(rc, name);
        if (team[option] === value) {
          throw new Failed(`Nothing changed. ${words} is already that value`);
        }
        team[option] = value;
        rc.only(what, src.origin);
        rc.feedback(`${words} for team ${teamWords(team)} is now "${value}".`, src.origin);
        return ok();
      };
    }
    default:
      throw new BadLine(`Unknown team option '${option}'`);
  }
}

/** `team add|remove|empty|join|leave|list|modify`: teams kept in `CommandState`. */
function teamCommand(cur: Cursor): Run {
  const action = cur.next('add, remove, empty, join, leave, list or modify');
  switch (action) {
    case 'add': {
      const name = cur.next('a team name');
      if (!TEAM_NAME.test(name)) throw new BadLine(`Invalid team name '${name}'`);
      const display = cur.done ? undefined : readComponent(cur, 'a display name');
      return (rc, src) => {
        if (rc.state.teams.has(name)) throw new Failed('A team already exists by that name');
        const team: SimTeam = {
          name,
          displayName: display === undefined ? name : display(rc, src),
          colour: 'reset',
          prefix: '',
          suffix: '',
          friendlyFire: true,
          seeFriendlyInvisibles: true,
          nametagVisibility: 'always',
          deathMessageVisibility: 'always',
          collisionRule: 'always',
        };
        rc.state.teams.set(name, team);
        rc.feedback(`Created team ${teamWords(team)}.`, src.origin);
        return ok(rc.state.teams.size);
      };
    }
    case 'remove': {
      const name = readTeamName(cur);
      cur.end();
      return (rc, src) => {
        const team = teamOf(rc, name);
        rc.state.teams.delete(name);
        for (const [holder, on] of [...rc.state.teamOf]) {
          if (on === name) rc.state.teamOf.delete(holder);
        }
        rc.feedback(`Removed team ${teamWords(team)}.`, src.origin);
        return ok(rc.state.teams.size);
      };
    }
    case 'empty': {
      const name = readTeamName(cur);
      cur.end();
      return (rc, src) => {
        const team = teamOf(rc, name);
        const members = [...rc.state.teamOf].filter(([, on]) => on === name).map(([key]) => key);
        if (members.length === 0) {
          throw new Failed('Nothing changed. That team is already empty');
        }
        for (const key of members) rc.state.teamOf.delete(key);
        rc.feedback(
          `Removed ${plural(members.length, 'member')} from team ${teamWords(team)}.`,
          src.origin,
        );
        return ok(members.length);
      };
    }
    case 'join': {
      const name = readTeamName(cur);
      const spec = cur.done ? undefined : readHolders(cur);
      cur.end();
      return (rc, src) => {
        const team = teamOf(rc, name);
        let keys: string[];
        if (spec === undefined) {
          if (src.executor === null) {
            throw new Failed('An entity is required to run this command here');
          }
          keys = [holderOf(src.executor)];
        } else keys = memberKeys(rc, spec, src);
        for (const key of keys) rc.state.teamOf.set(key, name);
        rc.feedback(
          keys.length === 1
            ? `Added ${membersWords(rc, keys)} to team ${teamWords(team)}.`
            : `Added ${keys.length} members to team ${teamWords(team)}.`,
          src.origin,
        );
        return ok(keys.length);
      };
    }
    case 'leave': {
      const spec = readHolders(cur);
      cur.end();
      return (rc, src) => {
        const keys = memberKeys(rc, spec, src);
        for (const key of keys) rc.state.teamOf.delete(key);
        rc.feedback(
          keys.length === 1
            ? `Removed ${membersWords(rc, keys)} from any team.`
            : `Removed ${keys.length} members from any team.`,
          src.origin,
        );
        return ok(keys.length);
      };
    }
    case 'list': {
      const name = cur.done ? undefined : readTeamName(cur);
      cur.end();
      return (rc, src) => {
        if (name === undefined) {
          const all = [...rc.state.teams.values()];
          rc.feedback(
            all.length === 0
              ? 'There are no teams.'
              : `There are ${plural(all.length, 'team')}: ${all.map(teamWords).join(', ')}`,
            src.origin,
          );
          return ok(all.length);
        }
        const team = teamOf(rc, name);
        const members = [...rc.state.teamOf].filter(([, on]) => on === name).map(([key]) => key);
        rc.feedback(
          members.length === 0
            ? `There are no members on team ${teamWords(team)}.`
            : `Team ${teamWords(team)} has ${plural(members.length, 'member')}: ${membersWords(rc, members)}`,
          src.origin,
        );
        return ok(members.length);
      };
    }
    case 'modify':
      return teamModify(cur);
    default:
      throw new BadLine(`Unknown team action '${action}'`);
  }
}

/** `spawnpoint [<targets> [<pos> [<rotation>]]]`: kept per player, who respawns there (B727). */
function spawnpointCommand(cur: Cursor): Run {
  const targets = cur.done ? undefined : readTargets(cur, 'a target', true);
  const at = cur.done ? undefined : readVec3(cur);
  const rotation = cur.done ? undefined : readRotation(cur);
  cur.end();
  return (rc, src) => {
    let found: CommandActor[];
    if (targets === undefined) {
      if (src.executor === null || !isPlayerActor(src.executor)) {
        throw new Failed('A player is required to run this command here');
      }
      found = [src.executor];
    } else found = selectSome(rc, targets, src, true);
    const area = blockOf(at === undefined ? src.pos : resolveVec3(rc, at, src, false));
    const { corner } = rc.state;
    const pos: BlockPos = { x: area.x + corner.x, y: area.y + corner.y, z: area.z + corner.z };
    // Without a rotation the spawn point faces yaw 0, pitch 0 (verify at implementation).
    const turn = rotation === undefined ? { yaw: 0, pitch: 0 } : rotation(src);
    for (const actor of found) {
      rc.state.spawnPoints.set(holderOf(actor), {
        pos,
        yaw: turn.yaw,
        pitch: turn.pitch,
        dimension: src.dimension,
      });
    }
    const who =
      found.length === 1 ? actorName(rc, found[0] as CommandActor) : `${found.length} players`;
    rc.feedback(
      `Set spawn point to ${posWords(pos)} [${round2(turn.yaw)}, ${round2(turn.pitch)}] in ${src.dimension} for ${who}.`,
      src.origin,
    );
    return ok(found.length);
  };
}

type AdvancementMode = 'only' | 'from' | 'through' | 'until' | 'everything';

/** The advancements a mode picks, in the game's order (parents, itself, then children). */
function advancementsFor(
  rc: RunContext,
  mode: AdvancementMode,
  root: SimAdvancement | undefined,
): SimAdvancement[] {
  const all = rc.advancements?.() ?? [];
  if (mode === 'everything') return [...all];
  const self = root as SimAdvancement;
  if (mode === 'only') return [self];
  const out: SimAdvancement[] = [];
  if (mode === 'until' || mode === 'through') {
    const parents: SimAdvancement[] = [];
    const seen = new Set<string>([self.id]);
    let parent = self.parent === undefined ? undefined : rc.advancement?.(self.parent);
    while (parent !== undefined && !seen.has(parent.id)) {
      seen.add(parent.id);
      parents.unshift(parent);
      parent = parent.parent === undefined ? undefined : rc.advancement?.(parent.parent);
    }
    out.push(...parents);
  }
  out.push(self);
  if (mode === 'from' || mode === 'through') {
    const walk = (id: string, seen: Set<string>): void => {
      for (const child of all) {
        if (child.parent !== id || seen.has(child.id)) continue;
        seen.add(child.id);
        out.push(child);
        walk(child.id, seen);
      }
    };
    walk(self.id, new Set([self.id]));
  }
  return out;
}

/** `advancement grant|revoke <targets> everything|only|from|through|until ...`. */
function advancementCommand(cur: Cursor): Run {
  const action = cur.next('grant or revoke');
  if (action !== 'grant' && action !== 'revoke') {
    throw new BadLine(`Unknown advancement action '${action}'`);
  }
  const grant = action === 'grant';
  const targets = readTargets(cur, 'a target', true);
  const mode = cur.next('everything, only, from, through or until') as AdvancementMode;
  if (!['everything', 'only', 'from', 'through', 'until'].includes(mode)) {
    throw new BadLine(`Unknown advancement mode '${mode}'`);
  }
  const id = mode === 'everything' ? undefined : cur.id('an advancement');
  if (id?.startsWith('#') === true) throw new BadLine(`Invalid advancement '${id}'`);
  const criterion = mode === 'only' && !cur.done ? cur.rest() : undefined;
  cur.end();
  return (rc, src) => {
    const players = selectSome(rc, targets, src, true);
    let root: SimAdvancement | undefined;
    if (id !== undefined) {
      root = rc.advancement?.(id);
      if (root === undefined) {
        if (id.startsWith('minecraft:'))
          throw new NotHere(`/advancement with Minecraft’s own ${id}`);
        throw new Failed(`Unknown advancement: ${id}`);
      }
    }
    if (mode === 'everything') {
      rc.only(
        'Minecraft’s own advancements (/advancement ... everything gives your project’s)',
        src.origin,
      );
    }
    const verb = grant ? 'grant' : 'revoke';
    const toFrom = grant ? 'to' : 'from';
    const who = (n: number): string =>
      n === 1 ? actorName(rc, players[0] as CommandActor) : `${n} players`;
    const calls: FunctionCall[] = [];
    if (criterion !== undefined) {
      const one = root as SimAdvancement;
      if (!one.criteria.includes(criterion)) {
        throw new Failed(`The advancement ${one.id} does not contain the criterion '${criterion}'`);
      }
      let changed = 0;
      for (const player of players) {
        if (changeCriteria(rc, player, one, [criterion], grant, calls, src)) changed += 1;
      }
      if (changed === 0) {
        throw new Failed(
          `Couldn't ${verb} criterion '${criterion}' of advancement ${advancementWords(one)} ${toFrom} ${who(players.length)} as they ${grant ? 'already have' : "don't have"} it`,
        );
      }
      rc.feedback(
        `${grant ? 'Granted' : 'Revoked'} criterion '${criterion}' of advancement ${advancementWords(one)} ${toFrom} ${who(players.length)}.`,
        src.origin,
      );
      return { success: true, result: changed, calls };
    }
    const picked = advancementsFor(rc, mode, root);
    let changed = 0;
    for (const player of players) {
      for (const one of picked) {
        if (changeCriteria(rc, player, one, one.criteria, grant, calls, src)) changed += 1;
      }
    }
    const many = picked.length !== 1;
    const what = many
      ? `${picked.length} advancements`
      : advancementWords(picked[0] as SimAdvancement);
    if (changed === 0) {
      throw new Failed(
        `Couldn't ${verb} ${many ? what : `advancement ${what}`} ${toFrom} ${who(players.length)} as they ${grant ? 'already have' : "don't have"} ${many ? 'them' : 'it'}`,
      );
    }
    rc.feedback(
      `${grant ? 'Granted' : 'Revoked'} ${many ? what : `the advancement ${what}`} ${toFrom} ${who(players.length)}.`,
      src.origin,
    );
    return { success: true, result: changed, calls };
  };
}

const advancementWords = (one: SimAdvancement): string => `[${one.title}]`;

const FRAME_WORDS: Readonly<Record<string, string>> = {
  task: 'has made the advancement',
  goal: 'has reached the goal',
  challenge: 'has completed the challenge',
};

/**
 * Grants or revokes criteria of one advancement for one player; true when anything changed. An
 * advancement that becomes done is said in the chat (when it announces) and its reward function
 * is queued to run as the player, as the game gives rewards at once.
 */
function changeCriteria(
  rc: RunContext,
  player: CommandActor,
  advancement: SimAdvancement,
  criteria: readonly string[],
  grant: boolean,
  calls: FunctionCall[],
  src: Source,
): boolean {
  const key = holderOf(player);
  let own = rc.state.advancements.get(key);
  if (own === undefined) {
    own = new Map();
    rc.state.advancements.set(key, own);
  }
  let done = own.get(advancement.id);
  if (done === undefined) {
    done = new Set();
    own.set(advancement.id, done);
  }
  const wasDone = rc.state.advancementDone(key, advancement);
  let changed = false;
  for (const criterion of criteria) {
    if (grant && !done.has(criterion)) {
      done.add(criterion);
      changed = true;
    } else if (!grant && done.delete(criterion)) changed = true;
  }
  if (done.size === 0) own.delete(advancement.id);
  if (grant && changed && !wasDone && rc.state.advancementDone(key, advancement)) {
    const name = actorName(rc, player);
    if (advancement.frame !== undefined && advancement.announce) {
      rc.chat(
        `${name} ${FRAME_WORDS[advancement.frame] ?? FRAME_WORDS.task} ${advancementWords(advancement)}`,
        src.origin,
      );
    }
    if (advancement.otherRewards.length > 0) {
      rc.only(`advancement rewards: ${advancement.otherRewards.join(', ')}`, src.origin);
    }
    if (advancement.rewardFunction !== undefined) {
      const pos = positionOf(rc, player) ?? src.pos;
      calls.push({
        id: advancement.rewardFunction,
        source: {
          executor: player,
          pos,
          yaw: yawOf(rc, player),
          pitch: pitchOf(rc, player),
          dimension: AREA_DIMENSION,
          ...(src.origin === undefined ? {} : { origin: src.origin }),
        },
      });
    }
  }
  return changed;
}

/** Things closer than this merge into one stack when they are the same item (approximate). */
const ITEM_MERGE_DISTANCE = 1.5;

/**
 * `summon` of something that is not one of the project's mobs (B727): kept as a thing with its
 * data, so selectors, `nbt=`, `data get entity` and `kill` see it; a dropped item merges into a
 * stack of the same item close by, as the game merges them (up to 64, or 99 by its
 * `max_stack_size` component).
 */
function summonThing(
  rc: RunContext,
  type: string,
  pos: Vec3,
  nbt: Json | undefined,
  src: Source,
): Outcome {
  const data: JsonObject = isRecord(nbt) ? (structuredClone(nbt) as JsonObject) : {};
  const games = rc.state.games;
  if (type === 'minecraft:item') {
    const item = data.Item;
    if (!isRecord(item) || typeof item.id !== 'string') throw new Failed('Unable to summon entity');
    const id = normalise(item.id);
    const count = typeof item.count === 'number' ? item.count : 1;
    const most =
      isRecord(item.components) && typeof item.components['minecraft:max_stack_size'] === 'number'
        ? item.components['minecraft:max_stack_size']
        : 64;
    for (const thing of games.things.values()) {
      const have = thing.data.Item;
      if (thing.type !== type || !isRecord(have) || normalise(String(have.id)) !== id) continue;
      if (JSON.stringify(have.components ?? {}) !== JSON.stringify(item.components ?? {})) continue;
      if (distanceBetween(thing.pos, pos) > ITEM_MERGE_DISTANCE) continue;
      const now = typeof have.count === 'number' ? have.count : 1;
      if (now + count > most) continue;
      (have as Record<string, Json>).count = now + count;
      rc.feedback(`Summoned new ${plainEntityName(id)}.`, src.origin);
      return ok();
    }
    (item as Record<string, Json>).id = id;
    (item as Record<string, Json>).count = count;
  }
  const id = games.newThingId();
  games.things.set(id, { id, type, pos, data });
  for (const tag of Array.isArray(data.Tags) ? data.Tags : []) {
    if (typeof tag !== 'string') continue;
    const key = mobUuid(id);
    const own = rc.state.tags.get(key) ?? new Set<string>();
    own.add(tag);
    rc.state.tags.set(key, own);
  }
  rc.only(
    `how ${plainEntityName(type)} looks and acts (Try it keeps it for commands but does not draw it)`,
    src.origin,
  );
  rc.feedback(`Summoned new ${plainEntityName(type)}.`, src.origin);
  return ok();
}

/** What `games-commands.ts` borrows to read and run its commands (B727). */
const KIT: CommandKit = {
  badLine: (message) => new BadLine(message),
  notHere: (form) => new NotHere(form),
  failed: (message) => new Failed(message),
  readTargets: (cur, what, players, one) => readTargets(cur as Cursor, what, players, one),
  select: (rc, selector, src) => select(rc, selector as Selector, src),
  selectSome: (rc, selector, src, players) => selectSome(rc, selector as Selector, src, players),
  readVec3: (cur) => readVec3(cur as Cursor),
  resolveVec3: (rc, spec, src, centre) => resolveVec3(rc, spec as Vec3Spec, src, centre),
  readTime,
  parseSnbt,
  componentText,
  actorName: (rc, actor) => actorName(rc, actor),
  holderOf,
  normalise,
  objectiveOf,
};

const COMMANDS: Readonly<Record<string, Compile>> = {
  advancement(cur) {
    return advancementCommand(cur);
  },

  spawnpoint(cur) {
    return spawnpointCommand(cur);
  },

  team(cur) {
    return teamCommand(cur);
  },

  // B558: the games kinds roll their chances with `random value` (one block, B552).
  random(cur) {
    const action = cur.next('value, roll or reset');
    if (action === 'reset') throw new NotHere('/random reset');
    if (action !== 'value' && action !== 'roll') throw new BadLine(`Unknown action '${action}'`);
    const range = readRange(cur.next('a range'));
    const sequence = cur.optional();
    cur.end();
    if (range.min === undefined || range.max === undefined) {
      throw new BadLine('The range must have both ends');
    }
    const min = range.min;
    const max = range.max;
    if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
      throw new BadLine('The range must hold at least two whole numbers');
    }
    return (rc, src) => {
      if (sequence !== undefined) rc.only('named random sequences (/random with a sequence)');
      const value = min + Math.floor(rc.host.random.next() * (max - min + 1));
      if (action === 'roll') {
        rc.chat(`${sourceName(rc, src)} rolled ${value} (from ${min} to ${max})`, src.origin);
      } else {
        rc.feedback(`Randomly chose ${value} (from ${min} to ${max})`, src.origin);
      }
      return ok(value);
    };
  },

  // B558: a games area's reset and the world setup's start place templates.
  place(cur) {
    const what = cur.next('feature, jigsaw, structure or template');
    if (what !== 'template') throw new NotHere(`/place ${what}`);
    const id = cur.id('a template');
    const at = cur.done ? undefined : readVec3(cur);
    const rest: string[] = [];
    while (!cur.done) rest.push(cur.next('an argument'));
    return (rc, src) => {
      const placer = rc.host.placeTemplate;
      if (placer === undefined) throw new NotHere('/place template');
      if (rest.length > 0 && rest[0] !== 'none') {
        rc.only('a turned, mirrored or partly placed template (it is placed as it is)', src.origin);
      }
      const corner = blockOf(at === undefined ? src.pos : resolveVec3(rc, at, src, false));
      const placed = placer.call(rc.host, id, corner, src.origin);
      if (placed === undefined) throw new Failed(`Template ${id} not found`);
      rc.feedback(`Template ${id} placed at ${posWords(corner)}.`, src.origin);
      return ok();
    };
  },

  say(cur) {
    const message = cur.rest();
    if (message === '') throw new BadLine('Expected a message');
    return (rc, src) => {
      rc.chat(`[${sourceName(rc, src)}] ${expandSelectors(rc, message, src)}`, src.origin);
      return ok();
    };
  },

  tellraw(cur) {
    const targets = readTargets(cur, 'a target', true);
    const raw = cur.rest();
    if (raw === '') throw new BadLine('Expected a text component');
    const component = parseSnbt(raw);
    return (rc, src) => {
      const found = selectSome(rc, targets, src, true);
      rc.chat(`${addressed(rc, found)}${componentText(rc, component, src)}`, src.origin);
      return ok(found.length);
    };
  },

  title(cur) {
    const targets = readTargets(cur, 'a target', true);
    const mode = cur.next('title, subtitle, actionbar, clear, reset or times');
    if (mode === 'clear' || mode === 'reset') {
      cur.end();
      return (rc, src) => {
        const found = selectSome(rc, targets, src, true);
        rc.feedback(mode === 'clear' ? 'Cleared the titles.' : 'Reset the title options.');
        return ok(found.length);
      };
    }
    if (mode === 'times') {
      for (const part of ['fade in', 'stay', 'fade out']) readTime(cur.next(part));
      cur.end();
      return (rc, src) => {
        const found = selectSome(rc, targets, src, true);
        rc.only('how long titles stay on the screen');
        return ok(found.length);
      };
    }
    if (mode !== 'title' && mode !== 'subtitle' && mode !== 'actionbar') {
      throw new BadLine(`Unknown title mode '${mode}'`);
    }
    const component = parseSnbt(cur.rest());
    return (rc, src) => {
      const found = selectSome(rc, targets, src, true);
      const text = componentText(rc, component, src);
      const where =
        mode === 'title' ? 'Title' : mode === 'subtitle' ? 'Subtitle' : 'Above the hotbar';
      rc.chat(`${addressed(rc, found)}${where}: ${text}`, src.origin);
      if (found.some((actor) => actor.kind === 'player')) chip(rc, text, PLAYER, src.origin);
      return ok(found.length);
    };
  },

  give(cur) {
    const targets = readTargets(cur, 'a target', true);
    const itemText = cur.next('an item');
    const match = /^(#?[a-z0-9_.:/-]+)(\[.*\])?(\{.*\})?$/s.exec(itemText);
    if (match === null || (match[1] as string).startsWith('#')) {
      throw new BadLine(`Unknown item '${itemText}'`);
    }
    const id = normalise(match[1] as string);
    if (match[3] !== undefined) throw new BadLine(`Unknown item '${itemText}'`);
    // B727: an item's components are kept on the stack (`item`, `clear` and `execute if items`
    // read them).
    const stackArg =
      match[2] === undefined ? { id } : readItemStackArg(itemText, parseSnbt, normalise);
    if (stackArg === undefined) throw new BadLine(`Unknown item '${itemText}'`);
    const count = cur.done ? 1 : cur.int('a count', 1);
    cur.end();
    return (rc, src) => {
      const found = selectSome(rc, targets, src, true);
      const name = rc.host.itemName(id);
      let left = 0;
      for (const actor of found) {
        left += inventoryOf(rc, actor)?.give(id, count, stackArg.components) ?? 0;
      }
      const who =
        found.length === 1 ? actorName(rc, found[0] as CommandActor) : `${found.length} players`;
      rc.feedback(`Gave ${count} ${name} to ${who}.`, src.origin);
      if (left > 0) rc.only(`items that do not fit dropping at a player's feet`, src.origin);
      return ok(found.length);
    };
  },

  clear(cur) {
    const targets = cur.done ? undefined : readTargets(cur, 'a target', true);
    const item = cur.optional();
    const max = cur.done ? undefined : cur.int('a count', 0);
    cur.end();
    if (item?.startsWith('#') === true) throw new NotHere('/clear with an item tag');
    const predicate =
      item === undefined ? undefined : readItemPredicate(item, parseSnbt, normalise);
    if (item !== undefined && predicate === undefined) throw new BadLine(`Unknown item '${item}'`);
    const test = (stack: ItemStack): boolean =>
      predicate === undefined || stackMatches(stack, predicate);
    return (rc, src) => {
      let found: CommandActor[];
      if (targets !== undefined) found = selectSome(rc, targets, src, true);
      else if (src.executor !== null && isPlayerActor(src.executor)) found = [src.executor];
      else throw new Failed('No player was found');
      if (predicate !== undefined && predicate.unknown.length > 0) {
        rc.only(
          `the item tests ${predicate.unknown.join(', ')} (the preview leaves them out)`,
          src.origin,
        );
      }
      let taken = 0;
      for (const actor of found) taken += takeItems(rc, actor, test, max);
      const who =
        found.length === 1 ? actorName(rc, found[0] as CommandActor) : `${found.length} players`;
      if (taken === 0) {
        throw new Failed(
          found.length === 1
            ? `No items were found on player ${who}`
            : `No items were found on ${who}`,
        );
      }
      rc.feedback(
        max === 0
          ? `Found ${plural(taken, 'matching item')} on ${who}.`
          : `Removed ${plural(taken, 'item')} from ${who}.`,
        src.origin,
      );
      return ok(taken);
    };
  },

  setblock(cur) {
    const at = readVec3(cur);
    const block = readBlockArg(cur.next('a block'));
    const mode = cur.optional() ?? 'replace';
    if (!['replace', 'keep', 'destroy', 'strict'].includes(mode)) {
      throw new BadLine(`Unknown mode '${mode}'`);
    }
    cur.end();
    return (rc, src) => {
      const pos = blockOf(resolveVec3(rc, at, src, false));
      if (!rc.host.world.inBounds(pos)) {
        rc.only('blocks outside the test area', src.origin);
        throw new Failed('That position is not loaded');
      }
      if (block.nbt) rc.only('block entity data on /setblock', src.origin);
      if (mode === 'keep' && rc.host.world.get(pos) !== null) {
        throw new Failed('Could not set the block');
      }
      if (mode === 'destroy') rc.only('drops of the replaced block', src.origin);
      if (!setCell(rc, pos, block.state, mode !== 'strict', src.origin)) {
        throw new Failed('Could not set the block');
      }
      rc.feedback(
        `Changed the block at ${posWords(pos)} to ${blockName(rc, block.state.name)}.`,
        src.origin,
      );
      return ok();
    };
  },

  fill(cur) {
    const from = readVec3(cur);
    const to = readVec3(cur);
    const block = readBlockArg(cur.next('a block'));
    let mode = cur.optional() ?? 'replace';
    let filter: BlockPredicate | undefined;
    if (mode === 'replace' && !cur.done) {
      filter = readBlockPredicate(cur.next('a filter'));
      mode = cur.optional() ?? 'replace';
    }
    if (!['replace', 'keep', 'hollow', 'outline', 'destroy', 'strict'].includes(mode)) {
      throw new BadLine(`Unknown mode '${mode}'`);
    }
    cur.end();
    return (rc, src) => {
      const box = boxOf(
        blockOf(resolveVec3(rc, from, src, false)),
        blockOf(resolveVec3(rc, to, src, false)),
      );
      checkVolume(box);
      if (block.nbt) rc.only('block entity data on /fill', src.origin);
      if (mode === 'destroy') rc.only('drops of the replaced blocks', src.origin);
      let changed = 0;
      let outside = 0;
      for (const pos of cells(box)) {
        if (!rc.host.world.inBounds(pos)) {
          outside += 1;
          continue;
        }
        const edge =
          pos.x === box.min.x ||
          pos.x === box.max.x ||
          pos.y === box.min.y ||
          pos.y === box.max.y ||
          pos.z === box.min.z ||
          pos.z === box.max.z;
        let target: BlockState | null = block.state;
        if (mode === 'keep' && rc.host.world.get(pos) !== null) continue;
        if (mode === 'outline' && !edge) continue;
        if (mode === 'hollow' && !edge) target = null;
        if (filter !== undefined) {
          const here = rc.host.world.get(pos) ?? { name: 'minecraft:air', properties: {} };
          if (!blockMatches(rc, filter, here)) continue;
        }
        if (setCell(rc, pos, target, mode !== 'strict', src.origin)) changed += 1;
      }
      if (outside > 0) rc.only('blocks outside the test area', src.origin);
      if (changed === 0) throw new Failed('No blocks were filled');
      rc.feedback(`Successfully filled ${plural(changed, 'block')}.`, src.origin);
      return ok(changed);
    };
  },

  clone(cur) {
    if (cur.peek() === 'from') throw new NotHere('/clone from another dimension');
    const begin = readVec3(cur);
    const end = readVec3(cur);
    if (cur.peek() === 'to') throw new NotHere('/clone to another dimension');
    const dest = readVec3(cur);
    let mask = cur.optional() ?? 'replace';
    let filter: BlockPredicate | undefined;
    if (mask === 'filtered') filter = readBlockPredicate(cur.next('a filter'));
    if (!['replace', 'masked', 'filtered', 'strict'].includes(mask)) {
      throw new BadLine(`Unknown mode '${mask}'`);
    }
    const strict = mask === 'strict';
    if (strict) mask = 'replace';
    const mode = cur.optional() ?? 'normal';
    if (!['normal', 'force', 'move'].includes(mode)) throw new BadLine(`Unknown mode '${mode}'`);
    cur.end();
    return (rc, src) => {
      const source = boxOf(
        blockOf(resolveVec3(rc, begin, src, false)),
        blockOf(resolveVec3(rc, end, src, false)),
      );
      checkVolume(source);
      const start = blockOf(resolveVec3(rc, dest, src, false));
      const target: Box3 = {
        min: start,
        max: {
          x: start.x + source.max.x - source.min.x,
          y: start.y + source.max.y - source.min.y,
          z: start.z + source.max.z - source.min.z,
        },
      };
      const overlap =
        source.min.x <= target.max.x &&
        target.min.x <= source.max.x &&
        source.min.y <= target.max.y &&
        target.min.y <= source.max.y &&
        source.min.z <= target.max.z &&
        target.min.z <= source.max.z;
      if (overlap && mode !== 'force') {
        throw new Failed('The source and destination areas cannot overlap');
      }
      const { world } = rc.host;
      const copied: { pos: BlockPos; state: BlockState | null }[] = [];
      let outside = 0;
      for (const pos of cells(source)) {
        if (!world.inBounds(pos)) {
          outside += 1;
          continue;
        }
        const state = world.get(pos);
        if (mask === 'masked' && state === null) continue;
        if (filter !== undefined) {
          if (!blockMatches(rc, filter, state ?? { name: 'minecraft:air', properties: {} })) {
            continue;
          }
        }
        copied.push({
          pos: {
            x: pos.x - source.min.x + target.min.x,
            y: pos.y - source.min.y + target.min.y,
            z: pos.z - source.min.z + target.min.z,
          },
          state,
        });
      }
      if (mode === 'move') {
        for (const pos of cells(source)) {
          if (world.inBounds(pos)) setCell(rc, pos, null, !strict, src.origin);
        }
      }
      let changed = 0;
      for (const { pos, state } of copied) {
        if (!world.inBounds(pos)) {
          outside += 1;
          continue;
        }
        if (setCell(rc, pos, state, !strict, src.origin)) changed += 1;
      }
      if (outside > 0) rc.only('blocks outside the test area', src.origin);
      if (changed === 0) throw new Failed('No blocks were cloned');
      rc.feedback(`Successfully cloned ${plural(changed, 'block')}.`, src.origin);
      return ok(changed);
    };
  },

  summon(cur) {
    const type = cur.id('an entity type');
    const at = cur.done ? undefined : readVec3(cur);
    const nbtText = cur.optional();
    cur.end();
    const nbt = nbtText === undefined ? undefined : parseSnbt(nbtText);
    if (nbt !== undefined && !isRecord(nbt)) throw new BadLine('Expected a compound for the data');
    return (rc, src) => {
      const pos = at === undefined ? src.pos : resolveVec3(rc, at, src, true);
      if (!rc.host.entities.knows(type)) return summonThing(rc, type, pos, nbt, src);
      const result = rc.host.entities.spawn(type, {
        pos: { x: Math.floor(pos.x), y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) },
        face: 'up',
      });
      if (!result.spawned) {
        if (result.reason.startsWith('There is no mob')) {
          rc.only(`summoning ${type} (only your project's mobs are in the preview)`, src.origin);
        }
        throw new Failed('Unable to summon entity');
      }
      if (nbt !== undefined) rc.only("entity data on /summon of your project's mobs", src.origin);
      rc.feedback(
        `Summoned new ${actorName(rc, { kind: 'mob', id: result.entity.id })}.`,
        src.origin,
      );
      return ok();
    };
  },

  kill(cur) {
    const targets = cur.done ? undefined : readTargets(cur, 'a target');
    cur.end();
    return (rc, src) => {
      const found =
        targets === undefined
          ? src.executor === null
            ? []
            : [src.executor]
          : select(rc, targets, src);
      if (found.length === 0) throw new Failed('No entity was found');
      for (const actor of found) {
        const name = actorName(rc, actor);
        if (actor.kind !== 'mob') {
          // B727: the player dies (death scores, a respawn a second later); B728 a practice
          // player too.
          playerDies(rc, actor, `${name} was killed`, src.origin);
        } else if (thingOf(rc, actor) !== undefined) {
          rc.state.games.things.delete(actor.id);
          rc.state.tags.delete(holderOf(actor));
        } else rc.host.entities.remove(actor.id);
        rc.feedback(`Killed ${name}.`, src.origin);
      }
      return ok(found.length);
    };
  },

  tp: teleport,
  teleport,

  effect(cur) {
    const action = cur.next('give or clear');
    if (action === 'clear') {
      const targets = cur.done ? undefined : readTargets(cur, 'a target');
      const effect = cur.done ? undefined : cur.id('an effect');
      cur.end();
      return (rc, src) => {
        const found =
          targets === undefined
            ? src.executor === null
              ? []
              : [src.executor]
            : select(rc, targets, src);
        if (found.length === 0) throw new Failed('No entity was found');
        let cleared = 0;
        for (const actor of found) {
          const own = rc.state.effects.get(holderOf(actor));
          if (own === undefined) continue;
          if (effect === undefined) {
            cleared += own.size;
            own.clear();
          } else if (own.delete(effect)) cleared += 1;
        }
        if (cleared === 0) throw new Failed('Unable to remove effect');
        rc.feedback(`Removed ${plural(cleared, 'effect')}.`, src.origin);
        return ok(found.length);
      };
    }
    if (action !== 'give') throw new BadLine(`Unknown effect action '${action}'`);
    const targets = readTargets(cur, 'a target');
    const effect = cur.id('an effect');
    let seconds: number | 'infinite' = 30;
    if (cur.peek() === 'infinite') {
      cur.next('infinite');
      seconds = 'infinite';
    } else if (!cur.done) seconds = cur.int('seconds', 1, 1_000_000);
    const amplifier = cur.done ? 0 : cur.int('an amplifier', 0, 255);
    const hide = cur.done ? false : cur.bool('hideParticles');
    cur.end();
    return (rc, src) => {
      const found = select(rc, targets, src);
      if (found.length === 0) throw new Failed('No entity was found');
      const name = plainEntityName(effect);
      const words = `${name}${amplifier > 0 ? ` ${roman(amplifier)}` : ''}${
        seconds === 'infinite' ? ' for ever' : ` for ${plural(seconds, 'second')}`
      }`;
      const until = seconds === 'infinite' ? Infinity : rc.host.now() + seconds * 20;
      for (const actor of found) {
        const key = holderOf(actor);
        let own = rc.state.effects.get(key);
        if (own === undefined) {
          own = new Map();
          rc.state.effects.set(key, own);
        }
        own.set(effect, { amplifier, until });
        chip(rc, words, actor, src.origin);
        rc.feedback(`Gave ${actorName(rc, actor)} ${words}.`, src.origin);
      }
      rc.only(`what ${name} does (the preview shows a chip)`, src.origin);
      if (hide) rc.only('hidden effect particles', src.origin);
      return ok(found.length);
    };
  },

  playsound(cur) {
    const sound = cur.id('a sound');
    const category = cur.next('a sound source');
    const targets = readTargets(cur, 'a target', true);
    const at = cur.done ? undefined : readVec3(cur);
    const volume = cur.done ? 1 : cur.float('a volume', 0);
    const pitch = cur.done ? 1 : cur.float('a pitch', 0);
    if (!cur.done) cur.float('a minimum volume', 0);
    cur.end();
    void category;
    return (rc, src) => {
      const found = selectSome(rc, targets, src, true);
      const position = at === undefined ? src.pos : resolveVec3(rc, at, src, true);
      rc.host.effect({
        kind: 'sound',
        id: sound,
        position,
        volume,
        pitch,
        ...(src.origin === undefined ? {} : { origin: src.origin }),
      });
      const who =
        found.length === 1 ? actorName(rc, found[0] as CommandActor) : `${found.length} players`;
      rc.feedback(`Played sound ${sound} to ${who}.`, src.origin);
      return ok(found.length);
    };
  },

  particle(cur) {
    const nameText = cur.next('a particle');
    const brace = nameText.indexOf('{');
    const id = normalise(brace < 0 ? nameText : nameText.slice(0, brace));
    const options = brace < 0 ? undefined : parseSnbt(nameText.slice(brace));
    const at = cur.done ? undefined : readVec3(cur);
    let delta: Vec3Spec | undefined;
    let speed = 0;
    let count = 0;
    if (!cur.done) {
      delta = readVec3(cur);
      speed = cur.float('a speed', 0);
      count = cur.done ? 0 : cur.int('a count', 0);
    }
    const display = cur.optional();
    if (display !== undefined && display !== 'force' && display !== 'normal') {
      throw new BadLine(`Unknown mode '${display}'`);
    }
    const viewers = cur.done ? undefined : readTargets(cur, 'viewers', true);
    cur.end();
    return (rc, src) => {
      if (viewers !== undefined) selectSome(rc, viewers, src, true);
      const centre = at === undefined ? src.pos : resolveVec3(rc, at, src, false);
      const d =
        delta === undefined
          ? { x: 0, y: 0, z: 0 }
          : { x: delta[0].n, y: delta[1].n, z: delta[2].n };
      const shown = Math.min(PARTICLE_LIMIT, Math.max(1, count));
      const random = rc.host.random;
      const gaussian = (): number => {
        const u = Math.max(random.next(), 1e-12);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random.next());
      };
      for (let i = 0; i < shown; i += 1) {
        const single = count === 0;
        rc.host.effect({
          kind: 'particle',
          id,
          position: single
            ? centre
            : {
                x: centre.x + gaussian() * d.x,
                y: centre.y + gaussian() * d.y,
                z: centre.z + gaussian() * d.z,
              },
          velocity: single
            ? { x: d.x * speed, y: d.y * speed, z: d.z * speed }
            : { x: gaussian() * speed, y: gaussian() * speed, z: gaussian() * speed },
          ...(isRecord(options) ? { options: { ...options, type: id } } : {}),
          ...(src.origin === undefined ? {} : { origin: src.origin }),
        });
      }
      if (count > PARTICLE_LIMIT) rc.only(`more than ${PARTICLE_LIMIT} particles at once`);
      rc.feedback(`Displaying particle ${id}.`, src.origin);
      return ok(shown);
    };
  },

  time(cur) {
    const action = cur.next('set, add or query');
    if (action === 'set' || action === 'add') {
      if (cur.peek() === 'timemarker') throw new NotHere('/time set timemarker');
      const ticks = readTime(cur.next('a time'));
      cur.end();
      return (rc, src) => {
        const now = rc.host.timeOfDay();
        const forward =
          action === 'add' ? ticks : (((ticks - now) % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
        rc.host.passTime(forward);
        const after = rc.host.timeOfDay();
        rc.feedback(`Set the time to ${after}.`, src.origin);
        return ok(after);
      };
    }
    if (action === 'query') {
      const what = cur.next('time or gametime');
      if (what !== 'time' && what !== 'gametime' && what !== 'daytime') {
        throw new NotHere(`/time query ${what}`);
      }
      cur.end();
      return (rc, src) => {
        const value = what === 'gametime' ? rc.host.now() : rc.host.timeOfDay();
        rc.feedback(`The time is ${value}.`, src.origin);
        return ok(value);
      };
    }
    throw new NotHere(`/time ${action}`);
  },

  function(cur) {
    const id = cur.id('a function');
    let args: JsonObject | undefined;
    let fromStorage: { id: string; path: string | undefined } | undefined;
    if (!cur.done) {
      const next = cur.peek() ?? '';
      if (next === 'with') {
        cur.next('with');
        const from = cur.next('block, entity or storage');
        if (from !== 'storage') throw new NotHere(`/function ... with ${from}`);
        fromStorage = { id: cur.id('a storage id'), path: cur.optional() };
      } else {
        const value = parseSnbt(cur.next('arguments'));
        if (!isRecord(value)) throw new BadLine('Expected a compound for the arguments');
        args = value;
      }
    }
    cur.end();
    return (rc, src) => {
      if (!rc.functionExists(id)) throw new Failed(`Unknown function ${id}`);
      let callArgs = args;
      if (fromStorage !== undefined) {
        const root: Json = rc.state.storage.get(fromStorage.id) ?? {};
        const value =
          fromStorage.path === undefined ? root : getAtPath(root, readPathArg(fromStorage.path));
        if (!isRecord(value)) throw new Failed(`Found no elements matching ${fromStorage.path}`);
        callArgs = value;
      }
      return {
        success: true,
        result: 1,
        calls: [{ id, source: src, ...(callArgs === undefined ? {} : { args: callArgs }) }],
      };
    };
  },

  schedule(cur) {
    const action = cur.next('function or clear');
    if (action === 'clear') {
      const id = cur.id('a function');
      cur.end();
      return (rc, src) => {
        const before = rc.state.scheduled.length;
        const kept = rc.state.scheduled.filter((one) => one.id !== id);
        rc.state.scheduled.splice(0, before, ...kept);
        const removed = before - kept.length;
        if (removed === 0) throw new Failed(`No schedules with id ${id}`);
        rc.feedback(`Removed ${plural(removed, 'schedule')} with id ${id}.`, src.origin);
        return ok(removed);
      };
    }
    if (action !== 'function') throw new BadLine(`Unknown schedule action '${action}'`);
    const id = cur.id('a function');
    const ticks = readTime(cur.next('a time'));
    const mode = cur.optional() ?? 'replace';
    if (mode !== 'append' && mode !== 'replace') throw new BadLine(`Unknown mode '${mode}'`);
    cur.end();
    return (rc, src) => {
      if (ticks === 0) throw new Failed("Can't schedule for current tick");
      if (!rc.functionExists(id)) throw new Failed(`Unknown function ${id}`);
      const due = rc.host.now() + ticks;
      if (mode === 'replace') {
        const kept = rc.state.scheduled.filter((one) => one.id !== id);
        rc.state.scheduled.splice(0, rc.state.scheduled.length, ...kept);
      }
      rc.state.scheduled.push({ id, due });
      rc.feedback(`Scheduled function ${id} in ${plural(ticks, 'tick')}.`, src.origin);
      return ok(due);
    };
  },

  scoreboard(cur) {
    const group = cur.next('objectives or players');
    const action = cur.next('an action');
    if (group === 'objectives') return objectivesCommand(cur, action);
    if (group === 'players') return playersCommand(cur, action);
    throw new BadLine(`Unknown scoreboard group '${group}'`);
  },

  tag(cur) {
    const targets = readTargets(cur, 'a target');
    const action = cur.next('add, remove or list');
    const name = action === 'list' ? undefined : cur.next('a tag');
    cur.end();
    if (name !== undefined && !/^[A-Za-z0-9_.+-]+$/.test(name)) {
      throw new BadLine(`Invalid tag '${name}'`);
    }
    if (action !== 'add' && action !== 'remove' && action !== 'list') {
      throw new BadLine(`Unknown tag action '${action}'`);
    }
    return (rc, src) => {
      const found = select(rc, targets, src);
      if (found.length === 0) throw new Failed('No entity was found');
      if (action === 'list') {
        const all = found.flatMap((actor) => [...(rc.state.tags.get(holderOf(actor)) ?? [])]);
        rc.feedback(
          all.length === 0 ? 'There are no tags.' : `Tags: ${[...new Set(all)].join(', ')}`,
          src.origin,
        );
        return ok(all.length);
      }
      let changed = 0;
      for (const actor of found) {
        const key = holderOf(actor);
        let own = rc.state.tags.get(key);
        if (own === undefined) {
          own = new Set();
          rc.state.tags.set(key, own);
        }
        if (action === 'add' && !own.has(name as string)) {
          own.add(name as string);
          changed += 1;
        } else if (action === 'remove' && own.delete(name as string)) changed += 1;
      }
      if (changed === 0) {
        throw new Failed(
          action === 'add'
            ? 'Nothing changed. The tag is already there'
            : 'Nothing changed. The tag is not there',
        );
      }
      rc.feedback(
        `${action === 'add' ? 'Added' : 'Removed'} tag '${name}' ${action === 'add' ? 'to' : 'from'} ${found
          .map((actor) => actorName(rc, actor))
          .join(', ')}.`,
        src.origin,
      );
      return ok(changed);
    };
  },

  return(cur) {
    const first = cur.next('a value, fail or run');
    if (first === 'fail') {
      cur.end();
      return () => ({ success: false, result: 0, returned: true });
    }
    if (first === 'run') {
      const inner = compileCommand(cur.rest());
      return (rc, src) => {
        const outcome = inner(rc, src);
        if (outcome.returned === true) return outcome;
        if (outcome.calls !== undefined && outcome.calls.length > 0) {
          const calls = outcome.calls.map((call, index, all) =>
            index === all.length - 1 ? { ...call, returnFromCaller: true } : call,
          );
          return { ...outcome, calls, returned: true };
        }
        return { ...outcome, returned: true };
      };
    }
    if (!/^-?\d+$/.test(first)) throw new BadLine(`Invalid integer '${first}'`);
    const value = Number(first);
    cur.end();
    return () => ({ success: true, result: value, returned: true });
  },

  data(cur) {
    const action = cur.next('an action');
    if (action === 'modify') return dataModify(cur);
    if (action === 'merge') {
      const kind = cur.next('block, entity or storage');
      if (kind !== 'storage') throw new NotHere(`/data merge ${kind}`);
      const id = cur.id('a storage id');
      const value = parseSnbt(cur.rest());
      if (!isRecord(value)) throw new BadLine('Expected a compound');
      return (rc, src) => {
        const own = storageOf(rc, id);
        mergeInto(own, value);
        rc.feedback(`Modified storage ${id}`, src.origin);
        return ok();
      };
    }
    if (action === 'remove') {
      const kind = cur.next('block, entity or storage');
      if (kind !== 'storage') throw new NotHere(`/data remove ${kind}`);
      const id = cur.id('a storage id');
      const path = readPathArg(cur.next('a path'));
      cur.end();
      return (rc, src) => {
        if (!removeAtPath(storageOf(rc, id), path)) {
          throw new Failed('Nothing changed. The specified properties already have these values');
        }
        rc.feedback(`Modified storage ${id}`, src.origin);
        return ok();
      };
    }
    if (action !== 'get') throw new NotHere(`/data ${action}`);
    const kind = cur.next('block, entity or storage');
    if (kind === 'block') throw new NotHere('/data get block');
    if (kind === 'storage') {
      const id = cur.id('a storage id');
      const pathText = cur.optional();
      const path = pathText === undefined ? undefined : readPathArg(pathText);
      const scale = cur.done ? 1 : cur.float('a scale');
      cur.end();
      return (rc, src) => {
        const root = rc.state.storage.get(id);
        const value = path === undefined ? root : getAtPath(root, path);
        if (value === undefined) throw new Failed(`Found no elements matching ${pathText ?? id}`);
        const n = dataNumber(value, scale);
        rc.feedback(`Storage ${id} has the following contents: ${snbtWords(value)}`, src.origin);
        return ok(n);
      };
    }
    if (kind !== 'entity') throw new BadLine(`Unknown data source '${kind}'`);
    const target = readTargets(cur, 'a target', false, true);
    const path = cur.optional();
    const scale = cur.done ? 1 : cur.float('a scale');
    cur.end();
    return (rc, src) => {
      const actor = selectSome(rc, target, src, false)[0] as CommandActor;
      if (path === undefined) {
        rc.only("an entity's whole data (/data get entity without a path)", src.origin);
        return fail;
      }
      const value = entityData(rc, actor, path, src.origin);
      if (value === undefined) {
        rc.only(`the entity data ${path}`, src.origin);
        throw new Failed(`Found no elements matching ${path}`);
      }
      const n = dataNumber(value, scale);
      rc.feedback(
        `${actorName(rc, actor)} has the following entity data: ${snbtWords(value)}`,
        src.origin,
      );
      return ok(n);
    };
  },

  dialog(cur) {
    const action = cur.next('show or clear');
    const targets = readTargets(cur, 'a target', true);
    if (action === 'clear') {
      cur.end();
      return (rc, src) => {
        const found = selectSome(rc, targets, src, true);
        rc.state.dialog = null;
        rc.feedback('Closed the dialog.', src.origin);
        return ok(found.length);
      };
    }
    if (action !== 'show') throw new BadLine(`Unknown dialog action '${action}'`);
    const raw = cur.rest();
    if (raw === '') throw new BadLine('Expected a dialog');
    const inline = raw.startsWith('{');
    const id = inline ? undefined : normalise(raw);
    if (!inline && !ID.test(raw)) throw new BadLine(`Invalid dialog '${raw}'`);
    return (rc, src) => {
      const found = selectSome(rc, targets, src, true);
      if (id === undefined) {
        rc.only('a dialog written inline in the command', src.origin);
        return ok(found.length);
      }
      // B728: only your own screen shows it; a practice player's opens in words.
      if (found.some((actor) => actor.kind === 'player')) {
        rc.state.dialog = { id, tick: rc.host.now() };
      }
      const who = found.map((actor) => actorName(rc, actor)).join(', ');
      rc.chat(`The dialog ${id} opens for ${who}.`, src.origin);
      rc.only('dialog screens (the preview names the dialog)', src.origin);
      return ok(found.length);
    };
  },

  execute(cur) {
    return compileExecute(cur);
  },

  // B727: `gamemode`, `attribute`, `bossbar`, `worldborder`, `spreadplayers`, `item`, `trigger`,
  // `gamerule`, `weather` and `difficulty` (`games-commands.ts`).
  ...(gamesCommands(KIT) as Readonly<Record<string, Compile>>),
};

/** An NBT path argument (B727). */
function readPathArg(text: string): NbtStep[] {
  const path = readNbtPath(text, parseSnbt);
  if (path === undefined) throw new NotHere(`the NBT path ${text}`);
  return path;
}

/** A command storage, made empty when it is first written. */
function storageOf(rc: RunContext, id: string): JsonObject {
  let own = rc.state.storage.get(id);
  if (own === undefined) {
    own = {};
    rc.state.storage.set(id, own);
  }
  return own;
}

/** Merges a compound into another, compounds inside merged too (`data merge`). */
function mergeInto(into: JsonObject, from: JsonObject): void {
  const target = into as Record<string, Json>;
  for (const [key, value] of Object.entries(from)) {
    const have = target[key];
    if (isRecord(have) && isRecord(value)) mergeInto(have, value);
    else target[key] = structuredClone(value);
  }
}

/** `data modify storage <id> <path> set|merge|append|prepend|insert ... value|from|string ...`. */
function dataModify(cur: Cursor): Run {
  const kind = cur.next('block, entity or storage');
  if (kind !== 'storage') throw new NotHere(`/data modify ${kind}`);
  const id = cur.id('a storage id');
  const pathText = cur.next('a path');
  const path = readPathArg(pathText);
  const how = cur.next('set, merge, append, prepend or insert');
  const index = how === 'insert' ? cur.int('an index') : undefined;
  if (!['set', 'merge', 'append', 'prepend', 'insert'].includes(how)) {
    throw new BadLine(`Unknown action '${how}'`);
  }
  const source = cur.next('value, from or string');
  let read: (rc: RunContext, src: Source) => Json | undefined;
  if (source === 'value') {
    const value = parseSnbt(cur.rest());
    read = () => structuredClone(value);
  } else if (source === 'from' || source === 'string') {
    const fromKind = cur.next('block, entity or storage');
    let get: (rc: RunContext, src: Source) => Json | undefined;
    if (fromKind === 'storage') {
      const fromId = cur.id('a storage id');
      const fromPath = cur.done ? undefined : readPathArg(cur.next('a path'));
      get = (rc) => {
        const root = rc.state.storage.get(fromId);
        return fromPath === undefined ? root : getAtPath(root, fromPath);
      };
    } else if (fromKind === 'entity') {
      const target = readTargets(cur, 'a target', false, true);
      const fromPath = cur.done ? undefined : cur.next('a path');
      get = (rc, src) => {
        const actor = selectSome(rc, target, src, false)[0] as CommandActor;
        return fromPath === undefined
          ? entityCompound(rc, actor, src.origin)
          : entityData(rc, actor, fromPath, src.origin);
      };
    } else throw new NotHere(`/data modify ... from ${fromKind}`);
    let start: number | undefined;
    let end: number | undefined;
    if (source === 'string') {
      start = cur.done ? undefined : cur.int('a start');
      end = cur.done ? undefined : cur.int('an end');
    }
    cur.end();
    read = (rc, src) => {
      const value = get(rc, src);
      if (value === undefined || source === 'from') return structuredClone(value);
      const text = typeof value === 'string' ? value : snbtWords(value);
      return text.slice(start, end);
    };
  } else throw new BadLine(`Unknown source '${source}'`);
  return (rc, src) => {
    const value = read(rc, src);
    if (value === undefined) throw new Failed(`Found no elements matching ${pathText}`);
    const root = storageOf(rc, id);
    let changed = false;
    if (how === 'set') changed = setAtPath(root, path, value);
    else if (how === 'merge') {
      const have = getAtPath(root, path);
      if (!isRecord(value)) throw new Failed('Expected a compound');
      if (isRecord(have)) mergeInto(have, value);
      else setAtPath(root, path, structuredClone(value));
      changed = true;
    } else {
      let list = getAtPath(root, path);
      if (list === undefined) {
        setAtPath(root, path, []);
        list = getAtPath(root, path);
      }
      if (!Array.isArray(list)) throw new Failed(`The target is not a list`);
      const items = list as Json[];
      const at = how === 'append' ? items.length : how === 'prepend' ? 0 : (index as number);
      items.splice(at < 0 ? items.length + at + 1 : at, 0, value);
      changed = true;
    }
    if (!changed) throw new Failed(`Found no elements matching ${pathText}`);
    rc.feedback(`Modified storage ${id}`, src.origin);
    return ok();
  };
}

/** A `data get` result as a number: numbers scaled, lists and text by length. */
function dataNumber(value: Json, scale: number): number {
  if (typeof value === 'number') return Math.floor(value * scale);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  return isRecord(value) ? Object.keys(value).length : 0;
}

/**
 * An entity's data as the preview knows it (B600: `Health` first; B727: things keep what
 * `summon` gave them, the player's items are listed): position, rotation, motion, tags and the
 * player's numbers.
 */
function entityCompound(
  rc: RunContext,
  actor: CommandActor,
  _origin: SimOrigin | undefined,
): JsonObject {
  const { host } = rc;
  const pos = positionOf(rc, actor) ?? { x: 0, y: 0, z: 0 };
  const thing = thingOf(rc, actor);
  const player = isPlayerActor(actor);
  const own = actor.kind === 'player';
  const practice = practiceOf(rc, actor);
  const mob =
    actor.kind === 'mob' && thing === undefined ? host.entities.entity(actor.id) : undefined;
  const yaw = yawOf(rc, actor);
  const pitch = pitchOf(rc, actor);
  const velocity = own
    ? host.player.velocity
    : practice !== undefined
      ? { x: 0, y: -practice.fall, z: 0 }
      : (mob?.velocity ?? { x: 0, y: 0, z: 0 });
  const { corner } = rc.state;
  const tags = [...(rc.state.tags.get(holderOf(actor)) ?? [])];
  const values: Record<string, Json> = {
    ...(thing?.data ?? {}),
    Pos: [pos.x + corner.x, pos.y + corner.y, pos.z + corner.z],
    Rotation: [yaw, pitch],
    Motion: [velocity.x, velocity.y, velocity.z],
    OnGround: own
      ? host.player.onGround
      : practice !== undefined
        ? practice.fall === 0
        : (mob?.onGround ?? true),
    Tags: tags,
  };
  if (thing !== undefined) values.id = thing.type;
  if (player) {
    const holder = holderOf(actor);
    const items = playerStacks(rc, actor).map(({ slot, stack }) => ({
      id: stack.id,
      count: stack.count,
      Slot: 'hotbar' in slot ? slot.hotbar : slotNumber(slot.named),
      ...(stack.components === undefined ? {} : { components: stack.components }),
    }));
    const held = stackIn(rc, actor, { hotbar: 0 });
    Object.assign(values, {
      Health: rc.state.games.healthOf(holder),
      FoodLevel: 20,
      Air: 300,
      XpLevel: 0,
      SelectedItemSlot: 0,
      Inventory: items,
      ...(held === null ? {} : { SelectedItem: { id: held.id, count: held.count } }),
    });
  }
  return values;
}

/** The player's numbers the preview does not keep (it answers full food and air, no levels). */
const UNKNOWN_PLAYER_DATA = new Set(['FoodLevel', 'Air', 'XpLevel', 'foodSaturationLevel']);

/** A named slot's number in the player's data (`inventory.3` is 12, `armor.feet` 100). */
function slotNumber(named: string): number {
  const armour: Record<string, number> = {
    'armor.feet': 100,
    'armor.legs': 101,
    'armor.chest': 102,
    'armor.head': 103,
    'weapon.offhand': -106,
  };
  const inv = /^inventory\.(\d+)$/.exec(named);
  return inv === null ? (armour[named] ?? -1) : Number(inv[1]) + 9;
}

/** The value of an entity data path, or `undefined` when the preview does not know it. */
function entityData(
  rc: RunContext,
  actor: CommandActor,
  path: string,
  origin: SimOrigin | undefined,
): Json | undefined {
  if (positionOf(rc, actor) === undefined) return undefined;
  const steps = readNbtPath(path, parseSnbt);
  if (steps === undefined) throw new NotHere(`the NBT path ${path}`);
  const [first] = steps;
  if (
    isPlayerActor(actor) &&
    first !== undefined &&
    'key' in first &&
    UNKNOWN_PLAYER_DATA.has(first.key)
  ) {
    rc.only(
      "the player's hunger, air and experience (the preview's player is never hungry)",
      origin,
    );
  }
  return getAtPath(entityCompound(rc, actor, origin), steps);
}

/**
 * The criteria whose scores the preview moves (B727): `dummy` and `trigger` by commands, the
 * death criteria when the player dies, `health` with the player's health, the kill criteria when
 * the player kills (`countKill`).
 */
const SELF_MOVING_CRITERIA = new Set([
  'dummy',
  'trigger',
  'deathCount',
  'health',
  'totalKillCount',
  'minecraft.custom:minecraft.deaths',
  'minecraft.custom:minecraft.time_since_death',
  'minecraft.custom:minecraft.mob_kills',
]);

/** Kill criteria move when the player kills a mob (B727: Try it's player kills by hitting). */
export function countKill(state: CommandState, holder: string, victimType: string): void {
  for (const objective of state.objectives.values()) {
    const kill =
      objective.criterion === 'totalKillCount' ||
      objective.criterion === 'minecraft.custom:minecraft.mob_kills' ||
      objective.criterion === `minecraft.killed:${victimType}`;
    if (kill) objective.scores.set(holder, ((objective.scores.get(holder) ?? 0) + 1) | 0);
  }
}

function objectivesCommand(cur: Cursor, action: string): Run {
  if (action === 'add') {
    const name = cur.next('an objective name');
    if (!/^[A-Za-z0-9_.+-]+$/.test(name)) throw new BadLine(`Invalid objective name '${name}'`);
    const criterion = cur.next('a criterion');
    const display = cur.done ? undefined : parseSnbt(cur.rest());
    return (rc, src) => {
      if (rc.state.objectives.has(name)) {
        throw new Failed('An objective already exists by that name');
      }
      const displayName = display === undefined ? name : componentText(rc, display, src);
      rc.state.objectives.set(name, { name, criterion, displayName, scores: new Map() });
      if (!SELF_MOVING_CRITERIA.has(criterion)) {
        rc.only(
          `the criterion ${criterion} (in the preview the score changes only by commands)`,
          src.origin,
        );
      }
      rc.feedback(`Created new objective [${displayName}].`, src.origin);
      return ok(rc.state.objectives.size);
    };
  }
  if (action === 'remove') {
    const name = cur.next('an objective');
    cur.end();
    return (rc, src) => {
      objectiveOf(rc, name);
      rc.state.objectives.delete(name);
      for (const [slot, shown] of [...rc.state.display]) {
        if (shown === name) rc.state.display.delete(slot);
      }
      rc.feedback(`Removed objective [${name}].`, src.origin);
      return ok(rc.state.objectives.size);
    };
  }
  if (action === 'setdisplay') {
    const slot = cur.next('a display slot');
    if (!DISPLAY_SLOT.test(slot)) throw new BadLine(`Unknown display slot '${slot}'`);
    const name = cur.optional();
    cur.end();
    return (rc, src) => {
      if (name === undefined) {
        if (!rc.state.display.delete(slot))
          throw new Failed('Nothing changed. That display slot is already empty');
        rc.feedback(`Cleared objective display slot ${slot}.`, src.origin);
        return ok(0);
      }
      const objective = objectiveOf(rc, name);
      if (rc.state.display.get(slot) === name) {
        throw new Failed('Nothing changed. That display slot is already showing that objective');
      }
      rc.state.display.set(slot, name);
      rc.only(`the scoreboard's ${slot} on the screen (the preview keeps the scores)`, src.origin);
      rc.feedback(
        `Set display slot ${slot} to show objective ${objective.displayName}.`,
        src.origin,
      );
      return ok(0);
    };
  }
  if (action === 'list') {
    cur.end();
    return (rc, src) => {
      const names = [...rc.state.objectives.keys()];
      rc.feedback(
        names.length === 0 ? 'There are no objectives.' : `Objectives: ${names.join(', ')}`,
        src.origin,
      );
      return ok(names.length);
    };
  }
  if (action === 'modify') {
    const name = cur.next('an objective');
    const what = cur.next('displayname, rendertype, numberformat or displayautoupdate');
    if (what === 'displayname') {
      const display = parseSnbt(cur.rest());
      return (rc, src) => {
        const objective = objectiveOf(rc, name);
        const words = componentText(rc, display, src);
        rc.state.objectives.set(name, { ...objective, displayName: words });
        rc.feedback(`Changed the display name of ${name} to [${words}]`, src.origin);
        return ok(0);
      };
    }
    if (what === 'rendertype') {
      const type = cur.next('integer or hearts');
      cur.end();
      if (type !== 'integer' && type !== 'hearts')
        throw new BadLine(`Unknown render type '${type}'`);
      return (rc, src) => {
        objectiveOf(rc, name);
        if (type === 'hearts') rc.only('scores drawn as hearts on the player list', src.origin);
        rc.feedback(`Changed the render type of objective [${name}]`, src.origin);
        return ok(0);
      };
    }
    if (what === 'numberformat' || what === 'displayautoupdate') {
      const rest = cur.rest();
      void rest;
      return (rc, src) => {
        objectiveOf(rc, name);
        rc.only(`how the scoreboard shows ${name}'s numbers (${what})`, src.origin);
        return ok(0);
      };
    }
    throw new BadLine(`Unknown objective option '${what}'`);
  }
  throw new NotHere(`/scoreboard objectives ${action}`);
}

function playersCommand(cur: Cursor, action: string): Run {
  if (action === 'set' || action === 'add' || action === 'remove') {
    const who = readHolders(cur);
    const name = cur.next('an objective');
    const amount = action === 'set' ? cur.int('a score') : cur.int('a score', 0, 2147483647);
    cur.end();
    return (rc, src) => {
      const objective = objectiveOf(rc, name);
      const keys = holders(rc, who, src, objective);
      let last = 0;
      for (const key of keys) {
        const before = objective.scores.get(key) ?? 0;
        last = int32(
          action === 'set' ? amount : action === 'add' ? before + amount : before - amount,
        );
        objective.scores.set(key, last);
      }
      rc.feedback(
        keys.length === 1
          ? `Set [${objective.displayName}] for ${holderWords(rc.host, keys[0] as string)} to ${last}.`
          : `Set [${objective.displayName}] for ${keys.length} entities.`,
        src.origin,
      );
      return ok(keys.length === 1 ? last : keys.length);
    };
  }
  if (action === 'reset') {
    const who = readHolders(cur);
    const name = cur.optional();
    cur.end();
    return (rc, src) => {
      const objectives =
        name === undefined ? [...rc.state.objectives.values()] : [objectiveOf(rc, name)];
      let keys: string[] = [];
      for (const objective of objectives) {
        keys = holders(rc, who, src, objective);
        for (const key of keys) objective.scores.delete(key);
      }
      rc.feedback(`Reset the scores of ${plural(keys.length, 'holder')}.`, src.origin);
      return ok(keys.length);
    };
  }
  if (action === 'get') {
    const who = readHolders(cur);
    const name = cur.next('an objective');
    cur.end();
    return (rc, src) => {
      const objective = objectiveOf(rc, name);
      const [key] = holders(rc, who, src, objective);
      const value = key === undefined ? undefined : objective.scores.get(key);
      if (key === undefined || value === undefined) {
        throw new Failed(`Can't get value of ${name} for ${key ?? 'nobody'}; none is set`);
      }
      rc.feedback(
        `${holderWords(rc.host, key)} has ${value} [${objective.displayName}].`,
        src.origin,
      );
      return ok(value);
    };
  }
  if (action === 'operation') {
    const who = readHolders(cur);
    const targetName = cur.next('an objective');
    const op = cur.next('an operation');
    if (!['+=', '-=', '*=', '/=', '%=', '=', '<', '>', '><'].includes(op)) {
      throw new BadLine(`Invalid operation '${op}'`);
    }
    const fromWho = readHolders(cur);
    const fromName = cur.next('an objective');
    cur.end();
    return (rc, src) => {
      const target = objectiveOf(rc, targetName);
      const from = objectiveOf(rc, fromName);
      const keys = holders(rc, who, src, target);
      const sources = holders(rc, fromWho, src, from);
      let last = 0;
      for (const key of keys) {
        for (const other of sources) {
          const a = target.scores.get(key) ?? 0;
          const b = from.scores.get(other) ?? 0;
          let value = a;
          switch (op) {
            case '+=':
              value = a + b;
              break;
            case '-=':
              value = a - b;
              break;
            case '*=':
              value = Math.imul(a, b);
              break;
            case '/=':
              value = b === 0 ? a : Math.floor(a / b);
              break;
            case '%=':
              value = b === 0 ? a : ((a % b) + b) % b;
              break;
            case '=':
              value = b;
              break;
            case '<':
              value = Math.min(a, b);
              break;
            case '>':
              value = Math.max(a, b);
              break;
            case '><':
              value = b;
              from.scores.set(other, a);
              break;
          }
          last = int32(value);
          target.scores.set(key, last);
        }
      }
      rc.feedback(`Set [${target.displayName}] for ${plural(keys.length, 'holder')}.`, src.origin);
      return ok(keys.length === 1 ? last : keys.length);
    };
  }
  if (action === 'list') {
    const who = cur.done ? undefined : readHolders(cur);
    cur.end();
    return (rc, src) => {
      if (who === undefined) {
        const all = new Set<string>();
        for (const objective of rc.state.objectives.values()) {
          for (const key of objective.scores.keys()) all.add(holderWords(rc.host, key));
        }
        rc.feedback(
          all.size === 0 ? 'There are no tracked entities.' : [...all].join(', '),
          src.origin,
        );
        return ok(all.size);
      }
      const [key] = holders(rc, who, src);
      const scores = key === undefined ? {} : rc.state.scoresOf(key);
      rc.feedback(
        Object.entries(scores)
          .map(([objective, value]) => `${objective}: ${value}`)
          .join(', ') || 'No scores.',
        src.origin,
      );
      return ok(Object.keys(scores).length);
    };
  }
  if (action === 'enable') {
    const who = readHolders(cur);
    const name = cur.next('an objective');
    cur.end();
    return (rc, src) => {
      const objective = objectiveOf(rc, name);
      if (objective.criterion !== 'trigger') {
        throw new Failed("You can only enable 'trigger' objectives");
      }
      const keys = who.all ? allHolders(rc) : holders(rc, who, src, objective);
      let changed = 0;
      for (const key of keys) {
        let own = rc.state.games.triggers.get(key);
        if (own === undefined) {
          own = new Set();
          rc.state.games.triggers.set(key, own);
        }
        if (!own.has(name)) changed += 1;
        own.add(name);
      }
      if (changed === 0) throw new Failed('Nothing changed. That trigger is already enabled');
      rc.feedback(
        keys.length === 1
          ? `Enabled trigger [${objective.displayName}] for ${holderWords(rc.host, keys[0] as string)}`
          : `Enabled trigger [${objective.displayName}] for ${keys.length} entities`,
        src.origin,
      );
      return ok(changed);
    };
  }
  throw new NotHere(`/scoreboard players ${action}`);
}

// execute ----------------------------------------------------------------------------------------

type Fork = (rc: RunContext, src: Source) => Source[];

/** Where `execute store` puts the value (B727: storage and boss bars too). */
type StoreSpec =
  | {
      readonly kind: 'result' | 'success';
      readonly where: 'score';
      readonly holders: Holders;
      readonly objective: string;
    }
  | {
      readonly kind: 'result' | 'success';
      readonly where: 'storage';
      readonly id: string;
      readonly path: readonly NbtStep[];
      readonly type: string;
      readonly scale: number;
    }
  | {
      readonly kind: 'result' | 'success';
      readonly where: 'bossbar';
      readonly id: string;
      readonly field: 'value' | 'max';
    };

interface TestStep {
  readonly test: Test;
  readonly want: boolean;
}

type Step = { readonly fork: Fork } | { readonly store: StoreSpec } | TestStep;

interface Branch {
  readonly src: Source;
  readonly stores: readonly { readonly spec: StoreSpec; readonly src: Source }[];
}

/**
 * A test of `if`/`unless`: how many things passed (a count for `entity` and `items`, 1 for
 * yes), 0 for no, or `undefined` when the preview cannot tell.
 */
type Test = (rc: RunContext, src: Source) => number | undefined;

const yes = (passed: boolean): number => (passed ? 1 : 0);

function readTest(cur: Cursor): Test {
  const kind = cur.next('a condition');
  switch (kind) {
    case 'block': {
      const at = readVec3(cur);
      const predicate = readBlockPredicate(cur.next('a block'));
      return (rc, src) => {
        const state = blockAt(rc, blockOf(resolveVec3(rc, at, src, false)));
        return yes(state !== undefined && blockMatches(rc, predicate, state));
      };
    }
    case 'score': {
      const who = readHolders(cur);
      const name = cur.next('an objective');
      const op = cur.next('matches or a comparison');
      if (op === 'matches') {
        const range = readRange(cur.next('a range'));
        return (rc, src) => {
          const objective = objectiveOf(rc, name);
          const [key] = holders(rc, who, src, objective);
          const value = key === undefined ? undefined : objective.scores.get(key);
          return yes(value !== undefined && inRange(value, range));
        };
      }
      if (!['<', '<=', '=', '>', '>='].includes(op)) throw new BadLine(`Invalid operation '${op}'`);
      const otherWho = readHolders(cur);
      const otherName = cur.next('an objective');
      return (rc, src) => {
        const objective = objectiveOf(rc, name);
        const other = objectiveOf(rc, otherName);
        const [key] = holders(rc, who, src, objective);
        const [otherKey] = holders(rc, otherWho, src, other);
        const a = key === undefined ? undefined : objective.scores.get(key);
        const b = otherKey === undefined ? undefined : other.scores.get(otherKey);
        if (a === undefined || b === undefined) return 0;
        return yes(
          op === '<'
            ? a < b
            : op === '<='
              ? a <= b
              : op === '='
                ? a === b
                : op === '>'
                  ? a > b
                  : a >= b,
        );
      };
    }
    case 'entity': {
      const selector = readSelector(cur.next('an entity'));
      return (rc, src) => select(rc, selector, src).length;
    }
    case 'dimension': {
      const dimension = cur.id('a dimension');
      return (_rc, src) => yes(src.dimension === dimension);
    }
    case 'items': {
      // B727: `execute if items entity <targets> <slots> <predicate>`: how many items match.
      const where = cur.next('block or entity');
      if (where !== 'entity') throw new NotHere('/execute if items block');
      const selector = readSelector(cur.next('an entity'));
      const slotText = cur.next('slots');
      const slots = readSlots(slotText);
      if (slots === undefined) throw new NotHere(`/execute if items with the slots ${slotText}`);
      const itemText = cur.next('an item predicate');
      if (itemText.startsWith('#')) throw new NotHere('/execute if items with an item tag');
      const predicate = readItemPredicate(itemText, parseSnbt, normalise);
      if (predicate === undefined) throw new BadLine(`Unknown item '${itemText}'`);
      return (rc, src) => {
        if (predicate.unknown.length > 0) {
          rc.only(
            `the item tests ${predicate.unknown.join(', ')} (the preview leaves them out)`,
            src.origin,
          );
        }
        let count = 0;
        for (const actor of select(rc, selector, src)) {
          if (!isPlayerActor(actor)) {
            rc.only('items held by mobs (/execute if items reads only players’)', src.origin);
            continue;
          }
          for (const slot of slots) {
            const stack = stackIn(rc, actor, slot);
            if (stack !== null && stackMatches(stack, predicate)) count += stack.count;
          }
        }
        return count;
      };
    }
    case 'predicate': {
      const id = cur.id('a predicate');
      return (rc, src) => {
        const answer = rc.host.predicate(id, situationOf(rc, src));
        if (answer === undefined) throw new Failed(`Unknown predicate: ${id}`);
        if (answer.answer === 'unknown') {
          rc.only(
            `whether the predicate ${id} passes here${
              answer.why.length === 0 ? '' : ` (${answer.why.join(' ')})`
            }; neither if nor unless passes`,
            src.origin,
          );
          return undefined;
        }
        return yes(answer.answer === 'yes');
      };
    }
    default:
      throw new NotHere(`/execute if ${kind}`);
  }
}

/** The situation a predicate is tried in from a command source (B604's `Situation`). */
function situationOf(rc: RunContext, src: Source): Situation {
  // B727: the weather `weather` set (clear until a command changes it).
  const weather = rc.state.games.weather;
  const kind =
    weather.until !== undefined && weather.until <= rc.host.now() ? 'clear' : weather.kind;
  const self = src.executor;
  const situation: Situation = {
    context: 'minecraft:command',
    position: [
      src.pos.x + rc.state.corner.x,
      src.pos.y + rc.state.corner.y,
      src.pos.z + rc.state.corner.z,
    ],
    dimension: src.dimension,
    weather: { raining: kind !== 'clear', thundering: kind === 'thunder' },
    time: { clock: AREA_DIMENSION, ticks: rc.host.timeOfDay() },
  };
  if (self === null) return situation;
  const key = holderOf(self);
  const pos = positionOf(rc, self) ?? src.pos;
  const effects: Record<string, { amplifier: number; duration: number }> = {};
  const now = rc.host.now();
  for (const [id, one] of rc.state.effects.get(key) ?? []) {
    if (one.until > now) {
      effects[id] = { amplifier: one.amplifier, duration: Math.min(one.until - now, 2147483647) };
    }
  }
  return {
    ...situation,
    thisEntity: {
      type: typeOf(rc, self) ?? PLAYER_TYPE,
      tags: [...(rc.state.tags.get(key) ?? [])],
      scores: rc.state.scoresOf(key),
      effects,
      position: [pos.x + rc.state.corner.x, pos.y + rc.state.corner.y, pos.z + rc.state.corner.z],
    },
  };
}

function compileExecute(cur: Cursor): Run {
  const steps: Step[] = [];
  let terminal: Run | undefined;
  while (!cur.done && terminal === undefined) {
    const word = cur.next('a subcommand');
    switch (word) {
      case 'run':
        terminal = compileCommand(cur.rest());
        break;
      case 'as': {
        const selector = readSelector(cur.next('a target'));
        steps.push({
          fork: (rc, src) =>
            select(rc, selector, src).map((actor) => ({ ...src, executor: actor })),
        });
        break;
      }
      case 'at': {
        const selector = readSelector(cur.next('a target'));
        steps.push({
          fork: (rc, src) =>
            select(rc, selector, src).map((actor) => {
              const pos = positionOf(rc, actor) ?? src.pos;
              return {
                ...src,
                pos,
                yaw: yawOf(rc, actor),
                pitch: pitchOf(rc, actor),
                dimension: AREA_DIMENSION,
              };
            }),
        });
        break;
      }
      case 'positioned': {
        if (cur.peek() === 'over') throw new NotHere('/execute positioned over');
        if (cur.peek() === 'as') {
          cur.next('as');
          const selector = readSelector(cur.next('a target'));
          steps.push({
            fork: (rc, src) =>
              select(rc, selector, src).map((actor) => ({
                ...src,
                pos: positionOf(rc, actor) ?? src.pos,
              })),
          });
        } else {
          const at = readVec3(cur);
          steps.push({ fork: (rc, src) => [{ ...src, pos: resolveVec3(rc, at, src, true) }] });
        }
        break;
      }
      case 'align': {
        const axes = cur.next('axes');
        if (!/^[xyz]{1,3}$/.test(axes) || new Set(axes).size !== axes.length) {
          throw new BadLine(`Invalid swizzle '${axes}'`);
        }
        steps.push({
          fork: (_rc, src) => [
            {
              ...src,
              pos: {
                x: axes.includes('x') ? Math.floor(src.pos.x) : src.pos.x,
                y: axes.includes('y') ? Math.floor(src.pos.y) : src.pos.y,
                z: axes.includes('z') ? Math.floor(src.pos.z) : src.pos.z,
              },
            },
          ],
        });
        break;
      }
      case 'rotated': {
        if (cur.peek() === 'as') {
          cur.next('as');
          const selector = readSelector(cur.next('a target'));
          steps.push({
            fork: (rc, src) =>
              select(rc, selector, src).map((actor) => ({
                ...src,
                yaw: yawOf(rc, actor),
                pitch: pitchOf(rc, actor),
              })),
          });
        } else {
          const rotation = readRotation(cur);
          steps.push({ fork: (_rc, src) => [{ ...src, ...rotation(src) }] });
        }
        break;
      }
      case 'in': {
        const dimension = cur.id('a dimension');
        steps.push({
          fork: (rc, src) => {
            if (dimension === AREA_DIMENSION) return [{ ...src, dimension }];
            rc.only(
              `the dimension ${dimension} (the test area is one Overworld; this branch stops)`,
              src.origin,
            );
            return [];
          },
        });
        break;
      }
      case 'on': {
        // B727: `on attacker` finds who last hit a thing (B728's practice players set it).
        const relation = cur.next('a relation');
        const RELATIONS = [
          'attacker',
          'controller',
          'leasher',
          'origin',
          'owner',
          'passengers',
          'target',
          'vehicle',
        ];
        if (!RELATIONS.includes(relation)) throw new BadLine(`Unknown relation '${relation}'`);
        steps.push({
          fork: (rc, src) => {
            const self = src.executor;
            if (self === null) return [];
            const thing = thingOf(rc, self);
            if (relation === 'attacker' && thing?.attacker !== undefined) {
              return present(rc, thing.attacker) ? [{ ...src, executor: thing.attacker }] : [];
            }
            // B728: a player's attacker is who hurt them in the last five seconds or so.
            const hurt =
              relation === 'attacker' && isPlayerActor(self)
                ? rc.state.games.hurtBy.get(holderOf(self))
                : undefined;
            if (hurt !== undefined) {
              const recent = rc.host.now() - hurt.tick <= KILL_CREDIT_TICKS;
              return recent && present(rc, hurt.by) ? [{ ...src, executor: hurt.by }] : [];
            }
            if (relation !== 'attacker') {
              rc.only(
                `the ${relation} of an entity (/execute on ${relation} finds nobody here)`,
                src.origin,
              );
            }
            return [];
          },
        });
        break;
      }
      case 'if':
      case 'unless': {
        steps.push({ test: readTest(cur), want: word === 'if' });
        break;
      }
      case 'store': {
        const kind = cur.next('result or success');
        if (kind !== 'result' && kind !== 'success') {
          throw new BadLine(`Unknown store kind '${kind}'`);
        }
        const where = cur.next('score, entity, block, storage or bossbar');
        if (where === 'score') {
          const who = readHolders(cur);
          const objective = cur.next('an objective');
          steps.push({ store: { kind, where: 'score', holders: who, objective } });
        } else if (where === 'storage') {
          const id = cur.id('a storage id');
          const pathText = cur.next('a path');
          const path = readPathArg(pathText);
          const type = cur.next('a type');
          if (!['byte', 'short', 'int', 'long', 'float', 'double'].includes(type)) {
            throw new BadLine(`Unknown type '${type}'`);
          }
          const scale = cur.float('a scale');
          steps.push({ store: { kind, where: 'storage', id, path, type, scale } });
        } else if (where === 'bossbar') {
          const id = cur.id('a boss bar id');
          const field = cur.next('value or max');
          if (field !== 'value' && field !== 'max') throw new BadLine(`Unknown field '${field}'`);
          steps.push({ store: { kind, where: 'bossbar', id, field } });
        } else throw new NotHere(`/execute store ${kind} ${where}`);
        break;
      }
      default:
        throw new NotHere(`/execute ${word}`);
    }
  }
  if (steps.length === 0 && terminal === undefined) throw new BadLine('Expected a subcommand');
  const last = steps[steps.length - 1];
  const endsOnTest = terminal === undefined && last !== undefined && 'test' in last;
  return (rc, src) => {
    let branches: Branch[] = [{ src, stores: [] }];
    for (const step of endsOnTest ? steps.slice(0, -1) : steps) {
      if ('store' in step) {
        branches = branches.map((branch) => ({
          src: branch.src,
          stores: [...branch.stores, { spec: step.store, src: branch.src }],
        }));
        continue;
      }
      if ('test' in step) {
        branches = branches.filter((branch) => {
          const value = testValue(step, rc, branch.src);
          return value !== undefined && value > 0;
        });
        continue;
      }
      branches = branches.flatMap((branch) =>
        step.fork(rc, branch.src).map((next) => ({ src: next, stores: branch.stores })),
      );
    }
    if (terminal === undefined) {
      // A condition at the end: each branch stores its count, or 0 when it fails (B727: as the
      // game does); a branch the preview cannot answer stores nothing.
      let passed = 0;
      let total = 0;
      for (const branch of branches) {
        const value = endsOnTest ? testValue(last as TestStep, rc, branch.src) : 1;
        if (value === undefined) continue;
        applyStores(rc, branch, value, value > 0);
        if (value > 0) {
          passed += 1;
          total += value;
        }
      }
      if (passed === 0) throw new Failed('Test failed');
      rc.feedback(total === 1 ? 'Test passed' : `Test passed, count: ${total}`, src.origin);
      return ok(total);
    }
    let success = false;
    let result = 0;
    const calls: FunctionCall[] = [];
    for (const branch of branches) {
      let outcome: Outcome;
      try {
        outcome = terminal(rc, branch.src);
      } catch (error) {
        if (!(error instanceof Failed)) throw error;
        rc.feedback(error.message, branch.src.origin);
        outcome = fail;
      }
      if (outcome.calls !== undefined && outcome.calls.length > 0) {
        for (const call of outcome.calls) {
          calls.push(
            branch.stores.length === 0
              ? call
              : {
                  ...call,
                  onDone: (value, passed) => {
                    call.onDone?.(value, passed);
                    if (value !== undefined) applyStores(rc, branch, value, passed);
                  },
                },
          );
        }
      } else applyStores(rc, branch, outcome.result, outcome.success);
      if (outcome.success) {
        success = true;
        result += outcome.result;
      }
      if (outcome.returned === true) {
        return { success: outcome.success, result: outcome.result, calls, returned: true };
      }
    }
    return calls.length === 0 ? { success, result } : { success, result, calls };
  };
}

/** A condition's value for one branch: its count when it holds (`unless`: 1), else 0. */
function testValue(step: TestStep, rc: RunContext, src: Source): number | undefined {
  const value = step.test(rc, src);
  if (value === undefined) return undefined;
  return step.want ? value : value > 0 ? 0 : 1;
}

function applyStores(rc: RunContext, branch: Branch, result: number, success: boolean): void {
  for (const { spec, src } of branch.stores) {
    const value = spec.kind === 'result' ? int32(result) : success ? 1 : 0;
    if (spec.where === 'storage') {
      const stored = storedNumber(
        spec.kind === 'result' ? result * spec.scale : value * spec.scale,
        spec.type,
      );
      if (!setAtPath(storageOf(rc, spec.id), spec.path, stored)) {
        rc.feedback(`Could not store into storage ${spec.id}`, src.origin);
      }
      continue;
    }
    if (spec.where === 'bossbar') {
      const bar = rc.state.games.bossbars.get(spec.id);
      if (bar === undefined) {
        rc.feedback(`No bossbar exists with the ID '${spec.id}'`, src.origin);
        continue;
      }
      if (spec.field === 'value') bar.value = Math.max(0, value);
      else bar.max = Math.max(1, value);
      continue;
    }
    const objective = rc.state.objectives.get(spec.objective);
    if (objective === undefined) {
      rc.feedback(`Unknown scoreboard objective '${spec.objective}'`, src.origin);
      continue;
    }
    for (const key of holders(rc, spec.holders, src, objective)) objective.scores.set(key, value);
  }
}

// ---------------------------------------------------------------------------------------------
// Compiling lines.

/** Reads one command (without its `/`); throws {@link BadLine} or {@link NotHere}. */
function compileCommand(text: string): Run {
  const cur = new Cursor(text);
  const head = cur.next('a command');
  const compile = COMMANDS[head];
  if (compile === undefined) throw new NotHere(`/${head}`);
  return compile(cur, head);
}

/** A line read for running: `ok` with what runs it, or why it does not run here. */
export type CompiledLine =
  | { readonly ok: true; readonly command: string; readonly run: Run }
  | {
      readonly ok: false;
      readonly command: string;
      /** `game`: a command or form only the game runs; `error`: the game would not read it. */
      readonly kind: 'game' | 'error';
      /** The form in words (`/spreadplayers`, `/execute store result storage`) or the error. */
      readonly why: string;
    };

/** Reads one command line (a leading `/` is allowed; no macro `$`). */
export function compileLine(line: string): CompiledLine {
  const text = line.trim().replace(/^\//, '');
  const command = text.split(' ', 1)[0] ?? '';
  try {
    return { ok: true, command, run: compileCommand(text) };
  } catch (error) {
    if (error instanceof NotHere) return { ok: false, command, kind: 'game', why: error.form };
    if (error instanceof BadLine) return { ok: false, command, kind: 'error', why: error.message };
    throw error;
  }
}

/** Runs a compiled command; a failure is the game's message as the command's feedback. */
export function runCompiled(run: Run, rc: RunContext, src: Source): Outcome {
  try {
    return run(rc, src);
  } catch (error) {
    if (error instanceof Failed) {
      rc.feedback(error.message, src.origin);
      return fail;
    }
    if (error instanceof NotHere) {
      rc.only(`the game's ${error.form}`, src.origin);
      return fail;
    }
    if (error instanceof BadLine) {
      rc.feedback(error.message, src.origin);
      return fail;
    }
    throw error;
  }
}

/** Whether a function line runs in Try it, and if not why (the Function editor's gutter). */
export interface LineSupport {
  readonly runs: boolean;
  /** The command's name (`execute`, `spreadplayers`), or `''` for a blank or comment line. */
  readonly command: string;
  /** Why it does not run: the form only the game runs, or the game's reading error. */
  readonly why?: string;
  /** True for a blank line or a comment (nothing to run). */
  readonly blank?: boolean;
  /** A macro line (`$`): checked with sample values in place of its `$(name)`s. */
  readonly macro?: boolean;
}

const MACRO = /\$\(([A-Za-z0-9_]+)\)/g;
const SAMPLE_VALUES = ['1', '@s', 'minecraft:stone', 'x'];

/** Whether Try it runs this function line, and why not (B613's gutter). */
export function lineSupport(line: string): LineSupport {
  const text = line.trim();
  if (text === '' || text.startsWith('#')) return { runs: true, command: '', blank: true };
  if (!text.startsWith('$')) {
    const compiled = compileLine(text);
    return compiled.ok
      ? { runs: true, command: compiled.command }
      : { runs: false, command: compiled.command, why: compiled.why };
  }
  // A macro line: try sample values for each `$(name)` until one reads.
  const body = text.slice(1);
  const names = [...new Set([...body.matchAll(MACRO)].map((m) => m[1] as string))];
  let first: CompiledLine | undefined;
  const combos = SAMPLE_VALUES.length ** Math.min(names.length, 4);
  for (let n = 0; n < combos; n += 1) {
    const values = new Map<string, string>();
    names.forEach((name, i) => {
      values.set(
        name,
        SAMPLE_VALUES[Math.floor(n / SAMPLE_VALUES.length ** i) % SAMPLE_VALUES.length] as string,
      );
    });
    const compiled = compileLine(
      body.replace(MACRO, (_w, name: string) => values.get(name) ?? '1'),
    );
    if (compiled.ok) return { runs: true, command: compiled.command, macro: true };
    first ??= compiled;
    if (!compiled.ok && compiled.kind === 'game') break;
  }
  if (first === undefined || first.ok) return { runs: true, command: '', macro: true };
  return { runs: false, command: first.command, why: first.why, macro: true };
}

/** Whether Try it runs this line (the Function editor's gutter, B606). */
export function understands(line: string): boolean {
  const support = lineSupport(line);
  return support.runs && support.blank !== true;
}
