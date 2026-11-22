/**
 * Loot tables, item modifiers and the odds (ADR 0120 D3; B601 stubs the interface B600 reported,
 * B605 fills it). A roll at a seed is MSM's own (about right); the odds are checked within the
 * tolerance of limit 2L1 (2 points per outcome). A type not known is reported, never skipped.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import {
  type EvalContext,
  type ItemSample,
  NOT_YET,
  type Situation,
  type Unsupported,
} from '../predicates/api.js';

/** One stack a roll made. */
export interface LootStack extends ItemSample {
  /** Durability left, when a function set it. */
  readonly damage?: number;
}

/** What {@link rollLoot} answers. */
export interface LootRoll {
  readonly stacks: readonly LootStack[];
  readonly unsupported: readonly Unsupported[];
}

/** One line of the odds: an item key (item, enchantments, damage) and how it came out. */
export interface OddsRow {
  readonly item: string;
  readonly enchantments?: Readonly<Record<string, number>>;
  readonly damage?: number;
  /** The share of rolls that gave at least one (0 to 1). */
  readonly chance: number;
  /** The mean count over all rolls. */
  readonly mean: number;
  /** Rolls by the count they gave. */
  readonly counts: Readonly<Record<number, number>>;
}

/** What one step of {@link lootOdds} gives. */
export interface OddsStep {
  readonly done: number;
  readonly rows: readonly OddsRow[];
}

/** Asks {@link lootOdds} how many rolls to make, how many per step and when to stop. */
export interface OddsOptions {
  readonly rolls: number;
  readonly step: number;
  readonly cancel: { readonly cancelled: boolean };
}

/** Rolls a loot table once in a situation (B605). Stub: nothing, with a "not yet" note. */
export function rollLoot(_table: Json, _situation: Situation, _ctx: EvalContext): LootRoll {
  return { stacks: [], unsupported: [NOT_YET('entry', '')] };
}

/**
 * The odds of a loot table over many rolls, in steps so a worker can post progress and stop at
 * the cancel token (B605). Stub: one step with no rows.
 */
export function* lootOdds(
  _table: Json,
  _situation: Situation,
  _ctx: EvalContext,
  _options: OddsOptions,
): Iterable<OddsStep> {
  yield { done: 0, rows: [] };
}

/** Applies an item modifier to an item (B605). Stub: the item as it was. */
export function applyItemModifier(
  _modifier: JsonObject | readonly Json[],
  item: ItemSample,
  _situation: Situation,
  _ctx: EvalContext,
): { readonly item: ItemSample; readonly unsupported: readonly Unsupported[] } {
  return { item, unsupported: [NOT_YET('function', '')] };
}
