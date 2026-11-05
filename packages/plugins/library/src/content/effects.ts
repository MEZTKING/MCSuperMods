/**
 * Mob effect questions shared by the Consumable and Totem flows (ADR 0044 D2, D4): a fixed
 * number of effect slots, each a choice of vanilla effect (or none), its duration, its level
 * and, for consumables, the chance it applies. {@link readEffects} turns the answers into the
 * `ConsumeEffect` list of `msm:consumable` and `msm:death_protection`.
 *
 * @packageDocumentation
 */
import type { JsonObject, StarterParameter } from '@msm/plugin-api';
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
