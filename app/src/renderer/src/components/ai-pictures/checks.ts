/**
 * The checks every AI picture passes before it is shown (ADR 0093, 2026-11-22): its shape
 * against MSM's own drawing of the same thing (the overlap of the two masks), its colour against
 * the asked colour (the hue distance of its main colour), and for a block face whether it tiles
 * ({@link seamCheck}). A picture that fails is never placed silently: the round tries once more
 * with a stronger prompt, then shows MSM's drawing with a plain line. Pure.
 *
 * @packageDocumentation
 */

import type { RgbaImage } from '../texture-editor/pixels';
import { seamCheck, toHsl } from './cleanup';

/**
 * The least mask overlap (intersection over union, after both outlines are cropped and fitted
 * into the same square) an item must have with MSM's drawing.
 */
export const MIN_SHAPE_OVERLAP = 0.6;

/**
 * The least share of the drawing's own gaps (the clear pixels inside its outline: a
 * chestplate's neck, the gap between leggings) a picture must leave clear, when the drawing has
 * at least {@link MIN_GAP_PIXELS} of them. A round blob fills them and fails.
 */
export const MIN_GAPS_KEPT = 0.5;
export const MIN_GAP_PIXELS = 4;

/** The square both outlines are fitted into before they are compared. */
const SHAPE_GRID = 16;

/** The most a picture's main hue may differ from the asked colour's (degrees). */
export const MAX_HUE_DISTANCE = 40;

/** Below this saturation a colour counts as grey (no hue to compare). */
const GREY = 0.15;

/** Why a picture failed. */
export type AiCheckFailure = 'shape' | 'colour' | 'seam';

/** The outcome of {@link checkPicture}. */
export interface AiCheck {
  ok: boolean;
  failures: AiCheckFailure[];
  /** The mask overlap with the reference, when there is one (0 to 1). */
  overlap?: number;
  /** The share of the reference's gaps the picture keeps clear (0 to 1). */
  gaps?: number;
  /** The main hue's distance from the asked colour's, when both have a hue. */
  hueDistance?: number;
}

/** Whether a pixel of `image` at (x, y) is drawn (half opaque or more). */
function drawn(image: RgbaImage, x: number, y: number): boolean {
  return (image.data[(y * image.width + x) * 4 + 3] ?? 0) >= 128;
}

/**
 * The overlap (intersection over union) of the drawn pixels of `a` and `b`; `b` is read at
 * `a`'s size by the nearest pixel when the sizes differ. 1 when neither has a drawn pixel.
 */
export function maskOverlap(a: RgbaImage, b: RgbaImage): number {
  let both = 0;
  let either = 0;
  for (let y = 0; y < a.height; y += 1) {
    const by = Math.min(b.height - 1, Math.floor((y * b.height) / a.height));
    for (let x = 0; x < a.width; x += 1) {
      const bx = Math.min(b.width - 1, Math.floor((x * b.width) / a.width));
      const inA = drawn(a, x, y);
      const inB = drawn(b, bx, by);
      if (inA && inB) both += 1;
      if (inA || inB) either += 1;
    }
  }
  return either === 0 ? 1 : both / either;
}

/** The drawn pixels of `image` cropped to their box and fitted, centred, into the grid. */
export function fittedMask(image: RgbaImage, grid = SHAPE_GRID): boolean[] {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!drawn(image, x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const mask = new Array<boolean>(grid * grid).fill(false);
  if (x1 < 0) return mask;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const scale = grid / Math.max(w, h);
  const fw = Math.max(1, Math.round(w * scale));
  const fh = Math.max(1, Math.round(h * scale));
  const ox = Math.floor((grid - fw) / 2);
  const oy = Math.floor((grid - fh) / 2);
  for (let y = 0; y < fh; y += 1) {
    const sy = y0 + Math.min(h - 1, Math.floor((y * h) / fh));
    for (let x = 0; x < fw; x += 1) {
      const sx = x0 + Math.min(w - 1, Math.floor((x * w) / fw));
      mask[(oy + y) * grid + ox + x] = drawn(image, sx, sy);
    }
  }
  return mask;
}

/**
 * How well `image`'s outline matches `reference`'s: the overlap of the two fitted masks and the
 * share of the reference's gaps (clear pixels with drawn pixels on both sides along their row
 * or their column) that `image` keeps clear (`null` when the
 * reference has too few gaps to judge).
 */
export function shapeMatch(
  image: RgbaImage,
  reference: RgbaImage,
): { overlap: number; gaps: number | null } {
  const a = fittedMask(image);
  const b = fittedMask(reference);
  let both = 0;
  let either = 0;
  for (let at = 0; at < a.length; at += 1) {
    if (a[at] && b[at]) both += 1;
    if (a[at] || b[at]) either += 1;
  }
  // The reference's gaps: clear pixels between drawn pixels on their row or column.
  let gapCount = 0;
  let kept = 0;
  for (let y = 0; y < SHAPE_GRID; y += 1) {
    for (let x = 0; x < SHAPE_GRID; x += 1) {
      const at = y * SHAPE_GRID + x;
      if (b[at]) continue;
      const row = b.slice(y * SHAPE_GRID, (y + 1) * SHAPE_GRID);
      const left = row.slice(0, x).some(Boolean);
      const right = row.slice(x + 1).some(Boolean);
      let above = false;
      let below = false;
      for (let yy = 0; yy < SHAPE_GRID; yy += 1) {
        if (!b[yy * SHAPE_GRID + x]) continue;
        if (yy < y) above = true;
        if (yy > y) below = true;
      }
      if (!((left && right) || (above && below))) continue;
      gapCount += 1;
      if (!a[at]) kept += 1;
    }
  }
  return {
    overlap: either === 0 ? 1 : both / either,
    gaps: gapCount < MIN_GAP_PIXELS ? null : kept / gapCount,
  };
}

/** The main hue of `image` (saturated pixels' mean, weighted by saturation), or `null`. */
export function mainHue(image: RgbaImage): number | null {
  let x = 0;
  let y = 0;
  let weight = 0;
  let count = 0;
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) < 128) continue;
    count += 1;
    const [h, s] = toHsl(image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0);
    if (s < GREY) continue;
    x += Math.cos((h * Math.PI) / 180) * s;
    y += Math.sin((h * Math.PI) / 180) * s;
    weight += s;
  }
  // A picture whose colourful pixels are under a quarter of it reads as grey.
  if (count === 0 || weight < count * 0.25 * GREY * 2) return null;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The hue of an RGB colour, or `null` for a grey. */
