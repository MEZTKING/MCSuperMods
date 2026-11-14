/**
 * Event definitions (B396): the events, trigger components and their options (cooldown, chance,
 * interval, hand) of every project block, item, mob and effect, read from the lowered files the
 * game would get (ADR 0085 D3): `msm/<ns>/<block|item|entity|effect>/<path>.json` (ADR 0025 D4).
 * Rules arrive here already compiled into ordinary events (ADR 0082 D3), so a plain rule is an
 * event like any other; a rule that needs a script is one `run_script` action whose handler's
 * rule keys come from the generated script's `// rule:<key>` markers.
 *
 * The trigger table restates the format's trigger fields (`definition.mcdoc`, the blocks-items
 * and entities validators' `EVENT_FIELDS`); a test pins it against those sources so a new
 * trigger cannot be silently missing.
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { plainEntityName } from '../entities/catalogue.js';
import type { SimFiles, SimOrigin } from '../types.js';

/** The definition kinds that own events. */
export type EventOwnerKind = 'block' | 'item' | 'entity' | 'effect';

/** Where in the format a trigger lives and whether Try it fires it. */
export interface TriggerSpec {
  /** A stable id: the owner kind and the component or field, e.g. `block:msm:on_interact`. */
  readonly id: string;
  readonly owner: EventOwnerKind;
  /** The keys from the definition's root down to the event id string. */
  readonly path: readonly string[];
  /** True when Try it fires it; false when it logs "Only in Minecraft" instead. */
  readonly handled: boolean;
  /** Plain words for the moment it fires, after "when": `the block is used`. */
  readonly words: string;
  /** The field next to the event that holds a cooldown in ticks, and its default. */
  readonly cooldown?: { readonly field: string; readonly default: number };
  /** The field holding a firing interval in ticks, and its default. */
  readonly interval?: { readonly field: string; readonly default: number };
  /** The field holding a chance from 0 to 1 (default 1). */
  readonly chance?: string;
  /** The field holding the hand (`main`, `off`, `either`; default `main`). */
  readonly hand?: string;
}

const spec = (
  owner: EventOwnerKind,
  path: readonly string[],
  handled: boolean,
  words: string,
  extra: Partial<Pick<TriggerSpec, 'cooldown' | 'interval' | 'chance' | 'hand'>> = {},
): TriggerSpec =>
  Object.freeze({
    id: `${owner}:${path.filter((key) => key !== 'components' && key !== 'event').join('.')}`,
    owner,
    path: Object.freeze([...path]),
    handled,
    words,
    ...extra,
  });

const c = (component: string, field = 'event'): string[] => ['components', component, field];

/**
 * Every trigger of the format at the Rules batch's close (ADR 0082 F12), in the format's order.
 * `handled: false` ones are said out loud when their owner first appears in the area.
 */
