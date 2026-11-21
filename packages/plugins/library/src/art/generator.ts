/**
 * The prototype's two entry points that the vanilla parity pictures (B459) draw with, kept byte
 * for byte so those pictures do not change: a gem-finish storage block and an ingot at the
 * prototype's hue shift of 16 degrees. The recipe table (ADR 0092 D7) draws everything else:
 * new code uses `artPixels` and `artPng`, whose recipes may change without touching these.
 *
 * @packageDocumentation
 */

import { encodePng, type Rgb } from '../assets/png';
import { pick, renderSprite, setPixel } from './canvas';
import { type ArtImage, blankImage } from './colour';
import { materialRamp } from './materials';
import { clusteredField, hashSeed, quantise, rng } from './noise';
import type { Silhouette } from './sprites';

/** The prototype recipes still drawn here. */
export type LegacyArtRecipe = 'block' | 'ingot';

/** Options for {@link generateArt}, as the prototype took them. */
export interface ArtOptions {
  /** The material colour. */
  readonly colour: Rgb;
  /** The seed; defaults to 0. */
  readonly seed?: number;
  /** `gem` (bevelled, glinting) or `metal` (plated) for `block`; defaults to `gem`. */
  readonly finish?: 'gem' | 'metal';
}

/** The prototype's hue shift. */
const PROTOTYPE_HUE_SHIFT = 16;

/** The prototype's ingot, frozen here (the recipe table's ingot may be redrawn). */
const PROTOTYPE_INGOT: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......5555555..',
  '.....554444443..',
  '...554444443332.',
  '..333333332221..',
  '..322222222111..',
  '..211111111110..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

function prototypeBlock(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const image = blankImage(16, 16);
  const { material, shine } = materialRamp(options.colour, PROTOTYPE_HUE_SHIFT);
  const metal = options.finish === 'metal';
  const field = metal
    ? clusteredField(16, 16, hashSeed('block', seed), { blurX: 3, blurY: 0 })
    : clusteredField(16, 16, hashSeed('block', seed), { blurX: 1 });
  const shades = metal ? quantise(field, [0.2, 0.55, 0.25]) : quantise(field, [0.1, 0.8, 0.1]);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let shade: number;
      if (ring === 0) {
        if (x === 0 || y === 0) shade = x === 15 || y === 15 ? 3 : 5;
        else shade = 1;
      } else if (ring === 1) {
        if (x === 1 || y === 1) shade = x === 14 || y === 14 ? 3 : 4;
        else shade = 2;
      } else {
        shade = 2 + (shades[y * 16 + x] ?? 1);
        if (metal && (y === 5 || y === 10)) shade = 2;
        if (metal && (y === 6 || y === 11)) shade = 4;
      }
      setPixel(image, x, y, pick(material, shade));
    }
  }
  if (!metal) {
    const random = rng(hashSeed('glint', seed, ...options.colour));
    const glints = 2 + Math.floor(random() * 2);
    for (let g = 0; g < glints; g += 1) {
      const length = 3 + Math.floor(random() * 3);
      const x0 = 3 + Math.floor(random() * 7);
      const y0 = 5 + Math.floor(random() * 8);
      for (let k = 0; k < length; k += 1) {
        const x = x0 + k;
        const y = y0 - k;
        if (x < 2 || y < 2 || x > 13 || y > 13) continue;
        setPixel(image, x, y, k === 1 ? shine : pick(material, 5));
        if (x + 1 <= 13) setPixel(image, x + 1, y, pick(material, 4));
      }
    }
  }
  return image;
}

/**
 * The RGBA pixels of a prototype recipe, 16 by 16, exactly as the prototype drew them.
 *
 * @param recipe - `block` or `ingot`.
 * @param options - The colour, the seed and the block's finish.
 */
export function generateArt(recipe: LegacyArtRecipe, options: ArtOptions): ArtImage {
  if (recipe === 'block') return prototypeBlock(options);
  const { material, shine } = materialRamp(options.colour, PROTOTYPE_HUE_SHIFT);
  return renderSprite(
    PROTOTYPE_INGOT,
    { material, shine, parts: {} },
    hashSeed('ingot', options.seed ?? 0, ...options.colour),
  );
}

/** A byte-stable PNG of {@link generateArt}. */
export function generateArtPng(recipe: LegacyArtRecipe, options: ArtOptions): Uint8Array {
  const image = generateArt(recipe, options);
  return encodePng(image.data, image.width, image.height);
}
