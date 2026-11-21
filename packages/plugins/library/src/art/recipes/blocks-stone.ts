/**
 * Stone-like block recipes (B492, ADR 0092 D7, D8): a plain block, stone, cobblestone, polished
 * stone, bricks, the pillar's side and top, a furnace-like front and a portal frame. Every face
 * is drawn in shades of the user's colour, lit from the top left; the tiling ones use wrapping
 * fields so their edges meet.
 *
 * @packageDocumentation
 */

import { setPixel } from '../canvas';
import { type ArtImage, blankImage, oklchToRgb, rgbToOklch } from '../colour';
import type { DrawContext } from '../info';
import { type Ramp, spreadShades } from '../materials';
import { clusteredField, hashSeed, quantise, rng } from '../noise';
import {
  colourRamp,
  colourRamp6,
  FACE,
  lean,
  paint,
  stepRamp,
  wrap,
  wrappingCells,
} from './blocks-common';

/** Fills the face from a wrapping field quantised to shades `base`, `base + 1` and so on. */
function fieldFill(
  image: ArtImage,
  ramp: Ramp,
  seed: number,
  proportions: readonly number[],
  centre: number,
  noise: number,
  base: number,
  blur: { blurX: number; blurY?: number } = { blurX: 1 },
): Uint8Array {
  const shades = quantise(
    clusteredField(FACE, FACE, seed, blur),
    spreadShades(proportions, centre, noise),
  );
  for (let i = 0; i < FACE * FACE; i += 1) {
    paint(image, i % FACE, i >> 4, ramp, base + (shades[i] ?? centre));
  }
  return shades;
}

/** A plain block: a soft two-tone clustered face with a few lighter and darker blobs. */
export function plainBlock(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  fieldFill(
    image,
    ramp,
    hashSeed('plain', context.seed),
    [0.06, 0.44, 0.42, 0.08],
    1,
    context.noise,
    1,
    { blurX: 2 },
  );
  return image;
}

/** Stone: clustered mid tones with a few dark specks and no lines. */
export function stone(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  fieldFill(
    image,
    ramp,
    hashSeed('stone', context.seed),
    [0.14, 0.36, 0.34, 0.16],
    1,
    context.noise,
    1,
  );
  const random = rng(hashSeed('stone-specks', context.seed));
  const specks = 3 + Math.round(3 * context.noise);
  for (let k = 0; k < specks; k += 1) {
    const x = Math.floor(random() * FACE);
    const y = Math.floor(random() * FACE);
    paint(image, x, y, ramp, 0);
    if (random() < 0.5) paint(image, wrap(x + 1), y, ramp, 0);
  }
  return image;
}

/**
 * Cobblestone: rounded stones of three shades, each lit on its top-left side and shaded on its
 * bottom-right, with dark gaps between them; the stones wrap so the face tiles.
 */
export function cobblestone(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const cells = wrappingCells(hashSeed('cobblestone', context.seed), 3, 0.7);
  const random = rng(hashSeed('cobblestone-tones', context.seed));
  const tones = Array.from({ length: cells.count }, () => 1.6 + Math.floor(random() * 3) * 0.55);
  const field = clusteredField(FACE, FACE, hashSeed('cobblestone-grain', context.seed));
  const dark = 0.1 * context.noise;
  const light = 1 - 0.08 * context.noise;
  for (let i = 0; i < FACE * FACE; i += 1) {
    const x = i % FACE;
    const y = i >> 4;
    const margin = cells.margin[i] ?? 0;
    if (margin < 1.1) {
      paint(image, x, y, ramp, 0);
      continue;
    }
    const facing = -((cells.dx[i] ?? 0) + (cells.dy[i] ?? 0)) / 2.6;
    let shade = (tones[cells.owner[i] ?? 0] ?? 2) + facing * 0.8;
    if (margin < 2.2 && facing < 0) shade -= 0.6;
    const rank = field[i] ?? 0.5;
    if (rank < dark) shade -= 1;
    if (rank > light) shade += 1;
    paint(image, x, y, ramp, Math.max(1, Math.min(4, shade)));
  }
  return image;
}

/**
 * Polished stone: a smooth centre with a little clustered variation, a one-pixel lighter border
 * on the top and left and a darker one on the bottom and right.
 */
export function polishedStone(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  fieldFill(
    image,
    ramp,
    hashSeed('polished_stone', context.seed),
    [0.07, 0.86, 0.07],
    1,
    context.noise,
    1,
    { blurX: 2 },
  );
  for (let k = 0; k < FACE; k += 1) {
    for (const [x, y] of [
      [k, 0],
      [0, k],
      [k, 15],
      [15, k],
    ] as const) {
      const lit = x === 0 || y === 0;
      const shadow = x === 15 || y === 15;
      paint(image, x, y, ramp, lit && shadow ? 2 : lit ? 4 : 1);
    }
  }
  return image;
}

/**
 * Bricks: four courses four pixels high (three of brick, one of mortar), joints every eight
 * pixels and every second course offset by half a brick; each brick has its own tone, a lit top
 * row and left end and a shaded right end; the mortar is a pale shade of the colour.
 */
