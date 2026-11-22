/**
 * `msm:loot_addition` (B605; ADR 0060 D3): the runtime adds an addition's `pools` to each table
 * it names, after the table's own pools, in the project's order. The view rolls a table with and
 * without its additions; the rows of the added pools are told apart by `OddsRow.pools` (an added
 * pool's index is the table's own pool count or more).
 */

import type { Json, JsonObject } from '@msm/plugin-api';

/** One addition element of the project: its id and data (`format`, `tables`, `pools`). */
export interface LootAdditionElement {
  readonly id: string;
  readonly data: Json;
}

/** A table with additions added, and which pools each addition brought. */
export interface TableWithAdditions {
  readonly table: JsonObject;
  /** The table's own pool count; pools at this index and after are added. */
  readonly ownPools: number;
  readonly added: readonly { readonly addition: string; readonly pools: readonly number[] }[];
}

function fullId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** Whether an addition names a table. */
export function additionTargets(addition: Json, tableId: string): boolean {
  const data =
    addition !== null && typeof addition === 'object' && !Array.isArray(addition) ? addition : {};
  const tables = Array.isArray(data.tables) ? data.tables : [];
  const wanted = fullId(tableId);
  return tables.some((t) => typeof t === 'string' && fullId(t) === wanted);
}

/** The additions of a project that name a table, in the project's order. */
export function additionsFor(
  tableId: string,
  additions: readonly LootAdditionElement[],
): LootAdditionElement[] {
  return additions.filter((a) => additionTargets(a.data, tableId));
}

/** A table with the pools of every addition that names it added after its own. */
export function withLootAdditions(
  tableId: string,
  table: Json,
  additions: readonly LootAdditionElement[],
): TableWithAdditions {
  const base = table !== null && typeof table === 'object' && !Array.isArray(table) ? table : {};
  const own = Array.isArray(base.pools) ? base.pools : [];
  const pools: Json[] = [...own];
  const added: { addition: string; pools: number[] }[] = [];
  for (const addition of additionsFor(tableId, additions)) {
    const data = addition.data as JsonObject;
    const extra = Array.isArray(data.pools) ? data.pools : [];
    const indexes: number[] = [];
    for (const pool of extra) {
      indexes.push(pools.length);
      pools.push(pool);
    }
    added.push({ addition: addition.id, pools: indexes });
  }
  return { table: { ...base, pools }, ownPools: own.length, added };
}
