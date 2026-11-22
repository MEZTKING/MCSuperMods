/**
 * Enchanting in loot (B605): `enchant_randomly`, `enchant_with_levels`, `set_enchantments`' book
 * rule and the enchantment providers (`single`, `by_cost`, `by_cost_with_difficulty`).
 *
 * Written from the enchantment files' fields and the B600 spike's observations (2S3, 2S11), never
 * from the game's code:
 * - `enchant_randomly`: one enchantment picked evenly from `options` (every enchantment without
 *   it; for an item other than a book only those whose `supported_items` hold it, unless
 *   `only_compatible` is false), at an even level from 1 to its `max_level`.
 * - `enchant_with_levels`: the level is modified by the item's enchantability (plus 1 and two
 *   draws of enchantability / 4 + 1, then times 1 + (r + r - 1) x 0.15, rounded, at least 1);
 *   each enchantment offers its highest level whose cost window (`min_cost` to `max_cost`, base
 *   plus `per_level_above_first` per level) holds it; one is picked by `weight`, then more while
 *   a draw of 50 is at most the level, each compatible with those picked (`exclusive_set`), the
 *   level halved after each. Checked within 0.75 points (book at 30, sword at 5 to 15).
 * - A book becomes an enchanted book; its enchantments are then its stored enchantments.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { ItemSample, Situation, Unsupported } from '../predicates/api.js';
import type { LootStack } from './api.js';
import { intProvider, intValue } from './numbers.js';
import {
  asNumber,
  asObject,
  BOOK,
  BOOK_ENCHANTABILITY,
  ENCHANTED_BOOK,
  fullId,
  idList,
  itemInfo,
  type LootContext,
  type LootFidelity,
  lookupFile,
  lootStack,
  newState,
  nextInt,
  type RollState,
  report,
  typeName,
  use,
  type WorkStack,
  workStack,
} from './state.js';

/** Enchantment provider types and how close each is. */
export const ENCHANTMENT_PROVIDER_SUPPORT: Readonly<Record<string, LootFidelity>> = {
  by_cost: 'about_right',
  by_cost_with_difficulty: 'only_in_game',
  single: 'about_right',
};

/** An enchantment file as the evaluator uses it. */
interface EnchantmentData {
  readonly id: string;
  readonly weight: number;
  readonly maxLevel: number;
  readonly minCost: readonly [number, number];
  readonly maxCost: readonly [number, number];
  readonly supported: ReadonlySet<string>;
  /** `primary_items` when given, else `supported_items`. */
  readonly primary: ReadonlySet<string>;
  readonly exclusive: ReadonlySet<string>;
}

function costPair(value: Json | undefined): readonly [number, number] {
  const object = asObject(value);
  return [asNumber(object?.base) ?? 0, asNumber(object?.per_level_above_first) ?? 0];
}

/** One enchantment's data, cached for the state; `undefined` (reported) when missing. */
function enchantment(state: RollState, id: string, path: string): EnchantmentData | undefined {
  const full = fullId(id);
  const key = `ench|${full}`;
  if (state.cache.has(key)) return state.cache.get(key) as EnchantmentData | undefined;
  const file = asObject(lookupFile(state, 'enchantment', full));
  let data: EnchantmentData | undefined;
  if (!file) {
    report(state, 'reference', full, path, 'missing_file');
  } else {
    const supported = new Set(idList(state, 'item', file.supported_items, path));
    data = {
      id: full,
      weight: Math.max(0, asNumber(file.weight) ?? 1),
      maxLevel: Math.max(1, asNumber(file.max_level) ?? 1),
      minCost: costPair(file.min_cost),
      maxCost: costPair(file.max_cost),
      supported,
      primary:
        file.primary_items === undefined
          ? supported
          : new Set(idList(state, 'item', file.primary_items, path)),
      exclusive: new Set(idList(state, 'enchantment', file.exclusive_set, path)),
    };
  }
  state.cache.set(key, data);
  return data;
}

