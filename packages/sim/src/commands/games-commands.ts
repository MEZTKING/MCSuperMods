/**
 * The commands games use (B727, `docs/PLAN-game-studio.md`; ADR 0120 D8 grown for ADR 0132):
 * what `@msm/plugin-games` lowers for its game types and what players type while testing them.
 *
 * - `gamemode`: kept per player (`GamesCommandState.gameModes`); a spectator cannot touch the
 *   area (`LocalWorldSource` refuses breaking, placing, using and hitting) and the selector
 *   filter `gamemode=` reads it. A player no command has set plays in survival, the game's
 *   default.
 * - `attribute` (base `get`, `set`, `reset`; `modifier add`, `remove`, `value get`; `get`): kept
 *   per holder with the game's three operations; most health moves the player's health (the
 *   hearts row of the panel, `playerHearts`), and a movement speed or jump strength of 0 holds
 *   the player still (the head start).
 * - `bossbar` (`add`, `remove`, `list`, `get`, `set` of each field) and `execute store ...
 *   bossbar`.
 * - `worldborder` (`set`, `add` over a time, `center`, `get`, `damage`, `warning`): the size
 *   moves from one width to another over game time (`borderSize`); the view draws it.
 * - `spreadplayers`: each target stands on the highest block at a seeded place within the
 *   range; teams are spread together when asked.
 * - `item replace ... with|from` and `item modify` (an inline modifier or the project's; the
 *   loot evaluator through the host's `modifyItem`) on the hotbar, the inventory, armour and
 *   both hands (`readSlots`, `stackIn`, `putStack`).
 * - `trigger` and `scoreboard players enable` (`triggers`: what each holder may trigger).
 * - `gamerule` (kept as state; the one the preview obeys is the target's keep-inventory rule,
 *   read from `TargetFacts.dev.gameRules`), `weather` (the predicates' weather follows it) and
 *   `difficulty`.
 * - The player dies (`kill`, `playerDies`): death scores (`deathCount`, the deaths statistic),
 *   effects gone, the inventory emptied unless the keep-inventory rule is on, and a respawn a
 *   second later at the player's spawn point (`respawnDue`). `@e` and `@n` do not find a dead
 *   player; `@a` does, as in the game.
 * - Things that are not project mobs (`summon minecraft:item`, `interaction`, `villager`,
 *   `marker`, displays): kept with their data (`GamesCommandState.things`) so selectors, `nbt=`,
 *   `data get entity` and `kill` see them; dropped items of one kind close together merge into
 *   one stack, as the game merges them. They are not drawn.
 *
 * `vanilla.ts` builds these commands from {@link gamesCommands} with its own readers (the
 * {@link CommandKit}), so this module imports nothing of it at run time. NBT paths
 * ({@link readNbtPath}, {@link getAtPath}, {@link setAtPath}) and item predicates
 * ({@link readItemPredicate}) are shared with `data`, `execute store` and `execute if items`.
 * Behaviour is written from the commands' syntax (the vendored command trees of both targets
 * agree on every form here) and the game's observable behaviour, never its code.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { Actor, ItemStack } from '../events/actions.js';
import type { BlockPos, SimOrigin, Vec3 } from '../types.js';
import { PREVIEW_PLAYER_NAME } from './parse.js';
import type { Objective, Outcome, RunContext, Source, VanillaHost } from './vanilla.js';

/** The commands this module adds to Try it (beside `VANILLA_COMMANDS` of `vanilla.ts`). */
export const GAMES_COMMAND_NAMES: readonly string[] = Object.freeze([
  'attribute',
  'bossbar',
  'difficulty',
  'gamemode',
  'gamerule',
  'item',
  'spreadplayers',
  'trigger',
  'weather',
  'worldborder',
]);

// ---------------------------------------------------------------------------------------------
// State.

/** The game modes. */
export const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
export type GameModeName = (typeof GAME_MODES)[number];

/** The game mode of a player no command has set (the game's default). */
export const DEFAULT_GAME_MODE: GameModeName = 'survival';

/** An attribute modifier's operation. */
export type ModifierOperation = 'add_value' | 'add_multiplied_base' | 'add_multiplied_total';

export interface AttributeModifier {
  readonly id: string;
  readonly amount: number;
  readonly operation: ModifierOperation;
}

/** One attribute of a holder: the base set by a command (or the default) and its modifiers. */
export interface SimAttribute {
  base: number | undefined;
  readonly modifiers: Map<string, AttributeModifier>;
}

/**
 * A player's attributes the preview knows the default of, and the range the game keeps each in
 * (observed in the game; (verify at implementation) for a new version). Others take a base set
 * by a command and say "only in Minecraft" when read without one.
 */
export const PLAYER_ATTRIBUTES: Readonly<
  Record<string, { readonly base: number; readonly min: number; readonly max: number }>
> = Object.freeze({
  'minecraft:max_health': { base: 20, min: 1, max: 1024 },
  'minecraft:movement_speed': { base: 0.1, min: 0, max: 1024 },
  'minecraft:jump_strength': { base: 0.42, min: 0, max: 32 },
  'minecraft:attack_damage': { base: 1, min: 0, max: 2048 },
  'minecraft:armor': { base: 0, min: 0, max: 30 },
  'minecraft:scale': { base: 1, min: 0.0625, max: 16 },
});

/** A boss bar (`bossbar`). */
export interface SimBossbar {
  readonly id: string;
  name: string;
  colour: string;
  style: string;
  value: number;
  max: number;
  visible: boolean;
  /** Holder keys of the players who see it. */
  readonly players: Set<string>;
}

/** The world border: its centre and a width moving from `from` to `to` between two ticks. */
export interface WorldBorder {
  centre: { x: number; z: number };
  from: number;
  to: number;
  start: number;
  end: number;
  damage: number;
  buffer: number;
  warningDistance: number;
  warningTime: number;
}

/** The game's default world border (observed: 59,999,968 wide, centred on 0, 0). */
export const DEFAULT_BORDER_SIZE = 59_999_968;

/** A thing that is not a project mob (`summon minecraft:item`, `interaction`, ...). */
export interface SimThing {
  readonly id: number;
  readonly type: string;
  pos: Vec3;
  /** Its entity data (as `summon` gave it; an item's `Item` with `id` and `count`). */
  data: JsonObject;
  /** Who last hit it (`execute on attacker`; B728's practice players set it). */
  attacker?: Actor;
}

/** Things are numbered from here, past any mob the preview spawns, so their UUIDs stay apart. */
export const FIRST_THING_ID = 1_000_000;

/** Ticks a dead player waits before respawning (Try it's player presses Respawn after a second). */
export const RESPAWN_TICKS = 20;

/** Weather kinds. */
export type WeatherKind = 'clear' | 'rain' | 'thunder';

/** The target facts the games state reads (game rule names are version facts). */
export interface GameRuleWords {
  /** The rule that keeps a player's inventory on death (`TargetFacts.dev.gameRules`). */
  readonly keepInventory?: string;
  /** Every vanilla game rule id without `minecraft:` (`TargetFacts.gameRules.vanillaNames`). */
  readonly known?: readonly string[];
}

