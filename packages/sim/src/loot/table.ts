/**
 * Loot tables (B605, ADR 0120 D3): a table rolls its pools in order; a pool whose `condition`
 * passes makes `rolls` (plus `bonus_rolls` x luck) picks, each expanding the entries into
 * candidates and taking one by weight; modifiers run entry first, then pool, then table
 * (observed, B600 2S1). Stacks with nothing left are dropped at the end of each table.
 *
 * A roll at a seed is MSM's own (about right): the game draws its random numbers in its own
 * order, so a single roll differs; the odds over many rolls are what is checked (limit 2L1).
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { Situation } from '../predicates/api.js';
import type { LootRoll } from './api.js';
import { type Candidate, candidateWeight, expandEntry } from './entries.js';
import { applyModifier } from './functions.js';
import { floatValue, intValue } from './numbers.js';
import {
  asObject,
  check,
  fullId,
  type LootContext,
  lookupFile,
  lootStack,
  MAX_DEPTH,
  newState,
  nextInt,
  type RollState,
  report,
  tainted,
  type WorkStack,
} from './state.js';

/** Tables found by id, and pool paths, per state (rolls run many times). */
const TABLES = new WeakMap<RollState, Map<string, { table: JsonObject; id: string }>>();
const POOL_PATHS = new WeakMap<RollState, Map<string, string[]>>();

/** A pool's path, made once per state (rolls run many times). */
function poolPathOf(state: RollState, at: string, i: number): string {
  let paths = POOL_PATHS.get(state)?.get(at);
  if (!paths) {
    paths = [];
    let byTable = POOL_PATHS.get(state);
    if (!byTable) {
      byTable = new Map();
      POOL_PATHS.set(state, byTable);
    }
    byTable.set(at, paths);
  }
  let path = paths[i];
  if (path === undefined) {
    path = `${at}/pools/${i}`;
    paths[i] = path;
  }
  return path;
}

/** The table a value names: an inline table, or the id of one (looked up, reported if missing). */
function tableOf(
  state: RollState,
  value: Json,
  path: string,
): { table: JsonObject; id: string } | undefined {
  if (typeof value === 'string') {
    let byId = TABLES.get(state);
    if (!byId) {
      byId = new Map();
      TABLES.set(state, byId);
    }
    const known = byId.get(value);
    if (known) return known;
    const id = fullId(value);
    const table = asObject(lookupFile(state, 'loot_table', id));
    if (!table) {
      report(state, 'reference', id, path, 'missing_file');
      return undefined;
    }
    const found = { table, id };
    byId.set(value, found);
    return found;
  }
  const table = asObject(value);
  if (!table) {
    report(state, 'reference', 'loot table', path, 'not_supported');
    return undefined;
  }
  return { table, id: path };
}

/**
 * Rolls a table (inline or by id) once, adding its stacks to `out`. `pool` is the top table's
 * pool a nested roll belongs to.
 */
export function rollTable(
  state: RollState,
  value: Json,
  path: string,
  out: WorkStack[],
  pool?: number,
): void {
  const found = tableOf(state, value, path);
  if (!found) return;
  if (state.tables.includes(found.id) || state.tables.length >= MAX_DEPTH) {
    report(state, 'reference', found.id, path, 'not_supported');
    return;
  }
  state.tables.push(found.id);
  const { table } = found;
  const at = typeof value === 'string' ? `${path}=>${found.id}` : path;
  const made: WorkStack[] = [];
  const luck = state.situation.luck ?? 0;
  const pools = Array.isArray(table.pools) ? table.pools : [];
  for (const [i, poolValue] of pools.entries()) {
    const poolData = asObject(poolValue);
    if (!poolData) continue;
    const poolPath = poolPathOf(state, at, i);
    const poolIndex = pool ?? i;
    let passed = true;
    let rolls = 0;
    const unknown = tainted(state, () => {
      passed = check(state, poolData.condition, `${poolPath}/condition`);
      if (!passed) return;
      rolls = intValue(state, poolData.rolls, `${poolPath}/rolls`);
      if (poolData.bonus_rolls !== undefined) {
        rolls += Math.floor(
          floatValue(state, poolData.bonus_rolls, `${poolPath}/bonus_rolls`) * luck,
        );
      }
    });
    if (!passed) continue;
    const entries = Array.isArray(poolData.entries) ? poolData.entries : [];
    for (let r = 0; r < rolls; r += 1) {
      const { candidates, weights, total } = expandPool(
        state,
        poolData,
        entries,
        poolPath,
        unknown,
        luck,
      );
      if (total <= 0) continue;
      let x = nextInt(state.random, total);
      let picked: Candidate | undefined;
      for (const [c, candidate] of candidates.entries()) {
        x -= weights[c] ?? 0;
        if (x < 0) {
          picked = candidate;
          break;
        }
      }
      if (!picked) continue;
      const chosen = picked;
      let stacks: WorkStack[] = [];
      const touched = tainted(state, () => {
        stacks = chosen.make(state);
      });
      if (touched || chosen.uncertain) for (const s of stacks) s.uncertain = true;
      applyModifier(state, poolData.modifier, stacks, `${poolPath}/modifier`);
      for (const s of stacks) {
        if (s.pool === undefined) s.pool = poolIndex;
        made.push(s);
      }
    }
  }
  applyModifier(state, table.modifier, made, `${at}/modifier`);
  for (const s of made) if (s.count > 0) out.push(s);
  state.tables.pop();
}

interface Expanded {
  readonly candidates: readonly Candidate[];
  readonly weights: readonly number[];
  readonly total: number;
}

/**
 * A pool's candidates for one roll. A pool whose expansion tried no condition and met nothing
 * uncertain gives the same candidates every roll, so they are kept for the state (speed).
 */
function expandPool(
  state: RollState,
  poolData: JsonObject,
  entries: readonly Json[],
  poolPath: string,
  unknown: boolean,
  luck: number,
): Expanded {
  const kept = state.fixedPools.get(poolData) as Expanded | undefined;
  if (kept && !unknown) return kept;
  const checks = state.checks;
  const candidates: Candidate[] = [];
  const touched = tainted(state, () => {
    for (const [e, entry] of entries.entries()) {
      expandEntry(state, entry, `${poolPath}/entries/${e}`, candidates, nestedRoll, unknown);
    }
  });
  let total = 0;
  const weights = candidates.map((c) => {
    const w = candidateWeight(c, luck);
    total += w;
    return w;
  });
  const expanded = { candidates, weights, total };
  if (!unknown && !touched && state.checks === checks) state.fixedPools.set(poolData, expanded);
  return expanded;
}

/** A nested table's roll (a `loot_table` entry): its stacks keep the outer pool's index. */
const nestedRoll = (state: RollState, table: Json, path: string, out: WorkStack[]): void => {
  rollTable(state, table, path, out, -1);
  for (const s of out) if (s.pool === -1) delete s.pool;
};

/** Rolls a loot table (inline, or the id of one) once in a situation. */
export function rollLootTable(table: Json, situation: Situation, ctx: LootContext): LootRoll {
  const state = newState(ctx, situation);
  const out: WorkStack[] = [];
  rollTable(state, table, '', out);
  return {
    stacks: out.map(lootStack),
    unsupported: [...state.unsupported.values()],
    parts: [...state.used.values()],
  };
}
