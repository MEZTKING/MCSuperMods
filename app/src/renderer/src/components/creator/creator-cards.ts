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

const EFFECT_KIND = 'msm:effect';
const ITEM_KIND = 'msm:item';

/** The levels an effect card's table lists (the game allows up to 256). */
export const EFFECT_TABLE_LEVELS = 4;

/** The colour of an effect's name in tooltips, by category (vanilla `MobEffectCategory`). */
export const CATEGORY_NAME_COLOURS: Readonly<Record<string, string>> = {
  beneficial: '#5555ff',
  harmful: '#ff5555',
  neutral: '#5555ff',
};

/** The words of an effect category. */
const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  beneficial: 'Good (beneficial)',
  harmful: 'Bad (harmful)',
  neutral: 'Neutral',
};

/** One row of an effect's level table. */
export interface EffectLevelRow {
  level: number;
  roman: string;
  /** One value per {@link EffectCard.columns} entry. */
  values: string[];
}

/** What the Card tab shows of a status effect (`msm:effect`, ADR 0055). */
export interface EffectCard {
  id: string;
  /** The English name (`display_name`), or the id's words. */
  name: string;
  category: 'beneficial' | 'harmful' | 'neutral';
  /** "Good (beneficial)", "Bad (harmful)" or "Neutral". */
  categoryWords: string;
  /** The name's colour in tooltips, from the category. */
  nameColour: string;
  /** The effect's own colour (particles and bar) as `#rrggbb`. */
  colour: string;
  /** The icon's asset: `textures/mob_effect/<path>.png` in the effect's namespace. */
  icon: { namespace: string; path: string };
  /** Sentences under the name (what it does when added, each tick, when it ends). */
  lines: string[];
  /** The headings of the level table after Level. */
  columns: string[];
  levels: EffectLevelRow[];
}

/** An action list's results in words ("heals 2 health", "hurts 2 health", …). */
function actionWords(actions: Json | undefined): string[] {
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action): string[] => {
    if (!isObject(action) || typeof action.type !== 'string') return [];
    const amount = num(action.amount);
    const whom = action.target === 'other' ? ' the one hit' : '';
    switch (action.type) {
      case 'heal':
        return [`heals${whom} ${show(amount)} health`];
      case 'damage':
        return [`hurts${whom} ${show(amount)} health`];
      case 'apply_effect':
        return typeof action.effect === 'string'
          ? [
              `gives${whom === '' ? '' : whom} ${idWords(action.effect)} ${romanLevel(Math.round(num(action.amplifier) ?? 0) + 1)} for ${show(num(action.seconds) ?? 0)} seconds`,
            ]
          : [];
      case 'spawn_particle':
        return ['shows particles'];
      case 'play_sound':
        return ['plays a sound'];
      case 'run_function':
        return [`runs ${typeof action.function === 'string' ? action.function : 'a function'}`];
      case 'run_script':
        return ['runs a script'];
      case 'launch':
        return [`launches${whom}`];
      case 'place_block':
        return ['places a block'];
      default:
        return [action.type.replaceAll('_', ' ')];
    }
  });
}

/** The words of an event's actions, or `undefined` when the event is not in `events`. */
function eventWords(events: Json | undefined, ref: Json | undefined): string | undefined {
  if (!isObject(ref) || typeof ref.event !== 'string' || !isObject(events)) return undefined;
  const event = events[ref.event];
  if (!isObject(event)) return undefined;
  const words = actionWords(event.actions);
  return words.length === 0 ? 'does nothing yet' : words.join(', ');
}

/** A modifier's value at `level` in words (`+0.04`, `+20%`). */
function modifierAt(amount: number, operation: string, level: number): string {
  const value = amount * level;
  if (operation === 'add_multiplied_base' || operation === 'add_multiplied_total') {
    const percent = Math.round(value * 1000) / 10;
    return `${percent >= 0 ? '+' : ''}${percent}%`;
  }
  return `${value >= 0 ? '+' : ''}${tidyNumber(value)}`;
}

