/**
 * Block state definition helpers for the block types (ADR 0067 D5): variants and multipart
 * written in vanilla's own shape (rotations, `uvlock` only where vanilla's files set it), so a
 * type looks and turns exactly as its vanilla family.
 */
import type { JsonObject } from '@msm/plugin-api';

/** The four horizontal directions in the order vanilla's files list them. */
export const HORIZONTAL_FACINGS = ['east', 'north', 'south', 'west'] as const;
export type HorizontalFacing = (typeof HORIZONTAL_FACINGS)[number];

/** Degrees a model facing north turns about Y to face each direction (furnaces, trapdoors). */
export const NORTH_BASED_Y: Readonly<Record<HorizontalFacing, number>> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

/** Degrees a model facing east turns about Y to face each direction (stairs, doors). */
export const EAST_BASED_Y: Readonly<Record<HorizontalFacing, number>> = {
  east: 0,
  south: 90,
  west: 180,
  north: 270,
};

/** Degrees a model facing south turns about Y to face each direction (fence gates). */
export const SOUTH_BASED_Y: Readonly<Record<HorizontalFacing, number>> = {
  south: 0,
  west: 90,
  north: 180,
  east: 270,
};

/** Normalises an angle to 0, 90, 180 or 270. */
export const turn = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** One model variant: zero rotations are left out, as in vanilla's files. */
export function variant(
  model: string,
  rotation: { x?: number; y?: number; uvlock?: boolean } = {},
): JsonObject {
  const out: JsonObject = { model };
  const x = turn(rotation.x ?? 0);
  const y = turn(rotation.y ?? 0);
  if (rotation.uvlock === true) out.uvlock = true;
  if (x !== 0) out.x = x;
  if (y !== 0) out.y = y;
  return out;
}

/** The variant key `a=1,b=2` of `properties`, sorted by property name as vanilla writes it. */
export function variantKey(properties: Readonly<Record<string, string>>): string {
  return Object.keys(properties)
    .sort()
    .map((name) => `${name}=${properties[name]}`)
    .join(',');
}

/** A `variants` block state definition from `[properties, variant]` pairs. */
export function variants(
  entries: Iterable<readonly [Readonly<Record<string, string>>, JsonObject]>,
): JsonObject {
  const out: JsonObject = {};
  for (const [properties, value] of entries) out[variantKey(properties)] = value;
  return { variants: out };
}

/** One multipart case: `apply` always, or when the `when` properties hold. */
export function part(apply: JsonObject, when?: Readonly<Record<string, string>>): JsonObject {
  return when === undefined ? { apply } : { apply, when: { ...when } };
}
