/**
 * Mob effect questions shared by the Consumable and Totem flows (ADR 0044 D2, D4): a fixed
 * number of effect slots, each a choice of vanilla effect (or none), its duration, its level
 * and, for consumables, the chance it applies. {@link chosenEffects} and
 * {@link consumeEffects} turn the answers into the `ConsumeEffect` list of `msm:consumable`
 * and `msm:death_protection`.
 *
 * The Status effect and Throwable flows (ADRs 0055, 0056) share the stat change questions
 * ({@link statParameters}, {@link attributeModifiers}), the particle choices, the effect colour
 * as an integer and the effect icon asset.
 *
 * @packageDocumentation
 */
import type { ContentBundleAsset, JsonObject, StarterParameter } from '@msm/plugin-api';
import { placeholderPng, type Rgb } from '../assets/png';
import { numberValue, type ParameterValues, stringValue } from './parameters';

/** The "no effect" value of an effect slot. */
export const NO_EFFECT = 'none';

/**
 * The vanilla mob effects the flows offer, by id, with their English names. Every id is
 * checked against each target's vendored `mob_effect` registry in the tests.
 */
export const EFFECT_CHOICES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'minecraft:speed', label: 'Speed' },
  { value: 'minecraft:haste', label: 'Haste' },
  { value: 'minecraft:strength', label: 'Strength' },
  { value: 'minecraft:jump_boost', label: 'Jump boost' },
  { value: 'minecraft:regeneration', label: 'Regeneration' },
  { value: 'minecraft:resistance', label: 'Resistance' },
  { value: 'minecraft:fire_resistance', label: 'Fire resistance' },
  { value: 'minecraft:water_breathing', label: 'Water breathing' },
  { value: 'minecraft:invisibility', label: 'Invisibility' },
  { value: 'minecraft:night_vision', label: 'Night vision' },
  { value: 'minecraft:health_boost', label: 'Health boost' },
  { value: 'minecraft:absorption', label: 'Absorption' },
  { value: 'minecraft:saturation', label: 'Saturation' },
  { value: 'minecraft:slow_falling', label: 'Slow falling' },
  { value: 'minecraft:luck', label: 'Luck' },
  { value: 'minecraft:glowing', label: 'Glowing' },
  { value: 'minecraft:slowness', label: 'Slowness' },
  { value: 'minecraft:weakness', label: 'Weakness' },
  { value: 'minecraft:poison', label: 'Poison' },
  { value: 'minecraft:nausea', label: 'Nausea' },
]);

/** The starting answers of one effect slot. */
export interface EffectSlotDefaults {
  effect: string;
  seconds: number;
  level: number;
}

/**
 * The questions of `slots.length` effect slots (`effect_1`, `effect_1_seconds`,
 * `effect_1_level` and, with `chance`, `effect_1_chance`; then `effect_2`, ...), all in
 * `group`.
 *
 * @param group - The wizard step.
 * @param slots - The defaults of each slot, in order.
 * @param chance - Whether each slot also asks for the chance the effect applies.
 */
export function effectParameters(
  group: string,
  slots: readonly EffectSlotDefaults[],
  chance: boolean,
): StarterParameter[] {
  const choices = [{ value: NO_EFFECT, label: 'None' }, ...EFFECT_CHOICES].map((entry) => ({
    ...entry,
  }));
  return slots.flatMap((slot, index): StarterParameter[] => {
    const n = index + 1;
    const parameters: StarterParameter[] = [
      {
        id: `effect_${n}`,
        label: `Effect ${n}`,
        group,
        type: 'choice',
        default: slot.effect,
        choices: choices.map((entry) => ({ ...entry })),
      },
      {
        id: `effect_${n}_seconds`,
        label: `Effect ${n}: seconds`,
        description: `How long effect ${n} lasts.`,
        group,
        type: 'number',
        default: slot.seconds,
        min: 1,
        max: 600,
        step: 1,
      },
      {
        id: `effect_${n}_level`,
        label: `Effect ${n}: level`,
        description: '1 is level I, 2 is level II, and so on.',
        group,
        type: 'number',
        default: slot.level,
        min: 1,
        max: 5,
        step: 1,
      },
    ];
    if (chance) {
      parameters.push({
        id: `effect_${n}_chance`,
        label: `Effect ${n}: chance`,
        description: 'From 0 to 1: 1 always applies the effect, 0.5 half of the time.',
        group,
        type: 'number',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      });
    }
    return parameters;
  });
}