export function bricks(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const [l, c, h] = rgbToOklch(context.colour);
  const mortarL = l < 0.74 ? l + 0.17 : l - 0.24;
  const mortar: Ramp = [
    oklchToRgb([mortarL - 0.03, c * 0.38, h]),
    oklchToRgb([mortarL, c * 0.32, h]),
  ];
  const random = rng(hashSeed('bricks', context.seed));
  const tones = Array.from({ length: 8 }, () => 1.75 + (random() - 0.5) * 0.9);
  const field = clusteredField(FACE, FACE, hashSeed('bricks-grain', context.seed));
  const dark = 0.1 * context.noise;
  const light = 1 - 0.08 * context.noise;
  for (let y = 0; y < FACE; y += 1) {
    const course = y >> 2;
    const row = y & 3;
    const offset = (course % 2) * 4;
    for (let x = 0; x < FACE; x += 1) {
      const i = y * FACE + x;
      const rank = field[i] ?? 0.5;
      const along = (x + offset) % 8;
      if (row === 3 || along === 7) {
        setPixel(image, x, y, mortar[rank < 0.35 ? 0 : 1] as (typeof mortar)[0]);
        continue;
      }
      const brick = course * 2 + (Math.floor((x + offset) / 8) % 2);
      let shade = tones[brick] ?? 2;
      if (row === 0) shade += 1;
      if (row === 2) shade -= 0.5;
      if (along === 0) shade += 0.7;
      if (along === 6) shade -= 0.5;
      if (rank < dark) shade -= 1;
      if (rank > light) shade += 1;
      paint(image, x, y, ramp, Math.max(0, Math.min(4, shade)));
    }
  }
  return image;
}

/** A pillar's side: vertical grooves every four pixels, each with a lit ridge after it. */
export function pillarSide(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('pillar_side', context.seed), { blurX: 0, blurY: 3 }),
    spreadShades([0.18, 0.64, 0.18], 1, context.noise),
  );
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const q = shades[y * FACE + x] ?? 1;
      const column = x % 4;
      const shade =
        column === 0
          ? q === 0
            ? 0
            : 1
          : column === 1
            ? q === 0
              ? 3
              : 4
            : 1 + q + (column === 2 ? 0.4 : 0);
      paint(image, x, y, ramp, shade);
    }
  }
  return image;
}

/**
 * A pillar's end: a bevelled rim (lit top and left), a sunken ring inside it (shaded on its top
 * and left) and a flat centre with a little variation.
 */
export function pillarTop(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('pillar_top', context.seed), { blurX: 2, wrap: false }),
    spreadShades([0.08, 0.84, 0.08], 1, context.noise),
  );
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const topLeft = x === ring || y === ring;
      const bottomRight = x === 15 - ring || y === 15 - ring;
      let shade: number;
      if (ring === 0) shade = topLeft && bottomRight ? 2 : topLeft ? 4 : 1;
      else if (ring === 3) shade = topLeft && bottomRight ? 2 : topLeft ? 1 : 2.6;
      else shade = 1 + (shades[y * FACE + x] ?? 1) + lean(x, y) * 0.8;
      paint(image, x, y, ramp, shade);
    }
  }
  return image;
}

/**
 * A furnace-like front: a bevelled stone frame, a clustered stone face, a dark opening in the
 * lower middle with a lit sill and a lighter lintel above it.
 */
export function blockFront(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp6(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('block_front', context.seed), { blurX: 1, wrap: false }),
    spreadShades([0.16, 0.6, 0.24], 1, context.noise),
  );
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let shade: number;
      if (ring === 0) {
        const lit = x === 0 || y === 0;
        const shadow = x === 15 || y === 15;
        shade = lit && shadow ? 3 : lit ? 4 : 1;
      } else if (x >= 4 && x <= 11 && y >= 9 && y <= 13) {
        shade = y === 13 && x > 4 ? 1 : 0;
      } else if (x >= 3 && x <= 12 && (y === 7 || y === 8)) {
        shade = y === 7 ? (x === 12 ? 4 : 5) : x === 3 ? 4 : 3;
      } else if (y === 14 && x >= 4 && x <= 11) {
        shade = 4;
      } else {
        shade = 2 + (shades[y * FACE + x] ?? 1) + lean(x, y) * 0.4;
      }
      paint(image, x, y, ramp, Math.max(0, Math.min(5, shade)));
    }
  }
  return image;
}

/**
 * A portal frame: a dark stone in a deep shade of the colour, bevelled (lit top and left), with
 * a few short glowing veins of the colour.
 */
export function portalFrame(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const [l, c, h] = rgbToOklch(context.colour);
  const dark = oklchToRgb([Math.min(l, 0.36), c * 0.6, h]);
  // One ramp from the dark stone up to the glowing veins, so their hues lean in one order.
  const ramp = stepRamp(
    dark,
    [
      { lightness: -0.12, chroma: 1 },
      { lightness: -0.06, chroma: 1 },
      { lightness: 0, chroma: 1 },
      { lightness: 0.06, chroma: 0.95 },
      { lightness: 0.12, chroma: 0.9 },
      { lightness: 0.26, chroma: 1.5 },
      { lightness: 0.36, chroma: 1.2 },
    ],
    context.hueShift,
  );
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('portal_frame', context.seed), { blurX: 1, wrap: false }),
    spreadShades([0.22, 0.5, 0.28], 1, context.noise),
  );
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const lit = x === ring || y === ring;
      const shadow = x === 15 - ring || y === 15 - ring;
      let shade: number;
      if (ring === 0) shade = lit && shadow ? 2 : lit ? 4 : 0;
      else if (ring === 1) shade = lit && shadow ? 2 : lit ? 3 : 1;
      else shade = (shades[y * FACE + x] ?? 1) + 0.6 + lean(x, y) * 0.5;
      paint(image, x, y, ramp, Math.max(0, Math.min(4, shade)));
    }
  }
  const random = rng(hashSeed('portal_frame-veins', context.seed));
  const veins = 2 + Math.round(context.noise);
  for (let v = 0; v < veins; v += 1) {
    const x = 3 + Math.floor(random() * 10);
    const y0 = 3 + Math.floor(random() * 7);
    const length = 2 + Math.floor(random() * 3);
    for (let k = 0; k < length; k += 1) {
      paint(image, x, y0 + k, ramp, k === 0 ? 6 : 5);
    }
  }
  return image;
}
