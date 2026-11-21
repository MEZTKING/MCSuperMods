/**
 * Helpers shared by the block recipes (B492): ramps in the user's colour, the light lean across
 * a face, wrapping cells for stones and pebbles, and painting a field of shades.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { pick, setPixel } from '../canvas';
import { type ArtImage, hueDelta, oklchToRgb, rgbToOklch } from '../colour';
import type { Ramp } from '../materials';
import { rng } from '../noise';
import { COOL_HUE, generateRamp, type ShadeStep, WARM_HUE } from '../ramp';

/** The size of a block face. */
export const FACE = 16;

/** Five shades of `colour`, darkest first, the colour itself in the middle. */
export function colourRamp(colour: Rgb, hueShift: number): Ramp {
  return generateRamp(colour, { count: 5, anchor: 2, hueShift });
}

/** Six shades of `colour`, darkest first, the colour itself fourth. */
export function colourRamp6(colour: Rgb, hueShift: number): Ramp {
  return generateRamp(colour, { count: 6, anchor: 3, hueShift });
}

/** A ramp of `colour` from custom steps (the anchor is the step with lightness 0). */
export function stepRamp(colour: Rgb, steps: readonly ShadeStep[], hueShift: number): Ramp {
  return generateRamp(colour, { steps, hueShift });
}

/** `colour` with its OKLCh lightness set to `l` and its chroma scaled by `chroma`. */
export function retone(colour: Rgb, l: number, chroma: number): Rgb {
  const [, c, h] = rgbToOklch(colour);
  return oklchToRgb([Math.max(0.14, Math.min(0.95, l)), c * chroma, h]);
}

/** The OKLCh lightness of a colour. */
export const lightnessOf = (colour: Rgb): number => rgbToOklch(colour)[0];

/**
 * How much a pixel faces the light across a 16 by 16 face: 1 at the top-left corner, -1 at the
 * bottom-right one, 0 on the diagonal between them.
 */
export const lean = (x: number, y: number): number => (7.5 - x + (7.5 - y)) / 15;

/** Wraps a coordinate onto the face. */
export const wrap = (v: number): number => ((v % FACE) + FACE) % FACE;

/** Paints a pixel of `ramp` at a fractional shade, rounded and clamped. */
export function paint(image: ArtImage, x: number, y: number, ramp: Ramp, shade: number): void {
  setPixel(image, x, y, pick(ramp, shade));
}

/** Wrapping cells (stones, pebbles): for each pixel its cell, its offset from the cell's centre and the gap to the next cell. */
export interface Cells {
  /** The number of cells. */
  readonly count: number;
  /** The cell of each pixel. */
  readonly owner: Uint8Array;
  /** The offset of each pixel from its cell's centre, across. */
  readonly dx: Float64Array;
  /** The offset of each pixel from its cell's centre, down. */
  readonly dy: Float64Array;
  /** How much nearer each pixel is to its own centre than to the next one (small on a gap). */
  readonly margin: Float64Array;
}

/**
 * Cells on a jittered `n` by `n` grid that wraps round the face, so a face made of them tiles.
 * Each centre moves by up to `jitter` of a cell from the middle of its grid square.
 */
export function wrappingCells(seed: number, n: number, jitter: number): Cells {
  const random = rng(seed);
  const size = FACE / n;
  const centres: [number, number][] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      centres.push([
        (i + 0.5) * size + (random() - 0.5) * size * jitter,
        (j + 0.5) * size + (random() - 0.5) * size * jitter,
      ]);
    }
  }
  const owner = new Uint8Array(FACE * FACE);
  const dx = new Float64Array(FACE * FACE);
  const dy = new Float64Array(FACE * FACE);
  const margin = new Float64Array(FACE * FACE);
  const near = (d: number): number => {
    let v = d;
    while (v > FACE / 2) v -= FACE;
    while (v < -FACE / 2) v += FACE;
    return v;
  };
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      let best = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY;
      let index = 0;
      let bx = 0;
      let by = 0;
      centres.forEach(([cx, cy], c) => {
        const ox = near(x + 0.5 - cx);
        const oy = near(y + 0.5 - cy);
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d < best) {
          second = best;
          best = d;
          index = c;
          bx = ox;
          by = oy;
        } else if (d < second) second = d;
      });
      const i = y * FACE + x;
      owner[i] = index;
      dx[i] = bx;
      dy[i] = by;
      margin[i] = second - best;
    }
  }
  return { count: centres.length, owner, dx, dy, margin };
}

/** The warmth of a hue, as the ramp rule measures it (`rules.ts`). */
const warmth = (hue: number): number =>
  Math.abs(hueDelta(hue, COOL_HUE)) - Math.abs(hueDelta(hue, WARM_HUE));

/**
 * Whether shades of two ramps may touch under the ramp rule (`checkArtRules`): wherever a shade
 * of one and a shade of the other read as one material (alike in hue and chroma, apart in
 * lightness), the darker is not the warmer. Two ramps of nearly the same hue can disagree,
 * since each leans its own way from its own colour.
 */
export function rampsAgree(a: Ramp, b: Ramp): boolean {
  for (const one of a) {
    for (const two of b) {
      const [l1, c1, h1] = rgbToOklch(one);
      const [l2, c2, h2] = rgbToOklch(two);
      if (c1 < 0.05 || c2 < 0.05) continue;
      if (Math.abs(hueDelta(h1, h2)) > 15) continue;
      if (Math.max(c1, c2) / Math.min(c1, c2) > 1.6) continue;
      if (Math.abs(l1 - l2) < 0.04) continue;
      const [dark, light] = l1 < l2 ? [h1, h2] : [h2, h1];
      if (warmth(dark) > warmth(light) + 2) return false;
    }
  }
  return true;
}
