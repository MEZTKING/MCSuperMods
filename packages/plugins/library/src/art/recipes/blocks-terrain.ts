/**
 * Terrain block recipes (B492, ADR 0092 D7, D8): dirt, the grass top and side, sand, gravel and
 * the portal surface. The tiling ones use wrapping fields and cells so their edges meet.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { setPixel } from '../canvas';
import { type ArtImage, blankImage, oklchToRgb, rgbToOklch } from '../colour';
import type { DrawContext } from '../info';
import { materialRamp, type Ramp, spreadShades } from '../materials';
import { clusteredField, hashSeed, quantise, rng } from '../noise';
import { colourRamp, FACE, lean, paint, stepRamp, wrap, wrappingCells } from './blocks-common';

/** The dirt under a grass side's fringe. */
export const DIRT_BROWN: Rgb = Object.freeze([134, 96, 67]) as Rgb;

/**
 * Clustered dirt in `ramp` with a few small pebbles (a lit pixel with a shadow below and to the
 * right); `tilt` leans the shades towards the top left (0 on a tiling face).
 */
function dirtFace(
  image: ArtImage,
  ramp: Ramp,
  context: DrawContext,
  id: string,
  tilt: number,
): void {
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed(id, context.seed)),
    spreadShades([0.12, 0.3, 0.38, 0.2], 2, context.noise),
  );
  for (let i = 0; i < FACE * FACE; i += 1) {
    const x = i % FACE;
    const y = i >> 4;
    paint(image, x, y, ramp, (shades[i] ?? 2) + lean(x, y) * tilt);
  }
  const random = rng(hashSeed(`${id}-pebbles`, context.seed));
  const pebbles = 2 + Math.round(2 * context.noise);
  for (let p = 0; p < pebbles; p += 1) {
    const x = Math.floor(random() * FACE);
    const y = Math.floor(random() * FACE);
    paint(image, x, y, ramp, 4);
    paint(image, wrap(x + 1), wrap(y + 1), ramp, 0);
    if (random() < 0.5) paint(image, wrap(x + 1), y, ramp, 3);
  }
}

/** Dirt: clustered shades of the colour with small pebbles. */
export function dirt(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  dirtFace(image, colourRamp(context.colour, context.hueShift), context, 'dirt', 0);
  return image;
}

/** Fills a grass top: clustered shades with a few lit blades, each with a shaded foot. */
export function grassTop(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('grass_top', context.seed)),
    spreadShades([0.14, 0.32, 0.36, 0.18], 2, context.noise),
  );
  for (let i = 0; i < FACE * FACE; i += 1) paint(image, i % FACE, i >> 4, ramp, shades[i] ?? 2);
  const random = rng(hashSeed('grass_top-blades', context.seed));
  const blades = 3 + Math.round(3 * context.noise);
  for (let b = 0; b < blades; b += 1) {
    const x = Math.floor(random() * FACE);
    const y = Math.floor(random() * FACE);
    paint(image, x, y, ramp, 4);
    paint(image, x, wrap(y + 1), ramp, 1);
  }
  return image;
}

/**
 * A grass side: dirt with an uneven fringe of grass in the colour two to four pixels deep at the
 * top (with the odd longer strand), lit along its top and shaded along its lower edge.
 */
export function grassSide(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  dirtFace(image, colourRamp(DIRT_BROWN, context.hueShift), context, 'grass_side', 1.3);
  const ramp = colourRamp(context.colour, context.hueShift);
  const random = rng(hashSeed('grass_side-fringe', context.seed));
  const depth = Array.from({ length: FACE }, () => 2 + Math.floor(random() * 3));
  const strands = 1 + Math.round(context.noise);
  for (let s = 0; s < strands; s += 1) {
    const x = Math.floor(random() * FACE);
    depth[x] = (depth[x] ?? 3) + 2;
  }
  const field = clusteredField(FACE, FACE, hashSeed('grass_side-grass', context.seed));
  for (let x = 0; x < FACE; x += 1) {
    const d = depth[x] ?? 3;
    for (let y = 0; y < d; y += 1) {
      const rank = field[y * FACE + x] ?? 0.5;
      let shade = y === 0 ? 3.2 : 2.2 - (rank < 0.3 * context.noise ? 1 : 0);
      if (y === d - 1) shade = 1;
      paint(image, x, y, ramp, Math.max(0, Math.min(4, shade + lean(x, y) * 1.6)));
    }
  }
  return image;
}