export const TRIGGER_SPECS: readonly TriggerSpec[] = Object.freeze([
  // Blocks (ADR 0025, 0058, 0061, 0067, 0074, 0075, 0077).
  spec('block', c('msm:on_interact'), true, 'a player uses the block'),
  spec('block', c('msm:on_step'), true, 'something steps on the block', {
    cooldown: { field: 'cooldown_ticks', default: 0 },
  }),
  spec('block', c('msm:redstone', 'on_powered'), true, 'the block becomes powered'),
  spec('block', c('msm:redstone', 'on_unpowered'), true, 'the block stops being powered'),
  spec('block', c('msm:on_break'), true, 'a player breaks the block'),
  spec('block', c('msm:on_place'), true, 'the block is placed'),
  spec('block', c('msm:on_random_tick'), true, 'the block gets a random tick', {
    chance: 'chance',
  }),
  spec('block', c('msm:on_entity_inside'), true, 'something is inside the block', {
    cooldown: { field: 'cooldown_ticks', default: 20 },
  }),
  spec('block', c('msm:container', 'on_open'), true, 'a player opens the container'),
  spec('block', c('msm:container', 'on_close'), true, 'a player closes the container'),
  spec('block', c('msm:machine', 'on_start'), false, 'the machine starts a recipe'),
  spec('block', c('msm:machine', 'on_finish'), false, 'the machine makes an output'),
  spec('block', ['on_travel'], false, 'something travels through the portal'),
  // Items (ADR 0025, 0056, 0061).
  spec('item', c('msm:on_use'), true, 'a player uses the item', {
    cooldown: { field: 'cooldown_ticks', default: 0 },
  }),
  spec(
    'item',
    ['components', 'msm:throwable', 'on_hit_entity', 'event'],
    false,
    'the thrown item hits a mob',
  ),
  spec(
    'item',
    ['components', 'msm:throwable', 'on_hit_block', 'event'],
    false,
    'the thrown item hits a block',
  ),
  spec('item', c('msm:on_hit'), false, 'the item hits a mob'),
  spec('item', c('msm:on_use_on_block'), true, 'a player uses the item on a block', {
    cooldown: { field: 'cooldown_ticks', default: 0 },
  }),
  spec('item', c('msm:while_held'), false, 'the item is held', {
    interval: { field: 'interval_ticks', default: 20 },
    hand: 'hand',
  }),
  spec('item', c('msm:while_worn'), false, 'the item is worn', {
    interval: { field: 'interval_ticks', default: 20 },
  }),
  // Mobs (ADR 0028, 0061, 0070, 0071).
  spec('entity', c('msm:attack', 'on_attack'), false, 'the mob hits something'),
  spec('entity', c('msm:on_hurt'), false, 'the mob is hurt'),
  spec('entity', c('msm:on_death'), true, 'the mob dies'),
  spec('entity', c('msm:on_interact'), true, 'a player uses the mob'),
  spec('entity', c('msm:on_tick'), true, 'the mob is alive', {
    interval: { field: 'interval_ticks', default: 20 },
  }),
  spec('entity', c('msm:on_spawn'), true, 'the mob spawns'),
  spec('entity', c('msm:ranged_attack', 'on_shoot'), false, 'the mob shoots'),
  spec('entity', c('msm:tameable', 'on_tame'), false, 'the mob is tamed'),
  spec('entity', c('msm:breedable', 'on_breed'), false, 'the mob breeds'),
  spec('entity', c('msm:rideable', 'on_mount'), false, 'someone mounts the mob'),
  // Mob effects (ADR 0055).
  spec('effect', c('msm:on_start'), false, 'the effect starts'),
  spec('effect', c('msm:on_tick'), false, 'the effect is active', {
    interval: { field: 'interval_ticks', default: 20 },
  }),
  spec('effect', c('msm:on_end'), false, 'the effect ends'),
]);

/** A trigger as one definition sets it: the spec, the event it fires and its options. */
export interface BoundTrigger {
  readonly spec: TriggerSpec;
  /** The event id it fires. */
  readonly event: string;
  /** Ticks between two firings (per position and entity for blocks, per item for items). */
  readonly cooldownTicks: number;
  /** Ticks between firings of a repeating trigger. */
  readonly intervalTicks: number;
  /** The chance a firing goes ahead, 0 to 1. */
  readonly chance: number;
  /** The hand of a held item's trigger. */
  readonly hand?: string;
  /** The JSON pointer of the trigger's event field in the definition. */
  readonly pointer: string;
}

/** A project block, item, mob or effect with its events and triggers. */
export interface EventOwner {
  /** The resource location, e.g. `mymod:ruby_block`. */
  readonly id: string;
  readonly kind: EventOwnerKind;
  /** Its name in plain words (`en_us`), else one made from its id. */
  readonly displayName: string;
  /** Its declared events by id: each an ordered list of actions. */
  readonly events: ReadonlyMap<string, readonly JsonObject[]>;
  /** The triggers it sets, by {@link TriggerSpec.id}. */
  readonly triggers: ReadonlyMap<string, BoundTrigger>;
  /** `max_stack_size` of an item (the inventory reads it). */
  readonly maxStackSize?: number;
  /** Where log lines about it point. */
  readonly origin: SimOrigin;
}

/** What a `run_script` handler made by Rules stands for (ADR 0082 D3). */
export interface RuleHandler {
  /** The handler id, `<ns>:rules/<book path>/<subject path>/<trigger>`. */
  readonly handler: string;
  /** The rule book id. */
  readonly book: string;
  /** The keys of the rules it runs, in order. */
  readonly keys: readonly string[];
  /** The rules' sentences, from the script's comments. */
  readonly sentences: readonly string[];
}

/** A script that listens for Script API events (`msm.events.on`), which only the game fires. */
export interface ScriptListeners {
  /** The script's lowered path. */
  readonly path: string;
  /** The rule book it was made from, for a script Rules generated. */
  readonly book?: string;
  /** The Script API event names it listens for, in the script's order. */
  readonly events: readonly string[];
  /** The rule keys of a generated script, in order. */
  readonly ruleKeys: readonly string[];
}