const hexColour = (value: number | undefined): string =>
  `#${Math.max(0, Math.min(0xffffff, Math.round(value ?? 0)))
    .toString(16)
    .padStart(6, '0')}`;

/** The status effects of a bundle as Card tab cards. */
export function effectCards(bundle: ContentBundle): EffectCard[] {
  return bundle.elements.flatMap((entry) => {
    if (entry.kind !== EFFECT_KIND || !isObject(entry.data)) return [];
    const data = entry.data;
    const category =
      data.category === 'harmful' || data.category === 'neutral' ? data.category : 'beneficial';
    const components = isObject(data.components) ? data.components : {};
    const columns: LevelColumn[] = [];
    const modifiers = Array.isArray(data.attribute_modifiers) ? data.attribute_modifiers : [];
    for (const modifier of modifiers) {
      if (!isObject(modifier)) continue;
      const amount = num(modifier.amount);
      const attribute = typeof modifier.attribute === 'string' ? modifier.attribute : 'attribute';
      const operation = typeof modifier.operation === 'string' ? modifier.operation : 'add_value';
      columns.push({
        label: idWords(attribute),
        at: (level) => (amount === undefined ? 'n/a' : modifierAt(amount, operation, level)),
      });
    }
    const lines: string[] = [];
    const start = eventWords(data.events, components['msm:on_start']);
    if (start !== undefined) lines.push(`When it is added, it ${start}.`);
    const tick = components['msm:on_tick'];
    const tickWords = eventWords(data.events, tick);
    if (isObject(tick) && tickWords !== undefined) {
      const interval = Math.max(1, Math.round(num(tick.interval_ticks) ?? 20));
      const faster = tick.faster_per_level === true;
      const seconds = (level: number) =>
        (faster ? Math.max(1, Math.floor(interval / level)) : interval) / 20;
      lines.push(
        `Every ${tidyNumber(seconds(1))} seconds it ${tickWords}${faster ? '; higher levels act faster' : ''}.`,
      );
      columns.push({ label: 'Acts every (seconds)', at: (level) => tidyNumber(seconds(level)) });
    }
    const end = eventWords(data.events, components['msm:on_end']);
    if (end !== undefined) lines.push(`When it ends or is removed, it ${end}.`);
    if (modifiers.length > 0) lines.push('Its stat changes last while it does.');
    if (lines.length === 0) lines.push('It shows its icon and particles and does nothing more.');
    const levels: EffectLevelRow[] = [];
    if (columns.length > 0) {
      for (let level = 1; level <= EFFECT_TABLE_LEVELS; level += 1) {
        levels.push({
          level,
          roman: romanLevel(level),
          values: columns.map((column) => column.at(level)),
        });
      }
    }
    const colon = entry.id.indexOf(':');
    return [
      {
        id: entry.id,
        name: typeof data.display_name === 'string' ? data.display_name : idWords(entry.id),
        category,
        categoryWords: CATEGORY_WORDS[category] ?? category,
        nameColour: CATEGORY_NAME_COLOURS[category] ?? '#5555ff',
        colour: hexColour(num(data.color)),
        icon: {
          namespace: entry.id.slice(0, colon),
          path: `mob_effect/${entry.id.slice(colon + 1)}.png`,
        },
        lines,
        columns: columns.map((column) => column.label),
        levels,
      },
    ];
  });
}

/** One point of a throw's flight, in blocks from the thrower's feet. */
export interface ArcPoint {
  x: number;
  y: number;
}

/** The eye height a throw starts from (a standing player). */
export const THROW_EYE_HEIGHT = 1.62;

/**
 * The flight of a throw at `speed` blocks per tick and `gravity`, aimed level from eye height,
 * as vanilla's `ThrowableProjectile` moves (move, then air drag 0.99, then gravity), until it
 * reaches the ground or 200 ticks pass. One point per tick, starting at the eye.
 */
