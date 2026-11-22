/**
 * What every part of the loot evaluator shares (B605, ADR 0120 D3): the context it is given, the
 * state of one roll, the condition check through B604's `testPredicate`, and small helpers.
 *
 * Unknown is never turned into no: a condition that answers unknown is taken as passing, so the
 * roll shows what can drop if it does, and everything it touched is marked uncertain and named
 * in the roll's unsupported list (ADR 0120 D4).
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import {
  type EvalContext,
  type ItemSample,
  type PredicateResult,
  type SeededRandom,
  type Situation,
  testPredicate,
  type Unsupported,
  unsupported,
} from '../predicates/api.js';
import type { LootStack } from './api.js';

/** How close a part of the evaluator is to the game (the live views' fidelity levels). */
export type LootFidelity = 'checked' | 'about_right' | 'only_in_game';

/** A part a roll used, with how close it is (the frame's fidelity line lists them). */
export interface LootPart {
  readonly kind: 'entry' | 'function' | 'number' | 'level_value' | 'enchantment_provider';
  readonly type: string;
  readonly fidelity: LootFidelity;
}

/** What the evaluator knows about an item (from the project, the target's facts or the caller). */
export interface LootItemInfo {
  /** Its durability, when it has one. */
  readonly maxDamage?: number;
  /** Its enchantability (the `minecraft:enchantable` value), when it can be enchanted. */
  readonly enchantability?: number;
  /** How many fit in one slot (an item with durability: 1). */
  readonly maxStackSize?: number;
}

/** Tries one condition; the default is B604's `testPredicate`. */
export type ConditionTester = (
  condition: Json,
  situation: Situation,
  ctx: EvalContext,
) => PredicateResult;

/**
 * The context of the loot evaluator: B601's {@link EvalContext} and a few optional readers a
 * caller can give. Without them the parts that need them are reported, never guessed.
 */
export interface LootContext extends EvalContext {
  /**
   * Every id of a registry folder (`enchantment`, `recipe`, ...), project and vanilla. Needed by
   * `enchant_randomly` and `enchant_with_levels` without `options` and by `furnace_smelt`.
   */
  readonly ids?: (folder: string) => readonly string[];
  /** What is known about an item; the target's vanilla tool numbers are asked after it. */
  readonly items?: (id: string) => LootItemInfo | undefined;
  /** The item a furnace makes of an item, when the caller knows it (else recipes are read). */
  readonly smelt?: (id: string) => string | undefined;
  /** Tries a condition (tests pass a stand-in until B604's evaluator lands). */
  readonly testCondition?: ConditionTester;
}

/** One stack while a roll is under way (mutable; the public {@link LootStack} is a copy). */
export interface WorkStack {
  id: string;
  count: number;
  enchantments?: Record<string, number>;
  /** The fraction of durability left (0 to 1), when a function set it. */
  damage?: number;
  components?: JsonObject;
  /** Made or changed by a part whose answer only the game knows. */
  uncertain: boolean;
  /** The index of the table's pool it came from. */
  pool?: number;
}

/** The state of one roll (or of the odds' many rolls). */
export interface RollState {
  readonly ctx: LootContext;
  readonly situation: Situation;
  readonly random: SeededRandom;
  /** What could not be worked out, once each (kind, type, path, reason). */
  readonly unsupported: Map<string, Unsupported>;
  /** Set while the current part used an unknown answer or a number only the game knows. */
  taint: boolean;
  /** Nested tables under way (a guard against a table naming itself). */
  readonly tables: string[];
  /** Per-state caches (enchantment candidates, tags) so many rolls stay fast. */
  readonly cache: Map<string, unknown>;
  /** The parts used, once each. */
  readonly used: Map<string, LootPart>;
  /** The same, by kind (a fast check). */
  readonly usedByKind: Map<string, Set<string>>;
  /** Conditions tried so far (a pool whose expansion tried none can keep its candidates). */
  checks: number;
  /** Pools whose candidates never change, with them (no condition tried while expanding). */
  readonly fixedPools: WeakMap<object, unknown>;
}

/** How deep nested tables and references may go before the evaluator stops. */
export const MAX_DEPTH = 32;

