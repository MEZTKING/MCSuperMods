/**
 * An enchantment's level table and the enchanting table's costs, worked out from the cost fields
 * (B600 2S11, observed on both targets with a fixture enchantment; MSM's own model, never the
 * game's code):
 *
 * - A level's cost window is `base + per_level_above_first x (level - 1)`, for `min_cost` and
 *   `max_cost`.
 * - The table's slots: base = random(8) + 1 + shelves / 2 + random(shelves + 1), shelves at most
 *   15; the top slot costs max(base / 3, 1), the middle base x 2 / 3 + 1, the bottom
 *   max(base, shelves x 2) (within 0.77 points of the game).
 * - At a cost the level is modified by the item's enchantability: cost + 1 + two draws of
 *   random(enchantability / 4 + 1), then times 1 + (r + r - 1) x 0.15, rounded, at least 1; an
 *   enchantment offers its highest level whose window holds that (within 1.33 points).
 *
 * Exact sums over those draws, no random numbers: the same fields give the same table.
 */

import type { Json, JsonObject } from '@msm/plugin-api';

/** The cost fields of an enchantment file. */
export interface CostFields {
  readonly maxLevel: number;
  readonly minCost: readonly [number, number];
  readonly maxCost: readonly [number, number];
  readonly weight: number;
  readonly anvilCost: number;
}

/** The most cost an enchanting table asks (15 shelves, bottom slot). */
export const TABLE_MAX_COST = 30;
/** Bookshelves that count. */
export const MAX_SHELVES = 15;

const num = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function pair(value: Json | undefined): readonly [number, number] {
  const object =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  return [num(object.base, 0), num(object.per_level_above_first, 0)];
}

/** The cost fields of an enchantment file (missing ones as zero, the level at least 1). */
export function costFieldsOf(data: Json | undefined): CostFields {
  const object =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as JsonObject) : {};
  return {
    maxLevel: Math.max(1, Math.floor(num(object.max_level, 1))),
    minCost: pair(object.min_cost),
    maxCost: pair(object.max_cost),
    weight: num(object.weight, 1),
    anvilCost: num(object.anvil_cost, 0),
  };
}

/** A level's cost window. */
export function costWindow(fields: CostFields, level: number): { min: number; max: number } {
  return {
    min: fields.minCost[0] + fields.minCost[1] * (level - 1),
    max: fields.maxCost[0] + fields.maxCost[1] * (level - 1),
  };
}

/** The level an enchantment offers at a modified level: its highest whose window holds it, or 0. */
export function levelAtModified(fields: CostFields, modified: number): number {
  for (let level = fields.maxLevel; level >= 1; level -= 1) {
    const { min, max } = costWindow(fields, level);
    if (min <= modified && modified <= max) return level;
  }
  return 0;
}

/** The CDF of t = u1 + u2 - 1 (two even draws from 0 to 1). */
function triangleCdf(t: number): number {
  if (t <= -1) return 0;
  if (t >= 1) return 1;
  return t < 0 ? (1 + t) ** 2 / 2 : 1 - (1 - t) ** 2 / 2;
}

/** How likely each modified level is at a cost for an item of some enchantability. */
export function modifiedLevels(cost: number, enchantability: number): Map<number, number> {
  const quarter = Math.floor(Math.max(0, enchantability) / 4) + 1;
  const out = new Map<number, number>();
  for (let a = 0; a < quarter; a += 1) {
    for (let b = 0; b < quarter; b += 1) {
      const x = cost + 1 + a + b;
      const weight = 1 / (quarter * quarter);
      const low = Math.round(x * 0.85) - 1;
      const high = Math.round(x * 1.15) + 1;
      for (let m = low; m <= high; m += 1) {
        const from = ((m - 0.5) / x - 1) / 0.15;
        const to = ((m + 0.5) / x - 1) / 0.15;
        const p = triangleCdf(to) - triangleCdf(from);
        if (p <= 0) continue;
        const level = Math.max(1, m);
        out.set(level, (out.get(level) ?? 0) + p * weight);
      }
    }
  }
  return out;
}

/** How likely each level of this enchantment is in the pick at a cost (0: none of its windows). */
export function levelChances(
  fields: CostFields,
  cost: number,
  enchantability: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [modified, p] of modifiedLevels(cost, enchantability)) {
    const level = levelAtModified(fields, modified);
    out.set(level, (out.get(level) ?? 0) + p);
  }
  return out;
}

/** Whole numbers as ranges: [1, 2, 3, 7] to "1 to 3, 7". */
export function rangesText(values: readonly number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | undefined;
  let last: number | undefined;
  for (const value of sorted) {
    if (start !== undefined && last !== undefined && value === last + 1) {
      last = value;
      continue;
    }
    if (start !== undefined && last !== undefined) {
      parts.push(start === last ? String(start) : `${start} to ${last}`);
    }
    start = value;
    last = value;
  }
  if (start !== undefined && last !== undefined) {
    parts.push(start === last ? String(start) : `${start} to ${last}`);
  }
  return parts.join(', ');
}

/** One row of the level table. */
export interface LevelRow {
  readonly level: number;
  readonly minCost: number;
  readonly maxCost: number;
  /** The table costs (1 to 30) at which the enchanting table can give this level. */
  readonly tableCosts: readonly number[];
}

/** The level table for an item of some enchantability. */
export function levelTable(fields: CostFields, enchantability: number): LevelRow[] {
  const byLevel = new Map<number, number[]>();
  for (let cost = 1; cost <= TABLE_MAX_COST; cost += 1) {
    for (const [level, p] of levelChances(fields, cost, enchantability)) {
      if (level === 0 || p <= 1e-9) continue;
      const list = byLevel.get(level) ?? [];
      list.push(cost);
      byLevel.set(level, list);
    }
  }
  const rows: LevelRow[] = [];
  for (let level = 1; level <= fields.maxLevel; level += 1) {
    const { min, max } = costWindow(fields, level);
    rows.push({ level, minCost: min, maxCost: max, tableCosts: byLevel.get(level) ?? [] });
  }
  return rows;
}

/** The cost range of each of the table's three slots with some bookshelves. */
export function slotCosts(shelves: number): readonly { min: number; max: number }[] {
  const s = Math.min(MAX_SHELVES, Math.max(0, Math.floor(shelves)));
  const half = Math.floor(s / 2);
  const slots = [
    { min: Number.POSITIVE_INFINITY, max: 0 },
    { min: Number.POSITIVE_INFINITY, max: 0 },
    { min: Number.POSITIVE_INFINITY, max: 0 },
  ];
  for (let a = 0; a < 8; a += 1) {
    for (let b = 0; b <= s; b += 1) {
      const base = a + 1 + half + b;
      const costs = [
        Math.max(Math.floor(base / 3), 1),
        Math.floor((base * 2) / 3) + 1,
        Math.max(base, s * 2),
      ];
      for (const [i, cost] of costs.entries()) {
        const slot = slots[i] as { min: number; max: number };
        slot.min = Math.min(slot.min, cost);
        slot.max = Math.max(slot.max, cost);
      }
    }
  }
  return slots;
}
