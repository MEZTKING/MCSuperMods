/**
 * Block state definition helpers for the block types (ADR 0067 D5): variants and multipart
 * written in vanilla's own shape (rotations, `uvlock` only where vanilla's files set it), so a
 * type looks and turns exactly as its vanilla family.
 */
import type { JsonObject } from '@msm/plugin-api';
import { isRecord } from '../paths';

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

/** The properties of a variant key `a=1,b=2` (`''` has none). */
export function parseVariantKey(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of key.split(',')) {
    const equals = pair.indexOf('=');
    if (equals > 0) out[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return out;
}

/**
 * Adds a boolean state `property` (`open`, `lit`; ADR 0074 D3, ADR 0075 D1) to a `variants`
 * block state definition: each variant of `idle` becomes `<property>=false`, and the variant
 * with the same key in `active` (else the idle one) `<property>=true`. A multipart definition
 * is returned as it is.
 */
export function withStateProperty(
  idle: JsonObject,
  active: JsonObject,
  property: string,
): JsonObject {
  const idleVariants = idle.variants;
  if (!isRecord(idleVariants)) return idle;
  const activeVariants = isRecord(active.variants) ? active.variants : idleVariants;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(idleVariants)) {
    const properties = parseVariantKey(key);
    if (value === undefined) continue;
    out[variantKey({ ...properties, [property]: 'false' })] = structuredClone(value);
    out[variantKey({ ...properties, [property]: 'true' })] = structuredClone(
      activeVariants[key] ?? value,
    );
  }
  return { variants: out };
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
