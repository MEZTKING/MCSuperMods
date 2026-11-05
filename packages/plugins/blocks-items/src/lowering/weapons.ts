/**
 * Vanilla item tags that gear joins so vanilla enchantments apply to it (ADR 0044 D3): the
 * enchanting tags list vanilla's own spears, mace, bow, crossbow and shield by id or by
 * `#minecraft:spears`, so a custom weapon of those kinds joins the same tags. Every tag here is
 * checked against each built-in target's vendored item tags in the tests.
 *
 * Swords, other tools and armour join their base tags (`minecraft:swords`, `head_armor`, ...)
 * through the library or by hand, as before; this table covers the 0.8.0 weapon kinds only.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** Item tag paths (under `minecraft:`) for an `msm:tool` of type spear or mace. */
const TOOL_TYPE_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  spear: ['spears'],
  mace: [
    'enchantable/mace',
    'enchantable/weapon',
    'enchantable/fire_aspect',
    'enchantable/durability',
  ],
});

/** Item tag paths for an `msm:ranged_weapon` of each type. */
const RANGED_TYPE_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  bow: ['enchantable/bow'],
  crossbow: ['enchantable/crossbow'],
});

/** The durability enchanting tag, joined by bows, crossbows and shields with `msm:durability`. */
const DURABILITY_TAG = 'enchantable/durability';

/** Every item tag path {@link weaponItemTags} can return, sorted. */
export const WEAPON_ITEM_TAGS: readonly string[] = Object.freeze(
  [
    ...new Set([
      ...Object.values(TOOL_TYPE_TAGS).flat(),
      ...Object.values(RANGED_TYPE_TAGS).flat(),
      DURABILITY_TAG,
    ]),
  ].sort(),
);

const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

/**
 * The vanilla item tags (paths under `minecraft:`, sorted, no duplicates) an item with these
 * components joins: a spear `minecraft:spears`; a mace the mace, weapon, fire aspect and
 * durability enchanting tags; a bow or crossbow its enchanting tag; a bow, crossbow or shield
 * with `msm:durability` also `enchantable/durability`. Anything else joins none.
 *
 * @param data - The item element data.
 */
export function weaponItemTags(data: JsonObject): string[] {
  const components = record(data.components);
  const tags = new Set<string>();
  const tool = record(components?.['msm:tool']);
  if (typeof tool?.type === 'string')
    for (const tag of TOOL_TYPE_TAGS[tool.type] ?? []) tags.add(tag);
  const ranged = record(components?.['msm:ranged_weapon']);
  const rangedTags = typeof ranged?.type === 'string' ? RANGED_TYPE_TAGS[ranged.type] : undefined;
  for (const tag of rangedTags ?? []) tags.add(tag);
  const blocks = rangedTags !== undefined || components?.['msm:shield'] !== undefined;
  if (blocks && components?.['msm:durability'] !== undefined) tags.add(DURABILITY_TAG);
  return [...tags].sort();
}
