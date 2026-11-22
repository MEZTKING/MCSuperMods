/**
 * Reading a {@link Situation} (ADR 0120 D4): the entities a condition names, enchantment levels
 * on items, the fields an entity sample may hold, and the presets the picker offers in plain
 * words. A field the sample does not hold makes a condition unknown, never no; a missing entity,
 * tool or killer is "none" (the game then answers no, B600's "the game's answers when the
 * situation lacks something").
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { normaliseId } from '../tags/lookup.js';
import type { EntitySample, ItemSample, Situation } from './api.js';

/**
 * The fields of an {@link EntitySample} the conditions read (all optional; a field not given is
 * not known, so a condition about it answers unknown):
 *
 * - `flags`: `is_on_fire`, `is_sneaking`, `is_sprinting`, `is_swimming`, `is_baby`,
 *   `is_on_ground`, `is_flying`, `is_in_water`, `is_fall_flying`, each true or false;
 * - `scores`: objective name to score (a score not listed is not known);
 * - `team`: the team name, or `''` for none;
 * - `equipment`: slot (`mainhand`, `offhand`, `head`, `chest`, `legs`, `feet`, `body`) to item
 *   (a slot not listed is empty once `equipment` is given);
 * - `effects`: effect id to its amplifier and duration (an effect not listed is not on it);
 * - `tags`: the entity's own tags (the `tag` command's), all of them;
 * - `position`: where it stands (else the situation's position).
 */
export interface EntityFields {
  readonly flags?: Readonly<Record<string, boolean>>;
  readonly scores?: Readonly<Record<string, number>>;
  readonly team?: string;
  readonly equipment?: Readonly<Record<string, ItemSample>>;
  readonly effects?: Readonly<
    Record<string, { readonly amplifier: number; readonly duration: number }>
  >;
  readonly tags?: readonly string[];
  readonly position?: readonly [number, number, number];
}

/** The typed fields of an entity sample (fields of the wrong shape are left out). */
export function entityFields(entity: EntitySample): EntityFields {
  const fields: {
    -readonly [K in keyof EntityFields]: EntityFields[K];
  } = {};
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (record(entity.flags)) {
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(entity.flags)) {
      if (typeof value === 'boolean') flags[key] = value;
    }
    fields.flags = flags;
  }
  if (record(entity.scores)) {
    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(entity.scores)) {
      if (typeof value === 'number') scores[key] = value;
    }
    fields.scores = scores;
  }
  if (typeof entity.team === 'string') fields.team = entity.team;
  if (record(entity.equipment)) {
    fields.equipment = entity.equipment as Record<string, ItemSample>;
  }
  if (record(entity.effects)) {
    fields.effects = entity.effects as NonNullable<EntityFields['effects']>;
  }
  if (Array.isArray(entity.tags)) {
    fields.tags = entity.tags.filter((tag): tag is string => typeof tag === 'string');
  }
  if (
    Array.isArray(entity.position) &&
    entity.position.length === 3 &&
    entity.position.every((n) => typeof n === 'number')
  ) {
    fields.position = entity.position as unknown as [number, number, number];
  }
  return fields;
}

/** What a condition's `entity` field names. */
export type EntityTarget =
  | 'this'
  | 'killer'
  | 'attacker'
  | 'direct_killer'
  | 'direct_attacker'
  | 'killer_player'
  | 'attacking_player'
  | 'target_entity'
  | 'interacting_entity';

/**
 * The entity a condition names: `found` with the entity, `none` when the situation has no such
 * entity (the game answers no), or `unknown` when the situation cannot hold it (a target or an
 * interacting entity: they belong to the game's own events).
 */
export type EntityLookup =
  | { readonly status: 'found'; readonly entity: EntitySample }
  | { readonly status: 'none' }
  | { readonly status: 'unknown' };

/** Finds the entity `target` names in the situation. */
export function entityFor(target: Json | undefined, situation: Situation): EntityLookup {
  const found = (entity: EntitySample | undefined): EntityLookup =>
    entity === undefined ? { status: 'none' } : { status: 'found', entity };
  switch (target) {
    case 'this':
      return found(situation.thisEntity);
    case 'killer':
    case 'attacker':
      return found(situation.killer);
    case 'direct_killer':
    case 'direct_attacker':
      return found(situation.directKiller);
    case 'killer_player':
    case 'attacking_player':
      return found(situation.killer?.player === true ? situation.killer : undefined);
    default:
      return { status: 'unknown' };
  }
}