/** What the games commands remember (held by `CommandState.games`). */
export class GamesCommandState {
  /** Holder key to game mode (unset: {@link DEFAULT_GAME_MODE}). */
  readonly gameModes = new Map<string, GameModeName>();
  /** Holder key to attribute id to its base and modifiers. */
  readonly attributes = new Map<string, Map<string, SimAttribute>>();
  /** Holder key to health, when it is not the most. */
  readonly health = new Map<string, number>();
  readonly bossbars = new Map<string, SimBossbar>();
  border: WorldBorder = defaultBorder();
  /** Game rules set by commands, by bare id. */
  readonly gameRules = new Map<string, boolean | number>();
  weather: { kind: WeatherKind; until: number | undefined } = { kind: 'clear', until: undefined };
  difficulty = 'normal';
  /** Holder key to the trigger objectives it may trigger now (`scoreboard players enable`). */
  readonly triggers = new Map<string, Set<string>>();
  /** Holder key to slots past the hotbar (`armor.*`, `weapon.offhand`, `inventory.*`). */
  readonly slots = new Map<string, Map<string, ItemStack>>();
  readonly things = new Map<number, SimThing>();
  nextThing = FIRST_THING_ID;
  /** Holder key of a dead player to the tick it respawns. */
  readonly dead = new Map<string, number>();
  rules: GameRuleWords = {};

  clear(): void {
    this.gameModes.clear();
    this.attributes.clear();
    this.health.clear();
    this.bossbars.clear();
    this.border = defaultBorder();
    this.gameRules.clear();
    this.weather = { kind: 'clear', until: undefined };
    this.difficulty = 'normal';
    this.triggers.clear();
    this.slots.clear();
    this.things.clear();
    this.nextThing = FIRST_THING_ID;
    this.dead.clear();
  }

  /** A holder's game mode. */
  gameMode(holder: string): GameModeName {
    return this.gameModes.get(holder) ?? DEFAULT_GAME_MODE;
  }

  /** An attribute's value with its modifiers, or `undefined` when its base is not known. */
  attribute(holder: string, id: string): number | undefined {
    const own = this.attributes.get(holder)?.get(id);
    const known = PLAYER_ATTRIBUTES[id];
    const base = own?.base ?? known?.base;
    if (base === undefined) return undefined;
    let value = base;
    const modifiers = [...(own?.modifiers.values() ?? [])];
    for (const one of modifiers) if (one.operation === 'add_value') value += one.amount;
    const added = value;
    for (const one of modifiers) {
      if (one.operation === 'add_multiplied_base') value += added * one.amount;
    }
    for (const one of modifiers) {
      if (one.operation === 'add_multiplied_total') value *= 1 + one.amount;
    }
    return known === undefined ? value : Math.min(known.max, Math.max(known.min, value));
  }

  /** The most health of a holder. */
  maxHealth(holder: string): number {
    return this.attribute(holder, 'minecraft:max_health') ?? 20;
  }

  /** A holder's health now. */
  healthOf(holder: string): number {
    const most = this.maxHealth(holder);
    return Math.min(most, this.health.get(holder) ?? most);
  }

  /** The border's width at a tick. */
  borderSize(now: number): number {
    const { from, to, start, end } = this.border;
    if (now >= end || end <= start) return to;
    if (now <= start) return from;
    return from + ((to - from) * (now - start)) / (end - start);
  }

  /** Whether a game rule is on (`undefined` when no command set it). */
  rule(name: string): boolean | number | undefined {
    return this.gameRules.get(name);
  }

  /** A new thing's id. */
  newThingId(): number {
    const id = this.nextThing;
    this.nextThing += 1;
    return id;
  }
}

function defaultBorder(): WorldBorder {
  return {
    centre: { x: 0, z: 0 },
    from: DEFAULT_BORDER_SIZE,
    to: DEFAULT_BORDER_SIZE,
    start: 0,
    end: 0,
    damage: 0.2,
    buffer: 5,
    warningDistance: 5,
    warningTime: 15,
  };
}

// ---------------------------------------------------------------------------------------------
// NBT paths (`data`, `execute store ... storage`, `function ... with storage`).

/**
 * One step of an NBT path: a key, an index into a list, the first element of a list that
 * holds a compound (`[{...}]`), or a compound filter on what is there (`{...}`).
 */
export type NbtStep =
  | { readonly key: string }
  | { readonly index: number }
  | { readonly find: JsonObject }
  | { readonly match: JsonObject };

/**
 * Reads an NBT path (`a.b[0]."c d"`, `Item{id:"x"}.count`, `list[{a:1}]`); `undefined` for a
 * form the preview does not read (`[]` all elements). `parse` reads the SNBT of filters.
 */
