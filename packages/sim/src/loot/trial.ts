/**
 * Trial spawners (B605; the `trial_spawner` registry, fields per B600 2S12): the waves as numbers
 * per player count, the mobs it picks from and the reward tables it ejects, as shares of their
 * weights. The view rolls each reward table with the loot code.
 *
 * About right: the per-player numbers follow the field names (a base plus an amount for each
 * player after the first), not a measurement. A field left out takes the game's own default,
 * which MSM does not guess: it is listed in `defaults`.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { DataLookup } from '../tags/api.js';

/** One player count's wave. */
export interface TrialWave {
  readonly players: number;
  /** Mobs in all, when the file gives the numbers. */
  readonly totalMobs?: number;
  /** Mobs at once. */
  readonly simultaneousMobs?: number;
}

/** A weighted choice and its share of the weights. */
export interface WeightedShare {
  readonly id: string;
  readonly weight: number;
  readonly share: number;
}

/** One configuration of a trial spawner, summed up. */
export interface TrialConfigSummary {
  readonly spawnRange?: number;
  readonly ticksBetweenSpawn?: number;
  readonly waves: readonly TrialWave[];
  readonly mobs: readonly WeightedShare[];
  readonly rewards: readonly WeightedShare[];
  /** The loot table of items dropped when ominous. */
  readonly ominousItems?: string;
  /** Fields left to the game's default. */
  readonly defaults: readonly string[];
  /** Where a configuration id could not be found. */
  readonly missing: readonly string[];
}

const FIELDS = [
  'spawn_range',
  'total_mobs',
  'total_mobs_added_per_player',
  'simultaneous_mobs',
  'simultaneous_mobs_added_per_player',
  'ticks_between_spawn',
  'spawn_potentials',
  'loot_tables_to_eject',
] as const;

function object(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function num(value: Json | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function shares(list: Json | undefined, idOf: (data: Json | undefined) => string): WeightedShare[] {
  const items = Array.isArray(list) ? list : [];
  const rows = items.map((item) => {
    const entry = object(item) ?? {};
    return { id: idOf(entry.data), weight: Math.max(0, num(entry.weight) ?? 1) };
  });
  const total = rows.reduce((a, r) => a + r.weight, 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? r.weight / total : 0 }));
}

/**
 * Sums up a trial spawner configuration (inline, or the id of a `trial_spawner` file) for 1 to
 * `maxPlayers` players.
 */
export function trialSpawnerSummary(
  config: Json,
  lookup: DataLookup,
  maxPlayers = 4,
): TrialConfigSummary {
  let data = object(config);
  const missing: string[] = [];
  if (typeof config === 'string') {
    const id = config.includes(':') ? config : `minecraft:${config}`;
    data = object(lookup('trial_spawner', id));
    if (!data) missing.push(id);
  }
  const c = data ?? {};
  const defaults = FIELDS.filter((f) => c[f] === undefined);
  const total = num(c.total_mobs);
  const totalAdded = num(c.total_mobs_added_per_player);
  const at = num(c.simultaneous_mobs);
  const atAdded = num(c.simultaneous_mobs_added_per_player);
  const waves: TrialWave[] = [];
  for (let players = 1; players <= maxPlayers; players += 1) {
    const extra = players - 1;
    const wave: { players: number; totalMobs?: number; simultaneousMobs?: number } = { players };
    if (total !== undefined) wave.totalMobs = Math.floor(total + (totalAdded ?? 0) * extra);
    if (at !== undefined) wave.simultaneousMobs = Math.floor(at + (atAdded ?? 0) * extra);
    waves.push(wave);
  }
  const summary: {
    spawnRange?: number;
    ticksBetweenSpawn?: number;
    waves: TrialWave[];
    mobs: WeightedShare[];
    rewards: WeightedShare[];
    ominousItems?: string;
    defaults: string[];
    missing: string[];
  } = {
    waves,
    mobs: shares(c.spawn_potentials, (d) => {
      const id = object(object(d)?.entity)?.id;
      return typeof id === 'string' ? id : '';
    }),
    rewards: shares(c.loot_tables_to_eject, (d) => (typeof d === 'string' ? d : '')),
    defaults: [...defaults],
    missing,
  };
  const range = num(c.spawn_range);
  if (range !== undefined) summary.spawnRange = range;
  const ticks = num(c.ticks_between_spawn);
  if (ticks !== undefined) summary.ticksBetweenSpawn = ticks;
  if (typeof c.items_to_drop_when_ominous === 'string') {
    summary.ominousItems = c.items_to_drop_when_ominous;
  }
  return summary;
}
