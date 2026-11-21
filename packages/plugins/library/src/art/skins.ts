/**
 * Box skins of models (ADR 0092 D7, D8): a model's box-UV cubes unfolded onto its texture and
 * drawn in a coat, each face shaded by its side, eyes on `face` boxes and the saddle in
 * leather. Until B494 draws them, {@link boxSkinArtPng} gives the placeholder box skin
 * ({@link boxSkinPng}) in the look's colour.
 *
 * @packageDocumentation
 */

import { boxSkinPixels, boxSkinPng, DEFAULT_COLOUR, type SkinBox } from '../assets/png';
import type { ArtLook } from './info';

/** The coats a box skin can be drawn in (ADR 0092 D7). */
export const ART_COATS = Object.freeze(['fur', 'scales', 'smooth', 'stone', 'slime'] as const);

/** A box skin's coat. */
export type ArtCoat = (typeof ART_COATS)[number];

/** A box skin's look: a look without a recipe, with a coat. */
export type BoxSkinLook = Omit<ArtLook, 'recipe'> & { readonly coat: ArtCoat };

/**
 * The RGBA pixels of a model's box skin in a look (for now the placeholder box skin in the
 * look's colour).
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colours, coat, detail and seed.
 */
export function boxSkinArtPixels(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  look: BoxSkinLook,
): Uint8Array {
  return boxSkinPixels(boxes, width, height, { colour: look.colour ?? DEFAULT_COLOUR });
}

/**
 * A byte-stable PNG of {@link boxSkinArtPixels} (for now the bytes of {@link boxSkinPng} in the
 * look's colour).
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colours, coat, detail and seed.
 */
export function boxSkinArtPng(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  look: BoxSkinLook,
): Uint8Array {
  return boxSkinPng(boxes, width, height, { colour: look.colour ?? DEFAULT_COLOUR });
}
