/**
 * The TypeScript generator of Rules (ADR 0082 D3): one script per book that needs one, written
 * against the Script API (`msm-runtime.d.ts`; 1.4 members from B370) so the content jar exporter
 * transpiles it to ES5 like any script (ADR 0031 D2).
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
  MAX_RADIUS,
  MAX_REPEAT,
  MAX_WEATHER_SECONDS,
  type TriggerEntry,
} from '../catalogue';

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
]);

/** Where a step list is: which actor variables exist and whether `player` is a loop's player. */
interface Env {
  readonly actors: ReadonlySet<string>;
  readonly here: boolean;
  readonly playerInLoop: boolean;
}

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
  private readonly bookId: string;
  private readonly counters: ReadonlyMap<string, number>;

  constructor(bookId: string, counters: readonly CounterDeclaration[]) {
    this.bookId = bookId;
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
  ): void {
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
    this.handlers.push([
      `// ${commentText(title)}`,
      `msm.actions.define(${literal(handler)}, (e) => {`,
      ...indent(head),
      ...indent(this.rules(trigger, rules)),
      '});',
    ]);
  }

  /** The handler of a script-only trigger (`msm.events.on`). */
  addEventHandler(
    trigger: TriggerEntry,
    subject: string | undefined,
    options: JsonObject,
    title: string,
    rules: readonly ScriptRule[],
  ): void {
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
      case 'player.tick':
        extra = `, { interval: ${Math.max(5, interval)} }`;
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
      ...indent(this.rules(trigger, rules)),
      `}${extra});`,
    ]);
  }

  /** The whole script, or null when no handler was added. */
  lines(): string[] | null {
    if (this.empty) return null;
    this.use('rule');
    const helpers: string[] = [];
    const needed = new Set(this.used);
    for (const helper of HELPERS) {
      if (needed.has(helper.name))
        for (const dependency of helper.uses ?? []) needed.add(dependency);
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

  private rules(trigger: TriggerEntry, rules: readonly ScriptRule[]): string[] {
    const env: Env = {
      actors: new Set(trigger.actors),
      here: trigger.hasPlace,
      playerInLoop: false,
    };
    const out: string[] = [];
    for (const { rule, key, sentence } of rules) {
      this.names = 0;
      const writer = new RuleWriter(this, trigger, (name) => this.use(name));
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

  constructor(builder: ScriptBuilder, trigger: TriggerEntry, use: (helper: string) => string) {
    this.builder = builder;
    this.trigger = trigger;
    this.use = use;
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
    const pieces = asArray(value).map((piece) =>
      typeof piece === 'string'
        ? literal(piece)
        : `${this.use('text')}(${this.number(piece, env)})`,
    );
    return pieces.length === 0 ? '""' : pieces.join(' + ');
  }

  // Places and who

  place(value: Json | undefined): string {
    const where = value ?? 'here';
    if (where === 'here') return 'here';
    if (where === 'above_here') return 'here.offset(0, 1, 0)';
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
      case 'dimension_is':
        return `world.dimension === ${literal(str(condition, 'dimension') ?? '')}`;
      case 'counter':
        return `${this.counterRead(condition)} ${compare} ${this.number(condition.number, env)}`;
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
        return ['e.cancel();'];
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