export function readNbtPath(text: string, parse: (snbt: string) => Json): NbtStep[] | undefined {
  const steps: NbtStep[] = [];
  let i = 0;
  const filter = (): JsonObject | undefined => {
    let depth = 0;
    const start = i;
    let quote = '';
    for (; i < text.length; i += 1) {
      const c = text[i] as string;
      if (quote !== '') {
        if (c === '\\') i += 1;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    const value = parse(text.slice(start, i));
    return isRecord(value) ? value : undefined;
  };
  while (i < text.length) {
    const c = text[i] as string;
    if (c === '.') {
      if (steps.length === 0) return undefined;
      i += 1;
      continue;
    }
    if (c === '[') {
      let close = i + 1;
      for (let depth = 0; close < text.length; close += 1) {
        const d = text[close];
        if (d === '{' || d === '[') depth += 1;
        else if (d === '}') depth -= 1;
        else if (d === ']') {
          if (depth === 0) break;
          depth -= 1;
        }
      }
      if (close >= text.length) return undefined;
      const inner = text.slice(i + 1, close).trim();
      if (inner.startsWith('{')) {
        const value = parse(inner);
        if (!isRecord(value)) return undefined;
        steps.push({ find: value });
        i = close + 1;
        continue;
      }
      if (!/^-?\d+$/.test(inner)) return undefined;
      steps.push({ index: Number(inner) });
      i = close + 1;
      continue;
    }
    if (c === '{') {
      const value = filter();
      if (value === undefined) return undefined;
      steps.push({ match: value });
      continue;
    }
    if (c === '"' || c === "'") {
      let out = '';
      i += 1;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') i += 1;
        out += text[i] ?? '';
        i += 1;
      }
      i += 1;
      steps.push({ key: out });
      continue;
    }
    const start = i;
    while (i < text.length && !'.[{"\''.includes(text[i] as string)) i += 1;
    steps.push({ key: text.slice(start, i) });
  }
  return steps;
}

/** Whether `value` holds everything `pattern` holds (the game's NBT match). */
export function nbtMatches(value: Json | undefined, pattern: Json): boolean {
  if (value === undefined) return false;
  if (isRecord(pattern)) {
    if (!isRecord(value)) return false;
    return Object.entries(pattern).every(([key, one]) => nbtMatches(value[key], one));
  }
  if (Array.isArray(pattern)) {
    if (!Array.isArray(value)) return false;
    if (pattern.length === 0) return value.length === 0;
    return pattern.every((one) => value.some((have) => nbtMatches(have, one)));
  }
  const number = (v: Json): Json => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
  return number(value) === number(pattern);
}

/** The value at a path, or `undefined`. */
export function getAtPath(root: Json | undefined, path: readonly NbtStep[]): Json | undefined {
  let at: Json | undefined = root;
  for (let s = 0; s < path.length; s += 1) {
    const step = path[s] as NbtStep;
    if (at === undefined) return undefined;
    if ('key' in step) {
      at = isRecord(at) ? at[step.key] : undefined;
    } else if ('index' in step) {
      if (!Array.isArray(at)) return undefined;
      at = at[step.index < 0 ? at.length + step.index : step.index];
    } else if ('find' in step) {
      if (!Array.isArray(at)) return undefined;
      at = at.find((one) => nbtMatches(one, step.find));
    } else if (!nbtMatches(at, step.match)) {
      return undefined;
    }
  }
  return at;
}

/**
 * Sets the value at a path inside `root` (a compound), making compounds on the way; false when
 * the path runs through something that is not a compound or a list with that element.
 */
export function setAtPath(root: JsonObject, path: readonly NbtStep[], value: Json): boolean {
  if (path.length === 0) return false;
  let at: Json = root;
  for (let s = 0; s < path.length - 1; s += 1) {
    const step = path[s] as NbtStep;
    const next = path[s + 1] as NbtStep;
    if ('key' in step) {
      if (!isRecord(at)) return false;
      const obj = at as Record<string, Json>;
      if (obj[step.key] === undefined) {
        obj[step.key] = 'index' in next || 'find' in next ? [] : {};
      }
      at = obj[step.key] as Json;
    } else if ('index' in step) {
      if (!Array.isArray(at)) return false;
      const list = at as Json[];
      const index = step.index < 0 ? list.length + step.index : step.index;
      if (list[index] === undefined) return false;
      at = list[index] as Json;
    } else if ('find' in step) {
      if (!Array.isArray(at)) return false;
      const found: Json | undefined = (at as Json[]).find((one) => nbtMatches(one, step.find));
      if (found === undefined) return false;
      at = found;
    } else if (!nbtMatches(at, step.match)) return false;
  }
  const last = path[path.length - 1] as NbtStep;
  if ('key' in last) {
    if (!isRecord(at)) return false;
    (at as Record<string, Json>)[last.key] = value;
    return true;
  }
  if ('index' in last) {
    if (!Array.isArray(at)) return false;
    const list = at as Json[];
    const index = last.index < 0 ? list.length + last.index : last.index;
    if (index < 0 || index >= list.length) return false;
    list[index] = value;
    return true;
  }
  if ('find' in last) {
    if (!Array.isArray(at)) return false;
    const list = at as Json[];
    const index = list.findIndex((one) => nbtMatches(one, last.find));
    if (index < 0) return false;
    list[index] = value;
    return true;
  }
  return false;
}

/** Removes the value at a path; whether anything was there. */
export function removeAtPath(root: JsonObject, path: readonly NbtStep[]): boolean {
  if (path.length === 0) return false;
  const parent = getAtPath(root, path.slice(0, -1));
  const last = path[path.length - 1] as NbtStep;
  if ('key' in last && isRecord(parent) && parent[last.key] !== undefined) {
    delete (parent as Record<string, Json>)[last.key];
    return true;
  }
  if ('index' in last && Array.isArray(parent)) {
    const list = parent as Json[];
    const index = last.index < 0 ? list.length + last.index : last.index;
    if (index < 0 || index >= list.length) return false;
    list.splice(index, 1);
    return true;
  }
  if ('find' in last && Array.isArray(parent)) {
    const list = parent as Json[];
    const index = list.findIndex((one) => nbtMatches(one, last.find));
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
  return false;
}

/** A number as `execute store ... storage <type>` writes it (Java's narrowing casts). */
export function storedNumber(value: number, type: string): number {
  switch (type) {
    case 'byte':
      return (Math.trunc(value) << 24) >> 24;
    case 'short':
      return (Math.trunc(value) << 16) >> 16;
    case 'int':
      return Math.trunc(value) | 0;
    case 'long':
      return Math.trunc(value);
    case 'float':
      return Math.fround(value);
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------------------------
// Items: slots and predicates.

/** A slot the preview keeps: a hotbar index (0 to 8) or a named slot of the holder's own. */
export type SlotRef = { readonly hotbar: number } | { readonly named: string };

/**
 * The slots a slot argument names (`hotbar.3`, `weapon.mainhand`, `armor.*`, `container.12`);
 * `undefined` for a range the preview has no place for (`enderchest.*`, `horse.*`).
 * `weapon.mainhand` is the hotbar's first slot (the preview has no selected slot of its own).
 */
export function readSlots(text: string): SlotRef[] | undefined {
  const hotbar = (n: number): SlotRef => ({ hotbar: n });
  const named = (name: string): SlotRef => ({ named: name });
  const many = (count: number, make: (i: number) => SlotRef): SlotRef[] =>
    Array.from({ length: count }, (_v, i) => make(i));
  switch (text) {
    case 'weapon':
    case 'weapon.mainhand':
      return [hotbar(0)];
    case 'weapon.offhand':
      return [named('weapon.offhand')];
    case 'weapon.*':
      return [hotbar(0), named('weapon.offhand')];
    case 'armor.head':
    case 'armor.chest':
    case 'armor.legs':
    case 'armor.feet':
    case 'armor.body':
      return [named(text)];
    case 'armor.*':
      return ['head', 'chest', 'legs', 'feet'].map((one) => named(`armor.${one}`));
    case 'hotbar.*':
      return many(9, hotbar);
    case 'inventory.*':
      return many(27, (i) => named(`inventory.${i}`));
    case 'container.*':
      return [...many(9, hotbar), ...many(27, (i) => named(`inventory.${i}`))];
  }
  const match = /^(hotbar|inventory|container)\.(\d+)$/.exec(text);
  if (match === null) return undefined;
  const n = Number(match[2]);
  if (match[1] === 'hotbar') return n < 9 ? [hotbar(n)] : undefined;
  if (match[1] === 'inventory') return n < 27 ? [named(`inventory.${n}`)] : undefined;
  if (n < 9) return [hotbar(n)];
  return n < 36 ? [named(`inventory.${n - 9}`)] : undefined;
}

/** An item predicate of `clear` and `execute if items`: an id (or `*`) and component tests. */
export interface ItemPredicate {
  readonly id: string | '*';
  /** `component=value` (exact) and `component~value` (partial, `custom_data`) tests. */
  readonly tests: readonly {
    readonly component: string;
    readonly partial: boolean;
    readonly value: Json;
  }[];
  /** Tests the preview cannot answer (`count`, `!`, `|` lists); said when used. */
  readonly unknown: readonly string[];
}

/** Reads an item predicate (`minecraft:compass[minecraft:custom_data~{a:1b}]`). */
export function readItemPredicate(
  text: string,
  parse: (snbt: string) => Json,
  normalise: (id: string) => string,
): ItemPredicate | undefined {
  const match = /^(\*|[a-z0-9_.:/-]+)(\[(.*)\])?$/s.exec(text);
  if (match === null) return undefined;
  const id = match[1] === '*' ? '*' : normalise(match[1] as string);
  const tests: { component: string; partial: boolean; value: Json }[] = [];
  const unknown: string[] = [];
  for (const part of splitTopLevel(match[3] ?? '')) {
    const test = /^([a-z0-9_.:/-]+)\s*(~|=)\s*(.*)$/s.exec(part);
    if (test === null || part.includes('|') || part.startsWith('!')) {
      unknown.push(part);
      continue;
    }
    try {
      tests.push({
        component: normalise(test[1] as string),
        partial: test[2] === '~',
        value: parse(test[3] as string),
      });
    } catch {
      unknown.push(part);
    }
  }
  return { id, tests, unknown };
}

/** Whether a stack matches an item predicate (its unknown tests pass). */
export function stackMatches(stack: ItemStack, predicate: ItemPredicate): boolean {
  if (predicate.id !== '*' && predicate.id !== stack.id) return false;
  for (const test of predicate.tests) {
    const have = stack.components?.[test.component];
    if (
      test.partial
        ? !nbtMatches(have, test.value)
        : JSON.stringify(have) !== JSON.stringify(test.value)
    ) {
      return false;
    }
  }
  return true;
}

/** Splits `a=1,b={c=2}` at its top-level commas. */
function splitTopLevel(text: string): string[] {
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
  return out.map((one) => one.trim()).filter((one) => one !== '');
}

/** An item argument (`minecraft:stone[custom_name="x"]`): its id and components. */
export function readItemStackArg(
  text: string,
  parse: (snbt: string) => Json,
  normalise: (id: string) => string,
): { readonly id: string; readonly components?: JsonObject } | undefined {
  const match = /^([a-z0-9_.:/-]+)(\[(.*)\])?$/s.exec(text);
  if (match === null) return undefined;
  const id = normalise(match[1] as string);
  if (match[3] === undefined) return { id };
  const components: Record<string, Json> = {};
  for (const part of splitTopLevel(match[3])) {
    const eq = /^(!?)([a-z0-9_.:/-]+)\s*(?:=\s*(.*))?$/s.exec(part);
    if (eq === null) return undefined;
    const key = normalise(eq[2] as string);
    if (eq[1] === '!') continue;
    components[key] = eq[3] === undefined ? {} : parse(eq[3]);
  }
  return Object.keys(components).length === 0 ? { id } : { id, components };
}

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------------------------
// The commands.

/** A cursor over a command's words (`vanilla.ts`'s). */
export interface KitCursor {
  readonly done: boolean;
  peek(): string | undefined;
  next(what: string): string;
  optional(): string | undefined;
  rest(): string;
  end(): void;
  int(what: string, min?: number, max?: number): number;
  float(what: string, min?: number): number;
  bool(what: string): boolean;
  id(what: string): string;
}

/** A selector as `vanilla.ts` reads it (opaque here). */
export interface KitSelector {
  readonly text: string;
}

/** A position argument as `vanilla.ts` reads it (opaque here). */
export type KitVec3 = readonly unknown[];

/** A compiled command. */
export type KitRun = (rc: RunContext, src: Source) => Outcome;

/** What `vanilla.ts` lends these commands: its readers, errors and helpers. */
export interface CommandKit {
  /** The game would not read the line. */
  badLine(message: string): Error;
  /** A form only the game runs. */
  notHere(form: string): Error;
  /** The command read but failed (the game's message). */
  failed(message: string): Error;
  readTargets(cur: KitCursor, what: string, players?: boolean, one?: boolean): KitSelector;
  select(rc: RunContext, selector: KitSelector, src: Source): Actor[];
  selectSome(rc: RunContext, selector: KitSelector, src: Source, players: boolean): Actor[];
  readVec3(cur: KitCursor): KitVec3;
  resolveVec3(rc: RunContext, spec: KitVec3, src: Source, centre: boolean): Vec3;
  readTime(text: string): number;
  parseSnbt(text: string): Json;
  componentText(rc: RunContext, value: Json, src: Source): string;
  actorName(rc: RunContext, actor: Actor): string;
  holderOf(actor: Actor): string;
  normalise(id: string): string;
  objectiveOf(rc: RunContext, name: string): Objective;
}

const ok = (result = 1): Outcome => ({ success: true, result });

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The commands of this module, built over `vanilla.ts`'s readers. */
export function gamesCommands(
  kit: CommandKit,
): Readonly<Record<string, (cur: KitCursor) => KitRun>> {
  const readComponentRest = (cur: KitCursor, what: string): Json => {
    const raw = cur.rest();
    if (raw === '') throw kit.badLine(`Expected ${what}`);
    try {
      return kit.parseSnbt(raw);
    } catch {
      throw kit.badLine(`Invalid text component '${raw}'`);
    }
  };

  /** A column argument (`minecraft:vec2`: `x z`, `~` relative) read now, worked out when run. */
  const readColumn = (
    cur: KitCursor,
  ): ((rc: RunContext, src: Source) => { x: number; z: number }) => {
    const read = (text: string): { rel: boolean; n: number; whole: boolean } => {
      const rel = text.startsWith('~');
      const rest = rel ? text.slice(1) : text;
      const n = rest === '' ? 0 : Number(rest);
      if (!Number.isFinite(n) || text.startsWith('^')) {
        throw kit.badLine(`Expected a coordinate, found '${text}'`);
      }
      return { rel, n, whole: !rest.includes('.') };
    };
    const x = read(cur.next('x'));
    const z = read(cur.next('z'));
    return (rc, src) => {
      const { corner } = rc.state;
      const axis = (c: { rel: boolean; n: number; whole: boolean }, base: number): number =>
        c.rel ? base + c.n : c.n + (c.whole ? 0.5 : 0);
      return { x: axis(x, src.pos.x + corner.x), z: axis(z, src.pos.z + corner.z) };
    };
  };

  const gamemode = (cur: KitCursor): KitRun => {
    const mode = cur.next('a game mode');
    if (!(GAME_MODES as readonly string[]).includes(mode)) {
      throw kit.badLine(`Unknown game mode: ${mode}`);
    }
    const targets = cur.done ? undefined : kit.readTargets(cur, 'a target', true);
    cur.end();
    return (rc, src) => {
      const found =
        targets === undefined
          ? src.executor?.kind === 'player'
            ? [src.executor]
            : []
          : kit.selectSome(rc, targets, src, true);
      if (found.length === 0) throw kit.failed('A player is required to run this command here');
      const words = `${mode[0]?.toUpperCase()}${mode.slice(1)} Mode`;
      let changed = 0;
      for (const actor of found) {
        const key = kit.holderOf(actor);
        if (rc.state.games.gameMode(key) === mode) continue;
        rc.state.games.gameModes.set(key, mode as GameModeName);
        changed += 1;
        rc.feedback(
          targets === undefined
            ? `Set own game mode to ${words}`
            : `Set ${kit.actorName(rc, actor)}'s game mode to ${words}`,
          src.origin,
        );
      }
      if (mode === 'spectator' && changed > 0) {
        rc.only(
          'flying through blocks as a spectator (in Try it a spectator walks and flies as usual and cannot touch anything)',
          src.origin,
        );
      }
      return ok(changed);
    };
  };

  const attribute = (cur: KitCursor): KitRun => {
    const target = kit.readTargets(cur, 'a target', false, true);
    const id = cur.id('an attribute');
    const action = cur.next('base, get or modifier');
    const holderAt = (rc: RunContext, src: Source): string => {
      const [actor] = kit.selectSome(rc, target, src, false);
      if (actor === undefined) throw kit.failed('No entity was found');
      if (actor.kind !== 'player') {
        rc.only("a mob's attributes (the preview keeps the player's)", src.origin);
      }
      return kit.holderOf(actor);
    };
    const own = (rc: RunContext, key: string): SimAttribute => {
      let byId = rc.state.games.attributes.get(key);
      if (byId === undefined) {
        byId = new Map();
        rc.state.games.attributes.set(key, byId);
      }
      let one = byId.get(id);
      if (one === undefined) {
        one = { base: undefined, modifiers: new Map() };
        byId.set(id, one);
      }
      return one;
    };
    const healthMoved = (rc: RunContext, key: string): void => {
      if (id !== 'minecraft:max_health') return;
      const games = rc.state.games;
      const most = games.maxHealth(key);
      if ((games.health.get(key) ?? most) >= most) games.health.delete(key);
    };
    const unknownBase = (rc: RunContext, src: Source): never => {
      rc.only(
        `the default value of ${id} (the preview knows it only once a command sets it)`,
        src.origin,
      );
      throw kit.failed(`Can't find attribute ${id} on the entity`);
    };
    if (action === 'get') {
      const scale = cur.done ? 1 : cur.float('a scale');
      cur.end();
      return (rc, src) => {
        const key = holderAt(rc, src);
        const value = rc.state.games.attribute(key, id);
        if (value === undefined) return unknownBase(rc, src);
        rc.feedback(`Value of attribute ${id} for ${key} is ${round2(value)}`, src.origin);
        return ok(Math.trunc(value * scale));
      };
    }
    if (action === 'base') {
      const what = cur.next('get, set or reset');
      if (what === 'get') {
        const scale = cur.done ? 1 : cur.float('a scale');
        cur.end();
        return (rc, src) => {
          const key = holderAt(rc, src);
          const base =
            rc.state.games.attributes.get(key)?.get(id)?.base ?? PLAYER_ATTRIBUTES[id]?.base;
          if (base === undefined) return unknownBase(rc, src);
          rc.feedback(`Base value of attribute ${id} for ${key} is ${round2(base)}`, src.origin);
          return ok(Math.trunc(base * scale));
        };
      }
      if (what === 'set') {
        const value = cur.float('a value');
        cur.end();
        return (rc, src) => {
          const key = holderAt(rc, src);
          own(rc, key).base = value;
          healthMoved(rc, key);
          rc.feedback(
            `Base value for attribute ${id} for ${key} set to ${round2(value)}`,
            src.origin,
          );
          return ok(1);
        };
      }
      if (what === 'reset') {
        cur.end();
        return (rc, src) => {
          const key = holderAt(rc, src);
          own(rc, key).base = undefined;
          healthMoved(rc, key);
          const base = PLAYER_ATTRIBUTES[id]?.base;
          if (base === undefined) return unknownBase(rc, src);
          rc.feedback(
            `Base value for attribute ${id} for ${key} reset to default ${base}`,
            src.origin,
          );
          return ok(1);
        };
      }
      throw kit.badLine(`Unknown action '${what}'`);
    }
    if (action !== 'modifier') throw kit.badLine(`Unknown action '${action}'`);
    const what = cur.next('add, remove or value');
    if (what === 'add') {
      const modifier = cur.id('a modifier id');
      const amount = cur.float('an amount');
      const operation = cur.next('an operation');
      if (!['add_value', 'add_multiplied_base', 'add_multiplied_total'].includes(operation)) {
        throw kit.badLine(`Unknown operation '${operation}'`);
      }
      cur.end();
      return (rc, src) => {
        const key = holderAt(rc, src);
        const one = own(rc, key);
        if (one.modifiers.has(modifier)) {
          throw kit.failed(
            `Modifier ${modifier} is already present on attribute ${id} for entity ${key}`,
          );
        }
        one.modifiers.set(modifier, {
          id: modifier,
          amount,
          operation: operation as ModifierOperation,
        });
        healthMoved(rc, key);
        rc.feedback(`Added modifier ${modifier} to attribute ${id} for ${key}`, src.origin);
        return ok(1);
      };
    }
    if (what === 'remove') {
      const modifier = cur.id('a modifier id');
      cur.end();
      return (rc, src) => {
        const key = holderAt(rc, src);
        if (!own(rc, key).modifiers.delete(modifier)) {
          throw kit.failed(`No modifier ${modifier} on attribute ${id} for entity ${key}`);
        }
        healthMoved(rc, key);
        rc.feedback(`Removed modifier ${modifier} from attribute ${id} for ${key}`, src.origin);
        return ok(1);
      };
    }
    if (what === 'value') {
      cur.next('get');
      const modifier = cur.id('a modifier id');
      const scale = cur.done ? 1 : cur.float('a scale');
      cur.end();
      return (rc, src) => {
        const key = holderAt(rc, src);
        const one = own(rc, key).modifiers.get(modifier);
        if (one === undefined) {
          throw kit.failed(`No modifier ${modifier} on attribute ${id} for entity ${key}`);
        }
        rc.feedback(
          `Value of modifier ${modifier} on attribute ${id} for ${key} is ${one.amount}`,
          src.origin,
        );
        return ok(Math.trunc(one.amount * scale));
      };
    }
    throw kit.badLine(`Unknown action '${what}'`);
  };

  const BAR_COLOURS = ['blue', 'green', 'pink', 'purple', 'red', 'white', 'yellow'];
  const BAR_STYLES = ['notched_10', 'notched_12', 'notched_20', 'notched_6', 'progress'];
  const barOf = (rc: RunContext, id: string): SimBossbar => {
    const bar = rc.state.games.bossbars.get(id);
    if (bar === undefined) throw kit.failed(`No bossbar exists with the ID '${id}'`);
    return bar;
  };

  const bossbar = (cur: KitCursor): KitRun => {
    const action = cur.next('add, get, list, remove or set');
    if (action === 'list') {
      cur.end();
      return (rc, src) => {
        const bars = [...rc.state.games.bossbars.values()];
        rc.feedback(
          bars.length === 0
            ? 'There are no custom bossbars active'
            : `There are ${bars.length} custom bossbars active: ${bars.map((bar) => `[${bar.name}]`).join(', ')}`,
          src.origin,
        );
        return ok(bars.length);
      };
    }
    const id = cur.id('a boss bar id');
    if (action === 'add') {
      const name = readComponentRest(cur, 'a name');
      return (rc, src) => {
        if (rc.state.games.bossbars.has(id)) {
          throw kit.failed(`A bossbar already exists with the ID '${id}'`);
        }
        const words = kit.componentText(rc, name, src);
        rc.state.games.bossbars.set(id, {
          id,
          name: words,
          colour: 'white',
          style: 'progress',
          value: 0,
          max: 100,
          visible: true,
          players: new Set(),
        });
        rc.feedback(`Created custom bossbar [${words}]`, src.origin);
        return ok(rc.state.games.bossbars.size);
      };
    }
    if (action === 'remove') {
      cur.end();
      return (rc, src) => {
        const bar = barOf(rc, id);
        rc.state.games.bossbars.delete(id);
        rc.feedback(`Removed custom bossbar [${bar.name}]`, src.origin);
        return ok(rc.state.games.bossbars.size);
      };
    }
    if (action === 'get') {
      const what = cur.next('max, players, value or visible');
      cur.end();
      if (!['max', 'players', 'value', 'visible'].includes(what)) {
        throw kit.badLine(`Unknown field '${what}'`);
      }
      return (rc, src) => {
        const bar = barOf(rc, id);
        const value =
          what === 'max'
            ? bar.max
            : what === 'value'
              ? bar.value
              : what === 'visible'
                ? bar.visible
                  ? 1
                  : 0
                : bar.players.size;
        rc.feedback(`Custom bossbar [${bar.name}] has ${what} ${value}`, src.origin);
        return ok(value);
      };
    }
    if (action !== 'set') throw kit.badLine(`Unknown bossbar action '${action}'`);
    const field = cur.next('a field');
    switch (field) {
      case 'name': {
        const name = readComponentRest(cur, 'a name');
        return (rc, src) => {
          const bar = barOf(rc, id);
          bar.name = kit.componentText(rc, name, src);
          rc.feedback(`Custom bossbar [${bar.name}] has been renamed`, src.origin);
          return ok(0);
        };
      }
      case 'color':
      case 'style': {
        const value = cur.next(`a ${field}`);
        cur.end();
        if (!(field === 'color' ? BAR_COLOURS : BAR_STYLES).includes(value)) {
          throw kit.badLine(`Incorrect argument for command '${value}'`);
        }
        return (rc, src) => {
          const bar = barOf(rc, id);
          if (field === 'color') bar.colour = value;
          else bar.style = value;
          rc.feedback(`Custom bossbar [${bar.name}] has changed ${field}`, src.origin);
          return ok(0);
        };
      }
      case 'value':
      case 'max': {
        const value = cur.int(`a ${field}`, field === 'max' ? 1 : 0);
        cur.end();
        return (rc, src) => {
          const bar = barOf(rc, id);
          if (field === 'value') bar.value = value;
          else bar.max = value;
          rc.feedback(`Custom bossbar [${bar.name}] has changed ${field} to ${value}`, src.origin);
          return ok(value);
        };
      }
      case 'visible': {
        const value = cur.bool('true or false');
        cur.end();
        return (rc, src) => {
          const bar = barOf(rc, id);
          bar.visible = value;
          rc.feedback(
            `Custom bossbar [${bar.name}] is now ${value ? 'visible' : 'hidden'}`,
            src.origin,
          );
          return ok(0);
        };
      }
      case 'players': {
        const targets = cur.done ? undefined : kit.readTargets(cur, 'players', true);
        cur.end();
        return (rc, src) => {
          const bar = barOf(rc, id);
          const found = targets === undefined ? [] : kit.select(rc, targets, src);
          bar.players.clear();
          for (const actor of found) bar.players.add(kit.holderOf(actor));
          rc.feedback(
            found.length === 0
              ? `Custom bossbar [${bar.name}] no longer has any players`
              : `Custom bossbar [${bar.name}] now has ${plural(found.length, 'player')}`,
            src.origin,
          );
          return ok(found.length);
        };
      }
      default:
        throw kit.badLine(`Unknown field '${field}'`);
    }
  };

  const worldborder = (cur: KitCursor): KitRun => {
    const action = cur.next('add, center, damage, get, set or warning');
    const said = (rc: RunContext, src: Source): void =>
      rc.only(
        'what the world border does to players outside it (Try it draws it only)',
        src.origin,
      );
    if (action === 'get') {
      cur.end();
      return (rc, src) => {
        const size = rc.state.games.borderSize(rc.host.now());
        rc.feedback(`The world border is currently ${Math.round(size)} block(s) wide`, src.origin);
        return ok(Math.round(size));
      };
    }
    if (action === 'set' || action === 'add') {
      const distance = cur.float('a distance', -59_999_968);
      const time = cur.done ? 0 : kit.readTime(cur.next('a time'));
      cur.end();
      return (rc, src) => {
        const games = rc.state.games;
        const now = rc.host.now();
        const current = games.borderSize(now);
        const to = action === 'set' ? distance : current + distance;
        if (to < 1) throw kit.failed('The world border cannot be smaller than 1 block wide');
        if (to > DEFAULT_BORDER_SIZE) {
          throw kit.failed(
            `The world border cannot be bigger than ${DEFAULT_BORDER_SIZE} blocks wide`,
          );
        }
        if (to === current && time === 0) {
          throw kit.failed('Nothing changed. The world border is already that size');
        }
        games.border = { ...games.border, from: current, to, start: now, end: now + time };
        rc.feedback(
          time === 0
            ? `Set the world border to ${round2(to)} block(s) wide`
            : `${to < current ? 'Shrinking' : 'Growing'} the world border to ${round2(to)} block(s) wide over ${Math.round(time / 20)} second(s)`,
          src.origin,
        );
        said(rc, src);
        return ok(Math.round(to - current));
      };
    }
    if (action === 'center') {
      const column = readColumn(cur);
      cur.end();
      return (rc, src) => {
        const centre = column(rc, src);
        const games = rc.state.games;
        if (games.border.centre.x === centre.x && games.border.centre.z === centre.z) {
          throw kit.failed('Nothing changed. The world border is already centered there');
        }
        games.border = { ...games.border, centre };
        rc.feedback(`Set the center of the world border to ${centre.x}, ${centre.z}`, src.origin);
        return ok(0);
      };
    }
    if (action === 'damage') {
      const what = cur.next('amount or buffer');
      const value = cur.float('a number', 0);
      cur.end();
      if (what !== 'amount' && what !== 'buffer') throw kit.badLine(`Unknown action '${what}'`);
      return (rc, src) => {
        const border = rc.state.games.border;
        if (what === 'amount') border.damage = value;
        else border.buffer = value;
        rc.feedback(`Set the world border damage ${what} to ${value}`, src.origin);
        said(rc, src);
        return ok(Math.trunc(value));
      };
    }
    if (action === 'warning') {
      const what = cur.next('distance or time');
      if (what !== 'distance' && what !== 'time') throw kit.badLine(`Unknown action '${what}'`);
      const value =
        what === 'distance' ? cur.int('a distance', 0) : kit.readTime(cur.next('a time'));
      cur.end();
      return (rc, src) => {
        const border = rc.state.games.border;
        if (what === 'distance') border.warningDistance = value;
        else border.warningTime = Math.round(value / 20);
        rc.feedback(`Set the world border warning ${what} to ${value}`, src.origin);
        said(rc, src);
        return ok(value);
      };
    }
    throw kit.badLine(`Unknown worldborder action '${action}'`);
  };

  const spreadplayers = (cur: KitCursor): KitRun => {
    const column = readColumn(cur);
    const spread = cur.float('a spread distance', 0);
    const range = cur.float('a range', 1);
    let maxHeight: number | undefined;
    if (cur.peek() === 'under') {
      cur.next('under');
      maxHeight = cur.int('a height');
    }
    const teams = cur.bool('respectTeams');
    const targets = kit.readTargets(cur, 'targets');
    cur.end();
    return (rc, src) => {
      const { x: cx, z: cz } = column(rc, src);
      const found = kit.selectSome(rc, targets, src, false);
      const { world } = rc.host;
      const { corner } = rc.state;
      const groups = new Map<string, Actor[]>();
      for (const actor of found) {
        const key = teams
          ? (rc.state.teamOf.get(kit.holderOf(actor)) ?? kit.holderOf(actor))
          : kit.holderOf(actor);
        groups.set(key, [...(groups.get(key) ?? []), actor]);
      }
      const placed: { x: number; z: number }[] = [];
      let cut = false;
      for (const members of groups.values()) {
        let spot: BlockPos | undefined;
        for (let tries = 0; tries < 100 && spot === undefined; tries += 1) {
          const x = Math.floor(cx - corner.x + (rc.host.random.next() * 2 - 1) * range);
          const z = Math.floor(cz - corner.z + (rc.host.random.next() * 2 - 1) * range);
          if (placed.some((one) => Math.hypot(one.x - x, one.z - z) < spread)) continue;
          const top = Math.min(
            world.sizeY - 1,
            maxHeight === undefined ? world.sizeY - 1 : maxHeight - corner.y,
          );
          for (let y = top; y >= 0; y -= 1) {
            if (!world.inBounds({ x, y, z })) break;
            if (
              world.get({ x, y, z }) !== null &&
              (y + 1 > top || world.get({ x, y: y + 1, z }) === null)
            ) {
              spot = { x, y: y + 1, z };
              break;
            }
          }
        }
        if (spot === undefined) {
          cut = true;
          continue;
        }
        placed.push({ x: spot.x, z: spot.z });
        for (const actor of members) {
          const at = { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
          if (actor.kind === 'player') rc.host.player.teleport(at);
          else {
            const thing = rc.state.games.things.get(actor.id);
            if (thing !== undefined) thing.pos = at;
            else rc.only('moving mobs with /spreadplayers (the preview moves you)', src.origin);
          }
        }
      }
      if (cut) {
        rc.only(
          'places outside the test area for /spreadplayers (those players stay where they are)',
          src.origin,
        );
      }
      if (placed.length === 0) {
        throw kit.failed(`Could not spread ${found.length} entities around ${cx}, ${cz}`);
      }
      rc.feedback(
        `Spread ${plural(found.length, 'entity', 'entities')} around ${cx}, ${cz}`,
        src.origin,
      );
      return ok(placed.length);
    };
  };

  const item = (cur: KitCursor): KitRun => {
    const action = cur.next('replace or modify');
    if (action !== 'replace' && action !== 'modify') throw kit.notHere(`/item ${action}`);
    const where = cur.next('block or entity');
    if (where !== 'entity') throw kit.notHere(`/item ${action} block`);
    const targets = kit.readTargets(cur, 'targets');
    const slotText = cur.next('a slot');
    const slots = readSlots(slotText);
    if (slots === undefined) throw kit.notHere(`/item with the slot ${slotText}`);
    if (action === 'modify') {
      const raw = cur.rest();
      if (raw === '') throw kit.badLine('Expected an item modifier');
      const modifier: Json =
        raw.startsWith('{') || raw.startsWith('[') ? kit.parseSnbt(raw) : kit.normalise(raw);
      return (rc, src) => {
        let changed = 0;
        for (const actor of kit.selectSome(rc, targets, src, false)) {
          if (actor.kind !== 'player') {
            rc.only('items held by mobs (/item ... the preview keeps only yours)', src.origin);
            continue;
          }
          for (const slot of slots) {
            const stack = stackIn(rc, slot);
            if (stack === null) continue;
            const after = modifyStack(rc, modifier, stack, src);
            if (after === undefined) continue;
            putStack(rc, slot, after.count <= 0 ? null : after);
            changed += 1;
          }
        }
        if (changed === 0) throw kit.failed(`No targets accepted item into slot ${slotText}`);
        rc.feedback(`Applied modifier to ${plural(changed, 'item')}`, src.origin);
        return ok(changed);
      };
    }
    const how = cur.next('with or from');
    let make: (rc: RunContext, src: Source) => ItemStack | null;
    if (how === 'with') {
      const text = cur.next('an item');
      const parsed = readItemStackArg(text, kit.parseSnbt, kit.normalise);
      if (parsed === undefined) throw kit.badLine(`Unknown item '${text}'`);
      const count = cur.done ? 1 : cur.int('a count', 0, 99);
      cur.end();
      make = () =>
        count === 0
          ? null
          : Object.freeze({
              id: parsed.id,
              count,
              ...(parsed.components === undefined ? {} : { components: parsed.components }),
            });
    } else if (how === 'from') {
      const fromWhere = cur.next('block or entity');
      if (fromWhere !== 'entity') throw kit.notHere('/item replace ... from block');
      const source = kit.readTargets(cur, 'a source', false, true);
      const fromSlotText = cur.next('a slot');
      const fromSlots = readSlots(fromSlotText);
      if (fromSlots?.length !== 1) throw kit.notHere(`/item with the slot ${fromSlotText}`);
      const raw = cur.done ? undefined : cur.rest();
      const modifier: Json | undefined =
        raw === undefined
          ? undefined
          : raw.startsWith('{') || raw.startsWith('[')
            ? kit.parseSnbt(raw)
            : kit.normalise(raw);
      make = (rc, src) => {
        const [from] = kit.selectSome(rc, source, src, false);
        if (from?.kind !== 'player') {
          rc.only('items held by mobs (/item ... the preview keeps only yours)', src.origin);
          return null;
        }
        const stack = stackIn(rc, fromSlots[0] as SlotRef);
        if (stack === null || modifier === undefined) return stack;
        return modifyStack(rc, modifier, stack, src) ?? stack;
      };
    } else throw kit.badLine(`Unknown action '${how}'`);
    return (rc, src) => {
      let changed = 0;
      for (const actor of kit.selectSome(rc, targets, src, false)) {
        if (actor.kind !== 'player') {
          rc.only('items held by mobs (/item ... the preview keeps only yours)', src.origin);
          continue;
        }
        for (const slot of slots) {
          putStack(rc, slot, make(rc, src));
          changed += 1;
        }
      }
      if (changed === 0) throw kit.failed(`No targets accepted item into slot ${slotText}`);
      rc.feedback(
        `Replaced a slot on ${plural(changed, 'entity', 'entities')} with an item`,
        src.origin,
      );
      return ok(changed);
    };
  };

  /** Applies an item modifier: the host's loot evaluator, else the inline forms read here. */
  const modifyStack = (
    rc: RunContext,
    modifier: Json,
    stack: ItemStack,
    src: Source,
  ): ItemStack | undefined => {
    // An inline modifier written with `function` (the older key) reads as one with `type`.
    const named = (one: Json): Json =>
      isRecord(one) && one.type === undefined && one.function !== undefined
        ? { ...one, type: one.function }
        : one;
    const asked = rc.host.modifyItem?.(
      Array.isArray(modifier) ? modifier.map(named) : named(modifier),
      stack,
    );
    if (asked !== undefined) {
      for (const one of asked.unsupported) rc.only(one, src.origin);
      return asked.stack;
    }
    const list = Array.isArray(modifier) ? modifier : [modifier];
    let out: ItemStack = stack;
    for (const one of list) {
      if (!isRecord(one)) {
        rc.only(`the item modifier ${String(one)} (the preview reads inline ones)`, src.origin);
        return undefined;
      }
      const type = kit.normalise(String(one.function ?? one.type ?? ''));
      if (type === 'minecraft:set_components' && isRecord(one.components)) {
        const components: Record<string, Json> = { ...(out.components ?? {}) };
        for (const [key, value] of Object.entries(one.components)) {
          if (key.startsWith('!')) delete components[kit.normalise(key.slice(1))];
          else components[kit.normalise(key)] = value;
        }
        out = Object.freeze({ id: out.id, count: out.count, components });
      } else if (type === 'minecraft:set_count' && typeof one.count === 'number') {
        out = Object.freeze({
          ...out,
          count: one.add === true ? out.count + one.count : one.count,
        });
      } else {
        rc.only(
          `the item modifier ${type} (the preview reads set_components and set_count)`,
          src.origin,
        );
        return undefined;
      }
    }
    return out;
  };

  const trigger = (cur: KitCursor): KitRun => {
    const name = cur.next('an objective');
    let how: 'add' | 'set' = 'add';
    let amount = 1;
    if (!cur.done) {
      const word = cur.next('add or set');
      if (word !== 'add' && word !== 'set') throw kit.badLine(`Unknown action '${word}'`);
      how = word;
      amount = cur.int('a value');
    }
    cur.end();
    return (rc, src) => {
      if (src.executor?.kind !== 'player')
        throw kit.failed('A player is required to run this command here');
      const objective = kit.objectiveOf(rc, name);
      if (objective.criterion !== 'trigger') {
        throw kit.failed("You can only trigger objectives that are 'trigger' type");
      }
      const key = kit.holderOf(src.executor);
      const enabled = rc.state.games.triggers.get(key);
      if (enabled?.has(name) !== true) throw kit.failed('You cannot trigger this objective yet');
      enabled.delete(name);
      const before = objective.scores.get(key) ?? 0;
      const value = how === 'set' ? amount : (before + amount) | 0;
      objective.scores.set(key, value);
      rc.feedback(
        how === 'set'
          ? `Triggered [${objective.displayName}] (set value to ${amount})`
          : `Triggered [${objective.displayName}] (added ${amount} to value)`,
        src.origin,
      );
      return ok(value);
    };
  };

  const gamerule = (cur: KitCursor): KitRun => {
    const raw = cur.next('a game rule');
    const name = raw.startsWith('minecraft:') ? raw.slice('minecraft:'.length) : raw;
    const value = cur.optional();
    cur.end();
    return (rc, src) => {
      const games = rc.state.games;
      const known = games.rules.known;
      if (known !== undefined && !known.includes(name)) {
        throw kit.badLine(`Incorrect argument for command '${raw}'`);
      }
      if (value === undefined) {
        const now = games.rule(name);
        if (now === undefined) {
          rc.only(
            `the default of the game rule ${name} (the preview knows rules once set)`,
            src.origin,
          );
          throw kit.failed(`The game rule ${name} has its default value`);
        }
        rc.feedback(`Gamerule ${name} is currently set to: ${String(now)}`, src.origin);
        return ok(typeof now === 'number' ? now : now ? 1 : 0);
      }
      let parsed: boolean | number;
      if (value === 'true' || value === 'false') parsed = value === 'true';
      else if (/^-?\d+$/.test(value)) parsed = Number(value);
      else throw kit.badLine(`Invalid value '${value}'`);
      games.gameRules.set(name, parsed);
      rc.feedback(`Gamerule ${name} is now set to: ${value}`, src.origin);
      if (name !== games.rules.keepInventory) {
        rc.only(
          `what the game rule ${name} does (Try it keeps it; it obeys the keep-inventory rule)`,
          src.origin,
        );
      }
      return ok(typeof parsed === 'number' ? parsed : parsed ? 1 : 0);
    };
  };

  const weather = (cur: KitCursor): KitRun => {
    const kind = cur.next('clear, rain or thunder');
    if (kind !== 'clear' && kind !== 'rain' && kind !== 'thunder') {
      throw kit.badLine(`Unknown weather '${kind}'`);
    }
    const duration = cur.done ? undefined : kit.readTime(cur.next('a duration'));
    cur.end();
    return (rc, src) => {
      rc.state.games.weather = {
        kind,
        until: duration === undefined ? undefined : rc.host.now() + duration,
      };
      rc.feedback(
        kind === 'clear'
          ? 'Set the weather to clear'
          : kind === 'rain'
            ? 'Set the weather to rain'
            : 'Set the weather to rain & thunder',
        src.origin,
      );
      rc.only('rain and thunder in the sky (predicates and Try it keep the weather)', src.origin);
      return ok(duration ?? 0);
    };
  };

  const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
  const difficulty = (cur: KitCursor): KitRun => {
    const level = cur.optional();
    cur.end();
    if (level !== undefined && !DIFFICULTIES.includes(level)) {
      throw kit.badLine(`Unknown difficulty '${level}'`);
    }
    return (rc, src) => {
      const games = rc.state.games;
      if (level === undefined) {
        rc.feedback(
          `The difficulty is ${games.difficulty[0]?.toUpperCase()}${games.difficulty.slice(1)}`,
          src.origin,
        );
        return ok(DIFFICULTIES.indexOf(games.difficulty));
      }
      if (games.difficulty === level)
        throw kit.failed(`The difficulty did not change; it is already set to ${level}`);
      games.difficulty = level;
      rc.feedback(
        `The difficulty has been set to ${level[0]?.toUpperCase()}${level.slice(1)}`,
        src.origin,
      );
      rc.only('what the difficulty does to mobs and hunger (Try it keeps it)', src.origin);
      return ok(DIFFICULTIES.indexOf(level));
    };
  };

  return {
    gamemode,
    attribute,
    bossbar,
    worldborder,
    spreadplayers,
    item,
    trigger,
    gamerule,
    weather,
    difficulty,
  };
}

// ---------------------------------------------------------------------------------------------
// Slots of the player.

/** The stack in one of the player's slots, or `null`. */
export function stackIn(rc: RunContext, slot: SlotRef): ItemStack | null {
  if ('hotbar' in slot) return rc.host.inventory().slots[slot.hotbar] ?? null;
  return rc.state.games.slots.get(PREVIEW_PLAYER_NAME)?.get(slot.named) ?? null;
}

/** Puts a stack (or nothing) in one of the player's slots. */
export function putStack(rc: RunContext, slot: SlotRef, stack: ItemStack | null): void {
  if ('hotbar' in slot) {
    rc.host.inventory().set(slot.hotbar, stack);
    return;
  }
  const key = PREVIEW_PLAYER_NAME;
  let own = rc.state.games.slots.get(key);
  if (own === undefined) {
    own = new Map();
    rc.state.games.slots.set(key, own);
  }
  if (stack === null) own.delete(slot.named);
  else own.set(slot.named, stack);
}

/** Every stack the player holds, with its slot (hotbar first). */
export function playerStacks(
  rc: RunContext,
): { readonly slot: SlotRef; readonly stack: ItemStack }[] {
  const out: { slot: SlotRef; stack: ItemStack }[] = [];
  rc.host.inventory().slots.forEach((stack, hotbar) => {
    if (stack !== null) out.push({ slot: { hotbar }, stack });
  });
  for (const [named, stack] of rc.state.games.slots.get(PREVIEW_PLAYER_NAME) ?? []) {
    out.push({ slot: { named }, stack });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Death and respawn.

/** The criteria a death moves, and how. */
const DEATH_COUNTED = new Set(['deathCount', 'minecraft.custom:minecraft.deaths']);
const DEATH_RESET = new Set(['minecraft.custom:minecraft.time_since_death']);

/**
 * The player dies (`kill`, the void): death scores move, effects go, the inventory empties
 * unless the keep-inventory rule is on, and a respawn waits {@link RESPAWN_TICKS}. False when the
 * player was already dead.
 */
export function playerDies(
  rc: RunContext,
  key: string,
  message: string,
  origin: SimOrigin | undefined,
): boolean {
  const games = rc.state.games;
  if (games.dead.has(key)) return false;
  games.dead.set(key, rc.host.now() + RESPAWN_TICKS);
  games.health.set(key, 0);
  for (const objective of rc.state.objectives.values()) {
    if (DEATH_COUNTED.has(objective.criterion)) {
      objective.scores.set(key, ((objective.scores.get(key) ?? 0) + 1) | 0);
    } else if (DEATH_RESET.has(objective.criterion)) objective.scores.set(key, 0);
    else if (objective.criterion === 'health') objective.scores.set(key, 0);
  }
  rc.state.effects.delete(key);
  const keep = games.rules.keepInventory;
  if (keep === undefined || games.rule(keep) !== true) {
    rc.host.inventory().clear();
    games.slots.delete(key);
    rc.only('the items you held dropping where you died (Try it takes them away)', origin);
  }
  rc.chat(message, origin);
  rc.only('the death screen (Try it’s player respawns a second later)', origin);
  return true;
}

/** Respawns the dead whose time has come: full health, at their spawn point when it is in the area. */
export function respawnDue(
  state: {
    readonly games: GamesCommandState;
    readonly spawnPoints: ReadonlyMap<string, { readonly pos: BlockPos }>;
    readonly corner: Vec3;
  },
  host: VanillaHost,
  playerName: string,
): void {
  const now = host.now();
  for (const [key, until] of [...state.games.dead]) {
    if (until > now) continue;
    state.games.dead.delete(key);
    state.games.health.delete(key);
    if (key !== playerName) continue;
    const point = state.spawnPoints.get(key);
    if (point !== undefined) {
      const at = {
        x: point.pos.x - state.corner.x,
        y: point.pos.y - state.corner.y,
        z: point.pos.z - state.corner.z,
      };
      if (
        host.world.inBounds({
          x: Math.floor(at.x),
          y: Math.max(0, Math.floor(at.y)),
          z: Math.floor(at.z),
        })
      ) {
        host.player.teleport({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
      }
    }
    host.log.info(
      point === undefined
        ? 'You respawned where you were (you have no spawn point in the test area).'
        : 'You respawned at your spawn point.',
    );
  }
}

/** The hearts row of the panel: health and most health in half hearts (2 a heart). */
export function playerHearts(
  games: GamesCommandState,
  playerName: string,
): { readonly health: number; readonly most: number; readonly dead: boolean } {
  return {
    health: games.healthOf(playerName),
    most: games.maxHealth(playerName),
    dead: games.dead.has(playerName),
  };
}

/** Keeps `health` objectives at the player's health (ceil, as the game shows it). */
export function syncHealthScores(
  state: {
    readonly games: GamesCommandState;
    readonly objectives: ReadonlyMap<string, Objective>;
  },
  playerName: string,
): void {
  for (const objective of state.objectives.values()) {
    if (objective.criterion !== 'health') continue;
    objective.scores.set(playerName, Math.ceil(state.games.healthOf(playerName)));
  }
}
