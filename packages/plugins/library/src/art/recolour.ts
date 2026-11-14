/**
 * Approach A of ADR 0092 (Proposed): recolour one of the user's own textures to a new
 * material colour. The material's colours keep their order and their lightness steps, the
 * target colour lands on the material's average tone, and the hue leans warm in the highlights
 * and cool in the shadows ({@link shadeOf}). Pixels outside the material and every alpha value
 * stay as they are, and an animated strip (a texture with an `.mcmeta`, frames stacked
 * downwards) is recoloured with one colour map for all its frames, so its `.mcmeta` is reused
 * unchanged.
 *
 * Pictures made this way are derived from Mojang's textures: they are for the user's own
 * game and must be marked as such (ADR 0092 D1).
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { type ArtImage, packRgb, rgbToOklch } from './colour';
import {
  extractPalette,
  type MaterialMaskOptions,
  materialMask,
  type PaletteEntry,
} from './palette';
import { DEFAULT_HUE_SHIFT, defaultSteps, shadeOf, squeezeFor } from './ramp';

/** Options for {@link recolourTexture}. */
export interface RecolourOptions extends MaterialMaskOptions {
  /** The pixels to recolour (1) or keep (0); defaults to {@link materialMask}. */
  readonly mask?: Uint8Array;
  /** The hue shift in degrees at the ends of the ramp; defaults to {@link DEFAULT_HUE_SHIFT}. */
  readonly hueShift?: number;
  /**
   * Scales the source's lightness steps; 1 (the default) keeps them, below 1 flattens the
   * texture, above 1 adds contrast.
   */
  readonly contrast?: number;
}

/** Chroma below which a source ramp counts as grey (iron, stone, wool). */
const GREY_CHROMA = 0.03;

/**
 * The colour map from each colour of a source material ramp to its new colour for `target`.
 * Keys are {@link packRgb} values.
 */
export function rampMap(
  source: readonly PaletteEntry[],
  target: Rgb,
  options: Pick<RecolourOptions, 'hueShift' | 'contrast'> = {},
): Map<number, Rgb> {
  const map = new Map<number, Rgb>();
  if (source.length === 0) return map;
  const total = source.reduce((sum, entry) => sum + entry.count, 0);
  const lch = source.map((entry) => rgbToOklch(entry.rgb));
  const lRef = source.reduce((sum, entry, i) => sum + (lch[i]?.[0] ?? 0) * entry.count, 0) / total;
  const cRef = source.reduce((sum, entry, i) => sum + (lch[i]?.[1] ?? 0) * entry.count, 0) / total;
  const contrast = options.contrast ?? 1;
  const offsets = lch.map((value) => (value[0] - lRef) * contrast);
  const span = Math.max(1e-6, ...offsets.map(Math.abs));
  const squeeze = squeezeFor(rgbToOklch(target)[0], offsets);
  // Grey sources borrow the built-in chroma profile, sampled by lightness offset.
  const profile = defaultSteps(7, 3);
  const profileChroma = (offset: number): number => {
    let best = profile[3] as { lightness: number; chroma: number };
    for (const step of profile) {
      if (Math.abs(step.lightness - offset) < Math.abs(best.lightness - offset)) best = step;
    }
    return best.chroma;
  };
  source.forEach((entry, i) => {
    const offset = offsets[i] ?? 0;
    const c = lch[i]?.[1] ?? 0;
    const chroma =
      cRef < GREY_CHROMA ? profileChroma(offset) : Math.max(0.5, Math.min(1.6, c / cRef));
    map.set(
      packRgb(entry.rgb),
      shadeOf(
        target,
        { lightness: offset, chroma },
        squeeze,
        offset / span,
        options.hueShift ?? DEFAULT_HUE_SHIFT,
      ),
    );
  });
  return map;
}

/**
 * `image` with every pixel whose colour is in `map` (and whose `mask` byte is not 0, when a
 * mask is given) replaced by the mapped colour. Alpha is kept.
 */
export function applyColourMap(
  image: ArtImage,
  map: ReadonlyMap<number, Rgb>,
  mask?: Uint8Array,
): ArtImage {
  const data = Uint8Array.from(image.data);
  const pixels = image.width * image.height;
  for (let i = 0; i < pixels; i += 1) {
    if ((data[i * 4 + 3] ?? 0) === 0) continue;
    if (mask !== undefined && (mask[i] ?? 0) === 0) continue;
    const key = packRgb([data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0]);
    const to = map.get(key);
    if (to === undefined) continue;
    data[i * 4] = to[0];
    data[i * 4 + 1] = to[1];
    data[i * 4 + 2] = to[2];
  }
  return { width: image.width, height: image.height, data };
}

/**
 * The number of frames of an animated strip: `height / width` when the height is a whole
 * multiple of the width, else 1.
 */
export function stripFrames(image: Pick<ArtImage, 'width' | 'height'>): number {
  return image.width > 0 && image.height % image.width === 0 ? image.height / image.width : 1;
}

/**
 * `image` recoloured to `target`: the material (see {@link materialMask}, or `options.mask`)
 * is mapped through {@link rampMap} of its own palette; everything else is kept.
 */
export function recolourTexture(
  image: ArtImage,
  target: Rgb,
  options: RecolourOptions = {},
): ArtImage {
  const mask = options.mask ?? materialMask(image, options);
  const palette = extractPalette(image, mask);
  return applyColourMap(image, rampMap(palette, target, options), mask);
}

/** The number of distinct colours `image` uses inside `mask` (all visible pixels without one). */
export function colourCount(image: ArtImage, mask?: Uint8Array): number {
  return extractPalette(image, mask).length;
}
