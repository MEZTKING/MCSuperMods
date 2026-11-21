/**
 * Pixel helpers and the sprite renderers of the vanilla-style generator (ADR 0092 D8): a
 * silhouette (`sprites.ts`) becomes a shaded picture lit from the top left, with an outline
 * on items. {@link renderSprite} is the prototype's renderer, kept byte for byte because the
 * vanilla parity pictures (B459) are drawn with it; {@link drawSprite} is the recipes' renderer
 * with detail, seeded variations and an outline that is always the darkest shade around it.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { type ArtImage, blankImage, rgbToOklab } from './colour';
import type { Ramp } from './materials';
import { clusteredField, rng } from './noise';
import type { Silhouette } from './sprites';

/** Paints one pixel of `image` (no bounds check). */
export const setPixel = (image: ArtImage, x: number, y: number, rgb: Rgb, alpha = 255): void => {
  const i = (y * image.width + x) * 4;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
  image.data[i + 3] = alpha;
};

/** The shade at `index` of `ramp`, rounded and clamped to the ramp. */
export const pick = (ramp: Ramp, index: number): Rgb =>
  ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(index)))] as Rgb;

/** The ramps a silhouette is drawn with: the material, its shine and the other parts by letter. */
export interface SpriteRamps {
  readonly material: Ramp;
  readonly shine: Rgb;
  readonly parts: Readonly<Record<string, Ramp>>;
}

/** Whether a silhouette character is a part (anything drawn). */
const isPart = (ch: string | undefined): boolean => ch !== undefined && ch !== '.';

/** The part a silhouette character belongs to: `M` for the material and its fixed shades. */
const partOf = (ch: string): string => (/[0-5*M]/.test(ch) ? 'M' : ch);

/**
 * The prototype's sprite renderer (16 by 16), unchanged so the pictures drawn with it keep their
 * bytes: each part pixel is shaded from its ramp's middle, one step lighter on an edge facing
 * the top left, one darker on an edge facing the bottom right, plus a gentle gradient across
 * the part; every transparent pixel next to a part (sides only) becomes that part's darkest
 * shade, the outline, the material winning over other parts. Large flat areas get a few
 * clustered one-step variations.
 */
export function renderSprite(rows: Silhouette, ramps: SpriteRamps, seed: number): ArtImage {
  const size = 16;
  const image = blankImage(size, size);
  const at = (x: number, y: number): string =>
    x < 0 || y < 0 || x >= size || y >= size ? '.' : (rows[y]?.[x] ?? '.');
  const rampOf = (part: string): Ramp =>
    part === 'M' ? ramps.material : (ramps.parts[part] ?? ramps.material);
  const boxes = partBoxes(rows, size, size);
  const field = clusteredField(size, size, seed, { blurX: 1, wrap: false });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ch = at(x, y);
      if (!isPart(ch)) continue;
      if (ch === '*') {
        setPixel(image, x, y, ramps.shine);
        continue;
      }
      if (/[0-5]/.test(ch)) {
        setPixel(image, x, y, pick(ramps.material, Number(ch)));
        continue;
      }
      const part = partOf(ch);
      const ramp = rampOf(part);
      const same = (dx: number, dy: number): boolean => partOf(at(x + dx, y + dy)) === part;
      const lit = !same(-1, 0) || !same(0, -1);
      const shadow = !same(1, 0) || !same(0, 1);
      const box = boxes.get(part) ?? { x0: 0, y0: 0, x1: 15, y1: 15 };
      const cx = (box.x0 + box.x1) / 2;
      const cy = (box.y0 + box.y1) / 2;
      const w = Math.max(1, box.x1 - box.x0);
      const h = Math.max(1, box.y1 - box.y0);
      const gradient = (cx - x) / w + (cy - y) / h;
      const top = ramp.length - 1;
      const mid = top / 2 + 0.25;
      let shade = mid + (lit ? 1 : 0) - (shadow ? 1 : 0) + gradient * 0.9;
      if (lit && !shadow && gradient > 0.35) shade = top;
      const interior = same(-1, 0) && same(1, 0) && same(0, -1) && same(0, 1);
      const rank = field[y * size + x] ?? 0.5;
      if (interior && rank < 0.1) shade -= 1;
      if (interior && rank > 0.93) shade += 1;
      setPixel(image, x, y, pick(ramp, Math.max(1, Math.min(top, shade))));
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isPart(at(x, y))) continue;
      const neighbours = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter(isPart);
      if (neighbours.length === 0) continue;
      const parts = neighbours.map((ch) => partOf(ch));
      const part = parts.includes('M') ? 'M' : (parts[0] as string);
      setPixel(image, x, y, pick(rampOf(part), 0));
    }
  }
  return image;
}

/** Each part's bounding box in a silhouette. */
function partBoxes(
  rows: Silhouette,
  width: number,
  height: number,
): Map<string, { x0: number; y0: number; x1: number; y1: number }> {
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ch = rows[y]?.[x] ?? '.';
      if (!isPart(ch)) continue;
      const part = partOf(ch);
      const box = boxes.get(part) ?? { x0: x, y0: y, x1: x, y1: y };
      boxes.set(part, {
        x0: Math.min(box.x0, x),
        y0: Math.min(box.y0, y),
        x1: Math.max(box.x1, x),
        y1: Math.max(box.y1, y),
      });
    }
  }
  return boxes;
}

/** How much {@link drawSprite} lightens the top left of the whole picture, in shades. */
const GLOBAL_LIGHT = 0.8;