export function throwArc(speed: number, gravity: number): ArcPoint[] {
  const points: ArcPoint[] = [{ x: 0, y: THROW_EYE_HEIGHT }];
  let x = 0;
  let y = THROW_EYE_HEIGHT;
  let vx = speed;
  let vy = 0;
  for (let tick = 0; tick < 200 && y > 0; tick += 1) {
    x += vx;
    y += vy;
    vx *= 0.99;
    vy = vy * 0.99 - gravity;
    if (y <= 0) {
      const previous = points[points.length - 1] as ArcPoint;
      const t = previous.y / (previous.y - y);
      points.push({ x: previous.x + (x - previous.x) * t, y: 0 });
      break;
    }
    points.push({ x, y });
  }
  return points;
}

/** What the Card tab shows of a throwable item (`msm:throwable`, ADR 0056). */
export interface ThrowableCard {
  id: string;
  /** The item's `display_name`, or the id's words. */
  name: string;
  speed: number;
  gravity: number;
  /** Where a level throw from eye height lands. */
  arc: ArcPoint[];
  /** The sentences: distance, damage, holding, after the throw, hits. */
  lines: string[];
}

const AFTER_THROW_WORDS: Readonly<Record<string, string>> = {
  consume: 'Each throw uses one item.',
  keep: 'Throwing does not use the item up.',
  drop: 'It is left where it lands, to be picked up again.',
  return:
    "It goes back into the thrower's inventory when it lands (it does not fly back), or drops at their feet when there is no room.",
};

/** The throwable items of a bundle as Card tab cards. */
export function throwableCards(bundle: ContentBundle): ThrowableCard[] {
  return bundle.elements.flatMap((entry) => {
    if (entry.kind !== ITEM_KIND || !isObject(entry.data)) return [];
    const data = entry.data;
    const components = isObject(data.components) ? data.components : {};
    const throwable = components['msm:throwable'];
    if (!isObject(throwable)) return [];
    const speed = num(throwable.speed) ?? 1.5;
    const gravity = num(throwable.gravity) ?? 0.03;
    const arc = throwArc(speed, gravity);
    const last = arc[arc.length - 1] as ArcPoint;
    const lines = [
      `Thrown at ${tidyNumber(speed)} blocks per tick with gravity ${tidyNumber(gravity)}: a level throw lands about ${Math.round(last.x)} blocks away.`,
    ];
    const damage = num(throwable.damage) ?? 0;
    lines.push(
      damage > 0
        ? `Deals ${tidyNumber(damage)} damage (${tidyNumber(damage / 2)} hearts) to what it hits.`
        : 'Deals no damage itself.',
    );
    const charge = num(throwable.charge_ticks) ?? 0;
    lines.push(
      charge > 0
        ? `Hold use for ${tidyNumber(charge / 20)} seconds, then let go to throw.`
        : 'Thrown at once on use.',
    );
    const after = typeof throwable.after_throw === 'string' ? throwable.after_throw : 'consume';
    lines.push(AFTER_THROW_WORDS[after] ?? AFTER_THROW_WORDS.consume ?? '');
    const cooldown = num(throwable.cooldown_ticks) ?? 0;
    if (cooldown > 0) lines.push(`Then waits ${tidyNumber(cooldown / 20)} seconds.`);
    const hitEntity = eventWords(data.events, throwable.on_hit_entity);
    if (hitEntity !== undefined) lines.push(`Hitting a mob or player ${hitEntity}.`);
    const hitBlock = eventWords(data.events, throwable.on_hit_block);
    if (hitBlock !== undefined) lines.push(`Hitting a block ${hitBlock}.`);
    return [
      {
        id: entry.id,
        name: typeof data.display_name === 'string' ? data.display_name : idWords(entry.id),
        speed,
        gravity,
        arc,
        lines,
      },
    ];
  });
}
