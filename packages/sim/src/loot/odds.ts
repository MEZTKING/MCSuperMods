/**
 * The odds (B605, ADR 0120 D3; limit 2L1): many seeded rolls counted per item key (the item,
 * its enchantments and its durability left in twentieths), in steps so a worker can post
 * progress and stop at the cancel token. These are the numbers the view shows as checked: within
 * 2 percentage points per outcome of the game's own 10,000 rolls (3 for explosions).
 *
 * Rows a part only the game knows touched are marked `uncertain`, and that part is named in the
 * step's `unsupported` list. Components (names, lore) do not split rows.
 */

import type { Json } from '@msm/plugin-api';
import type { ItemSample, Situation } from '../predicates/api.js';
import type { EnchantmentOdds, OddsOptions, OddsRow, OddsStep } from './api.js';
import { applyEnchantmentProvider } from './enchant.js';
import { type LootContext, newState, type RollState, type WorkStack, workStack } from './state.js';
import { rollTable } from './table.js';

/** Durability left is grouped into this many steps for the odds. */
export const DAMAGE_STEPS = 20;

interface RowTally {
  readonly item: string;
  readonly enchantments: Readonly<Record<string, number>> | undefined;
  readonly damage: number | undefined;
  uncertain: boolean;
  readonly pools: Set<number>;
  total: number;
  some: number;
  readonly counts: Map<number, number>;
}

/** The key of a stack's row and its durability step. */
function keyOf(stack: WorkStack): { key: string; damage: number | undefined } {
  const damage =
    stack.damage === undefined ? undefined : Math.round(stack.damage * DAMAGE_STEPS) / DAMAGE_STEPS;
  let key = stack.id;
  if (stack.enchantments) {
    const parts = Object.entries(stack.enchantments)
      .map(([id, level]) => `${id}=${level}`)
      .sort();
    if (parts.length > 0) key += `|${parts.join(',')}`;
  }
  if (damage !== undefined) key += `|d${damage}`;
  return { key, damage };
}

/** Counts rolls per item key; `rows()` gives the odds so far. */
export class OddsTally {
  private readonly tallies = new Map<string, RowTally>();
  private readonly enchantmentRolls = new Map<
    string,
    { item: string; enchantment: string; level: number; rolls: number }
  >();
  /** Rolls counted. */
  done = 0;

  /** Counts one roll's stacks (several stacks of one key count as one outcome, summed). */
  add(stacks: readonly WorkStack[]): void {
    this.done += 1;
    const sums = new Map<string, { tally: RowTally; count: number }>();
    const enchantments = new Set<string>();
    for (const stack of stacks) {
      const { key, damage } = keyOf(stack);
      let tally = this.tallies.get(key);
      if (!tally) {
        tally = {
          item: stack.id,
          enchantments:
            stack.enchantments && Object.keys(stack.enchantments).length > 0
              ? { ...stack.enchantments }
              : undefined,
          damage,
          uncertain: false,
          pools: new Set(),
          total: 0,
          some: 0,
          counts: new Map(),
        };
        this.tallies.set(key, tally);
      }
      if (stack.uncertain) tally.uncertain = true;
      if (stack.pool !== undefined) tally.pools.add(stack.pool);
      const sum = sums.get(key);
      if (sum) sum.count += stack.count;
      else sums.set(key, { tally, count: stack.count });
      for (const [id, level] of Object.entries(stack.enchantments ?? {})) {
        enchantments.add(`${stack.id}|${id}|${level}`);
      }
    }
    for (const { tally, count } of sums.values()) {
      tally.total += count;
      tally.some += 1;
      tally.counts.set(count, (tally.counts.get(count) ?? 0) + 1);
    }
    for (const key of enchantments) {
      const known = this.enchantmentRolls.get(key);
      if (known) known.rolls += 1;
      else {
        const [item = '', enchantment = '', level = '0'] = key.split('|');
        this.enchantmentRolls.set(key, { item, enchantment, level: Number(level), rolls: 1 });
      }
    }
  }

  /** The rows so far, the likeliest first. */
  rows(): OddsRow[] {
    const n = Math.max(1, this.done);
    const rows: OddsRow[] = [];
    for (const tally of this.tallies.values()) {
      const counts: Record<number, number> = {};
      const none = this.done - tally.some;
      if (none > 0) counts[0] = none;
      for (const [count, rolls] of [...tally.counts.entries()].sort((a, b) => a[0] - b[0])) {
        counts[count] = (counts[count] ?? 0) + rolls;
      }
      const row: {
        item: string;
        enchantments?: Readonly<Record<string, number>>;
        damage?: number;
        chance: number;
        mean: number;
        counts: Readonly<Record<number, number>>;
        uncertain?: boolean;
        pools?: readonly number[];
      } = { item: tally.item, chance: tally.some / n, mean: tally.total / n, counts };
      if (tally.enchantments) row.enchantments = tally.enchantments;
      if (tally.damage !== undefined) row.damage = tally.damage;
      if (tally.uncertain) row.uncertain = true;
      if (tally.pools.size > 0) row.pools = [...tally.pools].sort((a, b) => a - b);
      rows.push(row);
    }
    return rows.sort((a, b) => b.chance - a.chance || a.item.localeCompare(b.item));
  }

  /** The share of rolls that gave each enchantment at each level, per item. */
  enchantments(): EnchantmentOdds[] {
    const n = Math.max(1, this.done);
    return [...this.enchantmentRolls.values()]
      .map((e) => ({
        item: e.item,
        enchantment: e.enchantment,
        level: e.level,
        chance: e.rolls / n,
      }))
      .sort(
        (a, b) =>
          a.item.localeCompare(b.item) ||
          a.enchantment.localeCompare(b.enchantment) ||
          a.level - b.level,
      );
  }

  /** One step's answer. */
  step(state: RollState): OddsStep {
    return {
      done: this.done,
      rows: this.rows(),
      enchantments: this.enchantments(),
      unsupported: [...state.unsupported.values()],
      parts: [...state.used.values()],
    };
  }
}

/** Runs `roll` `options.rolls` times in steps, stopping when the cancel token is set. */
function* inSteps(
  state: RollState,
  options: OddsOptions,
  roll: () => WorkStack[],
): Generator<OddsStep> {
  const tally = new OddsTally();
  const total = Math.max(0, Math.floor(options.rolls));
  const step = Math.max(1, Math.floor(options.step));
  if (total === 0) {
    yield tally.step(state);
    return;
  }
  while (tally.done < total) {
    if (options.cancel.cancelled) return;
    const n = Math.min(step, total - tally.done);
    for (let i = 0; i < n; i += 1) {
      state.taint = false;
      tally.add(roll());
    }
    yield tally.step(state);
  }
}

/** The odds of a loot table (inline, or the id of one). */
export function* lootTableOdds(
  table: Json,
  situation: Situation,
  ctx: LootContext,
  options: OddsOptions,
): Generator<OddsStep> {
  const state = newState(ctx, situation);
  yield* inSteps(state, options, () => {
    const out: WorkStack[] = [];
    rollTable(state, table, '', out);
    return out;
  });
}

/** The odds of an enchantment provider on an item: which enchantments and levels it gives. */
export function* enchantmentProviderOdds(
  provider: Json,
  item: ItemSample,
  situation: Situation,
  ctx: LootContext,
  options: OddsOptions,
): Generator<OddsStep> {
  const state = newState(ctx, situation);
  yield* inSteps(state, options, () => {
    const stack = workStack(item);
    state.taint = false;
    applyEnchantmentProvider(state, provider, stack, '');
    if (state.taint) stack.uncertain = true;
    return [stack];
  });
}
