/**
 * Small helpers for MSM's own fallback block models in Try it (B463, B519): boxes with a texture
 * variable per face and crossed planes, in model pixels. Shared by the fallback parents of vanilla
 * parity 2 and 3; never written to an export.
 */
import type { JsonObject } from '@msm/plugin-api';

/** A point in model pixels. */
export type Vec = readonly [number, number, number];
const FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
/** A face of a model box. */
export type FaceName = (typeof FACES)[number];

/** The UV of a face of a box, from its size, as a model's default UV is. */
function uvOf(face: FaceName, from: Vec, to: Vec): number[] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (face) {
    case 'down':
    case 'up':
      return [x1, z1, x2, z2];
    case 'north':
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1];
    default:
      return [z1, 16 - y2, z2, 16 - y1];
  }
}

/** A box whose faces read `texture` (or one variable per face), with optional faces left out. */
export function box(
  from: Vec,
  to: Vec,
  texture: string | Partial<Record<FaceName, string>>,
  extra: JsonObject = {},
): JsonObject {
  const faces: JsonObject = {};
  for (const face of FACES) {
    const variable = typeof texture === 'string' ? texture : texture[face];
    if (variable === undefined) continue;
    faces[face] = { texture: `#${variable}`, uv: uvOf(face, from, to) };
  }
  return { from: [...from], to: [...to], faces, ...extra };
}

/** Two crossed planes reading `texture`, `height` pixels tall. */
export function cross(texture: string, height = 16, inset = 0.8): JsonObject[] {
  const rotation = { angle: 45, axis: 'y', origin: [8, 8, 8], rescale: true };
  return [
    box([inset, 0, 8], [16 - inset, height, 8], { north: texture, south: texture }, { rotation }),
    box([8, 0, inset], [8, height, 16 - inset], { east: texture, west: texture }, { rotation }),
  ];
}

/** A model of `elements` whose particle reads `#particle`. */
export const model = (elements: JsonObject[], particle: string): JsonObject => ({
  textures: { particle: `#${particle}` },
  elements,
});
