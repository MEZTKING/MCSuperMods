/**
 * Loot tables, item modifiers and the odds (ADR 0120 D3; B601 stubbed the interface B600
 * reported, B605 fills it). A roll at a seed is MSM's own (about right); the odds are checked
 * within the tolerance of limit 2L1 (2 points per outcome). A type not known is reported, never
 * skipped.
 *
 * Conditions are tried by `testPredicate` (B604) through `LootContext.testCondition`. An unknown
 * answer is never turned into no: it is taken as passing, the stacks and rows it touched are
 * marked `uncertain`, and what the situation lacked is named in `unsupported`.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { ItemSample, Situation, Unsupported } from '../predicates/api.js';
import { applyToStack } from './functions.js';
import { lootTableOdds } from './odds.js';
import {
  itemInfo,
  type LootContext,
  type LootPart,
  lootStack,
  newState,
  workStack,
} from './state.js';
import { rollLootTable } from './table.js';

export type {
  ConditionTester,
  LootContext,
  LootFidelity,
  LootItemInfo,
  LootPart,
} from './state.js';

/** One stack a roll made. */
export interface LootStack extends ItemSample {
  /** The fraction of durability left (0 to 1), when a function set it (`set_damage`). */
  readonly damage?: number;
  /** Made or changed by a part whose answer only the game knows (see `unsupported`). */
  readonly uncertain?: boolean;
  /** The index of the table's pool it came from (an addition's pools follow the table's own). */
  readonly pool?: number;
}

/** What {@link rollLoot} answers. */
export interface LootRoll {
  readonly stacks: readonly LootStack[];
  readonly unsupported: readonly Unsupported[];
  /** The entry, function and number types the roll used, with how close each is. */
  readonly parts?: readonly LootPart[];
}

/** One line of the odds: an item key (item, enchantments, damage) and how it came out. */
export interface OddsRow {
  readonly item: string;
  readonly enchantments?: Readonly<Record<string, number>>;
  /** Durability left, in twentieths (0 to 1). */
  readonly damage?: number;
  /** The share of rolls that gave at least one (0 to 1). */
  readonly chance: number;
  /** The mean count over all rolls. */
  readonly mean: number;
  /** Rolls by the count they gave (0 included when some rolls gave none). */
  readonly counts: Readonly<Record<number, number>>;
  /** Some of these came from a part only the game can answer for. */
  readonly uncertain?: boolean;
  /** The table pools it came from. */
  readonly pools?: readonly number[];
}

/** How often an enchantment at a level was on an item (the many combinations summed up). */
export interface EnchantmentOdds {
  readonly item: string;
  readonly enchantment: string;
  readonly level: number;
  /** The share of rolls with it (0 to 1). */
  readonly chance: number;
}

/** What one step of {@link lootOdds} gives. */
export interface OddsStep {
  readonly done: number;
  readonly rows: readonly OddsRow[];
  /** Each enchantment and level per item, over all combinations. */
  readonly enchantments?: readonly EnchantmentOdds[];
  /** What could not be worked out so far, each once. */
  readonly unsupported?: readonly Unsupported[];
  /** The parts used so far, with how close each is. */
  readonly parts?: readonly LootPart[];
}

/** Asks {@link lootOdds} how many rolls to make, how many per step and when to stop. */
export interface OddsOptions {
  readonly rolls: number;
  readonly step: number;
  readonly cancel: { readonly cancelled: boolean };
}

/** Rolls a loot table (inline, or the id of one) once in a situation. */
export function rollLoot(table: Json, situation: Situation, ctx: LootContext): LootRoll {
  return rollLootTable(table, situation, ctx);
}

/**
 * The odds of a loot table over many rolls, in steps so a worker can post progress and stop at
 * the cancel token. Each step answers the counts so far; a cancelled run yields nothing more.
 */
export function lootOdds(
  table: Json,
  situation: Situation,
  ctx: LootContext,
  options: OddsOptions,
): Iterable<OddsStep> {
  return lootTableOdds(table, situation, ctx, options);
}

/**
 * Applies an item modifier (a function, a list, or an item modifier id) to an item. A count of
 * 0 after it means the item is gone (`discard`, `set_count` to 0). The count stays within one
 * slot: an item with durability holds 1 (observed: `set_count` 5 on a sword left 1, B600).
 */
export function applyItemModifier(
  modifier: JsonObject | readonly Json[] | string,
  item: ItemSample | LootStack,
  situation: Situation,
  ctx: LootContext,
): {
  readonly item: LootStack;
  readonly unsupported: readonly Unsupported[];
  readonly parts: readonly LootPart[];
} {
  const state = newState(ctx, situation);
  const stack = workStack(item);
  applyToStack(state, modifier as Json, stack, '');
  const info = itemInfo(state, stack.id);
  const max = info?.maxStackSize ?? (info?.maxDamage !== undefined ? 1 : undefined);
  if (max !== undefined) stack.count = Math.min(stack.count, max);
  return {
    item: lootStack(stack),
    unsupported: [...state.unsupported.values()],
    parts: [...state.used.values()],
  };
}
