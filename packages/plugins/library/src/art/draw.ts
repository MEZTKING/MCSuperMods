/**
 * Drawing a look (ADR 0092 D9, D11): a recipe, its colours, finish, detail and seed become
 * pixels and byte-stable PNGs. A stub recipe draws its placeholder pattern (ADR 0092 D14). In
 * the Blockloom style (ADR 0135, the default) Blockloom's recipes draw the block faces they
 * have a material for; the Classic style draws every recipe with MSM's own.
 * Output is a pure function of the look: no `Math.random`, no clock, no locale.
 *
 * @packageDocumentation
 */

import { DEFAULT_COLOUR, encodePng, placeholderPixels } from '../assets/png';
import { blockloomDrawing, blockloomPictureNote, blockPictureStyle } from './blockloom/style';
import {
  type ArtLook,
  type ArtPixels,
  type ArtRecipeInfo,
  DETAIL_NOISE,
  type DrawContext,
} from './info';
import { ART_HUE_SHIFT } from './materials';
import { artRecipe } from './table';

/** The drawing context of a look: unknown finishes fall back to the recipe's first one. */
export function drawContext(look: ArtLook, info: ArtRecipeInfo): DrawContext {
  const finish =
    look.finish !== undefined && info.finishes.includes(look.finish)
      ? look.finish
      : info.finishes[0];
  return {
    colour: look.colour ?? DEFAULT_COLOUR,
    accent: look.accent,
    finish,
    noise: DETAIL_NOISE[look.detail ?? 'normal'] ?? 1,
    seed: Math.trunc(look.seed ?? 0) >>> 0,
    hueShift: ART_HUE_SHIFT,
  };
}

/**
 * The pixels of a look: every frame of the recipe, one after the other (a vertical strip),
 * each of the recipe's width and height. A stub draws its placeholder pattern with the same
 * colour and second colour.
 */
export function artPixels(look: ArtLook): ArtPixels {
  const { info, draw, fallback } = artRecipe(look.recipe);
  const { width, height, frames } = info;
  if ((look.style ?? blockPictureStyle()) === 'blockloom') {
    // ADR 0135 D3: Blockloom draws the whole tiling block faces it has a material for.
    const drawn = blockloomDrawing({
      recipe: look.recipe,
      colour: look.colour ?? DEFAULT_COLOUR,
      detail: look.detail,
      seed: look.seed,
      description: look.description,
    });
    if (drawn !== undefined) {
      return { width, height, frames, data: drawn.data, note: blockloomPictureNote(drawn.recipe) };
    }
  }
  if (draw === undefined) {
    const data = new Uint8Array(width * height * 4 * frames);
    for (let frame = 0; frame < frames; frame += 1) {
      const pixels = placeholderPixels(fallback, {
        colour: look.colour ?? DEFAULT_COLOUR,
        ...(look.accent === undefined ? {} : { accent: look.accent }),
        frame,
      });
      data.set(pixels, frame * width * height * 4);
    }
    return { width, height, frames, data };
  }
  const drawn = draw(drawContext(look, info));
  const drawnFrames = 'frames' in drawn ? drawn.frames : 1;
  if (
    drawn.width !== width ||
    drawn.height !== height ||
    drawnFrames !== frames ||
    drawn.data.length !== width * height * 4 * frames
  ) {
    throw new Error(`Art recipe ${info.id} drew a picture of the wrong size.`);
  }
  return { width, height, frames, data: drawn.data };
}

/** The PNG text of a drawing: Blockloom's note (ADR 0135 D8), or none. */
export function textOf(pixels: ArtPixels): Readonly<Record<string, string>> | undefined {
  return pixels.note === undefined ? undefined : { blockloom: pixels.note };
}

/** A byte-stable PNG of a look: the picture, or for several frames the whole strip. */
export function artLookPng(look: ArtLook): Uint8Array {
  const pixels = artPixels(look);
  return encodePng(pixels.data, pixels.width, pixels.height * pixels.frames, textOf(pixels));
}

/** Byte-stable PNGs of a look, one per frame (particles have four, other recipes one). */
export function artFramePngs(look: ArtLook): Uint8Array[] {
  const pixels = artPixels(look);
  const size = pixels.width * pixels.height * 4;
  return Array.from({ length: pixels.frames }, (_, frame) =>
    encodePng(
      pixels.data.subarray(frame * size, (frame + 1) * size),
      pixels.width,
      pixels.height,
      textOf(pixels),
    ),
  );
}