/** One rule of a rule book, as {@link RuleBookInfo} keeps it. */
export interface RuleInfo {
  readonly key: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly subject?: string;
  readonly trigger: string;
  /** The number of top-level steps in `do`. */
  readonly steps: number;
}

/** A rule book's rules, for naming the rule behind a plain action (optional input, B396). */
export interface RuleBookInfo {
  readonly id: string;
  readonly rules: readonly RuleInfo[];
}

/** The rule that made one action of a generated event. */
export interface RuleRef {
  readonly book: string;
  readonly key: string;
  readonly name?: string;
}

/** The facts the definitions read from a target: its folder names. */
export type DefinitionsTarget = Pick<TargetFacts, 'folders'>;

const DEFINITION_PATH = /^msm\/([a-z0-9_.-]+)\/(block|item|entity|effect)\/([a-z0-9_./-]+)\.json$/;
const SCRIPT_PATH = /^msm\/([a-z0-9_.-]+)\/script\/(.+)\.(ts|js)$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const wholeAtLeast = (value: Json | undefined, min: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined;

const LANG_PREFIX: Readonly<Record<EventOwnerKind, string>> = {
  block: 'block',
  item: 'item',
  entity: 'entity',
  effect: 'effect',
};

/** `/components/msm:on_step/event` from keys, escaped as RFC 6901 asks. */
export const pointerOf = (keys: readonly string[]): string =>
  keys.map((key) => `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');

function valueAt(root: JsonObject, keys: readonly string[]): Json | undefined {
  let value: Json | undefined = root;
  for (const key of keys) value = isRecord(value) ? value[key] : undefined;
  return value;
}

/** The trigger's component object: everything of `path` but the last key. */
function parentOf(root: JsonObject, path: readonly string[]): JsonObject | undefined {
  const parent = valueAt(root, path.slice(0, -1));
  return isRecord(parent) ? parent : undefined;
}

function bindTriggers(kind: EventOwnerKind, definition: JsonObject): Map<string, BoundTrigger> {
  const out = new Map<string, BoundTrigger>();
  for (const one of TRIGGER_SPECS) {
    if (one.owner !== kind) continue;
    const event = nonEmpty(valueAt(definition, one.path));
    if (event === undefined) continue;
    const fields = parentOf(definition, one.path) ?? {};
    const chance = one.chance === undefined ? undefined : fields[one.chance];
    const hand = one.hand === undefined ? undefined : nonEmpty(fields[one.hand]);
    out.set(
      one.id,
      Object.freeze({
        spec: one,
        event,
        cooldownTicks:
          one.cooldown === undefined
            ? 0
            : (wholeAtLeast(fields[one.cooldown.field], 0) ?? one.cooldown.default),
        intervalTicks:
          one.interval === undefined
            ? 0
            : (wholeAtLeast(fields[one.interval.field], 1) ?? one.interval.default),
        chance: typeof chance === 'number' && chance >= 0 && chance <= 1 ? chance : 1,
        ...(one.hand === undefined ? {} : { hand: hand ?? 'main' }),
        pointer: pointerOf(one.path),
      }),
    );
  }
  return out;
}

function eventsOf(definition: JsonObject): Map<string, readonly JsonObject[]> {
  const out = new Map<string, readonly JsonObject[]>();
  const events = isRecord(definition.events) ? definition.events : {};
  for (const [id, event] of Object.entries(events)) {
    const actions = isRecord(event) && Array.isArray(event.actions) ? event.actions : [];
    out.set(
      id,
      Object.freeze(actions.filter((action: Json): action is JsonObject => isRecord(action))),
    );
  }
  return out;
}

/** `Ruby Block` from `mymod:ruby_block`. */
export const plainName = (id: string): string => plainEntityName(id);

/** The rule trigger and subject of a generated event id `<subject>_rules_<trigger>`, else null. */
export function ruleEventOf(
  ownerId: string,
  eventId: string,
): { readonly subject: string; readonly trigger: string } | null {
  const prefix = `${ownerId}_rules_`;
  if (!eventId.startsWith(prefix)) return null;
  const trigger = eventId.slice(prefix.length);
  return /^[a-z0-9_]+$/.test(trigger) ? { subject: ownerId, trigger } : null;
}

/** Whether a `run_script` handler is one Rules made: `<ns>:rules/<book>/<subject>/<trigger>`. */
export const isRuleHandler = (handler: string): boolean => /^[a-z0-9_.-]+:rules\//.test(handler);

/** Reads a lowered file as text; `undefined` when absent. */
function readText(files: SimFiles, path: string): string | undefined {
  const raw = files.get(path);
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
}

const DEFINE = /msm\.actions\.define\(\s*["']([^"']+)["']/g;
const LISTEN = /msm\.events\.on\(\s*["']([^"']+)["']/g;
const RULE_MARK = /\/\/ rule:([A-Za-z0-9_.-]+)/g;
const BOOK_LINE = /^\/\/ Made by Rules from ([a-z0-9_.-]+:[a-z0-9_./-]+);/;

/** The distinct rule keys of a stretch of a generated script, in order. */
function ruleKeysIn(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(RULE_MARK)) {
    const key = match[1] as string;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** The `// When ...` sentences of a stretch of a generated script. */
function sentencesIn(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('// When '))
    .map((line) => line.slice(3));
}

/**
 * Reads the scripts among the lowered files: the `run_script` handlers Rules generated (with
 * their rule keys from the `// rule:<key>` markers, ADR 0082 D3) and the Script API events each
 * script listens for.
 */
export function readScripts(files: SimFiles): {
  readonly handlers: ReadonlyMap<string, RuleHandler>;
  readonly listeners: readonly ScriptListeners[];
} {
  const handlers = new Map<string, RuleHandler>();
  const listeners: ScriptListeners[] = [];
  const paths = [...files.keys()].filter((path) => SCRIPT_PATH.test(path)).sort();
  for (const path of paths) {
    const text = readText(files, path);
    if (text === undefined) continue;
    const book = BOOK_LINE.exec(text)?.[1];
    // Each top-level registration runs to the next one (or the end of the file).
    const starts = [
      ...[...text.matchAll(DEFINE)].map((m) => ({ at: m.index, kind: 'define', id: m[1] })),
      ...[...text.matchAll(LISTEN)].map((m) => ({ at: m.index, kind: 'listen', id: m[1] })),
    ].sort((a, b) => a.at - b.at);
    const events: string[] = [];
    const listenKeys: string[] = [];
    starts.forEach((start, index) => {
      const end = starts[index + 1]?.at ?? text.length;
      const body = text.slice(start.at, end);
      const id = start.id as string;
      if (start.kind === 'define') {
        if (book !== undefined && isRuleHandler(id)) {
          handlers.set(
            id,
            Object.freeze({
              handler: id,
              book,
              keys: Object.freeze(ruleKeysIn(body)),
              sentences: Object.freeze(sentencesIn(body)),
            }),
          );
        }
      } else {
        if (!events.includes(id)) events.push(id);
        for (const key of ruleKeysIn(body)) if (!listenKeys.includes(key)) listenKeys.push(key);
      }
    });
    if (events.length > 0) {
      listeners.push(
        Object.freeze({
          path,
          ...(book === undefined ? {} : { book }),
          events: Object.freeze(events),
          ruleKeys: Object.freeze(listenKeys),
        }),
      );
    }
  }
  return { handlers, listeners: Object.freeze(listeners) };
}

/**
 * Rule books as the app's session holds them (`{ id, data }` of each `msm:rules` element), for
 * naming the rule behind each action of a plain generated event. Optional: without them a plain
 * rule's event is named by its trigger only.
 */
export function ruleBooksFrom(
  books: readonly { readonly id: string; readonly data: Json }[],
): RuleBookInfo[] {
  return [...books]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((book) => {
      const data = isRecord(book.data) ? book.data : {};
      const rules = Array.isArray(data.rules) ? data.rules : [];
      return Object.freeze({
        id: book.id,
        rules: Object.freeze(
          rules.filter(isRecord).map((rule: JsonObject) => {
            const when = isRecord(rule.when) ? rule.when : {};
            const name = nonEmpty(rule.name);
            const subject = nonEmpty(when.subject);
            return Object.freeze({
              key: nonEmpty(rule.key) ?? '',
              ...(name === undefined ? {} : { name }),
              enabled: rule.enabled !== false,
              ...(subject === undefined ? {} : { subject }),
              trigger: nonEmpty(when.trigger) ?? '',
              steps: Array.isArray(rule.do) ? rule.do.length : 0,
            });
          }),
        ),
      });
    });
}

/** The `run_script` handler id of a book's part of a generated event (ADR 0082 D3). */
function bookHandler(bookId: string, subjectId: string, trigger: string): string {
  const [bookNs, bookPath] = bookId.split(':') as [string, string];
  const subjectPath = subjectId.slice(subjectId.indexOf(':') + 1);
  return `${bookNs}:rules/${bookPath}/${subjectPath}/${trigger}`;
}

/**
 * The rule behind each action of a generated event, by index, following the compiler's layout
 * (ADR 0082 D3): a hand-made event first as `trigger_event`, then each book's part in book id
 * order: one action per step of each plain rule, or one `run_script` for the whole part. An
 * action whose rule cannot be told is left out; a layout that does not match gives an empty map.
 */
export function rulesForActions(
  ownerId: string,
  eventId: string,
  actions: readonly JsonObject[],
  books: readonly RuleBookInfo[],
  handlers: ReadonlyMap<string, RuleHandler>,
): Map<number, readonly RuleRef[]> {
  const out = new Map<number, readonly RuleRef[]>();
  const rule = ruleEventOf(ownerId, eventId);
  if (rule === null) return out;
  let index = 0;
  if (actions[0]?.type === 'trigger_event') index = 1;
  // Handlers name their keys even without the books.
  actions.forEach((action, at) => {
    const handler = typeof action.handler === 'string' ? handlers.get(action.handler) : undefined;
    if (action.type === 'run_script' && handler !== undefined) {
      out.set(
        at,
        handler.keys.map((key) => ({ book: handler.book, key })),
      );
    }
  });
  for (const book of books) {
    const part = book.rules.filter(
      (one) => one.enabled && one.subject === ownerId && one.trigger === rule.trigger,
    );
    if (part.length === 0) continue;
    const action = actions[index];
    if (
      action?.type === 'run_script' &&
      action.handler === bookHandler(book.id, ownerId, rule.trigger)
    ) {
      out.set(
        index,
        part.map((one) => ({
          book: book.id,
          key: one.key,
          ...(one.name === undefined ? {} : { name: one.name }),
        })),
      );
      index += 1;
      continue;
    }
    for (const one of part) {
      for (let step = 0; step < one.steps; step++) {
        if (index >= actions.length) return new Map();
        out.set(index, [
          { book: book.id, key: one.key, ...(one.name === undefined ? {} : { name: one.name }) },
        ]);
        index += 1;
      }
    }
  }
  return out;
}

/** Every project event owner, by id, with the scripts beside them. */
export class EventDefinitions {
  private readonly owners = new Map<string, EventOwner>();
  /** Rules' `run_script` handlers by id. */
  readonly handlers: ReadonlyMap<string, RuleHandler>;
  /** Scripts that listen for Script API events. */
  readonly listeners: readonly ScriptListeners[];

  constructor(owners: readonly EventOwner[], scripts: ReturnType<typeof readScripts>) {
    for (const owner of owners) this.owners.set(`${owner.kind}|${owner.id}`, owner);
    this.handlers = scripts.handlers;
    this.listeners = scripts.listeners;
  }

  /** The owner of a kind by id, when it has a definition. */
  get(kind: EventOwnerKind, id: string): EventOwner | undefined {
    return this.owners.get(`${kind}|${id}`);
  }

  /** Every owner, in path order. */
  all(): EventOwner[] {
    return [...this.owners.values()];
  }
}

/**
 * Reads the events and triggers of a project's lowered files.
 *
 * @param files - The lowered output files by path (ADR 0085 D3).
 * @param target - The target they were lowered for (the language folder's name).
 */
export function readEventDefinitions(files: SimFiles, target: DefinitionsTarget): EventDefinitions {
  const langFolder = target.folders.resource.lang;
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(files, `assets/${namespace}/${langFolder}/en_us.json`);
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };
  const owners: EventOwner[] = [];
  const paths = [...files.keys()].filter((path) => DEFINITION_PATH.test(path)).sort();
  for (const path of paths) {
    const match = DEFINITION_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const kind = match[2] as EventOwnerKind;
    const ownerPath = match[3] as string;
    const id = `${namespace}:${ownerPath}`;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) continue;
    const key = `${LANG_PREFIX[kind]}.${namespace}.${ownerPath.replaceAll('/', '.')}`;
    const lang = langOf(namespace);
    const displayName =
      nonEmpty(lang[key]) ??
      (kind === 'block' ? nonEmpty(lang[`item.${namespace}.${ownerPath}`]) : undefined) ??
      plainName(id);
    const maxStack = wholeAtLeast(definition.max_stack_size, 1);
    owners.push(
      Object.freeze({
        id,
        kind,
        displayName,
        events: eventsOf(definition),
        triggers: bindTriggers(kind, definition),
        ...(kind === 'item' && maxStack !== undefined ? { maxStackSize: maxStack } : {}),
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  return new EventDefinitions(owners, readScripts(files));
}
