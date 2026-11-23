/**
 * The TypeScript generator of Rules (ADR 0082 D3): one script per book that needs one, written
 * against the Script API (`msm-runtime.d.ts`; 1.4 members from B370; 1.5's key and vehicle
 * events, HUD and `Vehicle` members from B421 for the B424 triggers, steps and values; 1.6's
 * `block.place`, `world.explosion` and `command` events and `Entity.vehicle`, `ride` and
 * `dismount` from B455 for the B458 triggers, steps and conditions; 1.7's `item.crafted`,
 * `item.picked_up`, `player.ate`, `player.slept`, `player.woke` and `player.advancement` events,
 * `World.gameRule` and `setGameRule`, `Player.stat`, `addStat` and `openDialog` from B533 for the
 * B534 triggers, steps, conditions and the command's arguments, ADR 0111) so the
 * content jar exporter transpiles it to ES5 like any script (ADR 0031 D2).
 *
 * The code is meant to be read: a header, small named helpers (only those used), one handler per
 * subject and trigger, one comment per rule with its sentence and a `// rule:<key>` marker at the
 * end of every line of a rule, so script problems and runtime errors map back to the rule. Each
 * rule runs inside `rule(key, ...)`, which logs an error with the book and key and lets the
 * other rules of the trigger run. Waits use `msm.schedule`; after a wait the rule stops when the
 * trigger's player or mob has died or left (`gone`). Every string from the book is written with
 * {@link literal}, so book text cannot break out of a string.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import {
  asArray,
  asObject,
  bool,
  type CounterDeclaration,
  conditionList,
  num,
  stepList,
  str,
} from '../book';
import {
  MAX_DROP_COUNT,
  MAX_EXPLOSION_POWER,
  MAX_PICK_CHOICES,
  MAX_PICK_WEIGHT,
  MAX_RADIUS,
  MAX_REPEAT,
  MAX_WEATHER_SECONDS,
  MAX_WORLD_BORDER,
  MAX_WORLD_BORDER_SECONDS,
  type TriggerEntry,
} from '../catalogue';
import {
  areaFunction,
  areaTag,
  fillForm,
  gameName,
  type Piece,
  type RulesFormName,
  SIGNAL_ARGUMENT,
  timerFunction,
  timerHolder,
  timersObjective,
} from './games';

/** A string literal that is safe in TypeScript and ES5 (line separators escaped). */
export function literal(text: string): string {
  return JSON.stringify(text)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A number literal (negative numbers in brackets). */
function numberLiteral(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe < 0 ? `(${String(safe)})` : String(safe);
}

/** Text for a one-line comment: no line breaks. */
export function commentText(text: string): string {
  return text.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

/** Literal command words. */
const words = (text: string): Piece => ({ text });
/** A TypeScript expression of command text. */
const code = (expression: string): Piece => ({ code: expression });

/** Pieces of command text as one TypeScript string expression (adjacent words joined). */
function piecesCode(pieces: readonly Piece[]): string {
  const parts: string[] = [];
  let text = '';
  for (const piece of pieces) {
    if ('text' in piece) {
      text += piece.text;
      continue;
    }
    if (text.length > 0 || parts.length === 0) parts.push(literal(text));
    text = '';
    parts.push(piece.code);
  }
  if (text.length > 0 || parts.length === 0) parts.push(literal(text));
  return parts.join(' + ');
}

const indent = (lines: readonly string[], depth = 1): string[] =>
  lines.map((line) => (line.length === 0 ? line : `${'  '.repeat(depth)}${line}`));

/** The helpers a script may use, in the order they are written. */
const HELPERS: readonly { name: string; uses?: readonly string[]; lines: readonly string[] }[] = [
  {
    name: 'rule',
    lines: [
      '/** Runs one rule; an error stops only that rule and is logged with its key. */',
      'const rule = (key: string, body: () => void): void => {',
      '  try {',
      '    body();',
      '  } catch (error) {',
      '    msm.log.error("Rules " + BOOK + ", rule " + key + ": " + String(error));',
      '  }',
      '};',
    ],
  },
  {
    name: 'gone',
    lines: [
      '/** Whether someone of the trigger has died or left since the rule started. */',
      'const gone = (entity: Entity | undefined): boolean => entity !== undefined && !entity.isAlive;',
    ],
  },
  {
    name: 'entities',
    lines: [
      '/** The entities of a list that are there. */',
      'const entities = (list: (Entity | undefined)[]): Entity[] =>',
      '  list.filter((entity): entity is Entity => entity !== undefined);',
    ],
  },
  {
    name: 'players',
    lines: [
      '/** The players of a list. */',
      'const players = (list: (Entity | undefined)[]): Player[] => {',
      '  const found: Player[] = [];',
      '  list.forEach((entity) => {',
      '    const player = entity === undefined ? undefined : entity.asPlayer();',
      '    if (player !== undefined) found.push(player);',
      '  });',
      '  return found;',
      '};',
    ],
  },
  {
    name: 'playersNear',
    lines: [
      '/** The players in the same dimension within `radius` blocks of `pos`. */',
      'const playersNear = (world: World, pos: Pos, radius: number): Player[] =>',
      '  msm.players().filter((player) => {',
      '    if (player.world.dimension !== world.dimension) return false;',
      '    const dx = player.pos.x - pos.x;',
      '    const dy = player.pos.y - pos.y;',
      '    const dz = player.pos.z - pos.z;',
      '    return dx * dx + dy * dy + dz * dz <= radius * radius;',
      '  });',
    ],
  },
  {
    name: 'withPos',
    lines: [
      '/** Runs `body` at a place when there is one. */',
      'const withPos = (pos: Pos | undefined, body: (pos: Pos) => void): void => {',
      '  if (pos !== undefined) body(pos);',
      '};',
    ],
  },
  {
    name: 'posOf',
    lines: [
      '/** Where an entity is, when there is one. */',
      'const posOf = (entity: Entity | undefined): Pos | undefined =>',
      '  entity === undefined ? undefined : entity.pos;',
    ],
  },
  {
    name: 'shift',
    lines: [
      '/** A place moved by some blocks. */',
      'const shift = (pos: Pos | undefined, x: number, y: number, z: number): Pos | undefined =>',
      '  pos === undefined ? undefined : pos.offset(x, y, z);',
    ],
  },
  {
    name: 'lookingAt',
    lines: [
      '/** Where an entity looks: the block or entity it looks at, else `distance` blocks ahead. */',
      'const lookingAt = (entity: Entity | undefined, distance: number): Pos | undefined => {',
      '  if (entity === undefined) return undefined;',
      '  const hit = entity.raycast(distance);',
      '  if (hit !== undefined) return hit.pos;',
      '  const look = entity.look;',
      '  return entity.pos.offset(look.x * distance, 1.62 + look.y * distance, look.z * distance);',
      '};',
    ],
  },
  {
    name: 'blockPos',
    lines: [
      '/** The corner of the block a place is in. */',
      'const blockPos = (pos: Pos): Pos =>',
      '  pos.offset(Math.floor(pos.x) - pos.x, Math.floor(pos.y) - pos.y, Math.floor(pos.z) - pos.z);',
    ],
  },
  {
    name: 'blockIs',
    uses: ['blockPos'],
    lines: [
      '/** Whether the block at a place is `id`. */',
      'const blockIs = (world: World, pos: Pos | undefined, id: string): boolean =>',
      '  pos !== undefined && world.getBlock(blockPos(pos)).split("[")[0] === id;',
    ],
  },
  {
    name: 'isType',
    lines: [
      '/** Whether an entity is of a type. */',
      'const isType = (entity: Entity | undefined, type: string): boolean =>',
      '  entity !== undefined && entity.type === type;',
    ],
  },
  {
    name: 'itemIn',
    lines: [
      '/** The item id in a hand, when there is one. */',
      'const itemIn = (entity: Entity | undefined, slot: "mainhand" | "offhand"): string | undefined => {',
      '  const item = entity === undefined ? undefined : entity.equipment(slot);',
      '  return item === undefined ? undefined : item.id;',
      '};',
    ],
  },
  {
    name: 'isNight',
    lines: [
      "/** Night is from 13000 (as `/time set night`) to 23000 (sunrise) in the day's ticks. */",
      'const isNight = (world: World): boolean => world.dayTime >= 13000 && world.dayTime < 23000;',
    ],
  },
  {
    name: 'random',
    lines: [
      '/** A random number from `min` to `max`. */',
      'const random = (min: number, max: number, whole: boolean): number => {',
      '  if (!whole) return min + Math.random() * (max - min);',
      '  const low = Math.ceil(Math.min(min, max));',
      '  const high = Math.floor(Math.max(min, max));',
      '  return low + Math.floor(Math.random() * (high - low + 1));',
      '};',
    ],
  },
  {
    name: 'divide',
    lines: [
      '/** `a` divided by `b`; dividing by zero gives 0. */',
      'const divide = (a: number, b: number): number => (b === 0 ? 0 : a / b);',
    ],
  },
  {
    name: 'whole',
    lines: [
      '/** A whole number of at least `min`. */',
      'const whole = (value: number, min: number): number => Math.max(min, Math.floor(value));',
    ],
  },
  {
    name: 'text',
    lines: [
      '/** A number as text, with at most two decimals. */',
      'const text = (value: number): string => String(Math.round(value * 100) / 100);',
    ],
  },
  {
    name: 'counters',
    lines: [
      '/** Counters are saved in the data stores under this prefix (ADR 0062). */',
      'const COUNTER = "rules.counter.";',
      '/** The data store of an entity, when there is one. */',
      'const dataOf = (entity: Entity | undefined): DataStore | undefined =>',
      '  entity === undefined ? undefined : entity.data;',
      "/** A counter's value, or its start value when it was never set. */",
      'const counterValue = (store: DataStore | undefined, name: string, start: number): number => {',
      '  const value = store === undefined ? undefined : store.get(COUNTER + name);',
      '  return typeof value === "number" ? value : start;',
      '};',
      '/** Sets a counter. */',
      'const setCounter = (store: DataStore | undefined, name: string, value: number): void => {',
      '  if (store !== undefined) store.set(COUNTER + name, value);',
      '};',
    ],
  },
  {
    name: 'riddenBy',
    lines: [
      '/** The project vehicle an entity rides, when it rides one (Script API 1.5). */',
      'const riddenBy = (entity: Entity | undefined): Vehicle | undefined => {',
      '  const ridden = entity === undefined ? undefined : entity.vehicle;',
      '  return ridden === undefined ? undefined : ridden.asVehicle();',
      '};',
    ],
  },
  {
    name: 'vehicleFuel',
    lines: [
      "/** Seconds of driving left in a vehicle's fuel; 0 without a vehicle. */",
      'const vehicleFuel = (vehicle: Vehicle | undefined): number =>',
      '  vehicle === undefined ? 0 : vehicle.fuel / 20;',
    ],
  },
  {
    name: 'vehicleDamage',
    lines: [
      '/** The damage a vehicle has taken; 0 without a vehicle. */',
      'const vehicleDamage = (vehicle: Vehicle | undefined): number =>',
      '  vehicle === undefined ? 0 : vehicle.damageTaken;',
    ],
  },
  {
    name: 'vehicleAmmo',
    lines: [
      "/** The rounds loaded in a vehicle's weapon; 0 without a vehicle or such a weapon. */",
      'const vehicleAmmo = (vehicle: Vehicle | undefined, weapon: string | number): number => {',
      '  if (vehicle === undefined) return 0;',
      '  try {',
      '    return vehicle.ammo(weapon);',
      '  } catch (error) {',
      '    return 0;',
      '  }',
      '};',
    ],
  },
  {
    name: 'rideChange',
    lines: [
      '/** What each player rode at the last look, by trigger and player (Script API 1.6). */',
      'const ridingBefore: { [key: string]: Entity | undefined } = {};',
      '/** What a player got on (`on`) or off since the last look for `slot`, else undefined. */',
      'const rideChange = (slot: string, player: Player, on: boolean): Entity | undefined => {',
      '  const key = slot + " " + player.uuid;',
      '  const before = ridingBefore[key];',
      '  const now = player.vehicle;',
      '  if (now === undefined) delete ridingBefore[key];',
      '  else ridingBefore[key] = now;',
      '  const was = before === undefined ? "" : before.uuid;',
      '  const is = now === undefined ? "" : now.uuid;',
      '  if (was === is) return undefined;',
      '  return on ? now : before;',
      '};',
    ],
  },
  {
    name: 'riding',
    lines: [
      '/** Whether an entity rides something, or something of a type (Script API 1.6). */',
      'const riding = (entity: Entity | undefined, type: string | undefined): boolean => {',
      '  const ridden = entity === undefined ? undefined : entity.vehicle;',
      '  return ridden !== undefined && (type === undefined || ridden.type === type);',
      '};',
    ],
  },
  {
    name: 'entityFacing',
    lines: [
      '/** The way an entity faces, north, east, south or west, from where it looks; "" without one. */',
      'const entityFacing = (entity: Entity | undefined): string => {',
      '  if (entity === undefined) return "";',
      '  const look = entity.look;',
      '  if (Math.abs(look.x) > Math.abs(look.z)) return look.x > 0 ? "east" : "west";',
      '  return look.z > 0 ? "south" : "north";',
      '};',
    ],
  },
  {
    name: 'blockFacing',
    uses: ['blockPos'],
    lines: [
      '/**',
      ' * The way the block at a place faces: its `facing`, else its `axis` (x is east, y up and',
      ' * z south); "" when it has neither.',
      ' */',
      'const blockFacing = (world: World, pos: Pos | undefined): string => {',
      '  if (pos === undefined) return "";',
      '  const state = world.getBlock(blockPos(pos));',
      '  const facing = /[[,]facing=([a-z]+)/.exec(state);',
      '  if (facing !== null) return String(facing[1]);',
      '  const axis = /[[,]axis=([xyz])/.exec(state);',
      '  if (axis === null) return "";',
      '  return axis[1] === "x" ? "east" : axis[1] === "y" ? "up" : "south";',
      '};',
    ],
  },
  {
    name: 'inFront',
    uses: ['blockFacing'],
    lines: [
      '/** One block along each way a block can face. */',
      'const FACING_STEPS: { [facing: string]: [number, number, number] } = {',
      '  north: [0, 0, -1],',
      '  east: [1, 0, 0],',
      '  south: [0, 0, 1],',
      '  west: [-1, 0, 0],',
      '  up: [0, 1, 0],',
      '  down: [0, -1, 0],',
      '};',
      '/** One block along the facing of the block at a place; undefined when it faces no way. */',
      'const inFront = (world: World, pos: Pos): Pos | undefined => {',
      '  const step = FACING_STEPS[blockFacing(world, pos)];',
      '  return step === undefined ? undefined : pos.offset(step[0], step[1], step[2]);',
      '};',
    ],
  },
  {
    name: 'commandArgs',
    lines: [
      "/** The values typed for the command's arguments, by name (ADR 0111 D1). */",
      'const commandArgs = (e: object): { [name: string]: unknown } => {',
      '  const args = (e as { args?: unknown }).args;',
      '  return typeof args === "object" && args !== null ? (args as { [name: string]: unknown }) : {};',
      '};',
    ],
  },
  {
    name: 'coord',
    lines: [
      '/** A coordinate as command text: at most two decimals, never an exponent. */',
      'const coord = (value: number): string => String(Math.round(value * 100) / 100);',
    ],
  },
  {
    name: 'blockCoord',
    lines: [
      '/** The block coordinate of a position part as command text. */',
      'const blockCoord = (value: number): string => String(Math.floor(value));',
    ],
  },
  {
    name: 'ran',
    lines: [
      "/** Runs a command as and at an entity; the command's result, or 0 without the entity. */",
      'const ran = (entity: Entity | undefined, command: string): number =>',
      '  entity === undefined ? 0 : entity.runCommand(command);',
    ],
  },
  {
    name: 'pickWeighted',
    lines: [
      '/** The index of one choice, picked at random by weight; the last when every weight is 0. */',
      'const pickWeighted = (weights: number[]): number => {',
      '  let total = 0;',
      '  weights.forEach((weight) => {',
      '    total += weight;',
      '  });',
      '  let roll = Math.random() * total;',
      '  for (let index = 0; index < weights.length; index += 1) {',
      '    roll -= weights[index];',
      '    if (roll < 0) return index;',
      '  }',
      '  return weights.length - 1;',
      '};',
    ],
  },
  {
    name: 'argNumber',
    lines: [
      '/** A number typed for an argument, or one part of a position; 0 when it was left out. */',
      'const argNumber = (args: { [name: string]: unknown }, name: string, axis: number): number => {',
      '  const value = args[name];',
      '  if (typeof value === "number") return value;',
      '  if (Array.isArray(value) && typeof value[axis] === "number") return value[axis];',
      '  return 0;',
      '};',
    ],
  },
  {
    name: 'argWords',
    lines: [
      '/** What was typed for an argument in words: a player by name, a position as "x y z". */',
      'const argWords = (args: { [name: string]: unknown }, name: string, player: boolean): string => {',
      '  const value = args[name];',
      '  if (value === undefined || value === null) return "";',
      '  if (Array.isArray(value)) return value.join(" ");',
      '  if (player && typeof value === "string") {',
      '    const found = msm.players().filter((someone) => someone.uuid === value)[0];',
      '    if (found !== undefined) return found.name;',
      '  }',
      '  return String(value);',
      '};',
    ],
  },
  {
    name: 'gameRuleNumber',
    lines: [
      "/** A game rule's value as a number: true is 1, false and a rule the world lacks 0. */",
      'const gameRuleNumber = (world: World, id: string): number => {',
      '  const value: unknown = world.gameRule(id);',
      '  return typeof value === "number" ? value : value === true ? 1 : 0;',
      '};',
    ],
  },
  {
    name: 'launch',
    lines: [
      '/** Pushes an entity as the `launch` action does. */',
      'const launch = (entity: Entity, direction: "look" | "horizontal" | "up", strength: number, up: number): void => {',
      '  const look = entity.look;',
      '  if (direction === "up") {',
      '    entity.setVelocity(0, strength + up, 0);',
      '  } else if (direction === "horizontal") {',
      '    const length = Math.sqrt(look.x * look.x + look.z * look.z);',
      '    const x = length === 0 ? 0 : look.x / length;',
      '    const z = length === 0 ? 0 : look.z / length;',
      '    entity.setVelocity(x * strength, up, z * strength);',
      '  } else {',
      '    entity.setVelocity(look.x * strength, look.y * strength + up, look.z * strength);',
      '  }',
      '};',
    ],
  },
  {
    name: 'showBossBar',
    lines: [
      '/** Shows, updates or hides a boss bar of this script. */',
      'const showBossBar = (',
      '  id: string,',
      '  title: string | undefined,',
      '  progress: number | undefined,',
      '  color: BossBarColor | undefined,',
      '  visible: boolean,',
      '  viewers: Player[],',
      '): void => {',
      '  const found = msm.bossBars.get(id);',
      '  if (!visible) {',
      '    if (found !== undefined) found.remove();',
      '    return;',
      '  }',
      '  const bar = found !== undefined ? found : msm.bossBars.create(id, { title: title !== undefined ? title : "" });',
      '  if (title !== undefined) bar.setTitle(title);',
      '  if (color !== undefined) bar.setColor(color);',
      '  if (progress !== undefined) bar.setProgress(Math.max(0, Math.min(1, progress)));',
      '  viewers.forEach((viewer) => bar.addPlayer(viewer));',
      '};',
    ],
  },
];

const COMPARE: Record<string, string> = {
  less_than: '<',
  at_most: '<=',
  equal_to: '===',
  at_least: '>=',
  more_than: '>',
};

const NEEDS_PLAYER = new Set([
  'give_item',
  'take_item',
  'feed',
  'give_experience',
  'set_game_mode',
  'show_message',
  'show_title',
  'show_action_bar',
  'show_hud',
  'hide_hud',
  'set_hud',
  'open_dialog',
  'add_to_stat',
  'give_loot',
  'set_spawn_point',
]);

/** The argument types read as one part of a position (ADR 0111 D1). */
const POSITION_ARGUMENTS = new Set(['position', 'block_position']);
const AXES: Record<string, number> = { x: 0, y: 1, z: 2 };

/** Where a step list is: which actor variables exist and whether `player` is a loop's player. */
interface Env {
  readonly actors: ReadonlySet<string>;
  readonly here: boolean;
  readonly playerInLoop: boolean;
}

/** What Rules reads of a project timer (ADR 0113 D6). */
export interface TimerFacts {
  /** Its length in seconds. */
  readonly seconds: number;
  /** Whether it counts up (its holder then holds the seconds gone). */
  readonly up: boolean;
}

/** What the script of a book knows of the games around it (ADR 0115). */
export interface GamesContext {
  /** The template of a command form on the target, or undefined. */
  readonly form: (name: RulesFormName) => string | undefined;
  /** A project timer's length and way of counting, or undefined when there is no such timer. */
  readonly timer: (id: string) => TimerFacts | undefined;
  /** Whether a project area has `reset` (else only its `clear` function exists). */
  readonly areaHasReset: (id: string) => boolean;
}

/** The bridge of a signal trigger (ADR 0115 D5): the command's id and the word it is sent. */
export interface SignalListen {
  readonly commandId: string;
  readonly word: string;
}

const NO_GAMES: GamesContext = {
  form: () => undefined,
  timer: () => undefined,
  areaHasReset: () => false,
};

/** One rule to write into a handler. */
export interface ScriptRule {
  readonly rule: JsonObject;
  readonly key: string;
  readonly sentence: string;
}

/** Builds the script of one book. */
export class ScriptBuilder {
  private readonly used = new Set<string>();
  private readonly handlers: string[][] = [];
  private names = 0;
  private argReads = 0;
  private readonly bookId: string;
  private readonly counters: ReadonlyMap<string, number>;
  /** The forms and areas of the project (ADR 0115). */
  readonly games: GamesContext;

  constructor(
    bookId: string,
    counters: readonly CounterDeclaration[],
    games: GamesContext = NO_GAMES,
  ) {
    this.bookId = bookId;
    this.games = games;
    this.counters = new Map(
      counters.map((counter) => [`${counter.scope}:${counter.name}`, counter.start]),
    );
  }

  /** Whether any handler was added. */
  get empty(): boolean {
    return this.handlers.length === 0;
  }

  /** The handler of a definition trigger's `run_script` bridge. */
  addDefinitionHandler(
    handler: string,
    trigger: TriggerEntry,
    title: string,
    rules: readonly ScriptRule[],
    commandArguments?: ReadonlyMap<string, string>,
  ): void {
    const body = this.handlerRules(trigger, rules, commandArguments);
    const head = [
      'const world = e.world;',
      'const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;',
    ];
    if (trigger.actors.includes('player'))
      head.push('const player: Player | undefined = e.player;');
    if (trigger.actors.includes('mob')) {
      head.push(
        `const mob: Entity | undefined = ${trigger.group === 'effects' ? 'e.other' : 'e.entity'};`,
      );
    }
    if (trigger.actors.includes('other')) head.push('const other: Entity | undefined = e.other;');
    if (trigger.subject === 'vehicle') {
      head.push(
        'const vehicle: Vehicle | undefined = e.entity !== undefined ? e.entity.asVehicle() : undefined;',
      );
    }
    if (body.args) head.push(`const args = ${this.use('commandArgs')}(e);`);
    this.handlers.push([
      `// ${commentText(title)}`,
      `msm.actions.define(${literal(handler)}, (e) => {`,
      ...indent(head),
      ...indent(body.lines),
      '});',
    ]);
  }

  /** The rules of one handler, and whether they read the command's arguments. */
  private handlerRules(
    trigger: TriggerEntry,
    rules: readonly ScriptRule[],
    commandArguments: ReadonlyMap<string, string> | undefined,
  ): { lines: string[]; args: boolean } {
    const before = this.argReads;
    const lines = this.rules(trigger, rules, commandArguments ?? new Map());
    return { lines, args: this.argReads > before };
  }

  /** Counts reads of the command's arguments, so a handler declares `args` only when used. */
  noteArgRead(): void {
    this.argReads += 1;
  }

  /** The handler of a script-only trigger (`msm.events.on`). */
  addEventHandler(
    trigger: TriggerEntry,
    subject: string | undefined,
    options: JsonObject,
    title: string,
    rules: readonly ScriptRule[],
    commandArguments?: ReadonlyMap<string, string>,
    signal?: SignalListen,
  ): void {
    const body = this.handlerRules(trigger, rules, commandArguments);
    const head: string[] = [];
    let extra = '';
    const interval = Math.max(1, Math.round((num(options, 'interval_seconds') ?? 1) * 20));
    switch (trigger.scriptEvent) {
      case 'block.interact':
      case 'block.break':
        if (trigger.scriptEvent === 'block.interact') head.push('if (e.hand !== "main") return;');
        if (subject !== undefined) head.push(`if (e.block.id !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.block.pos.offset(0.5, 0.5, 0.5);',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'item.use':
        if (subject !== undefined) head.push(`if (e.item.id !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'entity.hurt':
      case 'entity.death':
        head.push('if (e.entity.isPlayer) return;');
        if (subject !== undefined) head.push(`if (e.entity.type !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.entity.pos;',
          'const mob: Entity | undefined = e.entity;',
          'const other: Entity | undefined = e.attacker;',
          'const player: Player | undefined = e.attacker !== undefined ? e.attacker.asPlayer() : undefined;',
        );
        break;
      case 'entity.interact':
        head.push('if (e.hand !== "main" || e.entity.isPlayer) return;');
        if (subject !== undefined) head.push(`if (e.entity.type !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.entity.pos;',
          'const mob: Entity | undefined = e.entity;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'player.chat': {
        const contains = str(options, 'message_contains');
        if (contains !== undefined) {
          head.push(
            `if (e.message.toLowerCase().indexOf(${literal(contains.toLowerCase())}) < 0) return;`,
          );
        }
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      }
      case 'key.pressed':
      case 'key.released':
        if (subject !== undefined) head.push(`if (e.key !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'vehicle.mounted':
      case 'vehicle.dismounted':
      case 'vehicle.fired':
      case 'vehicle.destroyed':
        if (subject !== undefined) head.push(`if (e.vehicle.type !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.vehicle.pos;',
          'const vehicle: Vehicle | undefined = e.vehicle;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'item.crafted':
      case 'item.picked_up':
      case 'player.ate':
        // Script API 1.7 (ADR 0111 D3): the player and the item crafted, picked up or eaten.
        if (subject !== undefined) head.push(`if (e.item.id !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'player.advancement':
        if (subject !== undefined) {
          head.push(`if (e.advancement !== ${literal(subject)}) return;`);
        }
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'block.place':
        if (subject !== undefined) head.push(`if (e.block !== ${literal(subject)}) return;`);
        head.push(
          'const world = e.world;',
          'const here = e.pos.offset(0.5, 0.5, 0.5);',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'world.explosion':
        head.push(
          'const world = e.world;',
          'const here = e.pos;',
          'const other: Entity | undefined = e.source;',
        );
        break;
      case 'command':
        if (signal !== undefined) {
          // The function bridge (ADR 0115 D5): the signal command sent this subject's word.
          head.push(
            `if (e.id !== ${literal(signal.commandId)} || ${this.use('commandArgs')}(e)[${literal(SIGNAL_ARGUMENT)}] !== ${literal(signal.word)}) return;`,
            'const world = e.world;',
          );
          if (trigger.actors.includes('player')) {
            head.push(
              'const source = e.source;',
              'const player: Player | undefined = source !== undefined ? source.asPlayer() : undefined;',
              'if (player === undefined) return;',
              'const here = player.pos;',
            );
          }
          break;
        }
        // A command that runs a function (B458): no place without a source entity.
        if (subject !== undefined) head.push(`if (e.id !== ${literal(subject)}) return;`);
        head.push(
          'const source = e.source;',
          'if (source === undefined) return;',
          'const world = e.world;',
          'const here = source.pos;',
          'const player: Player | undefined = source.asPlayer();',
        );
        if (body.args) head.push(`const args = ${this.use('commandArgs')}(e);`);
        break;
      case 'player.tick':
        extra = `, { interval: ${Math.max(5, interval)} }`;
        if (trigger.id === 'player_mounted' || trigger.id === 'player_dismounted') {
          // Getting on or off: a look at the player's vehicle every quarter of a second.
          extra = ', { interval: 5 }';
          head.push(
            `const other: Entity | undefined = ${this.use('rideChange')}(${literal(trigger.id)}, e.player, ${trigger.id === 'player_mounted'});`,
            'if (other === undefined) return;',
            'const world = e.world;',
            'const here = e.player.pos;',
            'const player: Player | undefined = e.player;',
          );
          break;
        }
        if (trigger.subject === 'vehicle') {
          // Every N seconds while driven: the driver's tick, in a vehicle of the subject's type.
          head.push(
            `const driven = ${this.use('riddenBy')}(e.player);`,
            `if (driven === undefined || driven.type !== ${literal(subject ?? '')}) return;`,
            'const driver = driven.driver;',
            'if (driver === undefined || driver.uuid !== e.player.uuid) return;',
            'const world = e.world;',
            'const here = driven.pos;',
            'const vehicle: Vehicle | undefined = driven;',
            'const player: Player | undefined = e.player;',
          );
          break;
        }
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
        break;
      case 'server.tick':
        head.push(`if (e.tick % ${interval} !== 0) return;`, 'const world = e.world;');
        break;
      case 'server.started':
        head.push('const world = e.world;');
        break;
      default:
        head.push(
          'const world = e.world;',
          'const here = e.player.pos;',
          'const player: Player | undefined = e.player;',
        );
    }
    this.handlers.push([
      `// ${commentText(title)}`,
      `msm.events.on(${literal(trigger.scriptEvent ?? '')}, (e) => {`,
      ...indent(head),
      ...indent(body.lines),
      `}${extra});`,
    ]);
  }

  /** The whole script, or null when no handler was added. */
  lines(): string[] | null {
    if (this.empty) return null;
    this.use('rule');
    const helpers: string[] = [];
    const needed = new Set(this.used);
    // Dependencies of dependencies too (`inFront` uses `blockFacing`, which uses `blockPos`).
    for (let size = -1; size !== needed.size; ) {
      size = needed.size;
      for (const helper of HELPERS) {
        if (needed.has(helper.name))
          for (const dependency of helper.uses ?? []) needed.add(dependency);
      }
    }
    for (const helper of HELPERS) {
      if (needed.has(helper.name)) helpers.push(...helper.lines, '');
    }
    return [
      `// Made by Rules from ${commentText(this.bookId)}; edit the rules, not this file.`,
      'import { msm } from "msm:runtime";',
      '',
      `const BOOK = ${literal(this.bookId)};`,
      '',
      ...helpers,
      ...this.handlers.flatMap((handler, index) => (index === 0 ? handler : ['', ...handler])),
    ];
  }

  private use(name: string): string {
    this.used.add(name);
    return name;
  }

  private fresh(base: string): string {
    this.names += 1;
    return `${base}${this.names}`;
  }

  private rules(
    trigger: TriggerEntry,
    rules: readonly ScriptRule[],
    commandArguments: ReadonlyMap<string, string>,
  ): string[] {
    const env: Env = {
      actors: new Set(trigger.actors),
      here: trigger.hasPlace,
      playerInLoop: false,
    };
    const out: string[] = [];
    for (const { rule, key, sentence } of rules) {
      this.names = 0;
      const writer = new RuleWriter(this, trigger, (name) => this.use(name), commandArguments);
      const body: string[] = [];
      const onlyIf = asObject(rule.only_if);
      if (onlyIf !== undefined && conditionList(onlyIf).conditions.length > 0) {
        body.push(`if (!(${writer.conditions(onlyIf, env)})) return;`);
      }
      body.push(...writer.steps(rule, 'do', env, []));
      const marker = ` // rule:${key}`;
      out.push(
        `// ${commentText(sentence)}`,
        ...[`rule(${literal(key)}, () => {`, ...indent(body), '});'].map((line) => line + marker),
      );
    }
    return out;
  }

  /** The start value of a declared counter, else 0. */
  counterStart(scope: string, name: string): number {
    return this.counters.get(`${scope}:${name}`) ?? 0;
  }

  /** A fresh name for a local function. */
  freshName(base: string): string {
    return this.fresh(base);
  }
}

/** Writes the code of one rule. */
class RuleWriter {
  private readonly builder: ScriptBuilder;
  private readonly trigger: TriggerEntry;
  private readonly use: (helper: string) => string;
  private readonly commandArguments: ReadonlyMap<string, string>;

  constructor(
    builder: ScriptBuilder,
    trigger: TriggerEntry,
    use: (helper: string) => string,
    commandArguments: ReadonlyMap<string, string>,
  ) {
    this.builder = builder;
    this.trigger = trigger;
    this.use = use;
    this.commandArguments = commandArguments;
  }

  /** "What the player typed" for an argument, as a number or, in text, as words (ADR 0111 D1). */
  private commandArgument(object: JsonObject | undefined, inText: boolean): string {
    const name = str(object, 'name') ?? '';
    const type = this.commandArguments.get(name) ?? '';
    this.builder.noteArgRead();
    const axis = str(object, 'axis');
    if (inText && (axis === undefined || !POSITION_ARGUMENTS.has(type))) {
      return `${this.use('argWords')}(args, ${literal(name)}, ${type === 'player'})`;
    }
    const number = `${this.use('argNumber')}(args, ${literal(name)}, ${AXES[axis ?? 'x'] ?? 0})`;
    return inText ? `${this.use('text')}(${number})` : number;
  }

  // Games (ADR 0115)

  /** A command of a form as a TypeScript string expression; `""` when the target lacks it. */
  private command(
    name: RulesFormName,
    values: Readonly<Record<string, Piece | undefined>>,
  ): string {
    const form = this.builder.games.form(name);
    const pieces = form === undefined ? undefined : fillForm(form, values);
    return pieces === undefined ? '""' : piecesCode(pieces);
  }

  /** `scoreboard players get` of a timer's holder, run as the server: its time or `.on`. */
  private timerGet(timer: string, on: boolean): string {
    return `world.runCommand(${this.command('score_get', {
      holder: words(timerHolder(timer, on)),
      objective: words(timersObjective(timer)),
    })})`;
  }

  /** The seconds left on a timer: its holder counting down, its length less it counting up. */
  private timerLeft(timer: string): string {
    const read = this.timerGet(timer, false);
    const facts = this.builder.games.timer(timer);
    return facts?.up === true ? `Math.max(0, ${facts.seconds} - ${read})` : read;
  }

  /** `scoreboard players get @s <objective>`, run as the one it reads. */
  private scoreGet(objective: string | undefined): string {
    return this.command('score_get', {
      holder: words('@s'),
      objective: words(gameName(objective ?? '')),
    });
  }

  /** One someone of a "who": the player, the mob or the other one (default the player). */
  private one(value: Json | undefined): string {
    return value === 'mob' || value === 'other' ? value : 'player';
  }

  /** A whole number as command text: a literal rounded, a reading rounded at run time. */
  private integerText(value: Json | undefined, env: Env, min?: number): Piece {
    if (typeof value === 'number') {
      const whole = Math.round(value);
      return words(String(min === undefined ? whole : Math.max(min, whole)));
    }
    const expression = `Math.round(${this.number(value, env)})`;
    return code(`String(${min === undefined ? expression : `Math.max(${min}, ${expression})`})`);
  }

  /** The steps of "Pick one at random": an `if` chain on a weighted pick of `do`'s steps. */
  private pick(step: JsonObject, branch: (choice: JsonObject) => string[]): string[] {
    const choices = stepList(step, 'do')
      .slice(0, MAX_PICK_CHOICES)
      .map(({ step: choice }) => choice);
    if (choices.length === 0) return [];
    const weights = asArray(step.weights);
    const weightCode = choices.map((_, index) => {
      const weight = weights[index];
      return String(
        typeof weight === 'number' ? Math.min(MAX_PICK_WEIGHT, Math.max(0, Math.floor(weight))) : 1,
      );
    });
    const pick = this.builder.freshName('pick');
    const out = [`const ${pick} = ${this.use('pickWeighted')}([${weightCode.join(', ')}]);`];
    choices.forEach((choice, index) => {
      out.push(
        `${index === 0 ? 'if' : '} else if'} (${pick} === ${index}) {`,
        ...indent(branch(choice)),
      );
    });
    out.push('}');
    return out;
  }

  // Values

  number(value: Json | undefined, env: Env, fallback = 0): string {
    if (value === undefined) return numberLiteral(fallback);
    if (typeof value === 'number') return numberLiteral(value);
    const object = asObject(value);
    switch (str(object, 'value')) {
      case 'random':
        return `${this.use('random')}(${numberLiteral(num(object, 'min') ?? 0)}, ${numberLiteral(num(object, 'max') ?? 0)}, ${bool(object, 'whole') !== false})`;
      case 'counter':
        return this.counterRead(object ?? {});
      case 'player_health':
        return this.playerReading('health', env);
      case 'player_food':
        return this.playerReading('food', env);
      case 'player_level':
        return this.playerReading('xpLevel', env);
      case 'player_position':
        return this.playerReading(`pos.${str(object, 'axis') ?? 'x'}`, env);
      case 'player_count':
        return 'msm.players().length';
      case 'time_of_day':
        return 'world.dayTime';
      case 'vehicle_fuel':
        return `${this.use('vehicleFuel')}(${this.vehicle()})`;
      case 'vehicle_damage':
        return `${this.use('vehicleDamage')}(${this.vehicle()})`;
      case 'vehicle_ammo': {
        const weapon = str(object, 'weapon');
        return `${this.use('vehicleAmmo')}(${this.vehicle()}, ${weapon === undefined ? '0' : literal(weapon)})`;
      }
      case 'facing':
        // A reading in words: the checker keeps it out of numbers (B458).
        return '0';
      case 'command_argument':
        return this.commandArgument(object, false);
      case 'score':
        return `${this.use('ran')}(${this.one(object?.who)}, ${this.scoreGet(str(object, 'objective'))})`;
      case 'timer_left':
        return this.timerLeft(str(object, 'timer') ?? '');
      case 'team_size':
        return `world.runCommand(${this.command('if_entity', { entities: words(`@a[team=${gameName(str(object, 'team') ?? '')}]`) })})`;
      case 'math': {
        const a = this.number(object?.a, env);
        const b = this.number(object?.b, env);
        const op = str(object, 'op') ?? '+';
        if (op === '/') return `${this.use('divide')}(${a}, ${b})`;
        return `(${a} ${op === '-' || op === '*' ? op : '+'} ${b})`;
      }
      default:
        return '0';
    }
  }

  /** The vehicle of a vehicle trigger, else the one the player rides. */
  private vehicle(): string {
    return this.trigger.subject === 'vehicle' ? 'vehicle' : `${this.use('riddenBy')}(player)`;
  }

  private playerReading(field: string, env: Env): string {
    return env.playerInLoop ? `player.${field}` : `(player !== undefined ? player.${field} : 0)`;
  }

  private store(scope: string): string {
    this.use('counters');
    if (scope === 'player' || scope === 'mob') return `dataOf(${scope})`;
    return 'msm.storage';
  }

  private counterRead(object: JsonObject): string {
    const scope = str(object, 'scope') ?? 'world';
    const name = str(object, 'counter') ?? '';
    return `counterValue(${this.store(scope)}, ${literal(name)}, ${numberLiteral(this.builder.counterStart(scope, name))})`;
  }

  /** A whole-number expression of at least `min`. */
  private whole(value: Json | undefined, env: Env, min: number, max?: number): string {
    if (value === undefined) return String(min);
    if (typeof value === 'number') {
      const whole = Math.max(min, Math.floor(value));
      return String(max === undefined ? whole : Math.min(max, whole));
    }
    const expression = `${this.use('whole')}(${this.number(value, env)}, ${min})`;
    return max === undefined ? expression : `Math.min(${max}, ${expression})`;
  }

  text(value: Json | undefined, env: Env): string {
    const pieces = asArray(value).map((piece) => {
      if (typeof piece === 'string') return literal(piece);
      const object = asObject(piece);
      if (str(object, 'value') === 'facing') return this.facing(object?.of);
      if (str(object, 'value') === 'command_argument') return this.commandArgument(object, true);
      return `${this.use('text')}(${this.number(piece, env)})`;
    });
    return pieces.length === 0 ? '""' : pieces.join(' + ');
  }

  /** The way the block here, the player, the mob or the other one faces, as a string. */
  private facing(of: Json | undefined): string {
    if (of === 'player' || of === 'mob' || of === 'other') {
      return `${this.use('entityFacing')}(${of})`;
    }
    return `${this.use('blockFacing')}(world, here)`;
  }

  // Places and who

  place(value: Json | undefined): string {
    const where = value ?? 'here';
    if (where === 'here') return 'here';
    if (where === 'above_here') return 'here.offset(0, 1, 0)';
    if (where === 'in_front_of_here') return `${this.use('inFront')}(world, here)`;
    if (where === 'player') return `${this.use('posOf')}(player)`;
    if (where === 'mob') return `${this.use('posOf')}(mob)`;
    const object = asObject(where);
    if (str(object, 'place') === 'player_looking') {
      return `${this.use('lookingAt')}(player, ${numberLiteral(num(object, 'distance') ?? 5)})`;
    }
    if (str(object, 'place') === 'offset') {
      const offset = asArray(object?.offset).map((part) =>
        numberLiteral(typeof part === 'number' ? part : 0),
      );
      while (offset.length < 3) offset.push('0');
      return `${this.use('shift')}(${this.place(object?.from ?? 'here')}, ${offset.slice(0, 3).join(', ')})`;
    }
    return 'undefined';
  }

  /** The entities or players a "who" means, as an array expression. */
  who(value: Json | undefined, fallback: string, needPlayer: boolean): string {
    const who = value ?? fallback;
    const list = needPlayer ? this.use('players') : this.use('entities');
    if (who === 'player' || who === 'mob' || who === 'other') return `${list}([${who}])`;
    if (who === 'every_player') return 'msm.players()';
    const object = asObject(who);
    if (str(object, 'who') === 'players_nearby') {
      const radius = Math.min(MAX_RADIUS, Math.max(1, num(object, 'radius') ?? 1));
      return `${this.use('playersNear')}(world, here, ${radius})`;
    }
    return '[]';
  }

  // Conditions

  conditions(owner: JsonObject, env: Env): string {
    const { match, conditions } = conditionList(owner);
    if (conditions.length === 0) return 'true';
    const parts = conditions.map(({ condition }) => this.condition(condition, env));
    return parts.length === 1
      ? (parts[0] ?? 'true')
      : parts.map((part) => `(${part})`).join(match === 'any' ? ' || ' : ' && ');
  }

  private condition(condition: JsonObject, env: Env): string {
    const expression = this.conditionCore(condition, env);
    return bool(condition, 'not') === true ? `!(${expression})` : expression;
  }

  private hasPlayer(field: string, env: Env): string {
    return env.playerInLoop ? `player.${field}` : `player !== undefined && player.${field}`;
  }

  private conditionCore(condition: JsonObject, env: Env): string {
    const compare = COMPARE[str(condition, 'compare') ?? 'equal_to'] ?? '===';
    switch (str(condition, 'condition')) {
      case 'player_sneaking':
        return this.hasPlayer('isSneaking', env);
      case 'player_in_creative':
        return this.hasPlayer('isCreative', env);
      case 'player_holding': {
        const item = literal(str(condition, 'item') ?? '');
        const itemIn = this.use('itemIn');
        const hand = str(condition, 'hand') ?? 'main';
        if (hand === 'either') {
          return `${itemIn}(player, "mainhand") === ${item} || ${itemIn}(player, "offhand") === ${item}`;
        }
        return `${itemIn}(player, ${hand === 'off' ? '"offhand"' : '"mainhand"'}) === ${item}`;
      }
      case 'player_has_item': {
        const item = literal(str(condition, 'item') ?? '');
        return this.hasPlayer(
          `inventory.count(${item}) >= ${this.number(condition.count, env, 1)}`,
          env,
        );
      }
      case 'player_health':
        return this.hasPlayer(`health ${compare} ${this.number(condition.number, env)}`, env);
      case 'player_food':
        return this.hasPlayer(`food ${compare} ${this.number(condition.number, env)}`, env);
      case 'player_level':
        return this.hasPlayer(`xpLevel ${compare} ${this.number(condition.number, env)}`, env);
      case 'chance':
        return `Math.random() * 100 < ${this.number(condition.percent, env)}`;
      case 'is_day':
        return `!${this.use('isNight')}(world)`;
      case 'is_night':
        return `${this.use('isNight')}(world)`;
      case 'is_raining':
        return 'world.isRaining';
      case 'is_thundering':
        return 'world.isThundering';
      case 'block_is':
        return `${this.use('blockIs')}(world, ${this.place(condition.where)}, ${literal(str(condition, 'block') ?? '')})`;
      case 'mob_is': {
        const who = str(condition, 'who') ?? 'other';
        return `${this.use('isType')}(${who === 'player' || who === 'mob' ? who : 'other'}, ${literal(str(condition, 'mob') ?? '')})`;
      }
      case 'is_riding': {
        const who = str(condition, 'who') ?? 'player';
        const mount = str(condition, 'mount');
        return `${this.use('riding')}(${who === 'mob' || who === 'other' ? who : 'player'}, ${mount === undefined ? 'undefined' : literal(mount)})`;
      }
      case 'is_facing':
        return `${this.facing(condition.of)} === ${literal(str(condition, 'direction') ?? 'north')}`;
      case 'caused_by': {
        const cause = str(condition, 'cause') ?? 'block';
        return cause === 'block'
          ? 'other === undefined'
          : `${this.use('isType')}(other, ${literal(cause)})`;
      }
      case 'dimension_is':
        return `world.dimension === ${literal(str(condition, 'dimension') ?? '')}`;
      case 'counter':
        return `${this.counterRead(condition)} ${compare} ${this.number(condition.number, env)}`;
      case 'game_rule': {
        const id = literal(str(condition, 'game_rule') ?? '');
        const value = condition.value;
        if (typeof value === 'boolean') return `world.gameRule(${id}) === ${value}`;
        return `${this.use('gameRuleNumber')}(world, ${id}) ${compare} ${this.number(value, env)}`;
      }
      case 'in_area':
        // The area's tick function tags the players in it (B552).
        return `${this.use('ran')}(player, ${this.command('if_entity', { entities: words(`@s[tag=${areaTag(str(condition, 'area') ?? '')}]`) })}) > 0`;
      case 'on_team':
        return `${this.use('ran')}(${this.one(condition.who)}, ${this.command('if_entity', { entities: words(`@s[team=${gameName(str(condition, 'team') ?? '')}]`) })}) > 0`;
      case 'score_at_least':
        return `${this.use('ran')}(${this.one(condition.who)}, ${this.scoreGet(str(condition, 'objective'))}) >= ${this.number(condition.number, env)}`;
      case 'timer_running':
        return `${this.timerGet(str(condition, 'timer') ?? '', true)} > 0`;
      case 'stat_at_least':
        return this.hasPlayer(
          `stat(${literal(str(condition, 'stat') ?? '')}) >= ${this.number(condition.number, env)}`,
          env,
        );
      default:
        return 'false';
    }
  }

  // Steps

  /** Whether a step, or a step inside it, waits. */
  private waits(step: JsonObject): boolean {
    if (str(step, 'step') === 'wait') return true;
    return ['do', 'else'].some((field) =>
      stepList(step, field).some(({ step: inner }) => this.waits(inner)),
    );
  }

  /** The code of a step list followed by `after` (the continuation of waits). */
  steps(owner: JsonObject, field: string, env: Env, after: readonly string[]): string[] {
    const list = stepList(owner, field).map(({ step }) => step);
    return this.sequence(list, env, after);
  }

  private sequence(list: readonly JsonObject[], env: Env, after: readonly string[]): string[] {
    const out: string[] = [];
    for (const [index, step] of list.entries()) {
      if (!this.waits(step)) {
        out.push(...this.plainStep(step, env));
        continue;
      }
      const rest = list.slice(index + 1);
      const id = str(step, 'step');
      if (id === 'wait') {
        const ticks = Math.max(1, Math.round(Math.min(3600, num(step, 'seconds') ?? 1) * 20));
        out.push(
          `msm.schedule(${ticks}, () => {`,
          ...indent(this.aliveCheck(env)),
          ...indent(this.sequence(rest, env, after)),
          '});',
        );
        return out;
      }
      const next = this.builder.freshName('next');
      const goOn = [`${next}();`];
      out.push(`const ${next} = (): void => {`, ...indent(this.sequence(rest, env, after)), '};');
      if (id === 'if') {
        const otherwise = stepList(step, 'else');
        out.push(
          `if (${this.conditions(step, env)}) {`,
          ...indent(this.steps(step, 'do', env, goOn)),
          '} else {',
          ...indent(otherwise.length === 0 ? goOn : this.steps(step, 'else', env, goOn)),
          '}',
        );
      } else if (id === 'pick_random') {
        out.push(...this.pick(step, (choice) => this.sequence([choice], env, goOn)));
      } else if (id === 'repeat') {
        const loop = this.builder.freshName('loop');
        out.push(
          `const ${loop} = (count: number): void => {`,
          `  if (count >= ${this.times(step)}) {`,
          `    ${next}();`,
          '    return;',
          '  }',
          ...indent(this.steps(step, 'do', env, [`${loop}(count + 1);`])),
          '};',
          `${loop}(0);`,
        );
      } else if (id === 'for_each_player') {
        const list = this.builder.freshName('players');
        const each = this.builder.freshName('each');
        const inner: Env = {
          actors: new Set([...env.actors, 'player']),
          here: env.here,
          playerInLoop: true,
        };
        out.push(
          `const ${list} = ${this.playerList(step)};`,
          `const ${each} = (index: number): void => {`,
          `  if (index >= ${list}.length) {`,
          `    ${next}();`,
          '    return;',
          '  }',
          `  const player: Player = ${list}[index];`,
          ...indent(this.steps(step, 'do', inner, [`${each}(index + 1);`])),
          '};',
          `${each}(0);`,
        );
      }
      return out;
    }
    out.push(...after);
    return out;
  }

  private times(step: JsonObject): number {
    return Math.min(MAX_REPEAT, Math.max(1, Math.floor(num(step, 'times') ?? 1)));
  }

  private playerList(step: JsonObject): string {
    const radius = num(step, 'radius');
    if (radius === undefined) return 'msm.players()';
    return `${this.use('playersNear')}(world, here, ${Math.min(MAX_RADIUS, Math.max(1, Math.floor(radius)))})`;
  }

  private aliveCheck(env: Env): string[] {
    const checks: string[] = [];
    if (
      env.actors.has('player') &&
      !env.playerInLoop &&
      this.trigger.actors.includes('player') &&
      this.trigger.playerGone !== true
    ) {
      checks.push(`${this.use('gone')}(player)`);
    }
    if (env.actors.has('mob') && this.trigger.mobDead !== true)
      checks.push(`${this.use('gone')}(mob)`);
    return checks.length === 0 ? [] : [`if (${checks.join(' || ')}) return;`];
  }

  /** The code of a step without waits inside. */
  private plainStep(step: JsonObject, env: Env): string[] {
    const id = str(step, 'step') ?? '';
    const who = (fallback: string) => this.who(step.who, fallback, NEEDS_PLAYER.has(id));
    const at = (body: string) =>
      `${this.use('withPos')}(${this.place(step.where)}, (at) => ${body});`;
    switch (id) {
      case 'give_item':
        return [
          `${who('player')}.forEach((target) => target.give(${literal(str(step, 'item') ?? '')}, ${this.whole(step.count, env, 1)}));`,
        ];
      case 'take_item':
        return [
          `${who('player')}.forEach((target) => target.inventory.remove(${literal(str(step, 'item') ?? '')}, ${this.whole(step.count, env, 1)}));`,
        ];
      case 'heal':
        return [
          `${who('player')}.forEach((target) => target.heal(${this.number(step.amount, env)}));`,
        ];
      case 'hurt':
        return [
          `${who('player')}.forEach((target) => target.damage(${this.number(step.amount, env)}));`,
        ];
      case 'feed':
        return [
          `${who('player')}.forEach((target) => target.setFood(Math.min(20, target.food + ${this.number(step.food, env)}), target.saturation + ${this.number(step.saturation, env)}));`,
        ];
      case 'give_experience':
        return [
          `${who('player')}.forEach((target) => target.${bool(step, 'levels') === true ? 'addXpLevels' : 'addXp'}(${this.number(step.amount, env)}));`,
        ];
      case 'set_game_mode':
        return [
          `${who('player')}.forEach((target) => target.setGameMode(${literal(str(step, 'mode') ?? 'survival')}));`,
        ];
      case 'teleport':
        return [
          `${this.use('withPos')}(${this.place(step.to)}, (at) => ${who('player')}.forEach((target) => target.teleport(at)));`,
        ];
      case 'launch':
        return [
          `${who('player')}.forEach((target) => ${this.use('launch')}(target, ${literal(str(step, 'direction') ?? 'look')}, ${this.number(step.strength, env)}, ${this.number(step.up, env)}));`,
        ];
      case 'show_message':
        return [
          `${who('player')}.forEach((target) => target.sendMessage(${this.text(step.text, env)}));`,
        ];
      case 'show_action_bar':
        return [
          `${who('player')}.forEach((target) => target.showActionBar(${this.text(step.text, env)}));`,
        ];
      case 'show_title': {
        const subtitle =
          step.subtitle === undefined ? '' : `, { subtitle: ${this.text(step.subtitle, env)} }`;
        return [
          `${who('player')}.forEach((target) => target.showTitle(${this.text(step.title, env)}${subtitle}));`,
        ];
      }
      case 'show_hud':
      case 'hide_hud':
        return [
          `${who('player')}.forEach((target) => target.${id === 'show_hud' ? 'showHud' : 'hideHud'}(${literal(str(step, 'hud') ?? '')}));`,
        ];
      case 'set_hud': {
        const value =
          step.text !== undefined ? this.text(step.text, env) : this.number(step.value, env);
        return [
          `${who('player')}.forEach((target) => target.setHud(${literal(str(step, 'hud') ?? '')}, ${value}));`,
        ];
      }
      case 'give_effect': {
        const seconds = step.seconds;
        const ticks =
          typeof seconds === 'number'
            ? String(Math.max(1, Math.round(seconds * 20)))
            : `Math.round(${this.number(seconds, env)} * 20)`;
        const amplifier = Math.min(255, Math.max(0, Math.round(num(step, 'level') ?? 1) - 1));
        return [
          `${who('player')}.forEach((target) => target.addEffect(${literal(str(step, 'effect') ?? '')}, ${ticks}, ${amplifier}));`,
        ];
      }
      case 'remove_effect':
        return [
          `${who('player')}.forEach((target) => target.removeEffect(${literal(str(step, 'effect') ?? '')}));`,
        ];
      case 'place_block':
        return [
          at(`world.setBlock(${this.use('blockPos')}(at), ${literal(str(step, 'block') ?? '')})`),
        ];
      case 'remove_block':
        // Script API 1.4: broken as if mined (sound and particles), with or without its drops.
        return [
          at(
            `world.breakBlock(${this.use('blockPos')}(at)${bool(step, 'drop_items') === true ? '' : ', { drops: false }'})`,
          ),
        ];
      case 'spawn_mob':
        return [
          at(
            `{ for (let index = 0; index < ${this.whole(step.count, env, 1, 100)}; index += 1) world.spawnEntity(${literal(str(step, 'mob') ?? '')}, at); }`,
          ),
        ];
      case 'drop_item':
        return [
          at(
            `world.dropItem(at, { id: ${literal(str(step, 'item') ?? '')}, count: ${this.whole(step.count, env, 1, MAX_DROP_COUNT)} })`,
          ),
        ];
      case 'explode': {
        const power = step.power;
        const powerCode =
          typeof power === 'number'
            ? numberLiteral(Math.min(MAX_EXPLOSION_POWER, Math.max(0, power)))
            : `Math.min(${MAX_EXPLOSION_POWER}, Math.max(0, ${this.number(power, env)}))`;
        return [
          at(
            `world.explode(at, ${powerCode}, { fire: ${bool(step, 'fire') === true}, breaksBlocks: ${bool(step, 'break_blocks') !== false} })`,
          ),
        ];
      }
      case 'set_weather': {
        // Script API 1.4 takes more than 0 and at most 1000000 seconds; 0 or less leaves the
        // length to the game.
        const raw = step.seconds;
        let seconds = '';
        if (typeof raw === 'number') {
          if (raw > 0) seconds = `, ${numberLiteral(Math.min(MAX_WEATHER_SECONDS, raw))}`;
        } else if (raw !== undefined) {
          seconds = `, Math.min(${MAX_WEATHER_SECONDS}, Math.max(0.05, ${this.number(raw, env)}))`;
        }
        return [`world.setWeather(${literal(str(step, 'weather') ?? 'clear')}${seconds});`];
      }
      case 'set_game_rule': {
        const value = step.value;
        const code =
          typeof value === 'boolean'
            ? String(value)
            : typeof value === 'number'
              ? numberLiteral(Math.round(value))
              : `Math.round(${this.number(value, env)})`;
        return [`world.setGameRule(${literal(str(step, 'game_rule') ?? '')}, ${code});`];
      }
      case 'open_dialog':
        return [
          `${who('player')}.forEach((target) => target.openDialog(${literal(str(step, 'dialog') ?? '')}));`,
        ];
      case 'add_to_stat':
        return [
          `${who('player')}.forEach((target) => target.addStat(${literal(str(step, 'stat') ?? '')}, ${this.whole(step.amount, env, 0)}));`,
        ];
      case 'run_function':
        return this.asPlayerOrWorld('runFunction', literal(str(step, 'function') ?? ''), env);
      case 'run_command':
        return this.asPlayerOrWorld('runCommand', this.text(step.command, env), env);
      case 'play_sound': {
        const options: string[] = [];
        const volume = num(step, 'volume');
        const pitch = num(step, 'pitch');
        if (volume !== undefined) options.push(`volume: ${numberLiteral(volume)}`);
        if (pitch !== undefined) options.push(`pitch: ${numberLiteral(pitch)}`);
        const tail = options.length === 0 ? '' : `, { ${options.join(', ')} }`;
        return [at(`world.playSound(${literal(str(step, 'sound') ?? '')}, at${tail})`)];
      }
      case 'spawn_particles': {
        const options: string[] = [];
        for (const field of ['count', 'spread', 'speed']) {
          const value = num(step, field);
          if (value !== undefined) options.push(`${field}: ${numberLiteral(value)}`);
        }
        const tail = options.length === 0 ? '' : `, { ${options.join(', ')} }`;
        return [at(`world.spawnParticle(${this.particle(step.particle)}, at${tail})`)];
      }
      case 'play_animation': {
        const controller = str(step, 'controller');
        const tail = controller === undefined ? '' : `, ${literal(controller)}`;
        return [
          `if (mob !== undefined) mob.playAnimation(${literal(str(step, 'animation') ?? '')}${tail});`,
        ];
      }
      case 'remove_mob':
        // Script API 1.4 `Entity.remove()`: gone without loot or death events; players are
        // skipped (removing a player is a TypeError).
        return [
          `${who('mob')}.forEach((target) => { if (target.asPlayer() === undefined) target.remove(); });`,
        ];
      case 'show_boss_bar': {
        const title = step.title === undefined ? 'undefined' : this.text(step.title, env);
        const progress =
          step.value === undefined
            ? 'undefined'
            : `${this.use('divide')}(${this.number(step.value, env)}, ${this.number(step.max, env, 100)})`;
        const color = str(step, 'color');
        const colorCode = color === undefined ? 'undefined' : literal(color);
        const viewers = this.who(step.who, 'every_player', true);
        return [
          `${this.use('showBossBar')}(${literal(`rules_${str(step, 'bar') ?? 'bar'}`)}, ${title}, ${progress}, ${colorCode}, ${bool(step, 'visible') !== false}, ${viewers});`,
        ];
      }
      case 'stop_normal_action':
      case 'stop_placing':
      case 'stop_explosion':
        return ['e.cancel();'];
      case 'keep_blocks_safe':
        // Script API 1.6: entities are still hurt and pushed, no block breaks.
        return ['e.keepBlocks();'];
      case 'ride':
        // Script API 1.6 `Entity.ride`: refused for a player as the mount and during the
        // boarding cooldown; nothing rides itself.
        return [
          `${this.who(step.mount, 'mob', false)}.forEach((mount) => ${who('player')}.forEach((target) => { if (target.uuid !== mount.uuid) target.ride(mount); }));`,
        ];
      case 'dismount':
        return [`${who('player')}.forEach((target) => { target.dismount(); });`];
      case 'set_counter':
      case 'add_to_counter':
      case 'take_from_counter': {
        const scope = str(step, 'scope') ?? 'world';
        const name = str(step, 'counter') ?? '';
        const amount = this.number(step.amount, env);
        const value =
          id === 'set_counter'
            ? amount
            : `${this.counterRead(step)} ${id === 'add_to_counter' ? '+' : '-'} ${amount}`;
        this.use('counters');
        return [`setCounter(${this.store(scope)}, ${literal(name)}, ${value});`];
      }
      case 'give_loot':
        return [
          `${who('player')}.forEach((target) => target.runCommand(${this.command('loot_give', { players: words('@s'), loot_table: words(str(step, 'loot_table') ?? '') })}));`,
        ];
      case 'drop_loot':
        return [
          at(
            `world.runCommand(${this.command('loot_spawn', { x: code(`${this.use('coord')}(at.x)`), y: code('coord(at.y)'), z: code('coord(at.z)'), loot_table: words(str(step, 'loot_table') ?? '') })}, at)`,
          ),
        ];
      case 'place_structure': {
        const mirror = str(step, 'mirror');
        const rotation = str(step, 'rotation') ?? (mirror === undefined ? undefined : 'none');
        const block = this.use('blockCoord');
        return [
          at(
            `world.runCommand(${this.command('place_template', {
              template: words(str(step, 'structure') ?? ''),
              x: code(`${block}(at.x)`),
              y: code(`${block}(at.y)`),
              z: code(`${block}(at.z)`),
              rotation: rotation === undefined ? undefined : words(rotation),
              mirror: mirror === undefined ? undefined : words(mirror),
            })}, at)`,
          ),
        ];
      }
      case 'join_team':
        return [
          `${who('player')}.forEach((target) => target.runCommand(${this.command('team_join', { team: words(gameName(str(step, 'team') ?? '')), members: words('@s') })}));`,
        ];
      case 'leave_team':
        return [
          `${who('player')}.forEach((target) => target.runCommand(${this.command('team_leave', { members: words('@s') })}));`,
        ];
      case 'set_score':
      case 'add_to_score':
        return [
          `${who('player')}.forEach((target) => target.runCommand(${this.command(
            id === 'set_score' ? 'score_set' : 'score_add',
            {
              holders: words('@s'),
              objective: words(gameName(str(step, 'objective') ?? '')),
              score: this.integerText(step.amount, env, id === 'add_to_score' ? 0 : undefined),
            },
          )}));`,
        ];
      case 'start_timer':
      case 'stop_timer':
        return [
          `world.runFunction(${literal(timerFunction(str(step, 'timer') ?? '', id === 'start_timer' ? 'start' : 'stop'))});`,
        ];
      case 'reset_area': {
        const area = str(step, 'area') ?? '';
        const part = this.builder.games.areaHasReset(area) ? 'reset' : 'clear';
        return [`world.runFunction(${literal(areaFunction(area, part))});`];
      }
      case 'set_world_spawn': {
        const block = this.use('blockCoord');
        return [
          at(
            `world.runCommand(${this.command('set_world_spawn', { x: code(`${block}(at.x)`), y: code(`${block}(at.y)`), z: code(`${block}(at.z)`) })}, at)`,
          ),
        ];
      }
      case 'set_spawn_point': {
        const block = this.use('blockCoord');
        return [
          `${this.use('withPos')}(${this.place(step.where)}, (at) => ${who('player')}.forEach((target) => target.runCommand(${this.command('spawn_point', { players: words('@s'), x: code(`${block}(at.x)`), y: code(`${block}(at.y)`), z: code(`${block}(at.z)`) })})));`,
        ];
      }
      case 'set_world_border':
        return this.worldBorder(step, env);
      case 'pick_random':
        return this.pick(step, (choice) => this.plainStep(choice, env));
      case 'if': {
        const otherwise = stepList(step, 'else');
        return [
          `if (${this.conditions(step, env)}) {`,
          ...indent(this.steps(step, 'do', env, [])),
          ...(otherwise.length === 0
            ? ['}']
            : ['} else {', ...indent(this.steps(step, 'else', env, [])), '}']),
        ];
      }
      case 'repeat':
        return [
          `for (let count = 0; count < ${this.times(step)}; count += 1) {`,
          ...indent(this.steps(step, 'do', env, [])),
          '}',
        ];
      case 'for_each_player': {
        const inner: Env = {
          actors: new Set([...env.actors, 'player']),
          here: env.here,
          playerInLoop: true,
        };
        return [
          `${this.playerList(step)}.forEach((player) => {`,
          ...indent(this.steps(step, 'do', inner, [])),
          '});',
        ];
      }
      default:
        return [`// Left out: step "${commentText(id)}" is not known.`];
    }
  }

  /** "Set the world border": its width, over some seconds, and its centre when given. */
  private worldBorder(step: JsonObject, env: Env): string[] {
    const raw = step.width;
    const width =
      typeof raw === 'number'
        ? words(String(Math.min(MAX_WORLD_BORDER, Math.max(1, raw))))
        : code(
            `${this.use('coord')}(Math.min(${MAX_WORLD_BORDER}, Math.max(1, ${this.number(raw, env)})))`,
          );
    const rawSeconds = step.seconds;
    let seconds: Piece | undefined;
    if (typeof rawSeconds === 'number') {
      const whole = Math.min(MAX_WORLD_BORDER_SECONDS, Math.round(rawSeconds));
      if (whole > 0) seconds = words(String(whole));
    } else if (rawSeconds !== undefined) {
      seconds = code(
        `String(Math.min(${MAX_WORLD_BORDER_SECONDS}, Math.max(1, Math.round(${this.number(rawSeconds, env)}))))`,
      );
    }
    const run = (command: string, at = env.here ? 'here' : undefined): string =>
      at === undefined ? `world.runCommand(${command});` : `world.runCommand(${command}, ${at});`;
    const out: string[] = [];
    if (step.center !== undefined) {
      const coord = this.use('coord');
      out.push(
        `${this.use('withPos')}(${this.place(step.center)}, (at) => ${run(
          this.command('worldborder_center', {
            x: code(`${coord}(at.x)`),
            z: code(`${coord}(at.z)`),
          }),
          'at',
        ).slice(0, -1)});`,
      );
    }
    out.push(
      run(
        seconds === undefined
          ? this.command('worldborder_set', { width })
          : this.command('worldborder_set_over_seconds', { width, seconds }),
      ),
    );
    return out;
  }

  private particle(value: Json | undefined): string {
    if (typeof value === 'string') return literal(value);
    const object = asObject(value);
    if (object === undefined) return '"minecraft:poof"';
    return `{ ${Object.keys(object)
      .sort()
      .map((key) => `${literal(key)}: ${this.json(object[key])}`)
      .join(', ')} }`;
  }

  private json(value: Json | undefined): string {
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'string') return literal(value);
    if (typeof value === 'number') return numberLiteral(value);
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.json(item)).join(', ')}]`;
    return `{ ${Object.keys(value)
      .sort()
      .map((key) => `${literal(key)}: ${this.json(value[key])}`)
      .join(', ')} }`;
  }

  private asPlayerOrWorld(method: string, argument: string, env: Env): string[] {
    const world = env.here ? `world.${method}(${argument}, here)` : `world.${method}(${argument})`;
    if (env.playerInLoop) return [`player.${method}(${argument});`];
    if (!env.actors.has('player')) return [`${world};`];
    const name = this.builder.freshName(method === 'runCommand' ? 'command' : 'fn');
    return [
      `const ${name} = ${argument};`,
      `if (player !== undefined) player.${method}(${name});`,
      `else ${env.here ? `world.${method}(${name}, here)` : `world.${method}(${name})`};`,
    ];
  }
}