/** One chosen effect, with its English name. */
export interface ChosenEffect {
  effect: string;
  label: string;
  seconds: number;
  /** Level minus one, as the game stores it. */
  amplifier: number;
  /** 0 to 1; 1 when the slot asks no chance. */
  chance: number;
}

/** The chosen effects of `count` slots, in slot order, leaving out slots set to none. */
export function chosenEffects(values: ParameterValues, count: number): ChosenEffect[] {
  const out: ChosenEffect[] = [];
  for (let n = 1; n <= count; n += 1) {
    const effect = stringValue(values, `effect_${n}`);
    const choice = EFFECT_CHOICES.find((entry) => entry.value === effect);
    if (choice === undefined) continue;
    const chanceValue = values[`effect_${n}_chance`];
    out.push({
      effect,
      label: choice.label,
      seconds: Math.round(numberValue(values, `effect_${n}_seconds`)),
      amplifier: Math.max(0, Math.round(numberValue(values, `effect_${n}_level`)) - 1),
      chance:
        typeof chanceValue === 'number'
          ? Math.round(Math.min(1, Math.max(0, chanceValue)) * 100) / 100
          : 1,
    });
  }
  return out;
}

/**
 * The `ConsumeEffect` JSON of chosen effects: `amplifier` only above level I and `chance`
 * only below 1, as the MSM format's defaults allow.
 */
export function consumeEffects(effects: readonly ChosenEffect[]): JsonObject[] {
  return effects.map((entry) => {
    const out: JsonObject = { effect: entry.effect, seconds: entry.seconds };
    if (entry.amplifier > 0) out.amplifier = entry.amplifier;
    if (entry.chance < 1) out.chance = entry.chance;
    return out;
  });
}

/** Roman numerals for effect levels 1 to 5. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** `Speed II for 60 seconds`, for notes. */
export function describeEffect(entry: ChosenEffect): string {
  const level = ROMAN[entry.amplifier] ?? String(entry.amplifier + 1);
  const chance =
    entry.chance < 1 ? ` (${Math.round(entry.chance * 100)} per cent of the time)` : '';
  return `${entry.label} ${level} for ${entry.seconds} second${entry.seconds === 1 ? '' : 's'}${chance}`;
}