/** The enchantments of `options` (an id, a `#tag` or a list), or all of them without it. */
function optionIds(
  state: RollState,
  options: Json | undefined,
  path: string,
  type: string,
): readonly string[] | undefined {
  if (options !== undefined) return idList(state, 'enchantment', options, `${path}/options`);
  const all = state.ctx.ids?.('enchantment');
  if (!all) {
    report(state, 'function', type, path, 'missing_file');
    return undefined;
  }
  return all.map(fullId);
}

/** Whether two enchantments may be on one item. */
function compatible(a: EnchantmentData, b: EnchantmentData): boolean {
  return a.id !== b.id && !a.exclusive.has(b.id) && !b.exclusive.has(a.id);
}

/** Sets enchantments on a stack, turning a book into an enchanted book. */
export function addEnchantments(stack: WorkStack, levels: Readonly<Record<string, number>>): void {
  const next = { ...(stack.enchantments ?? {}) };
  for (const [id, level] of Object.entries(levels)) {
    if (level > 0) next[fullId(id)] = level;
    else delete next[fullId(id)];
  }
  stack.enchantments = next;
  if (stack.id === BOOK && Object.keys(next).length > 0) stack.id = ENCHANTED_BOOK;
}

/** `enchant_randomly` on one stack. */
export function enchantRandomly(
  state: RollState,
  fn: JsonObject,
  stack: WorkStack,
  path: string,
): void {
  const ids = optionIds(state, fn.options, path, 'enchant_randomly');
  if (!ids) return;
  const book = stack.id === BOOK;
  const onlyCompatible = fn.only_compatible !== false;
  const cacheKey = `rand|${path}|${stack.id}|${onlyCompatible}`;
  let list = state.cache.get(cacheKey) as readonly EnchantmentData[] | undefined;
  if (!list) {
    list = ids
      .map((id) => enchantment(state, id, path))
      .filter((e): e is EnchantmentData => e !== undefined)
      .filter((e) => book || !onlyCompatible || e.supported.has(stack.id));
    state.cache.set(cacheKey, list);
  }
  if (list.length === 0) return;
  const picked = list[nextInt(state.random, list.length)] as EnchantmentData;
  const level = 1 + nextInt(state.random, picked.maxLevel);
  addEnchantments(stack, { [picked.id]: level });
}

/** The enchantability of a stack's item, reported (and taken as 1) when nobody knows it. */
function enchantability(state: RollState, id: string, path: string, type: string): number {
  const known = itemInfo(state, id)?.enchantability;
  if (known !== undefined) return known;
  report(state, 'function', `${type} (enchantability of ${id})`, path, 'missing_file');
  return BOOK_ENCHANTABILITY;
}

/**
 * Picks enchantments for a stack at an enchanting cost, as an enchanting table would offer them
 * (`enchant_with_levels`, `by_cost`).
 */
export function enchantAtCost(
  state: RollState,
  stack: WorkStack,
  cost: number,
  options: Json | undefined,
  path: string,
  type: string,
): void {
  const ids = optionIds(state, options, path, type);
  if (!ids) return;
  const book = stack.id === BOOK;
  const quarter = Math.floor(enchantability(state, stack.id, path, type) / 4) + 1;
  let level = cost + 1 + nextInt(state.random, quarter) + nextInt(state.random, quarter);
  const bonus = (state.random.next() + state.random.next() - 1) * 0.15;
  level = Math.max(1, Math.round(level + level * bonus));
  const poolKey = `pool|${path}|${stack.id}`;
  let pool = state.cache.get(poolKey) as readonly EnchantmentData[] | undefined;
  if (!pool) {
    pool = ids
      .map((id) => enchantment(state, id, path))
      .filter((e): e is EnchantmentData => e !== undefined)
      .filter((e) => book || e.primary.has(stack.id));
    state.cache.set(poolKey, pool);
  }
  let candidates: { data: EnchantmentData; level: number }[] = [];
  for (const data of pool) {
    for (let l = data.maxLevel; l >= 1; l -= 1) {
      const min = data.minCost[0] + data.minCost[1] * (l - 1);
      const max = data.maxCost[0] + data.maxCost[1] * (l - 1);
      if (min <= level && level <= max) {
        candidates.push({ data, level: l });
        break;
      }
    }
  }
  const pick = (): { data: EnchantmentData; level: number } | undefined => {
    let total = 0;
    for (const c of candidates) total += c.data.weight;
    if (total <= 0) return undefined;
    let x = nextInt(state.random, total);
    for (const c of candidates) {
      x -= c.data.weight;
      if (x < 0) return c;
    }
    return undefined;
  };
  const chosen: { data: EnchantmentData; level: number }[] = [];
  const first = pick();
  if (first) {
    chosen.push(first);
    while (nextInt(state.random, 50) <= level) {
      candidates = candidates.filter((c) => chosen.every((o) => compatible(o.data, c.data)));
      if (candidates.length === 0) break;
      const next = pick();
      if (!next) break;
      chosen.push(next);
      level = Math.floor(level / 2);
    }
  }
  if (chosen.length === 0) return;
  addEnchantments(stack, Object.fromEntries(chosen.map((c) => [c.data.id, c.level])));
}

