/**
 * The two questions the Weapon and Gear set flows share (ADR 0127 D2, D3): "Never wears out"
 * (vanilla's `minecraft:unbreakable`) and "Starts with an enchantment" with its level (vanilla's
 * `minecraft:enchantments`, which the runtime decodes once data packs are loaded). Both go in
 * the item's `msm:components` passthrough (ADR 0044 D1).
 */
import type { JsonObject, StarterParameter } from '@msm/plugin-api';

/** The enchantments a made item can start with. */
export const STARTING_ENCHANTMENTS: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'none', label: 'None' },
  { value: 'minecraft:unbreaking', label: 'Unbreaking' },
  { value: 'minecraft:mending', label: 'Mending' },
  { value: 'minecraft:sharpness', label: 'Sharpness' },
  { value: 'minecraft:smite', label: 'Smite' },
  { value: 'minecraft:knockback', label: 'Knockback' },
  { value: 'minecraft:fire_aspect', label: 'Fire Aspect' },
  { value: 'minecraft:looting', label: 'Looting' },
  { value: 'minecraft:efficiency', label: 'Efficiency' },
  { value: 'minecraft:fortune', label: 'Fortune' },
  { value: 'minecraft:protection', label: 'Protection' },
  { value: 'minecraft:feather_falling', label: 'Feather Falling' },
  { value: 'minecraft:frost_walker', label: 'Frost Walker' },
  { value: 'minecraft:power', label: 'Power' },
  { value: 'minecraft:flame', label: 'Flame' },
  { value: 'minecraft:infinity', label: 'Infinity' },
  { value: 'minecraft:quick_charge', label: 'Quick Charge' },
  { value: 'minecraft:multishot', label: 'Multishot' },
]);

/** The highest level the flows offer (vanilla's highest is 5). */
export const STARTING_LEVEL_MAX = 10;

/** The wear questions of a flow, in group `group`; `what` names the made thing ("weapon"). */
export function wearParameters(group: string, what: string): StarterParameter[] {
  return [
    {
      id: 'never_wears_out',
      label: 'Never wears out',
      description: `The ${what} keeps working for ever, as with vanilla's Unbreakable tag: no durability is used up.`,
      group,
      type: 'boolean',
      default: false,
    },
    {
      id: 'starting_enchantment',
      label: 'Starts with an enchantment',
      description: `The ${what} is made already enchanted, glinting as enchanted items do. The enchanting table cannot enchant it further; an anvil can.`,
      group,
      type: 'choice',
      default: 'none',
      choices: STARTING_ENCHANTMENTS.map((entry) => ({ ...entry })),
    },
    {
      id: 'starting_enchantment_level',
      label: 'Enchantment level',
      description: 'Used with an enchantment above; vanilla goes up to 5 (Sharpness V).',
      group,
      type: 'number',
      default: 1,
      min: 1,
      max: STARTING_LEVEL_MAX,
      step: 1,
    },
  ];
}

/** What the wear answers put on an item. */
export interface Wear {
  readonly neverWearsOut: boolean;
  /** The enchantment id, or undefined for none. */
  readonly enchantment: string | undefined;
  readonly level: number;
}

/** The wear answers read from flow values. */
export function readWear(
  booleanValue: (id: string) => boolean,
  stringValue: (id: string) => string,
  numberValue: (id: string) => number,
): Wear {
  const enchantment = stringValue('starting_enchantment');
  const known = STARTING_ENCHANTMENTS.some(
    (entry) => entry.value === enchantment && entry.value !== 'none',
  );
  return {
    neverWearsOut: booleanValue('never_wears_out'),
    enchantment: known ? enchantment : undefined,
    level: Math.min(
      STARTING_LEVEL_MAX,
      Math.max(1, Math.round(numberValue('starting_enchantment_level'))),
    ),
  };
}

/** Whether the answers change anything. */
export const wearsDifferently = (wear: Wear): boolean =>
  wear.neverWearsOut || wear.enchantment !== undefined;

/**
 * Adds the wear components to `components` (in place) and returns the sentence that says so,
 * or an empty string when the answers change nothing.
 */
export function applyWear(components: JsonObject, wear: Wear): string {
  if (!wearsDifferently(wear)) return '';
  const existing = components['msm:components'];
  const passthrough: JsonObject =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const parts: string[] = [];
  if (wear.enchantment !== undefined) {
    passthrough['minecraft:enchantments'] = { [wear.enchantment]: wear.level };
    parts.push(
      `starts with ${wear.enchantment} at level ${wear.level} (minecraft:enchantments in msm:components)`,
    );
  }
  if (wear.neverWearsOut) {
    passthrough['minecraft:unbreakable'] = {};
    parts.push('never wears out (minecraft:unbreakable)');
  }
  components['msm:components'] = passthrough;
  return ` It ${parts.join(' and ')}.`;
}