/** A list of effects in English: `a`, `a and b`, `a, b and c`; `no effects` when empty. */
export function describeEffects(effects: readonly ChosenEffect[]): string {
  const words = effects.map(describeEffect);
  if (words.length === 0) return 'no effects';
  if (words.length === 1) return words[0] as string;
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** The "no stat change" value of a stat slot. */
export const NO_STAT = 'none';

/**
 * A stat a custom effect can change (ADR 0055 D11): a vanilla attribute, how its amount is
 * asked (`percent`: the answer is a percentage of the stat, `add_multiplied_total` or
 * `add_multiplied_base`; `points`: the answer is added as it is, `add_value`) and its English
 * name. Every id is checked against each target's vendored `attribute` registry in the tests.
 */
export interface StatChoice {
  value: string;
  label: string;
  unit: 'percent' | 'points';
  operation: 'add_value' | 'add_multiplied_base' | 'add_multiplied_total';
}

/** The stats the Status effect flow offers, in list order. */
export const STAT_CHOICES: readonly StatChoice[] = Object.freeze([
  {
    value: 'minecraft:movement_speed',
    label: 'Movement speed (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_total',
  },
  {
    value: 'minecraft:attack_damage',
    label: 'Attack damage (half hearts)',
    unit: 'points',
    operation: 'add_value',
  },
  {
    value: 'minecraft:attack_speed',
    label: 'Attack speed (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_total',
  },
  {
    value: 'minecraft:max_health',
    label: 'Max health (half hearts)',
    unit: 'points',
    operation: 'add_value',
  },
  { value: 'minecraft:armor', label: 'Armour (points)', unit: 'points', operation: 'add_value' },
  {
    value: 'minecraft:armor_toughness',
    label: 'Armour toughness (points)',
    unit: 'points',
    operation: 'add_value',
  },
  {
    value: 'minecraft:jump_strength',
    label: 'Jump strength (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_base',
  },
  {
    value: 'minecraft:scale',
    label: 'Size (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_base',
  },
  {
    value: 'minecraft:knockback_resistance',
    label: 'Knockback resistance (per cent)',
    unit: 'percent',
    operation: 'add_value',
  },
  {
    value: 'minecraft:block_break_speed',
    label: 'Mining speed (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_base',
  },
  {
    value: 'minecraft:gravity',
    label: 'Gravity (per cent)',
    unit: 'percent',
    operation: 'add_multiplied_base',
  },
  { value: 'minecraft:luck', label: 'Luck (points)', unit: 'points', operation: 'add_value' },
]);

/** The starting answers of one stat slot. */
export interface StatSlotDefaults {
  stat: string;
  amount: number;
}

/**
 * The questions of `slots.length` stat slots (`stat_1`, `stat_1_amount`, `stat_2`, ...), all
 * in `group`. The amount is per effect level, as vanilla multiplies modifiers by the level.
 */
export function statParameters(
  group: string,
  slots: readonly StatSlotDefaults[],
): StarterParameter[] {
  const choices = [
    { value: NO_STAT, label: 'None' },
    ...STAT_CHOICES.map((entry) => ({ value: entry.value, label: entry.label })),
  ];
  return slots.flatMap((slot, index): StarterParameter[] => {
    const n = index + 1;
    return [
      {
        id: `stat_${n}`,
        label: `Stat change ${n}`,
        group,
        type: 'choice',
        default: slot.stat,
        choices: choices.map((entry) => ({ ...entry })),
      },
      {
        id: `stat_${n}_amount`,
        label: `Stat change ${n}: amount per level`,
        description:
          'Per cent for the stats marked so (20 is 20 per cent faster), points or half hearts for the others. Negative numbers lower the stat.',
        group,
        type: 'number',
        default: slot.amount,
        min: -100,
        max: 100,
        step: 1,
      },
    ];
  });
}

/** One chosen stat change. */
export interface ChosenStat {
  stat: StatChoice;
  /** The answer as given: per cent or points per level. */
  amount: number;
}

/** The chosen stat changes of `count` slots, in slot order, leaving out none and zero. */
export function chosenStats(values: ParameterValues, count: number): ChosenStat[] {
  const out: ChosenStat[] = [];
  for (let n = 1; n <= count; n += 1) {
    const stat = STAT_CHOICES.find((entry) => entry.value === stringValue(values, `stat_${n}`));
    const amount = Math.round(numberValue(values, `stat_${n}_amount`) * 100) / 100;
    if (stat === undefined || amount === 0) continue;
    out.push({ stat, amount });
  }
  return out;
}

/** The `attribute_modifiers` of an `msm:effect` from chosen stat changes. */
export function attributeModifiers(stats: readonly ChosenStat[]): JsonObject[] {
  return stats.map(({ stat, amount }) => ({
    attribute: stat.value,
    amount: stat.unit === 'percent' ? Math.round(amount * 100) / 10_000 : amount,
    operation: stat.operation,
  }));
}

/** `movement speed +20 per cent per level`, for notes. */
export function describeStat({ stat, amount }: ChosenStat): string {
  const name = stat.label.replace(/ \(.*\)$/, '').toLowerCase();
  const sign = amount > 0 ? '+' : '';
  const unit = stat.unit === 'percent' ? ' per cent' : '';
  return `${name} ${sign}${amount}${unit} per level`;
}

/** The particles the flows offer, by id, with their English names; checked per target. */
export const PARTICLE_CHOICES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'minecraft:end_rod', label: 'Sparkles' },
  { value: 'minecraft:glow', label: 'Glow' },
  { value: 'minecraft:heart', label: 'Hearts' },
  { value: 'minecraft:happy_villager', label: 'Green stars' },
  { value: 'minecraft:flame', label: 'Flames' },
  { value: 'minecraft:snowflake', label: 'Snowflakes' },
  { value: 'minecraft:enchant', label: 'Enchanting glyphs' },
  { value: 'minecraft:witch', label: 'Witch magic' },
  { value: 'minecraft:electric_spark', label: 'Sparks' },
  { value: 'minecraft:smoke', label: 'Smoke' },
]);

/** An `#rrggbb` colour as the integer an `msm:effect` stores in `color`. */
export function colourInt(rgb: Rgb): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

/**
 * The 18 by 18 placeholder icon of the effect `<namespace>:<path>`, at the fixed path
 * `textures/mob_effect/<path>.png` the game looks it up by (ADR 0055 D2, D6).
 */
export function effectIconAsset(namespace: string, path: string, colour: Rgb): ContentBundleAsset {
  return {
    namespace,
    path: `textures/mob_effect/${path}.png`,
    bytes: placeholderPng('effect_icon', { colour }),
  };
}
