/**
 * An enchantment's effects in plain words (ADR 0120, limit 2L10: described, not played). The
 * effect component ids are the data's own (the target's `enchantment_effect_component_type`
 * registry, the same 31 on both targets, B600 2S11); the words are MSM's. An id not listed here
 * is named as it is, never left out.
 */

import type { Json, JsonObject } from '@msm/plugin-api';

/** Words for each effect component. */
export const EFFECT_WORDS: Readonly<Record<string, string>> = {
  ammo_use: 'Changes how much ammunition a shot uses',
  armor_effectiveness: 'Changes how well the target’s armour works against it',
  attributes: 'Changes attributes while it is worn or held',
  block_experience: 'Changes the experience from mining blocks',
  crossbow_charge_time: 'Changes how long a crossbow takes to load',
  crossbow_charging_sounds: 'Changes the sounds of loading a crossbow',
  damage: 'Changes the damage dealt',
  damage_immunity: 'Makes the wearer immune to some damage',
  damage_protection: 'Lowers the damage taken',
  equipment_drops: 'Changes the chance a mob drops its equipment',
  fishing_luck_bonus: 'Adds luck when fishing',
  fishing_time_reduction: 'Makes fish bite sooner',
  hit_block: 'Does something when it hits a block',
  item_damage: 'Changes how much durability the item loses',
  knockback: 'Changes the knockback dealt',
  location_changed: 'Does something when the wearer moves',
  mob_experience: 'Changes the experience from killing mobs',
  post_attack: 'Does something after an attack',
  post_piercing_attack: 'Does something after a piercing attack',
  prevent_armor_change: 'Stops the armour being taken off',
  prevent_equipment_drop: 'Keeps the item when its holder dies',
  projectile_count: 'Changes how many projectiles are shot at once',
  projectile_piercing: 'Lets projectiles pass through mobs',
  projectile_spawned: 'Does something when a projectile is shot',
  projectile_spread: 'Changes how far projectiles spread',
  repair_with_xp: 'Repairs the item with experience',
  smash_damage_per_fallen_block: 'Adds damage for each block fallen before a smash',
  tick: 'Does something every tick',
  trident_return_acceleration: 'Brings a thrown trident back',
  trident_sound: 'Changes a trident’s sounds',
  trident_spin_attack_strength: 'Launches the holder with a trident in rain or water',
};

const bare = (id: string): string => (id.startsWith('minecraft:') ? id.slice(10) : id);

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const round = (value: number): string => String(Math.round(value * 1000) / 1000);

/** A level-based value in words: `2`, `1 + 0.5 per level above the first`, or its type. */
export function levelValueWords(value: Json | undefined): string | undefined {
  if (typeof value === 'number') return round(value);
  if (!isObject(value) || typeof value.type !== 'string') return undefined;
  const type = bare(value.type);
  if (type === 'linear' && typeof value.base === 'number') {
    const per = typeof value.per_level_above_first === 'number' ? value.per_level_above_first : 0;
    return per === 0
      ? round(value.base)
      : `${round(value.base)} + ${round(per)} per level above the first`;
  }
  return `a ${type.replaceAll('_', ' ')} value`;
}

const VALUE_WORDS: Readonly<Record<string, string>> = {
  add: 'adds',
  multiply: 'multiplies by',
  set: 'sets to',
  remove_binomial: 'removes by chance',
  all_of: 'does several things',
  exponential: 'raises',
};

/** One value effect in words (`adds 1 + 0.5 per level above the first`), when it has one. */
function valueEffectWords(effect: Json | undefined): string | undefined {
  if (!isObject(effect) || typeof effect.type !== 'string') return undefined;
  const type = bare(effect.type);
  const verb = VALUE_WORDS[type] ?? type.replaceAll('_', ' ');
  const amount = levelValueWords(effect.value ?? effect.factor ?? effect.chance);
  return amount === undefined ? verb : `${verb} ${amount}`;
}

/** One line of an enchantment's effects. */
export interface EffectLine {
  /** The effect component id, as written. */
  readonly id: string;
  readonly words: string;
  /** Details in words (amounts, attributes), or none. */
  readonly details: readonly string[];
}

/** The `effects` map in words, in the data's order. */
export function effectLines(effects: Json | undefined): EffectLine[] {
  if (!isObject(effects)) return [];
  const out: EffectLine[] = [];
  for (const [id, value] of Object.entries(effects)) {
    const words = EFFECT_WORDS[bare(id)] ?? `Has the effect “${id}”`;
    const details: string[] = [];
    const list = Array.isArray(value) ? value : [value];
    for (const entry of list) {
      if (!isObject(entry)) continue;
      if (typeof entry.attribute === 'string') {
        const amount = levelValueWords(entry.amount);
        details.push(`${entry.attribute}${amount === undefined ? '' : `: ${amount}`}`);
        continue;
      }
      const effectWords = valueEffectWords(entry.effect);
      if (effectWords !== undefined) {
        details.push(
          entry.requirements === undefined
            ? effectWords
            : `${effectWords}, when its conditions pass`,
        );
      }
    }
    out.push({ id, words, details: [...new Set(details)] });
  }
  return out;
}