/** A new state over a context and a situation. */
export function newState(ctx: LootContext, situation: Situation): RollState {
  return {
    ctx,
    situation,
    random: ctx.random,
    unsupported: new Map(),
    taint: false,
    tables: [],
    cache: new Map(),
    used: new Map(),
    usedByKind: new Map(),
    checks: 0,
    fixedPools: new WeakMap(),
  };
}

/** Records something that could not be worked out (once) and marks the current part uncertain. */
export function report(
  state: RollState,
  kind: Unsupported['kind'],
  type: string,
  path: string,
  reason: Unsupported['reason'],
): void {
  const key = `${kind}|${type}|${path}|${reason}`;
  if (!state.unsupported.has(key))
    state.unsupported.set(key, unsupported(kind, type, path, reason));
  state.taint = true;
}

/** Notes that a part was used (for the fidelity line). */
export function use(
  state: RollState,
  kind: LootPart['kind'],
  type: string,
  fidelity: LootFidelity,
): void {
  let byType = state.usedByKind.get(kind);
  if (!byType) {
    byType = new Set();
    state.usedByKind.set(kind, byType);
  }
  if (byType.has(type)) return;
  byType.add(type);
  state.used.set(`${kind}|${type}`, { kind, type, fidelity });
}

/** Runs `fn` with the taint cleared and answers whether it set it; the outer taint is kept. */
export function tainted(state: RollState, fn: () => void): boolean {
  const outer = state.taint;
  state.taint = false;
  fn();
  const inner = state.taint;
  state.taint = outer || inner;
  return inner;
}

/** A resource location with its namespace (`stone` is `minecraft:stone`; `#` kept). */
export function fullId(id: string): string {
  const tag = id.startsWith('#');
  const bare = tag ? id.slice(1) : id;
  const full = bare.includes(':') ? bare : `minecraft:${bare}`;
  return tag ? `#${full}` : full;
}

/** A type id without `minecraft:` (`minecraft:set_count` is `set_count`). */
export function typeName(type: Json | undefined): string {
  if (typeof type !== 'string') return '';
  return type.startsWith('minecraft:') ? type.slice('minecraft:'.length) : type;
}

/** The level of an enchantment in a map keyed with or without the namespace. */
export function levelOf(
  enchantments: Readonly<Record<string, number>> | undefined,
  id: string,
): number {
  if (!enchantments) return 0;
  const full = fullId(id);
  return enchantments[full] ?? enchantments[full.slice('minecraft:'.length)] ?? 0;
}

/** A whole number from 0 (included) to `n` (excluded); 0 when `n` is 0 or less. */
export function nextInt(random: SeededRandom, n: number): number {
  return n <= 0 ? 0 : Math.floor(random.next() * n);
}

