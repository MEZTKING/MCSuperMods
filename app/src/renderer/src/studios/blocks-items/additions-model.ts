/**
 * Pure helpers of the "World addition" and "Extra drops" Studios (B239, ADR 0060 D2, D3): the
 * simple drop row that reads and writes one loot pool, loot table groups, and the new rows the
 * forms add; and of the "Vanilla block rules" Studio (B516, ADR 0105 D4): its six lists in words,
 * the rows "Add" writes, and the vanilla pair a rule replaces. No React, no session.
 *
 * The pool shape the simple row writes is the one the target's `LootPool` schema describes
 * (a single `condition` and an entry `modifier`); {@link simpleDropsSupported} asks the schema,
 * so a target with another pool shape falls back to the generic form and Raw JSON.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { VanillaPairFacts } from '@msm/plugin-api';
import type { SchemaNode } from '@msm/schemas';
import { isJsonObject } from '../../forms/pointer';
import { resolveNode } from '../../forms/schema-utils';
import { listItemNode } from '../structures/pickers';
import { asObject, fieldNodeThrough } from './blocks-items-model';

type JsonObject = { [key: string]: Json };

/** The kind ids the addition Studios edit (ADR 0060 D2, D3). */
export const BIOME_ADDITION_KIND = 'msm:biome_addition';
export const LOOT_ADDITION_KIND = 'msm:loot_addition';
/** The kind id of the vanilla block rules (ADR 0105 D4; registered by `@msm/plugin-blocks-items`). */
export const VANILLA_BLOCK_RULES_KIND = 'msm:vanilla_block_rules';

/** One extra drop as the simple row shows it. */
export interface SimpleDrop {
  /** The item id; empty until picked. */
  item: string;
  /** Smallest and largest count, at least 1. */
  min: number;
  max: number;
  /** The chance that the drop rolls, 0 to 1. */
  chance: number;
  /** Whether it drops only when a player kills the mob. */
  playerKill: boolean;
}

/** The row "Add drop" starts with. */
export const NEW_DROP: Readonly<SimpleDrop> = Object.freeze({
  item: '',
  min: 1,
  max: 1,
  chance: 1,
  playerKill: false,
});

/** `id` without a `minecraft:` prefix. */
const bare = (id: Json | undefined): string | undefined =>
  typeof id === 'string' ? id.replace(/^minecraft:/, '') : undefined;

const onlyKeys = (object: JsonObject, keys: readonly string[]): boolean =>
  Object.keys(object).every((key) => keys.includes(key));

const isCount = (value: Json | undefined): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** The count of a `set_count` modifier, or `undefined` when it is not a simple one. */
function readCount(modifier: Json | undefined): { min: number; max: number } | undefined {
  if (modifier === undefined) return { min: 1, max: 1 };
  if (!isJsonObject(modifier) || bare(modifier.type) !== 'set_count') return undefined;
  if (!onlyKeys(modifier, ['type', 'count'])) return undefined;
  const { count } = modifier;
  if (isCount(count)) return { min: count, max: count };
  if (!isJsonObject(count) || bare(count.type) !== 'uniform') return undefined;
  if (!onlyKeys(count, ['type', 'min', 'max'])) return undefined;
  if (!isCount(count.min) || !isCount(count.max)) return undefined;
  return { min: count.min, max: count.max };
}

/** The chance and player-kill rule of a pool `condition`, or `undefined` when not simple. */
function readCondition(
  condition: Json | undefined,
): { chance: number; playerKill: boolean } | undefined {
  if (condition === undefined) return { chance: 1, playerKill: false };
  if (!isJsonObject(condition)) return undefined;
  const terms =
    bare(condition.type) === 'all_of' && onlyKeys(condition, ['type', 'terms'])
      ? condition.terms
      : [condition];
  if (!Array.isArray(terms) || terms.length === 0 || terms.length > 2) return undefined;
  let chance: number | undefined;
  let playerKill = false;
  for (const term of terms) {
    if (!isJsonObject(term)) return undefined;
    const type = bare(term.type);
    if (type === 'killed_by_player' && onlyKeys(term, ['type']) && !playerKill) {
      playerKill = true;
    } else if (
      type === 'random_chance' &&
      onlyKeys(term, ['type', 'chance']) &&
      typeof term.chance === 'number' &&
      term.chance >= 0 &&
      term.chance <= 1 &&
      chance === undefined
    ) {
      chance = term.chance;
    } else {
      return undefined;
    }
  }
  return { chance: chance ?? 1, playerKill };
}