/** Options for {@link drawSprite}. */
export interface SpriteOptions {
  /** The variation seed. */
  readonly seed: number;
  /** The noise factor of the detail (1 as tuned). */
  readonly noise: number;
  /** Whether to draw the outline round the parts; defaults to true. */
  readonly outline?: boolean;
}

/**
 * Draws a silhouette of any size with the recipes' rules (ADR 0092 D8). Shading is as in
 * {@link renderSprite} (lit top-left edges, shadowed bottom-right edges, a gradient across each
 * part, here with most of a shade more light towards the picture's top-left corner); on top of it the seed moves each part's light centre by up to a pixel and nudges a few
 * pixels one shade (lighter in the top-left half of their part, darker in the bottom-right half),
 * and the detail scales how many interior pixels get a clustered one-step variation. Fixed
 * shades (`0` to `5`) take part in the nudges but never go below shade 1. With `outline`, every
 * transparent pixel beside a part becomes the darkest outline shade of the parts it touches, so
 * the outline is always darker than what it surrounds.
 */
export function drawSprite(rows: Silhouette, ramps: SpriteRamps, options: SpriteOptions): ArtImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const image = blankImage(width, height);
  const at = (x: number, y: number): string =>
    x < 0 || y < 0 || x >= width || y >= height ? '.' : (rows[y]?.[x] ?? '.');
  const rampOf = (part: string): Ramp =>
    part === 'M' ? ramps.material : (ramps.parts[part] ?? ramps.material);
  const boxes = partBoxes(rows, width, height);
  const random = rng(options.seed);
  const jitter = new Map<string, readonly [number, number]>();
  for (const part of [...boxes.keys()].sort()) {
    jitter.set(part, [(random() - 0.5) * 2, (random() - 0.5) * 2]);
  }
  const field = clusteredField(width, height, options.seed ^ 0x5bd1e995, { blurX: 1, wrap: false });
  const dark = 0.1 * options.noise;
  const light = 1 - 0.07 * options.noise;
  const shades = new Float64Array(width * height).fill(-1);
  const halves = new Int8Array(width * height);
  const candidates: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ch = at(x, y);
      if (!isPart(ch) || ch === '*') continue;
      const part = partOf(ch);
      const ramp = rampOf(part);
      const top = ramp.length - 1;
      const box = boxes.get(part) ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
      const [jx, jy] = jitter.get(part) ?? [0, 0];
      const cx = (box.x0 + box.x1) / 2 + jx;
      const cy = (box.y0 + box.y1) / 2 + jy;
      const w = Math.max(1, box.x1 - box.x0);
      const h = Math.max(1, box.y1 - box.y0);
      const gradient = (cx - x) / w + (cy - y) / h;
      halves[y * width + x] = gradient >= 0 ? 1 : -1;
      if (/[0-5]/.test(ch)) {
        shades[y * width + x] = Math.max(1, Number(ch));
        candidates.push(y * width + x);
        continue;
      }
      const same = (dx: number, dy: number): boolean => partOf(at(x + dx, y + dy)) === part;
      const lit = !same(-1, 0) || !same(0, -1);
      const shadow = !same(1, 0) || !same(0, 1);
      const mid = top / 2 + 0.25;
      const global =
        ((width - 1) / 2 - x) / Math.max(1, width - 1) +
        ((height - 1) / 2 - y) / Math.max(1, height - 1);
      let shade = mid + (lit ? 1 : 0) - (shadow ? 1 : 0) + gradient * 0.9 + global * GLOBAL_LIGHT;
      if (lit && !shadow && gradient > 0.35) shade = top;
      const interior = same(-1, 0) && same(1, 0) && same(0, -1) && same(0, 1);
      const rank = field[y * width + x] ?? 0.5;
      if (interior && rank < dark) shade -= 1;
      if (interior && rank > light) shade += 1;
      shades[y * width + x] = Math.max(1, Math.min(top, Math.round(shade)));
      candidates.push(y * width + x);
    }
  }
  // Seeded nudges: lighter towards the light, darker away from it, only where that changes
  // the shade.
  const movable = candidates.filter((index) => {
    const top = rampOf(partOf(at(index % width, Math.floor(index / width)))).length - 1;
    const value = shades[index] ?? 1;
    return (halves[index] ?? 1) > 0 ? value < top : value > 1;
  });
  const nudges = Math.min(movable.length, Math.round(3 + 2 * options.noise));
  for (let k = 0; k < nudges; k += 1) {
    const index = Math.floor(random() * movable.length);
    const at0 = movable[index] as number;
    movable.splice(index, 1);
    shades[at0] = (shades[at0] ?? 1) + (halves[at0] ?? 1);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ch = at(x, y);
      if (!isPart(ch)) continue;
      if (ch === '*') {
        setPixel(image, x, y, ramps.shine);
        continue;
      }
      setPixel(image, x, y, pick(rampOf(partOf(ch)), shades[y * width + x] ?? 1));
    }
  }
  if (options.outline === false) return image;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isPart(at(x, y))) continue;
      const neighbours = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter(isPart);
      if (neighbours.length === 0) continue;
      let best: Rgb | undefined;
      let bestL = Number.POSITIVE_INFINITY;
      for (const part of new Set(neighbours.map((ch) => partOf(ch)))) {
        const rgb = pick(rampOf(part), 0);
        const l = rgbToOklab(rgb)[0];
        if (l < bestL) {
          bestL = l;
          best = rgb;
        }
      }
      if (best !== undefined) setPixel(image, x, y, best);
    }
  }
  return image;
}
