/**
 * The pure model of the Creator's Card tab and effect lists (ADR 0044 D6): enchantment cards
 * (the in-game name with its levels, where it goes, how rare it is and a per-level table of
 * its numbers), painting cards (title, author, size in blocks and how the picture fits) and
 * the rows of an effect list (consumables, charms, totems).
 *
 * Level-based values follow the game's `LevelBasedValue` types (`linear`, `levels_squared`,
 * `clamped`, `fraction`, `lookup`, plain numbers); the enchanting cost is `base` plus
 * `per_level_above_first` for each level above the first.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const ENCHANTMENT_KIND = 'minecraft:enchantment';
const PAINTING_KIND = 'minecraft:painting_variant';
const LANG_KIND = 'minecraft:lang';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** A level in Roman numerals as the game shows it (I to X), larger levels as digits. */
export function romanLevel(level: number): string {
  return ROMAN[level - 1] ?? String(level);
}

/** A number rounded to two decimals for display (`1.5`, `0.25`, `3`). */
export function tidyNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The English words of an id's path: `minecraft:fire_resistance` gives "Fire resistance".
 * Used for vanilla mob effects and attributes, whose names are not in the bundle.
 */
export function idWords(id: string): string {
  const path = id.slice(id.indexOf(':') + 1).replace(/^.*\//, '');
  const words = path.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The string a bundle's language files give `key`, or `undefined`. */
export function bundleTranslation(bundle: ContentBundle, key: string): string | undefined {
  for (const entry of bundle.elements) {
    if (entry.kind !== LANG_KIND || !isObject(entry.data)) continue;
    const value = entry.data[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** The text of a text component: its `translate` key through the bundle, or its `text`. */
function componentText(bundle: ContentBundle, value: Json | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (!isObject(value)) return undefined;
  if (typeof value.translate === 'string') {
    return (
      bundleTranslation(bundle, value.translate) ??
      (typeof value.fallback === 'string' ? value.fallback : value.translate)
    );
  }
  return typeof value.text === 'string' ? value.text : undefined;
}

/**
 * The value of a level-based value at `level`, or `undefined` for a shape the preview does not
 * know.
 */
export function levelValue(value: Json | undefined, level: number): number | undefined {
  const plain = num(value);
  if (plain !== undefined) return plain;
  if (!isObject(value)) return undefined;
  const type = typeof value.type === 'string' ? value.type.replace(/^minecraft:/, '') : '';
  switch (type) {
    case 'linear': {
      const base = num(value.base);
      const per = num(value.per_level_above_first);
      return base === undefined || per === undefined ? undefined : base + per * (level - 1);
    }
    case 'levels_squared': {
      const added = num(value.added);
      return added === undefined ? undefined : level * level + added;
    }
    case 'clamped': {
      const inner = levelValue(value.value, level);
      const min = num(value.min);
      const max = num(value.max);
      if (inner === undefined || min === undefined || max === undefined) return undefined;
      return Math.min(max, Math.max(min, inner));
    }
    case 'fraction': {
      const top = levelValue(value.numerator, level);
      const bottom = levelValue(value.denominator, level);
      return top === undefined || bottom === undefined || bottom === 0 ? undefined : top / bottom;
    }
    case 'lookup': {
      const values = Array.isArray(value.values) ? value.values : [];
      const index = level - 1;
      return index < values.length
        ? levelValue(values[index], level)
        : levelValue(value.fallback, level);
    }
    default:
      return undefined;
  }
}

/** An enchanting cost (`{ base, per_level_above_first }`) at `level`. */
export function enchantingCost(value: Json | undefined, level: number): number | undefined {
  if (!isObject(value)) return undefined;
  const base = num(value.base);
  const per = num(value.per_level_above_first);
  return base === undefined || per === undefined ? undefined : base + per * (level - 1);
}

/** One numeric column of an enchantment's level table. */
interface LevelColumn {
  label: string;
  at(level: number): string;
}

const show = (value: number | undefined, unit = ''): string =>
  value === undefined ? 'n/a' : `${tidyNumber(value)}${unit}`;

/** The vanilla effect components a value effect (`add`, `multiply`, `set`) changes, in words. */
const VALUE_COMPONENT_WORDS: Readonly<Record<string, string>> = {
  damage: 'Extra damage',
  knockback: 'Extra knockback',
  armor_effectiveness: 'Armour effectiveness',
  damage_protection: 'Protection',
  smash_damage_per_fallen_block: 'Smash damage per block fallen',
  item_damage: 'Item wear',
  mob_experience: 'Mob experience',
  block_experience: 'Block experience',
  projectile_count: 'Extra projectiles',
  projectile_spread: 'Projectile spread',
  crossbow_charge_time: 'Charge time',
  trident_spin_attack_strength: 'Spin attack strength',
  fishing_luck_bonus: 'Fishing luck',
  fishing_time_reduction: 'Fishing time reduction',
  repair_with_xp: 'Repair from experience',
  equipment_drops: 'Equipment drops',
  ammo_use: 'Ammo use',
  projectile_piercing: 'Piercing',
};

/** Columns of one value effect (`{ type: add|multiply|set|remove_binomial, ... }`). */
function valueEffectColumns(component: string, effect: JsonObject): LevelColumn[] {
  const type = typeof effect.type === 'string' ? effect.type.replace(/^minecraft:/, '') : '';
  const word = VALUE_COMPONENT_WORDS[component] ?? idWords(component);
  switch (type) {
    case 'add':
      return [{ label: word, at: (level) => `+${show(levelValue(effect.value, level))}` }];
    case 'multiply':
      return [{ label: word, at: (level) => `x${show(levelValue(effect.factor, level))}` }];
    case 'set':
      return [{ label: word, at: (level) => show(levelValue(effect.value, level)) }];
    case 'remove_binomial': {
      const label = component === 'item_damage' ? 'Wear skipped' : `${word} skipped`;
      return [
        {
          label,
          at: (level) => {
            const chance = levelValue(effect.chance, level);
            return chance === undefined ? 'n/a' : `${Math.round(chance * 100)}%`;
          },
        },
      ];
    }
    default:
      return [];
  }
}

/** Columns of one entity effect (`post_attack`, `hit_block`, `tick` and friends). */
function entityEffectColumns(effect: JsonObject): LevelColumn[] {
  const type = typeof effect.type === 'string' ? effect.type.replace(/^minecraft:/, '') : '';
  switch (type) {
    case 'ignite':
      return [
        {
          label: 'Sets on fire (seconds)',
          at: (level) => show(levelValue(effect.duration, level)),
        },
      ];
    case 'apply_mob_effect': {
      const toApply = Array.isArray(effect.to_apply) ? effect.to_apply[0] : effect.to_apply;
      const name = typeof toApply === 'string' ? idWords(toApply.replace(/^#/, '')) : 'Effect';
      const range = (min: Json | undefined, max: Json | undefined, level: number, add = 0) => {
        const low = levelValue(min, level);
        const high = levelValue(max, level);
        if (low === undefined || high === undefined) return 'n/a';
        const a = tidyNumber(low + add);
        const b = tidyNumber(high + add);
        return a === b ? a : `${a} to ${b}`;
      };
      return [
        {
          label: `${name} (seconds)`,
          at: (level) => range(effect.min_duration, effect.max_duration, level),
        },
        {
          label: `${name} level`,
          at: (level) => range(effect.min_amplifier, effect.max_amplifier, level, 1),
        },
      ];
    }
    case 'damage_entity':
      return [
        {
          label: 'Extra damage dealt',
          at: (level) => {
            const low = levelValue(effect.min_damage, level);
            const high = levelValue(effect.max_damage, level);
            if (low === undefined || high === undefined) return 'n/a';
            return low === high ? tidyNumber(low) : `${tidyNumber(low)} to ${tidyNumber(high)}`;
          },
        },
      ];
    default:
      return type === '' ? [] : [{ label: idWords(type), at: () => 'yes' }];
  }
}

/** The columns of an enchantment's `effects`, in component order. */
function effectColumns(effects: Json | undefined): LevelColumn[] {
  if (!isObject(effects)) return [];
  const columns: LevelColumn[] = [];
  for (const [key, list] of Object.entries(effects)) {
    const component = key.replace(/^minecraft:/, '');
    const entries = Array.isArray(list) ? list : [list];
    for (const entry of entries) {
      if (!isObject(entry)) continue;
      if (component === 'attributes') {
        const attribute = typeof entry.attribute === 'string' ? entry.attribute : 'attribute';
        columns.push({
          label: idWords(attribute),
          at: (level) => `+${show(levelValue(entry.amount, level))}`,
        });
        continue;
      }
      const effect = isObject(entry.effect) ? entry.effect : null;
      if (effect === null) continue;
      const type = typeof effect.type === 'string' ? effect.type.replace(/^minecraft:/, '') : '';
      const value = valueEffectColumns(component, effect);
      columns.push(
        ...(value.length > 0 || ['add', 'multiply', 'set'].includes(type)
          ? value
          : entityEffectColumns(effect)),
      );
    }
  }
  return columns;
}

/** One row of an enchantment's level table. */
export interface EnchantmentLevelRow {
  level: number;
  /** The level as the game shows it (I, II, …). */
  roman: string;
  /** The enchanting table levels it appears at (`5 to 25`), or `n/a`. */
  cost: string;
  /** One value per {@link EnchantmentCard.columns} entry. */
  values: string[];
}

/** What the Card tab shows of an enchantment. */
export interface EnchantmentCard {
  id: string;
  /** The English name from the bundle's language file, or the id. */
  name: string;
  maxLevel: number;
  /** The items it goes on (`supported_items`: an item, a list or a `#` tag). */
  supportedItems: string;
  slots: string[];
  weight: number | undefined;
  /** "Common", "Uncommon", "Rare" or "Very rare" for the vanilla weights 10, 5, 2, 1, else `null`. */
  rarity: string | null;
  anvilCost: number | undefined;
  exclusiveSet: string | null;
  /** The headings of the level table after Level and Enchanting cost. */
  columns: string[];
  levels: EnchantmentLevelRow[];
}

const RARITY_OF_WEIGHT: Readonly<Record<number, string>> = {
  10: 'Common',
  5: 'Uncommon',
  2: 'Rare',
  1: 'Very rare',
};

/** The highest level the level table lists (an enchantment may go to 255). */
export const LEVEL_TABLE_LIMIT = 10;

/** The enchantments of a bundle as Card tab cards. */
export function enchantmentCards(bundle: ContentBundle): EnchantmentCard[] {
  return bundle.elements.flatMap((entry) => {
    if (entry.kind !== ENCHANTMENT_KIND || !isObject(entry.data)) return [];
    const data = entry.data;
    const maxLevel = Math.max(1, Math.round(num(data.max_level) ?? 1));
    const weight = num(data.weight);
    const columns = effectColumns(data.effects);
    const supported = data.supported_items;
    const levels: EnchantmentLevelRow[] = [];
    for (let level = 1; level <= Math.min(maxLevel, LEVEL_TABLE_LIMIT); level += 1) {
      const low = enchantingCost(data.min_cost, level);
      const high = enchantingCost(data.max_cost, level);
      levels.push({
        level,
        roman: romanLevel(level),
        cost: low === undefined || high === undefined ? 'n/a' : `${low} to ${high}`,
        values: columns.map((column) => column.at(level)),
      });
    }
    return [
      {
        id: entry.id,
        name: componentText(bundle, data.description) ?? entry.id,
        maxLevel,
        supportedItems: Array.isArray(supported)
          ? supported.filter((item) => typeof item === 'string').join(', ')
          : typeof supported === 'string'
            ? supported
            : '',
        slots: Array.isArray(data.slots)
          ? data.slots.filter((slot): slot is string => typeof slot === 'string')
          : [],
        weight,
        rarity: weight === undefined ? null : (RARITY_OF_WEIGHT[weight] ?? null),
        anvilCost: num(data.anvil_cost),
        exclusiveSet: typeof data.exclusive_set === 'string' ? data.exclusive_set : null,
        columns: columns.map((column) => column.label),
        levels,
      },
    ];
  });
}

/** The words of an equipment slot group an enchantment works in. */
const SLOT_WORDS: Readonly<Record<string, string>> = {
  any: 'any slot',
  hand: 'either hand',
  mainhand: 'the main hand',
  offhand: 'the off hand',
  armor: 'an armour slot',
  head: 'the head slot',
  chest: 'the chest slot',
  legs: 'the legs slot',
  feet: 'the feet slot',
  body: 'the body slot',
  saddle: 'the saddle slot',
};

/** The sentences under an enchantment card's name (where it goes, how rare, the anvil). */
export function enchantmentSummary(card: EnchantmentCard): string[] {
  const lines: string[] = [];
  const slots = card.slots.map((slot) => SLOT_WORDS[slot] ?? slot);
  lines.push(
    `Goes on ${card.supportedItems || 'nothing yet'}${slots.length === 0 ? '' : `, works in ${slots.join(' or ')}`}.`,
  );
  lines.push(
    card.maxLevel === 1
      ? 'Has one level.'
      : `Levels I to ${romanLevel(card.maxLevel)} (${card.maxLevel}).`,
  );
  if (card.weight !== undefined) {
    lines.push(
      card.rarity === null
        ? `Offered with weight ${card.weight}.`
        : `${card.rarity}: offered with weight ${card.weight}.`,
    );
  }
  if (card.anvilCost !== undefined) lines.push(`Anvil cost ${card.anvilCost}.`);
  if (card.exclusiveSet !== null) {
    lines.push(`Cannot be combined with the enchantments in ${card.exclusiveSet}.`);
  }
  return lines;
}

/** What the Card tab shows of a painting variant. */
export interface PaintingCard {
  id: string;
  title: string;
  author: string | null;
  /** Size in blocks. */
  width: number;
  height: number;
  /** The picture's id (`asset_id`). */
  assetId: string;
}

/** The painting variants of a bundle as Card tab cards. */
export function paintingCards(bundle: ContentBundle): PaintingCard[] {
  return bundle.elements.flatMap((entry) => {
    if (entry.kind !== PAINTING_KIND || !isObject(entry.data)) return [];
    const data = entry.data;
    return [
      {
        id: entry.id,
        title: componentText(bundle, data.title) ?? entry.id,
        author: componentText(bundle, data.author) ?? null,
        width: Math.max(1, Math.round(num(data.width) ?? 1)),
        height: Math.max(1, Math.round(num(data.height) ?? 1)),
        assetId: typeof data.asset_id === 'string' ? data.asset_id : entry.id,
      },
    ];
  });
}

/**
 * How a picture of `pixels` fits a painting of `blocks`: pixels per block when the proportions
 * match, otherwise a warning that the game stretches it.
 */
export function pictureFit(
  pixels: { width: number; height: number },
  blocks: { width: number; height: number },
): { matches: boolean; text: string } {
  const matches = pixels.width * blocks.height === pixels.height * blocks.width;
  const size = `${pixels.width} by ${pixels.height} pixels`;
  if (matches) {
    return {
      matches,
      text: `The picture is ${size}: ${tidyNumber(pixels.width / blocks.width)} pixels per block.`,
    };
  }
  return {
    matches,
    text: `The picture is ${size}, not the proportions of ${blocks.width} by ${blocks.height} blocks: the game stretches it to fit.`,
  };
}

/** One row of an effect list. */
export interface EffectRow {
  /** The effect's English name, for example "Fire resistance". */
  name: string;
  /** The level in Roman numerals. */
  level: string;
  seconds: number;
  /** The chance in per cent, or `null` when it always applies. */
  chance: number | null;
  /** Who it affects ("You", "The other entity"), or `null` when it is the user. */
  target: string | null;
}

/** The rows of a `ConsumeEffect` list (`msm:consumable`, `msm:death_protection`). */
export function consumeEffectRows(effects: Json | undefined): EffectRow[] {
  if (!Array.isArray(effects)) return [];
  return effects.flatMap((entry) => {
    if (!isObject(entry) || typeof entry.effect !== 'string') return [];
    const chance = num(entry.chance);
    return [
      {
        name: idWords(entry.effect),
        level: romanLevel(Math.round(num(entry.amplifier) ?? 0) + 1),
        seconds: num(entry.seconds) ?? 0,
        chance: chance === undefined || chance >= 1 ? null : Math.round(chance * 100),
        target: null,
      },
    ];
  });
}

/** The rows of the `apply_effect` actions of an item's event (a charm). */
export function actionEffectRows(actions: Json | undefined): EffectRow[] {
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action) => {
    if (!isObject(action) || action.type !== 'apply_effect') return [];
    if (typeof action.effect !== 'string') return [];
    return [
      {
        name: idWords(action.effect),
        level: romanLevel(Math.round(num(action.amplifier) ?? 0) + 1),
        seconds: num(action.seconds) ?? 0,
        chance: null,
        target: action.target === 'other' ? 'The other entity' : null,
      },
    ];
  });
}