/**
 * The simple drop a pool holds, or `undefined` when the pool uses more than one item entry with
 * a count, a chance and a player-kill rule (it then stays with the generic form and Raw JSON).
 */
export function readSimpleDrop(pool: Json | undefined): SimpleDrop | undefined {
  if (!isJsonObject(pool) || !onlyKeys(pool, ['rolls', 'entries', 'condition'])) return undefined;
  if (pool.rolls !== 1) return undefined;
  const { entries } = pool;
  if (!Array.isArray(entries) || entries.length !== 1) return undefined;
  const entry = entries[0];
  if (!isJsonObject(entry) || bare(entry.type) !== 'item') return undefined;
  if (!onlyKeys(entry, ['type', 'name', 'modifier']) || typeof entry.name !== 'string') {
    return undefined;
  }
  const count = readCount(entry.modifier);
  const condition = readCondition(pool.condition);
  if (count === undefined || condition === undefined) return undefined;
  return { item: entry.name, ...count, ...condition };
}

/** The loot pool of a simple drop: one roll of one item entry, its count and its condition. */
export function writeSimpleDrop(drop: SimpleDrop): JsonObject {
  const min = Math.max(1, Math.round(drop.min));
  const max = Math.max(min, Math.round(drop.max));
  const entry: JsonObject = { type: 'minecraft:item', name: drop.item };
  if (min !== 1 || max !== 1) {
    entry.modifier = {
      type: 'minecraft:set_count',
      count: min === max ? min : { type: 'minecraft:uniform', min, max },
    };
  }
  const pool: JsonObject = { rolls: 1, entries: [entry] };
  const terms: JsonObject[] = [];
  if (drop.playerKill) terms.push({ type: 'minecraft:killed_by_player' });
  if (drop.chance < 1) terms.push({ type: 'minecraft:random_chance', chance: drop.chance });
  if (terms.length === 1) pool.condition = terms[0] as JsonObject;
  if (terms.length > 1) pool.condition = { type: 'minecraft:all_of', terms };
  return pool;
}

/**
 * Whether the target's pool schema has the shape the simple row writes (a single `condition`
 * on the pool and a `modifier` on entries), read from the element's schema node.
 */
export function simpleDropsSupported(node: SchemaNode | undefined, data: Json): boolean {
  const pools = fieldNodeThrough(node, data, 'pools');
  const pool = listItemNode(pools);
  if (pool === undefined) return false;
  const sample = writeSimpleDrop({ ...NEW_DROP, item: 'minecraft:stone' });
  if (fieldNodeThrough(pool, sample, 'condition') === undefined) return false;
  const entries = listItemNode(fieldNodeThrough(pool, sample, 'entries'));
  if (entries === undefined) return false;
  const resolved = resolveNode(entries);
  // The entry type is a dispatcher on `type`; the item member carries `modifier`.
  return (
    fieldNodeThrough(resolved, { type: 'minecraft:item', name: 'minecraft:stone' }, 'modifier') !==
    undefined
  );
}

/** The loot table groups the table picker offers, by path prefix. */
export const TABLE_GROUPS: readonly { id: string; label: string; prefix: string }[] = Object.freeze(
  [
    { id: 'entities', label: 'Mobs', prefix: 'entities/' },
    { id: 'blocks', label: 'Blocks', prefix: 'blocks/' },
    { id: 'chests', label: 'Chests', prefix: 'chests/' },
  ],
);

/** The group label of a loot table id ("Mobs", "Blocks", "Chests"), or "Other". */
export function tableGroupLabel(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return TABLE_GROUPS.find((group) => path.startsWith(group.prefix))?.label ?? 'Other';
}

/**
 * `suggest` narrowed to loot tables of group `group` (an id of {@link TABLE_GROUPS}): typing
 * `zombie` with "Mobs" offers `minecraft:entities/zombie`. Other registries are unchanged; an
 * empty group offers every table.
 */
export function suggestTablesIn(
  suggest: (registry: string, prefix: string) => string[],
  group: string,
): (registry: string, prefix: string) => string[] {
  const found = TABLE_GROUPS.find((entry) => entry.id === group);
  if (found === undefined) return suggest;
  const inGroup = (id: string) =>
    (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id).startsWith(found.prefix);
  return (registry, prefix) => {
    if (registry !== 'loot_table') return suggest(registry, prefix);
    const out = new Set<string>();
    if (!prefix.includes('/') && !prefix.includes(':')) {
      for (const id of suggest(registry, `${found.prefix}${prefix}`)) out.add(id);
    }
    for (const id of suggest(registry, prefix)) if (inGroup(id)) out.add(id);
    return [...out].filter(inGroup);
  };
}

