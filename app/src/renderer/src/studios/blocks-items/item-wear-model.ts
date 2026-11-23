/**
 * "Never wears out" and "Starts with enchantments" of the Item Studio (ADR 0127 D2, D3): two
 * vanilla data components in the item's `msm:components` passthrough (ADR 0044 D1),
 * `minecraft:unbreakable` (`{}`) and `minecraft:enchantments` (enchantment id to level, 1 to
 * 255). The runtime decodes `enchantments` once data packs are loaded, so project enchantments
 * work too. Keys are read with or without the `minecraft:` prefix and written with it.
 */
import type { Json, JsonObject } from '@msm/plugin-api';

export const UNBREAKABLE = 'minecraft:unbreakable';
export const ENCHANTMENTS = 'minecraft:enchantments';
/** The highest level the component takes. */
export const MAX_ENCHANTMENT_LEVEL = 255;

/** Enchantments offered first when one is added, in order. */
export const SUGGESTED_ENCHANTMENTS: readonly string[] = Object.freeze([
  'minecraft:unbreaking',
  'minecraft:mending',
  'minecraft:sharpness',
  'minecraft:efficiency',
  'minecraft:protection',
  'minecraft:power',
  'minecraft:fire_aspect',
  'minecraft:looting',
]);

/** One starting enchantment. */
export interface StartingEnchantment {
  readonly id: string;
  readonly level: number;
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `msm:components` object of an item's components, or an empty one. */
export function passthroughOf(components: JsonObject): JsonObject {
  const value = components['msm:components'];
  return isObject(value) ? value : {};
}

/** The key of vanilla component `id` in `passthrough`: with the prefix, without it, or undefined. */
function keyOf(passthrough: JsonObject, id: string): string | undefined {
  if (passthrough[id] !== undefined) return id;
  const bare = id.slice('minecraft:'.length);
  return passthrough[bare] !== undefined ? bare : undefined;
}

/** Whether the item never wears out. */
export function isUnbreakable(components: JsonObject): boolean {
  return keyOf(passthroughOf(components), UNBREAKABLE) !== undefined;
}

/** The item's starting enchantments, in their order in the file. */
export function startingEnchantments(components: JsonObject): StartingEnchantment[] {
  const passthrough = passthroughOf(components);
  const key = keyOf(passthrough, ENCHANTMENTS);
  const value = key === undefined ? undefined : passthrough[key];
  if (!isObject(value)) return [];
  return Object.entries(value).map(([id, level]) => ({
    id,
    level: typeof level === 'number' ? level : 1,
  }));
}

/**
 * `msm:components` with vanilla component `id` set to `value` (or removed when undefined), the
 * key without the prefix removed too; undefined when nothing is left, so the field goes.
 */
export function withPassthrough(
  components: JsonObject,
  id: string,
  value: Json | undefined,
): JsonObject | undefined {
  const next: JsonObject = { ...passthroughOf(components) };
  delete next[id];
  delete next[id.slice('minecraft:'.length)];
  if (value !== undefined) next[id] = value;
  return Object.keys(next).length === 0 ? undefined : next;
}

/** The `minecraft:enchantments` value of a list (a later id wins), or undefined when empty. */
export function enchantmentsValue(list: readonly StartingEnchantment[]): JsonObject | undefined {
  const value: JsonObject = {};
  for (const { id, level } of list) {
    if (id.length === 0) continue;
    value[id] = Math.min(MAX_ENCHANTMENT_LEVEL, Math.max(1, Math.round(level)));
  }
  return Object.keys(value).length === 0 ? undefined : value;
}

/** The enchantment a new row starts with: the first suggestion not on the list yet. */
export function nextEnchantment(list: readonly StartingEnchantment[]): string {
  const taken = new Set(list.map((entry) => entry.id));
  return (
    SUGGESTED_ENCHANTMENTS.find((id) => !taken.has(id)) ?? (SUGGESTED_ENCHANTMENTS[0] as string)
  );
}

const ROMAN: readonly (readonly [number, string])[] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/**
 * A tooltip line as the game shows an enchantment (`Fire Aspect II`): the words of the id's
 * path, the level in Roman numerals up to 39, else in digits.
 */
export function enchantmentWords(id: string, level: number): string {
  const path = id.slice(id.indexOf(':') + 1);
  const name = path
    .split(/[_/]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  if (!Number.isInteger(level) || level < 1 || level > 39) return `${name} ${level}`;
  let rest = level;
  let numeral = '';
  for (const [n, letters] of ROMAN) {
    while (rest >= n) {
      numeral += letters;
      rest -= n;
    }
  }
  return `${name} ${numeral}`;
}
