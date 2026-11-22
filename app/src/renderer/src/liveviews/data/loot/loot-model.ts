/**
 * What the Roll it views share (B609; ADR 0120 D3, limits 2L1 and 2L2): the data folders they
 * ask for, the words of the odds, which rows an addition brought, and the thing a table is
 * about. Pure apart from {@link useDebounced}; the views draw these.
 *
 * Every random draw and every roll happens in the live views worker; nothing here rolls.
 */

import type { Json, Project } from '@msm/plugin-api';
import type { LootAdditionElement, LootPart, OddsRow, Unsupported } from '@msm/sim';
import { useEffect, useState } from 'react';
import { type Fidelity, weakest } from '../../frame/fidelity';
import { type LangTable, wordsOfPath } from '../../frame/item-picture';
import { PICKER_PRESETS } from '../../frame/situations';

/**
 * The data folders a roll reads, project and vanilla: tables, the enchantments and their
 * providers, predicates, the number providers, trial spawners and the tags the parts name.
 * Every one is a folder the cache keeps (`LIVE_VIEW_DATA_FOLDERS`, the target's block tags).
 */
export const LOOT_FOLDERS: readonly string[] = Object.freeze([
  'context_float_provider',
  'context_int_provider',
  'enchantment',
  'enchantment_provider',
  'loot_table',
  'predicate',
  'tags/block',
  'tags/damage_type',
  'tags/enchantment',
  'tags/entity_type',
  'tags/item',
  'trial_spawner',
]);

/** The kind of `msm:loot_addition` elements. */
export const LOOT_ADDITION = 'msm:loot_addition';

/**
 * The seed the odds roll with: always the same, so a new seed changes the one roll and not the
 * odds ("the odds are the same"), and the odds of an unchanged table come from the cache.
 */
export const ODDS_SEED = 'the odds';

/** What the plan's limit 2L1 says under every roll. */
export const ROLL_DIFFERS = 'Your roll in the game will differ; the odds are the same.';

/** The fidelity line of one roll (2L1: MSM's own random sequence). */
export const ONE_ROLL_WORDS = 'One roll: MSM’s own';

/** The fidelity line of the odds, by the weakest part they used. */
export const ODDS_WORDS: Readonly<Record<Fidelity, string>> = {
  checked: 'Odds: checked against the game',
  about_right: 'Odds: about right (some parts are MSM’s own reading)',
  only_in_game: 'Odds: some parts only the game knows',
};

/** How many rows of the odds are drawn before "and N more". */
export const ODDS_ROWS_SHOWN = 40;

/** The level of the odds: the weakest part they used (`checked` before any part is known). */
export function oddsFidelity(parts: readonly LootPart[] | undefined): Fidelity {
  return weakest((parts ?? []).map((part) => part.fidelity));
}

/** A share as a percentage in plain words: `12.3%`, `under 0.1%`, `100%`. */
export function percent(chance: number): string {
  if (chance <= 0) return '0%';
  if (chance >= 1) return '100%';
  const value = chance * 100;
  if (value < 0.1) return 'under 0.1%';
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
}

/** How many of a row drop when it drops: `1`, `1 to 3, about 1.9`. */
export function howMany(row: OddsRow): string {
  const counts = Object.keys(row.counts)
    .map(Number)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const low = counts[0];
  const high = counts[counts.length - 1];
  if (low === undefined || high === undefined) return 'none';
  if (low === high) return String(low);
  const average = row.chance > 0 ? row.mean / row.chance : 0;
  return `${low} to ${high}, about ${average.toFixed(1)}`;
}

/** Whether a row or stack came (also) from a pool an addition brought. */
export function fromAddedPool(pools: readonly number[] | undefined, ownPools: number): boolean {
  return (pools ?? []).some((pool) => pool >= ownPools);
}

/** The additions whose pools a row came from, in their order. */
export function addedBy(
  pools: readonly number[] | undefined,
  added: readonly { readonly addition: string; readonly pools: readonly number[] }[],
): string[] {
  const mine = new Set(pools ?? []);
  return added.filter((entry) => entry.pools.some((pool) => mine.has(pool))).map((e) => e.addition);
}

/** Every `msm:loot_addition` element of the project, in the project's order (as the runtime adds them). */
export function lootAdditions(project: Pick<Project, 'namespaces'>): LootAdditionElement[] {
  const out: LootAdditionElement[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === LOOT_ADDITION) {
        out.push({ id: element.id, data: element.data as Json });
      }
    }
  }
  return out;
}