export function hueOf(rgb: readonly [number, number, number]): number | null {
  const [h, s] = toHsl(rgb[0], rgb[1], rgb[2]);
  return s < GREY ? null : h;
}

/** The shortest distance between two hues (0 to 180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

/** What a picture is checked against. */
export interface AiCheckTarget {
  /** MSM's drawing of the same thing (items and tools: its mask is the shape). */
  reference?: RgbaImage;
  /** The asked colour. */
  colour?: readonly [number, number, number];
  /** A block face: it must tile; its shape is the whole square. */
  face?: boolean;
}

/** Checks a cleaned-up picture against its target. */
export function checkPicture(image: RgbaImage, target: AiCheckTarget): AiCheck {
  const failures: AiCheckFailure[] = [];
  const out: AiCheck = { ok: true, failures };
  if (target.reference !== undefined && target.face !== true) {
    const match = shapeMatch(image, target.reference);
    out.overlap = match.overlap;
    if (match.gaps !== null) out.gaps = match.gaps;
    if (match.overlap < MIN_SHAPE_OVERLAP || (match.gaps !== null && match.gaps < MIN_GAPS_KEPT)) {
      failures.push('shape');
    }
  }
  const asked = target.colour === undefined ? null : hueOf(target.colour);
  if (asked !== null) {
    const hue = mainHue(image);
    if (hue === null) {
      failures.push('colour');
    } else {
      out.hueDistance = hueDistance(hue, asked);
      if (out.hueDistance > MAX_HUE_DISTANCE) failures.push('colour');
    }
  }
  if (target.face === true && !seamCheck(image).tiles) failures.push('seam');
  out.ok = failures.length === 0;
  return out;
}

/** A failed check in words: "did not look like a chestplate", "was not golden". */
export function checkWords(check: AiCheck, noun: string, colour?: string): string {
  const parts: string[] = [];
  if (check.failures.includes('shape')) parts.push(`did not look like ${withArticle(noun)}`);
  if (check.failures.includes('colour')) {
    parts.push(colour === undefined ? 'was not in the asked colour' : `was not ${colour}`);
  }
  if (check.failures.includes('seam')) parts.push('showed a seam when tiled');
  return parts.join(' and ');
}

/** "a chestplate", "an axe", "a pair of boots", "planks". */
export function withArticle(noun: string): string {
  if (/^(boots|leggings)$/.test(noun)) return `a pair of ${noun}`;
  if (/^(planks|bricks|leaves)$/.test(noun)) return noun;
  return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
}

/**
 * The colour a picture is mostly in: the mean of its most saturated half of drawn pixels (its
 * grey pixels when it has no colour), or `undefined` when nothing is drawn.
 */
export function dominantColour(image: RgbaImage): [number, number, number] | undefined {
  const pixels: { rgb: [number, number, number]; s: number }[] = [];
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) < 128) continue;
    const rgb: [number, number, number] = [
      image.data[at] ?? 0,
      image.data[at + 1] ?? 0,
      image.data[at + 2] ?? 0,
    ];
    pixels.push({ rgb, s: toHsl(...rgb)[1] });
  }
  if (pixels.length === 0) return undefined;
  pixels.sort((a, b) => b.s - a.s);
  const half = pixels.slice(0, Math.max(1, Math.ceil(pixels.length / 2)));
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of half) {
    r += pixel.rgb[0];
    g += pixel.rgb[1];
    b += pixel.rgb[2];
  }
  return [Math.round(r / half.length), Math.round(g / half.length), Math.round(b / half.length)];
}