/** Sand: fine, pale noise of the colour in gentle steps, with almost no dark specks. */
export function sand(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = stepRamp(
    context.colour,
    [
      { lightness: -0.11, chroma: 1 },
      { lightness: -0.045, chroma: 1 },
      { lightness: 0, chroma: 1 },
      { lightness: 0.04, chroma: 0.92 },
      { lightness: 0.075, chroma: 0.85 },
    ],
    context.hueShift,
  );
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('sand', context.seed), { blurX: 0, blurY: 0 }),
    spreadShades([0.015, 0.25, 0.45, 0.25, 0.035], 2, context.noise),
  );
  for (let i = 0; i < FACE * FACE; i += 1) paint(image, i % FACE, i >> 4, ramp, shades[i] ?? 2);
  return image;
}

/**
 * Gravel: larger pebbles in mixed greys, some tinted by the colour and some plain, each lit on
 * its top left, with dark gaps between them; the pebbles wrap so the face tiles.
 */
export function gravel(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const [l, c, h] = rgbToOklch(context.colour);
  const tinted = colourRamp(oklchToRgb([l, c * 0.7, h]), context.hueShift);
  const grey = colourRamp(oklchToRgb([l * 0.94, 0, h]), context.hueShift);
  const cells = wrappingCells(hashSeed('gravel', context.seed), 4, 0.8);
  const random = rng(hashSeed('gravel-pebbles', context.seed));
  const pebbles = Array.from({ length: cells.count }, () => ({
    ramp: random() < 0.5 ? tinted : grey,
    tone: 1.5 + random() * 1.4,
  }));
  const field = clusteredField(FACE, FACE, hashSeed('gravel-grain', context.seed));
  for (let i = 0; i < FACE * FACE; i += 1) {
    const x = i % FACE;
    const y = i >> 4;
    const pebble = pebbles[cells.owner[i] ?? 0] ?? { ramp: grey, tone: 2 };
    if ((cells.margin[i] ?? 0) < 0.9) {
      paint(image, x, y, grey, 0);
      continue;
    }
    const facing = -((cells.dx[i] ?? 0) + (cells.dy[i] ?? 0)) / 2;
    let shade = pebble.tone + facing * 0.9;
    const rank = field[i] ?? 0.5;
    if (rank < 0.08 * context.noise) shade -= 1;
    paint(image, x, y, pebble.ramp, Math.max(1, Math.min(4, shade)));
  }
  return image;
}

/** A triangle wave of period 16 on whole numbers: 0 at multiples of 16, 1 halfway. */
const triangle = (t: number): number => Math.abs((((t % 16) + 16) % 16) - 8) / 8;

/** The see-through levels of the portal's bands, palest band first. */
const PORTAL_ALPHA: readonly number[] = [85, 170, 170, 255];

/**
 * A portal surface: wavy diagonal bands in four shades of the colour, the darker ones
 * see-through at fixed levels (85 and 170), the lightest opaque, with a few bright sparks; the
 * bands and the noise wrap so the surface tiles. The alpha depends on the seed only.
 */
export function portalSurface(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const { shine } = materialRamp(context.colour, context.hueShift);
  const random = rng(hashSeed('portal', context.seed));
  const phase = Math.floor(random() * 16);
  const swirl = 1 + Math.floor(random() * 3);
  const rank = clusteredField(FACE, FACE, hashSeed('portal-noise', context.seed), { blurX: 2 });
  const mix = Math.min(0.6, 0.3 * context.noise);
  const values = new Float64Array(FACE * FACE);
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const bend = 4 * triangle(swirl * y + phase);
      const wave = triangle(x + 2 * y + bend + phase);
      values[y * FACE + x] = (1 - mix) * wave + mix * (rank[y * FACE + x] ?? 0.5);
    }
  }
  const order = [...values.keys()].sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0) || a - b);
  const ranks = new Float64Array(FACE * FACE);
  order.forEach((index, r) => {
    ranks[index] = r / (FACE * FACE - 1);
  });
  const bands = quantise(ranks, [0.32, 0.3, 0.24, 0.14]);
  for (let i = 0; i < FACE * FACE; i += 1) {
    const band = bands[i] ?? 0;
    setPixel(image, i % FACE, i >> 4, ramp[band + 1] as Rgb, PORTAL_ALPHA[band]);
  }
  const sparks = 2 + Math.round(context.noise);
  for (let s = 0; s < sparks; s += 1) {
    const x = Math.floor(random() * FACE);
    const y = Math.floor(random() * FACE);
    setPixel(image, x, y, shine, 255);
  }
  return image;
}
