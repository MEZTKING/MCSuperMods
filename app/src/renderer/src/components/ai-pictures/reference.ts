/**
 * MSM's own drawing of the thing an AI picture is for (ADR 0093, 2026-11-22): the art
 * generator's recipe for the slot (ADR 0092), in the asked colour. It is the reference the
 * service starts from (Retro Diffusion's `input_image`), the shape every result is checked
 * against, and the picture shown in place of a result that fails. Loaded lazily with the
 * drawing code, so the renderer's main chunk does not carry the recipes (ADR 0092 D17).
 *
 * @packageDocumentation
 */

import { type ArtRecipeId, artLookPng, artPixels } from '@msm/plugin-library';
import type { RgbaImage } from '../texture-editor/pixels';
import type { AiSlot } from './prompt';

/** MSM's drawing: its pixels and its PNG. */
export interface DrawnReference {
  image: RgbaImage;
  png: Uint8Array;
  recipe: string;
}

/**
 * The drawing of `slot` in `colour` (seed `seed`), at the recipe's own size (16 by 16 for items
 * and block faces), or `null` when the slot has no recipe.
 */
export function drawnReference(
  slot: AiSlot | undefined,
  colour: readonly [number, number, number],
  seed = 0,
): DrawnReference | null {
  if (slot?.recipe === undefined) return null;
  const recipe = slot.recipe as ArtRecipeId;
  try {
    const look = {
      recipe,
      colour: [colour[0], colour[1], colour[2]] as [number, number, number],
      seed,
    };
    const pixels = artPixels(look);
    const size = pixels.width * pixels.height * 4;
    const image: RgbaImage = {
      width: pixels.width,
      height: pixels.height,
      data: new Uint8ClampedArray(pixels.data.subarray(0, size)),
    };
    return { image, png: artLookPng(look), recipe };
  } catch {
    return null;
  }
}
