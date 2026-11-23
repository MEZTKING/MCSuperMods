/**
 * Pictures for the stand-in bodies (B627; ADR 0121 D4): layers laid one over another into the one
 * picture a body samples, as the game draws a villager's base, type, job and badge layers over the
 * same model, and as the sulfur cube's outer and inner pictures share one sheet (their rectangles
 * do not overlap; `SULFUR_CUBE_LAYERS`). Pure: no DOM, no canvas, so tests and workers can use it.
 *
 * @packageDocumentation
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { RgbaPixels } from '../font/png';

/** One layer: its pixels and, optionally, the rectangle of the sheet it may cover. */
export interface PictureLayer {
  readonly pixels: RgbaPixels;
  /** `[x0, y0, x1, y1]` in texels of the sheet; the whole sheet when absent. */
  readonly rect?: readonly [number, number, number, number];
}

/**
 * Lays `layers` over each other, first at the bottom, into a `width` by `height` sheet. A layer of
 * another size is stretched to the sheet (nearest texel), as a picture drawn at a higher
 * resolution for the same layout is; each pixel is laid over what is below by its alpha.
 */
export function composeLayers(
  width: number,
  height: number,
  layers: readonly PictureLayer[],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (const layer of layers) {
    const { pixels } = layer;
    if (pixels.width <= 0 || pixels.height <= 0) continue;
    const [x0, y0, x1, y1] = layer.rect ?? [0, 0, width, height];
    const sx = pixels.width / width;
    const sy = pixels.height / height;
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
      const from = Math.min(pixels.height - 1, Math.floor(y * sy));
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
        const at = (from * pixels.width + Math.min(pixels.width - 1, Math.floor(x * sx))) * 4;
        const alpha = (pixels.data[at + 3] ?? 0) / 255;
        if (alpha === 0) continue;
        const to = (y * width + x) * 4;
        const below = (out[to + 3] ?? 0) / 255;
        const total = alpha + below * (1 - alpha);
        for (let c = 0; c < 3; c += 1) {
          const top = pixels.data[at + c] ?? 0;
          const under = out[to + c] ?? 0;
          out[to + c] = Math.round((top * alpha + under * below * (1 - alpha)) / total);
        }
        out[to + 3] = Math.round(total * 255);
      }
    }
  }
  return out;
}

/** The colour of one texel of a composed sheet, as `[r, g, b, a]`. */
export function texelAt(
  sheet: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const at = (y * width + x) * 4;
  return [sheet[at] ?? 0, sheet[at + 1] ?? 0, sheet[at + 2] ?? 0, sheet[at + 3] ?? 0];
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The texture size a geo model names (`texture_width`, `texture_height`), 64 by 64 by default. */
export function geoTextureSize(geo: Json): { width: number; height: number } {
  const list = isObject(geo) ? geo['minecraft:geometry'] : undefined;
  const first = Array.isArray(list) ? list[0] : undefined;
  const description = isObject(first) && isObject(first.description) ? first.description : {};
  const size = (value: Json | undefined) =>
    typeof value === 'number' && value > 0 ? Math.round(value) : 64;
  return { width: size(description.texture_width), height: size(description.texture_height) };
}

/** The bone names of a geo model, in file order. */
export function geoBoneNames(geo: Json): string[] {
  const list = isObject(geo) ? geo['minecraft:geometry'] : undefined;
  const first = Array.isArray(list) ? list[0] : undefined;
  const bones = isObject(first) && Array.isArray(first.bones) ? first.bones : [];
  return bones.flatMap((bone) =>
    isObject(bone) && typeof bone.name === 'string' ? [bone.name] : [],
  );
}
