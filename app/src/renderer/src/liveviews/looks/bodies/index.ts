/**
 * Stand-in bodies for the vanilla mobs (ADR 0121 D4; B620 interface, B623 builds the bodies).
 * Each body is geo JSON for the geo renderer (`preview/geo/geometry.ts`). Bodies are labelled
 * About right. Until B623, every call answers the flat sheet.
 */

import type { Json } from '@msm/plugin-api';

/** The eighteen bodies B619 said yes to (the zombie nautilus is the flat sheet). */
export type BodyId =
  | 'wolf'
  | 'wolf_baby'
  | 'cat'
  | 'cat_baby'
  | 'pig'
  | 'pig_cold'
  | 'pig_baby'
  | 'cow'
  | 'cow_cold'
  | 'cow_warm'
  | 'cow_baby'
  | 'chicken'
  | 'chicken_cold'
  | 'chicken_baby'
  | 'frog'
  | 'villager'
  | 'villager_baby'
  | 'sulfur_cube';

/** A geo model: the JSON the geo renderer reads. */
export type GeoJson = Json;

/**
 * The body for a variant kind (`minecraft:wolf_variant`, ...), the model the variant names
 * (`normal`, `cold`, `warm`) and the baby flag: a loader of its geo JSON, or `'flat_sheet'` where
 * no body can be written (the zombie nautilus, 3L5).
 */
export function bodyFor(
  _kind: string,
  _model: string | undefined,
  _baby: boolean,
): (() => Promise<GeoJson>) | 'flat_sheet' {
  return 'flat_sheet';
}
