/**
 * Vanilla tags the block types always join (ADR 0067 D6). They carry behaviour (fences connect
 * to `#minecraft:wooden_fences` members, walls to `#minecraft:walls`, fence gates fit walls),
 * so lowering writes them with `merge: 'tag'`. Every name is checked against each built-in
 * target's vendored registries in the plugin tests. Vanilla has no `pressure_plates` or
 * `stone_pressure_plates` item tag, so those are block tags only (B259).
 */
import type { JsonObject } from '@msm/plugin-api';
import { nonEmptyString } from '../shared';

/** The tags (paths under `minecraft:`) one block joins, per registry. */
export interface TypeTags {
  block: readonly string[];
  item: readonly string[];
}

/** No tags. */
export const NO_TAGS: TypeTags = Object.freeze({ block: [], item: [] });

/** The set types whose blocks are wooden (vanilla's wooden doors, buttons and plates). */
export const WOODEN_SET_TYPES: readonly string[] = Object.freeze([
  'wood',
  'cherry',
  'bamboo',
  'crimson',
  'warped',
]);

/** The set types whose buttons and plates are vanilla's stone ones. */
export const STONE_SET_TYPES: readonly string[] = Object.freeze(['stone', 'polished_blackstone']);

/** The sound types that make a fence wooden by default (ADR 0067 D6). */
export const WOOD_SOUND_TYPES: readonly string[] = Object.freeze([
  'wood',
  'bamboo_wood',
  'cherry_wood',
  'nether_wood',
]);

/** Block tags the types can join (for the vendored-registry test). */
export const TYPE_BLOCK_TAGS: readonly string[] = Object.freeze([
  'buttons',
  'doors',
  'fence_gates',
  'fences',
  'pressure_plates',
  'slabs',
  'stairs',
  'stone_buttons',
  'stone_pressure_plates',
  'trapdoors',
  'walls',
  'wooden_buttons',
  'wooden_doors',
  'wooden_fences',
  'wooden_pressure_plates',
  'wooden_trapdoors',
]);

/** Item tags the types can join (for the vendored-registry test). */
export const TYPE_ITEM_TAGS: readonly string[] = Object.freeze([
  'buttons',
  'doors',
  'fence_gates',
  'fences',
  'slabs',
  'stairs',
  'stone_buttons',
  'trapdoors',
  'walls',
  'wooden_buttons',
  'wooden_doors',
  'wooden_fences',
  'wooden_pressure_plates',
  'wooden_trapdoors',
]);

/** A tag joined as a block tag and as the item tag of the same name. */
export const both = (...tags: string[]): TypeTags => ({ block: tags, item: tags });

/** The block's `set_type`, or `undefined`. */
const setTypeOf = (data: JsonObject): string | undefined => nonEmptyString(data.set_type);

/** `wooden_<family>` or `stone_<family>` for a set type, or `undefined` for metal ones. */
function setTypeSubtag(data: JsonObject, family: string, stone: boolean): string | undefined {
  const setType = setTypeOf(data);
  if (setType === undefined) return undefined;
  if (WOODEN_SET_TYPES.includes(setType)) return `wooden_${family}`;
  if (stone && STONE_SET_TYPES.includes(setType)) return `stone_${family}`;
  return undefined;
}

/** Tags of a door: `doors`, plus `wooden_doors` for a wooden set type. */
export function doorTags(data: JsonObject): TypeTags {
  const sub = setTypeSubtag(data, 'doors', false);
  return sub === undefined ? both('doors') : both('doors', sub);
}

/** Tags of a trapdoor: `trapdoors`, plus `wooden_trapdoors` for a wooden set type. */
export function trapdoorTags(data: JsonObject): TypeTags {
  const sub = setTypeSubtag(data, 'trapdoors', false);
  return sub === undefined ? both('trapdoors') : both('trapdoors', sub);
}

/** Tags of a button: `buttons`, plus `wooden_buttons` or `stone_buttons`. */
export function buttonTags(data: JsonObject): TypeTags {
  const sub = setTypeSubtag(data, 'buttons', true);
  return sub === undefined ? both('buttons') : both('buttons', sub);
}

/**
 * Tags of a pressure plate: the block tag `pressure_plates`, plus `wooden_pressure_plates`
 * (block and item) or the block tag `stone_pressure_plates`. A weighted plate joins only
 * `pressure_plates`, as vanilla's gold and iron plates do.
 */
export function pressurePlateTags(data: JsonObject): TypeTags {
  if (data.weighted_max !== undefined) return { block: ['pressure_plates'], item: [] };
  const sub = setTypeSubtag(data, 'pressure_plates', true);
  if (sub === undefined) return { block: ['pressure_plates'], item: [] };
  return {
    block: ['pressure_plates', sub],
    item: sub === 'wooden_pressure_plates' ? [sub] : [],
  };
}

/**
 * Whether a fence is wooden: the editor field `wooden` when set, else whether `sound_type` is a
 * wood sound (default `stone`, so not wooden).
 */
export function isWoodenFence(data: JsonObject): boolean {
  if (typeof data.wooden === 'boolean') return data.wooden;
  const sound = nonEmptyString(data.sound_type) ?? 'stone';
  return WOOD_SOUND_TYPES.includes(sound);
}

/** Tags of a fence: `fences`, plus `wooden_fences` when wooden. */
export function fenceTags(data: JsonObject): TypeTags {
  return isWoodenFence(data) ? both('fences', 'wooden_fences') : both('fences');
}