/** The feature row "Add feature" writes: an ore at the underground ores step. */
export function newBiomeFeature(steps: readonly string[]): JsonObject {
  const step = steps.includes('underground_ores') ? 'underground_ores' : (steps[0] ?? '');
  return { feature: '', step };
}

/** The spawn row "Add spawn" writes. */
export function newBiomeSpawn(categories: readonly string[]): JsonObject {
  const category = categories.includes('monster') ? 'monster' : (categories[0] ?? '');
  return { entity: '', category, weight: 10, min_group: 1, max_group: 4 };
}

/** The list at `key` of an addition, or `[]`. */
export function listAt(data: Json | undefined, key: string): Json[] {
  const value = asObject(data)[key];
  return Array.isArray(value) ? value : [];
}

/** The strings at `key` of an addition (biomes, tables), or `[]`. */
export function idsAt(data: Json | undefined, key: string): string[] {
  return listAt(data, key).filter((value): value is string => typeof value === 'string');
}

// Vanilla block rules (B516, ADR 0105 D4) -------------------------------------------------------

/** The lists of `msm:vanilla_block_rules`, in the order the Studio shows them. */
export const VANILLA_RULE_LISTS = Object.freeze([
  'strip',
  'flatten',
  'till',
  'wax',
  'age',
  'burn',
] as const);
/** One list of {@link VANILLA_RULE_LISTS}. */
export type VanillaRuleList = (typeof VANILLA_RULE_LISTS)[number];

/** Each list in words: its section title (the plan's Very easy wording) and what a row does. */
export const VANILLA_RULE_WORDS: Readonly<
  Record<VanillaRuleList, { title: string; into: string; note: string }>
> = Object.freeze({
  strip: {
    title: 'When you use an axe on it',
    into: 'Becomes',
    note: 'An axe strips it, as logs into stripped logs. Shared block states, such as which way a log lies, are kept.',
  },
  flatten: {
    title: 'When you use a shovel on it',
    into: 'Becomes',
    note: 'A shovel flattens it, as dirt into a path; only when there is air above it.',
  },
  till: {
    title: 'When you use a hoe on it',
    into: 'Becomes',
    note: 'A hoe tills it, as dirt into farmland; only when there is air above it. It can drop an item once, as rooted dirt drops hanging roots.',
  },
  wax: {
    title: 'When you use honeycomb on it',
    into: 'Becomes',
    note: 'Honeycomb waxes it; an axe scrapes the wax off again.',
  },
  age: {
    title: 'Ages like copper',
    into: 'Ages into',
    note: 'It slowly ages into the next block, as copper; an axe scrapes it back.',
  },
  burn: {
    title: 'Burns',
    into: '',
    note: "Fire spreads to it and burns it away at these rates, 0 to 300 each; Minecraft's planks are 5 and 20.",
  },
});

/** The field naming what a row's block becomes (`into`, or `next` for ageing; none for burning). */
export function ruleTargetField(list: VanillaRuleList): 'into' | 'next' | undefined {
  if (list === 'burn') return undefined;
  return list === 'age' ? 'next' : 'into';
}

/** The burn rates a new burning row starts with: Minecraft's planks. */
export const NEW_BURN_ODDS = Object.freeze({ burn_odds: 5, ignite_odds: 20 });

/** The row "Add" writes to `list`. */
export function newVanillaRule(list: VanillaRuleList): JsonObject {
  if (list === 'burn') return { block: '', ...NEW_BURN_ODDS };
  return { block: '', [ruleTargetField(list) ?? 'into']: '' };
}

/** The vanilla pair map a list may replace (`TargetFacts.blocks.vanillaPairs`). */
function vanillaPairMap(
  facts: VanillaPairFacts | undefined,
  list: VanillaRuleList,
): Readonly<Record<string, string>> | undefined {
  if (facts === undefined || list === 'burn') return undefined;
  return facts[list];
}

/**
 * The block vanilla already turns `block` into with the list's tool, or `undefined`: a rule for
 * it replaces vanilla's pair (the validators warn; ADR 0105 D4).
 */
export function vanillaPairOf(
  facts: VanillaPairFacts | undefined,
  list: VanillaRuleList,
  block: Json | undefined,
): string | undefined {
  if (typeof block !== 'string' || block === '') return undefined;
  const id = block.includes(':') ? block : `minecraft:${block}`;
  return vanillaPairMap(facts, list)?.[id];
}