/** `enchant_with_levels` on one stack. */
export function enchantWithLevels(
  state: RollState,
  fn: JsonObject,
  stack: WorkStack,
  path: string,
): void {
  const cost = intValue(state, fn.levels, `${path}/levels`);
  enchantAtCost(state, stack, cost, fn.options, path, 'enchant_with_levels');
}

/** Applies an enchantment provider (an inline provider or the id of one) to a stack. */
export function applyEnchantmentProvider(
  state: RollState,
  provider: Json,
  stack: WorkStack,
  path: string,
): void {
  let value: Json | undefined = provider;
  let at = path;
  if (typeof provider === 'string') {
    value = lookupFile(state, 'enchantment_provider', provider);
    at = `${path}=>${fullId(provider)}`;
    if (value === undefined) {
      report(state, 'reference', fullId(provider), path, 'missing_file');
      return;
    }
  }
  const object = asObject(value);
  const type = typeName(object?.type);
  if (!object) {
    report(state, 'reference', 'enchantment_provider', at, 'not_supported');
    return;
  }
  const fidelity = ENCHANTMENT_PROVIDER_SUPPORT[type];
  if (fidelity) use(state, 'enchantment_provider', type, fidelity);
  switch (type) {
    case 'single': {
      const id = typeof object.enchantment === 'string' ? fullId(object.enchantment) : '';
      const level = intProvider(state, object.level, `${at}/level`);
      if (id) addEnchantments(stack, { [id]: level });
      return;
    }
    case 'by_cost':
      enchantAtCost(
        state,
        stack,
        intProvider(state, object.cost, `${at}/cost`),
        object.enchantments,
        at,
        'by_cost',
      );
      return;
    case 'by_cost_with_difficulty':
      // The cost follows the place's regional difficulty, which needs a world: the lowest cost
      // stands in, marked uncertain.
      report(state, 'function', type, at, 'needs_world');
      enchantAtCost(
        state,
        stack,
        asNumber(object.min_cost) ?? 0,
        object.enchantments,
        at,
        'by_cost_with_difficulty',
      );
      return;
    default:
      report(state, 'function', type || 'no type', at, 'not_supported');
  }
}

/**
 * Applies an enchantment provider to an item once (Roll it on a chosen item): the item with the
 * enchantments it gave and what could not be worked out.
 */
export function rollEnchantmentProvider(
  provider: Json,
  item: ItemSample,
  situation: Situation,
  ctx: LootContext,
): { readonly item: LootStack; readonly unsupported: readonly Unsupported[] } {
  const state = newState(ctx, situation);
  const stack = workStack(item);
  state.taint = false;
  applyEnchantmentProvider(state, provider, stack, '');
  if (state.taint) stack.uncertain = true;
  return { item: lootStack(stack), unsupported: [...state.unsupported.values()] };
}