/** The tables an addition names, each with its namespace, in order and once each. */
export function additionTables(data: Json | undefined): string[] {
  const object =
    data !== null && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
  const tables = Array.isArray(object?.tables) ? object.tables : [];
  const out: string[] = [];
  for (const table of tables) {
    if (typeof table !== 'string' || table.trim() === '') continue;
    const full = table.includes(':') ? table : `minecraft:${table}`;
    if (!out.includes(full)) out.push(full);
  }
  return out;
}

/** The project's own loot table of an id, or `undefined`. */
export function projectTable(project: Pick<Project, 'namespaces'>, id: string): Json | undefined {
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:loot_table' && element.id === id) return element.data as Json;
    }
  }
  return undefined;
}

/**
 * The block or mob a table is about, from where it lives: `ns:blocks/ruby` is the block
 * `ns:ruby`, `ns:entities/zombie` the mob `ns:zombie`. The situation puts it in place of a
 * preset's sample block or mob.
 */
export function tableSubject(id: string): { block?: string; entity?: string } {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : id.slice(0, colon);
  const path = colon < 0 ? id : id.slice(colon + 1);
  if (path.startsWith('blocks/')) return { block: `${namespace}:${path.slice('blocks/'.length)}` };
  if (path.startsWith('entities/')) {
    return { entity: `${namespace}:${path.slice('entities/'.length)}` };
  }
  return {};
}

/**
 * The contexts a table says it is rolled in (its `type`), when the picker has presets for it;
 * otherwise none (every preset is offered).
 */
export function tableContexts(data: Json | undefined): string[] {
  const object =
    data !== null && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
  const type = object?.type;
  if (typeof type !== 'string' || type === '') return [];
  const contexts = [type.includes(':') ? type : `minecraft:${type}`];
  return PICKER_PRESETS.some((entry) => contexts.includes(entry.fields.context)) ? contexts : [];
}

/**
 * Whether the view should show the set-up banner's reason: something was not found while the
 * Minecraft folder is not set up (a vanilla table, tag or enchantment, `missing_file`).
 */
export function namesMissingFile(parts: readonly Unsupported[]): boolean {
  return parts.some((part) => part.reason === 'missing_file');
}

/** A mob's name: `en_us`'s, else words made from its id. */
export function entityName(id: string, lang: LangTable | null): string {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : id.slice(0, colon);
  const path = colon < 0 ? id : id.slice(colon + 1);
  return lang?.[`entity.${namespace}.${path.replaceAll('/', '.')}`] ?? wordsOfPath(id);
}

/** The reported parts of several answers, each once. */
export function allUnsupported(
  ...lists: (readonly Unsupported[] | undefined)[]
): readonly Unsupported[] {
  const seen = new Set<string>();
  const out: Unsupported[] = [];
  for (const list of lists) {
    for (const part of list ?? []) {
      const key = `${part.kind}|${part.type}|${part.path}|${part.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }
  return out;
}

/** The parts of several answers, each once (the weakest level kept). */
export function allParts(...lists: (readonly LootPart[] | undefined)[]): readonly LootPart[] {
  const byKey = new Map<string, LootPart>();
  for (const list of lists) {
    for (const part of list ?? []) {
      const key = `${part.kind}|${part.type}`;
      const known = byKey.get(key);
      if (known === undefined || weakest([known.fidelity, part.fidelity]) !== known.fidelity) {
        byKey.set(key, part);
      }
    }
  }
  return [...byKey.values()];
}

/** A value that follows `value` once it has stood still for `ms` (the views' 150 ms). */
export function useDebounced<T>(value: T, ms: number, key: string): T {
  const [settled, setSettled] = useState(value);
  // `key` stands for `value` (a JSON value is compared by its contents).
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);
  return settled;
}

/** A table in plain words: `minecraft:entities/zombie` is "Zombie (a mob)". */
export function tableWords(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const name = wordsOfPath(id);
  if (path.startsWith('entities/')) return `${name} (a mob)`;
  if (path.startsWith('blocks/')) return `${name} (a block)`;
  if (path.startsWith('chests/')) return `${name} (a chest)`;
  if (path.startsWith('gameplay/fishing')) return `${name} (fishing)`;
  return name;
}