/** The JSON object at `value`, or `undefined`. */
export function asObject(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

/** The number at `value`, or `undefined`. */
export function asNumber(value: Json | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Tries a condition (`condition` of a table, pool, entry or function: one condition, a list or
 * a predicate id). Yes and no are kept; unknown passes, marks the part uncertain and names what
 * the situation lacked.
 */
export function check(state: RollState, condition: Json | undefined, path: string): boolean {
  if (condition === undefined) return true;
  state.checks += 1;
  const tester = state.ctx.testCondition ?? testPredicate;
  const result = tester(condition, state.situation, state.ctx);
  if (result.answer === 'yes') return true;
  if (result.answer === 'no') return false;
  if (result.unsupported.length === 0) {
    const type =
      typeof condition === 'string' ? condition : typeName(asObject(condition)?.type) || 'list';
    report(state, 'condition', type, path, 'needs_world');
  }
  for (const part of result.unsupported) {
    report(state, part.kind, part.type, joinPath(path, part.path), part.reason);
  }
  state.taint = true;
  return true;
}

/** Joins a pointer and a pointer below it. */
export function joinPath(base: string, below: string): string {
  if (below === '' || below === '/') return base;
  return below.startsWith('/') ? `${base}${below}` : `${base}/${below}`;
}

/** The list of a value that may be one item or a list. */
export function listOf(value: Json | undefined): readonly Json[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * A data file by folder key (`loot_table`, `item_modifier`, ...; the target names the folder)
 * and id through the context's lookup (the project's over vanilla's), the id given its namespace.
 */
export function lookupFile(state: RollState, folder: string, id: string): Json | undefined {
  const full = fullId(id).replace(/^#/, '');
  const named = (state.ctx.types.folders?.data as Readonly<Record<string, string>> | undefined)?.[
    folder
  ];
  return state.ctx.lookup(named ?? folder, full);
}

/**
 * The members of a tag (`registry` as `item` or `enchantment`), cached for the state. A tag the
 * game would drop is reported and gives no member.
 */
export function tagMembers(
  state: RollState,
  registry: string,
  id: string,
  path: string,
): readonly string[] {
  const full = fullId(id).replace(/^#/, '');
  const key = `tag|${registry}|${full}`;
  const known = state.cache.get(key) as readonly string[] | undefined;
  if (known) return known;
  const tag = state.ctx.resolveTag(registry, full);
  if (tag.dropped) report(state, 'reference', `#${full}`, path, 'missing_file');
  const members = tag.dropped ? [] : tag.members.map((member) => member.id);
  state.cache.set(key, members);
  return members;
}

/**
 * A list of ids (`#tag`, one id, or a list of ids and tags) opened up into its ids, in order and
 * each once.
 */
export function idList(
  state: RollState,
  registry: string,
  value: Json | undefined,
  path: string,
): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of listOf(value)) {
    if (typeof item !== 'string') continue;
    const ids = item.startsWith('#') ? tagMembers(state, registry, item, path) : [fullId(item)];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * A book enchants as an item of enchantability 1: observed by the B600 spike (2S3), where
 * `enchant_with_levels` on a book at 30 levels matched the game within 0.75 points with it.
 */
export const BOOK_ENCHANTABILITY = 1;

/** The item `enchant_randomly` and `enchant_with_levels` turn a book into. */
export const BOOK = 'minecraft:book';
export const ENCHANTED_BOOK = 'minecraft:enchanted_book';

/**
 * What is known of an item: the caller's reader, then the target's vanilla tool numbers, then a
 * book's enchantability.
 */
export function itemInfo(state: RollState, id: string): LootItemInfo | undefined {
  const given = state.ctx.items?.(id);
  if (given) return given;
  const key = `item|${id}`;
  if (state.cache.has(key)) return state.cache.get(key) as LootItemInfo | undefined;
  let found: LootItemInfo | undefined =
    id === BOOK ? { enchantability: BOOK_ENCHANTABILITY } : undefined;
  const tools = state.ctx.types.items?.vanillaTools;
  if (tools && id.startsWith('minecraft:')) {
    for (const [tier, byType] of Object.entries(tools)) {
      for (const [tool, stats] of Object.entries(byType)) {
        if (`minecraft:${tier}_${tool}` === id) {
          found = { maxDamage: stats.durability, enchantability: stats.enchantability };
        }
      }
    }
  }
  state.cache.set(key, found);
  return found;
}

/** A work stack of an item sample. */
export function workStack(item: ItemSample | LootStack): WorkStack {
  const stack: WorkStack = { id: fullId(item.id), count: item.count, uncertain: false };
  if (item.enchantments) stack.enchantments = { ...item.enchantments };
  if (item.components) stack.components = { ...item.components };
  if ('damage' in item && item.damage !== undefined) stack.damage = item.damage;
  if ('uncertain' in item && item.uncertain) stack.uncertain = true;
  return stack;
}

/** A public stack of a work stack. */
export function lootStack(stack: WorkStack): LootStack {
  const out: {
    id: string;
    count: number;
    enchantments?: Readonly<Record<string, number>>;
    components?: JsonObject;
    damage?: number;
    uncertain?: boolean;
    pool?: number;
  } = { id: stack.id, count: stack.count };
  if (stack.enchantments && Object.keys(stack.enchantments).length > 0) {
    out.enchantments = stack.enchantments;
  }
  if (stack.components && Object.keys(stack.components).length > 0) {
    out.components = stack.components;
  }
  if (stack.damage !== undefined) out.damage = stack.damage;
  if (stack.uncertain) out.uncertain = true;
  if (stack.pool !== undefined) out.pool = stack.pool;
  return out;
}