/** The level of an enchantment on an item (0 when it is not on it, or there is no item). */
export function enchantmentLevel(item: ItemSample | undefined, enchantment: string): number {
  if (item?.enchantments === undefined) return 0;
  const id = normaliseId(enchantment);
  for (const [key, level] of Object.entries(item.enchantments)) {
    if (normaliseId(key) === id) return level;
  }
  return 0;
}

/** The enchantments stored in an item (an enchanted book's), from its components. */
export function storedEnchantments(item: ItemSample): Readonly<Record<string, number>> {
  const component = componentOf(item, 'stored_enchantments');
  if (component === undefined || component === null || typeof component !== 'object') return {};
  if (Array.isArray(component)) return {};
  const levels = component.levels;
  const map: JsonObject =
    levels !== undefined && levels !== null && typeof levels === 'object' && !Array.isArray(levels)
      ? levels
      : component;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'number') out[normaliseId(key)] = value;
  }
  return out;
}

/** A component of an item by id, with or without `minecraft:`. */
export function componentOf(item: ItemSample, id: string): Json | undefined {
  if (item.components === undefined) return undefined;
  const full = normaliseId(id);
  for (const [key, value] of Object.entries(item.components)) {
    if (normaliseId(key) === full) return value;
  }
  return undefined;
}

/** A preset of the situation picker: plain words and the situation behind them. */
export interface SituationPreset {
  readonly id: string;
  readonly label: string;
  readonly situation: Situation;
}

const PICKAXE: ItemSample = { id: 'minecraft:diamond_pickaxe', count: 1 };

/**
 * The picker's presets (ADR 0120 D4: presets in plain words, the fields in Advanced). Weather,
 * time, place and scores are left out on purpose: a condition about them answers "only the game
 * knows" until the user sets them.
 */
export const SITUATION_PRESETS: readonly SituationPreset[] = [
  {
    id: 'mine_hand',
    label: 'Mining a block with your hand',
    situation: { context: 'minecraft:block', block: { id: 'minecraft:stone' } },
  },
  {
    id: 'mine_pickaxe',
    label: 'Mining a block with a pickaxe',
    situation: { context: 'minecraft:block', block: { id: 'minecraft:stone' }, tool: PICKAXE },
  },
  {
    id: 'mine_fortune',
    label: 'Mining a block with a Fortune III pickaxe',
    situation: {
      context: 'minecraft:block',
      block: { id: 'minecraft:stone' },
      tool: { ...PICKAXE, enchantments: { 'minecraft:fortune': 3 } },
    },
  },
  {
    id: 'mine_silk',
    label: 'Mining a block with a Silk Touch pickaxe',
    situation: {
      context: 'minecraft:block',
      block: { id: 'minecraft:stone' },
      tool: { ...PICKAXE, enchantments: { 'minecraft:silk_touch': 1 } },
    },
  },
  {
    id: 'block_exploded',
    label: 'A block blown up by another block',
    situation: {
      context: 'minecraft:block',
      block: { id: 'minecraft:stone' },
      explosion: { power: 4, decays: true },
    },
  },
  {
    id: 'kill_player',
    label: 'A mob killed by a player',
    situation: {
      context: 'minecraft:entity',
      thisEntity: { type: 'minecraft:zombie' },
      killer: { type: 'minecraft:player', player: true },
      directKiller: { type: 'minecraft:player' },
      damage: { type: 'minecraft:player_attack' },
    },
  },
  {
    id: 'kill_looting',
    label: 'A mob killed by a player with a Looting III sword',
    situation: {
      context: 'minecraft:entity',
      thisEntity: { type: 'minecraft:zombie' },
      killer: {
        type: 'minecraft:player',
        player: true,
        weapon: {
          id: 'minecraft:diamond_sword',
          count: 1,
          enchantments: { 'minecraft:looting': 3 },
        },
      },
      directKiller: { type: 'minecraft:player' },
      damage: { type: 'minecraft:player_attack' },
    },
  },
  {
    id: 'kill_mob',
    label: 'A mob killed by another mob',
    situation: {
      context: 'minecraft:entity',
      thisEntity: { type: 'minecraft:zombie' },
      killer: { type: 'minecraft:skeleton', player: false },
      directKiller: { type: 'minecraft:arrow' },
      damage: { type: 'minecraft:arrow' },
    },
  },
  {
    id: 'mob_died',
    label: 'A mob that died with no one near',
    situation: {
      context: 'minecraft:entity',
      thisEntity: { type: 'minecraft:zombie' },
      damage: { type: 'minecraft:fall' },
    },
  },
  {
    id: 'chest',
    label: 'Opening a chest',
    situation: { context: 'minecraft:chest', thisEntity: { type: 'minecraft:player' } },
  },
];
