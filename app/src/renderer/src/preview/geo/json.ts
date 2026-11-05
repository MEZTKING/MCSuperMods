/**
 * Small readers over geo model data shared by the subject resolution (loaded with the panel)
 * and the baker (loaded with the lazy canvas). No gl-matrix here, so the panel stays light.
 */

import type { JsonObject } from '@msm/plugin-api';

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the first geometry of a `.geo.json` object, or `null`. */
export function firstGeometry(data: unknown): JsonObject | null {
  if (!isObject(data)) return null;
  const list = data['minecraft:geometry'];
  if (!Array.isArray(list)) return null;
  const first = list[0];
  return isObject(first) ? first : null;
}

/** The bone names of a geometry, in file order. */
export function boneNames(data: unknown): string[] {
  const bones = firstGeometry(data)?.bones;
  if (!Array.isArray(bones)) return [];
  return bones.flatMap((bone) =>
    isObject(bone) && typeof bone.name === 'string' ? [bone.name] : [],
  );
}
