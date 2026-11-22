/**
 * Plant and pot block recipes of vanilla parity 3 (B518, ADR 0092 D7, D8; ADR 0103): a strand
 * that grows in a line (kelp-like, vine-like, with berries or without), a stalk (cane, cactus
 * and bamboo faces, bamboo leaves), a lichen spread thinly over a face, a dripleaf (its leaf,
 * the leaf's edge and the stem) and the clay sheet of a flower pot. Each is drawn fresh in code
 * from words, as the other recipes are; no Minecraft texture is opened or measured (ADR 0092
 * D12). Shapes depend on the seed and the finish only, never on the colour.
 *
 * The faces a model samples in parts (the cactus, bamboo, dripleaf edge and the pot) are drawn
 * so that any part of them reads as the material: the pattern runs over the whole face.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import type { DrawContext } from '../info';
import type { Ramp } from '../materials';
import { clusteredField, hashSeed, rng } from '../noise';
import { generateRamp } from '../ramp';
import { colourRamp, FACE, lean, paint, rampsAgree } from './blocks-common';

/** The berries of a strand when no second colour is given: a warm glow-berry orange. */
export const STRAND_BERRY: Rgb = Object.freeze([236, 150, 48]) as Rgb;

/** The glowing specks of a lichen when no second colour is given: a pale warm yellow. */
export const LICHEN_GLOW: Rgb = Object.freeze([226, 206, 128]) as Rgb;

/** The finishes of each recipe, the first the default. */
export const STRAND_FINISHES = Object.freeze(['body', 'tip', 'berries', 'berrytip']);
export const STALK_FINISHES = Object.freeze(['cane', 'cactus', 'cactustop', 'bamboo', 'leaves']);
export const DRIPLEAF_FINISHES = Object.freeze(['top', 'side', 'stem']);

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** A shade of a five-shade ramp, clamped to it. */
const five = (value: number): number => clamp(value, 0, 4);

/**
 * The second colour's ramp of `count` shades, or the main ramp's lighter shades when the two
 * would disagree on which shade is warmer where they touch (as the crop's produce).
 */
function accentRamp(accent: Rgb, main: Ramp, hueShift: number): Ramp {
  const own = generateRamp(accent, { count: 4, anchor: 2, hueShift });
  return rampsAgree(own, main) ? own : main.slice(1);
}

/** The noise of a face: a clustered field of ranks around 0, from -0.5 to 0.5. */
function faceNoise(seed: number, tag: string, wrap = false): (x: number, y: number) => number {
  const field = clusteredField(FACE, FACE, hashSeed(tag, seed), { wrap });
  return (x, y) => (field[y * FACE + x] ?? 0.5) - 0.5;
}

// Strand ---------------------------------------------------------------------------------------

/**
 * A strand (kelp, weeping, twisting and cave vines): a wavy two-pixel stem down the face with
 * short leaves on alternate sides. `body` runs edge to edge so stacked blocks join; `tip` stops
 * a few pixels from the top in a pointed bud. `berries` (a body) and `berrytip` (a tip) add round
 * berries in the second colour beside the stem. Transparent around them.
 */
export function strand(context: DrawContext): ArtImage {
  const finish = context.finish ?? 'body';
  const tip = finish === 'tip' || finish === 'berrytip';
  const berries = finish === 'berries' || finish === 'berrytip';
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const random = rng(hashSeed('strand', context.seed));
  const amplitude = 0.7 + random() * 0.9;
  const phase = random() * Math.PI * 2;
  const period = 7 + random() * 5;
  const first = random() < 0.5 ? -1 : 1;
  const leafStart = Math.floor(random() * 3);
  const top = tip ? 3 + Math.floor(random() * 2) : 0;
  const noise = faceNoise(context.seed, 'strand-shade');
  const columnAt = (y: number): number =>
    7 + Math.round(amplitude * Math.sin((y / period) * Math.PI * 2 + phase));
  const shadeAt = (x: number, y: number, extra: number): number =>
    five(1.9 + lean(x, y) * 1.7 + noise(x, y) * 1.1 * context.noise + extra);
  for (let y = top; y < FACE; y += 1) {
    const x = columnAt(y);
    paint(image, x, y, ramp, shadeAt(x, y, 0.6));
    paint(image, x + 1, y, ramp, shadeAt(x + 1, y, -0.5));
  }
  if (tip) {
    // A pointed bud: one pixel above the stem, lit on its left.
    const x = columnAt(top);
    paint(image, x, top - 1, ramp, shadeAt(x, top - 1, 1));
    paint(image, x + 1, top - 2, ramp, shadeAt(x + 1, top - 2, 0.8));
  }
  let side = first;
  for (let y = top + 2 + leafStart; y < FACE - 1; y += 3) {
    const x = columnAt(y);
    const base = side < 0 ? x - 1 : x + 2;
    const lit = side < 0 ? 0.5 : -0.3;
    paint(image, base, y, ramp, shadeAt(base, y, lit));
    const reach = base + side;
    if (reach >= 0 && reach < FACE && y - 1 >= top) {
      paint(image, reach, y - 1, ramp, shadeAt(reach, y - 1, lit + 0.3));
    }
    side = -side;
  }
  if (berries) {
    const fruit = accentRamp(context.accent ?? STRAND_BERRY, ramp, context.hueShift);
    let berrySide = -first;
    for (let y = top + 3 + Math.floor(random() * 2); y < FACE - 2; y += 5) {
      const x = columnAt(y);
      const left = berrySide < 0 ? x - 2 : x + 2;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const bx = left + dx;
          if (bx < 0 || bx >= FACE) continue;
          const own = dx === 0 && dy === 0 ? 1 : dx === 1 && dy === 1 ? -0.8 : 0;
          const shade = Math.round(1.6 + lean(bx, y + dy) * 1.6 + own);
          setPixel(image, bx, y + dy, fruit[clamp(shade, 0, fruit.length - 1)] as Rgb);
        }
      }
      berrySide = -berrySide;
    }
  }
  return image;
}

// Stalk ----------------------------------------------------------------------------------------

/** Sugar-cane-like stalks: three two-pixel stalks edge to edge with nodes and a few blades. */
function cane(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('stalk-cane', context.seed));
  const noise = faceNoise(context.seed, 'stalk-cane-shade');
  const columns = [1, 7, 12].map((x) => clamp(x + Math.floor(random() * 2), 0, FACE - 2));
  for (const column of columns) {
    const nodeOffset = Math.floor(random() * 5);
    const spacing = 4 + Math.floor(random() * 2);
    for (let y = 0; y < FACE; y += 1) {
      const node = (y + nodeOffset) % spacing === 0;
      for (const [dx, lit] of [
        [0, 0.6],
        [1, -0.5],
      ] as const) {
        const x = column + dx;
        const shade = 1.9 + lean(x, y) * 1.3 + lit + noise(x, y) * context.noise - (node ? 1 : 0);
        paint(image, x, y, ramp, five(shade));
      }
    }
    // One blade from a node, leaning out on the side with room.
    const bladeY = 3 + Math.floor(random() * 8);
    const dir = column < 8 ? 1 : -1;
    for (let k = 1; k <= 3; k += 1) {
      const x = column + (dir > 0 ? 1 : 0) + dir * k;
      const y = bladeY - k;
      if (x < 0 || x >= FACE || y < 0) continue;
      paint(image, x, y, ramp, five(2.2 + lean(x, y) * 1.3 - k * 0.2));
    }
  }
  return image;
}

/** A cactus side: ribs down the face, spines along them, filled edge to edge. */
function cactusSide(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('stalk-cactus', context.seed));
  const noise = faceNoise(context.seed, 'stalk-cactus-shade');
  const shift = Math.floor(random() * 2);
  const spines = new Set<number>();
  for (let n = 0; n < 14; n += 1) {
    const rib = (Math.floor(random() * 4) * 4 + 1 + shift) % FACE;
    spines.add(Math.floor(random() * FACE) * FACE + rib);
  }
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const groove = (x + 4 - shift) % 4 === 3;
      let shade = 2 + lean(x, y) * 1.2 + noise(x, y) * 0.9 * context.noise;
      if (groove) shade -= 1.1;
      if (spines.has(y * FACE + x)) shade = 4;
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/** A cactus top (and bottom): rings round a light centre, filled edge to edge. */
function cactusTop(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const noise = faceNoise(context.seed, 'stalk-cactus-top');
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d) % 3 === 0 ? -0.9 : 0;
      const shade = 2 + lean(x, y) * 1.3 + ring + noise(x, y) * context.noise + (d < 2 ? 1 : 0);
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/** A bamboo-like stalk: stalk bands down the face with node lines, filled edge to edge. */
function bamboo(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('stalk-bamboo', context.seed));
  const noise = faceNoise(context.seed, 'stalk-bamboo-shade');
  const nodeOffset = Math.floor(random() * 6);
  const spacing = 5 + Math.floor(random() * 3);
  for (let y = 0; y < FACE; y += 1) {
    const node = (y + nodeOffset) % spacing;
    for (let x = 0; x < FACE; x += 1) {
      const band = x % 4;
      let shade = 2.1 + lean(x, y) * 1.2 + noise(x, y) * 0.8 * context.noise;
      if (band === 0) shade += 0.7;
      if (band === 3) shade -= 0.8;
      if (node === 0) shade -= 1.2;
      if (node === 1) shade += 0.6;
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/** Bamboo-like leaves: narrow blades fanning out from the middle, transparent between them. */
function bambooLeaves(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('stalk-leaves', context.seed));
  const blades = 5 + Math.floor(random() * 2);
  for (let b = 0; b < blades; b += 1) {
    const angle = (b / blades) * Math.PI * 2 + random() * 0.6;
    const length = 5 + random() * 2.5;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) * 0.8 - 0.25;
    for (let t = 1; t <= length; t += 0.5) {
      const x = Math.round(7.5 + dx * t);
      const y = Math.round(7.5 + dy * t);
      if (x < 0 || y < 0 || x >= FACE || y >= FACE) continue;
      const shade = 2.4 + lean(x, y) * 1.4 - (t / length) * 0.6 + (b % 2 === 0 ? 0.3 : -0.3);
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/**
 * A stalk face: `cane` (three cane stalks, transparent between), `cactus` (a cactus side),
 * `cactustop` and `bamboo` (opaque, the pattern over the whole face) and `leaves` (bamboo-like
 * blades fanning out).
 */
export function stalk(context: DrawContext): ArtImage {
  const ramp = colourRamp(context.colour, context.hueShift);
  switch (context.finish) {
    case 'cactus':
      return cactusSide(context, ramp);
    case 'cactustop':
      return cactusTop(context, ramp);
    case 'bamboo':
      return bamboo(context, ramp);
    case 'leaves':
      return bambooLeaves(context, ramp);
    default:
      return cane(context, ramp);
  }
}

// Lichen ---------------------------------------------------------------------------------------

/**
 * A lichen spread thinly over a face, as glow lichen: clustered patches over about half of it,
 * shaded by a second field so the patches have no dark rim, with a few glowing specks in the
 * second colour. Transparent between the patches.
 */
export function lichen(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const glow = accentRamp(context.accent ?? LICHEN_GLOW, ramp, context.hueShift);
  const cover = clusteredField(FACE, FACE, hashSeed('lichen', context.seed), { blurX: 2 });
  const noise = faceNoise(context.seed, 'lichen-shade');
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const rank = cover[y * FACE + x] ?? 0;
      if (rank < 0.52) continue;
      if (rank > 0.965) {
        setPixel(image, x, y, glow[glow.length - 1] as Rgb);
        continue;
      }
      paint(image, x, y, ramp, five(2 + lean(x, y) * 1.5 + noise(x, y) * 1.6 * context.noise));
    }
  }
  return image;
}

// Dripleaf -------------------------------------------------------------------------------------

/** A dripleaf's leaf, seen from above: a wide leaf with cut corners and veins from its stalk. */
function dripleafTop(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('dripleaf-top', context.seed));
  const noise = faceNoise(context.seed, 'dripleaf-top-shade');
  const corner = 2 + Math.floor(random() * 2);
  const veinTurn = 0.8 + random() * 0.5;
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const cx = Math.min(x, FACE - 1 - x);
      const cy = Math.min(y, FACE - 1 - y);
      if (cx + cy < corner) continue;
      const midrib = Math.abs(x - 7.5) < 1 && y > 1;
      const fromStalk = Math.abs(Math.abs(x - 7.5) * veinTurn - (15 - y) * 0.5);
      const vein = !midrib && Math.round(fromStalk) % 4 === 0 && y > 2 && y < 14;
      let shade = 1.9 + lean(x, y) * 1.4 + noise(x, y) * context.noise;
      if (midrib) shade += 1.1;
      else if (vein) shade += 0.7;
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/** A dripleaf's edge: rows of leaf, lighter along the top, over the whole face. */
function dripleafSide(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const noise = faceNoise(context.seed, 'dripleaf-side', true);
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const row = y % 4;
      let shade = 2 + lean(x, y) * 1.2 + noise(x, y) * 1.1 * context.noise;
      if (row === 0) shade += 0.8;
      if (row === 3) shade -= 0.8;
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}

/** A dripleaf's stem: a gently bending stem edge to edge with one leaflet. */
function dripleafStem(context: DrawContext, ramp: Ramp): ArtImage {
  const image = blankImage(FACE, FACE);
  const random = rng(hashSeed('dripleaf-stem', context.seed));
  const noise = faceNoise(context.seed, 'dripleaf-stem-shade');
  const bend = random() * Math.PI * 2;
  const leafY = 5 + Math.floor(random() * 6);
  const dir = random() < 0.5 ? -1 : 1;
  const columnAt = (y: number): number => 7 + Math.round(0.8 * Math.sin(y / 5 + bend));
  for (let y = 0; y < FACE; y += 1) {
    const x = columnAt(y);
    paint(image, x, y, ramp, five(2.2 + lean(x, y) * 1.3 + noise(x, y) * context.noise + 0.5));
    paint(
      image,
      x + 1,
      y,
      ramp,
      five(1.6 + lean(x + 1, y) * 1.3 + noise(x + 1, y) * context.noise),
    );
  }
  const base = columnAt(leafY) + (dir > 0 ? 2 : -1);
  for (let k = 0; k < 3; k += 1) {
    const x = base + dir * k;
    const y = leafY - (k > 0 ? 1 : 0);
    if (x < 0 || x >= FACE) continue;
    paint(image, x, y, ramp, five(2.6 + lean(x, y) * 1.3 - k * 0.3));
  }
  return image;
}

/**
 * A dripleaf: `top` (the leaf from above, with cut corners), `side` (its edge, over the whole
 * face) and `stem` (transparent around a bending stem).
 */
export function dripleaf(context: DrawContext): ArtImage {
  const ramp = colourRamp(context.colour, context.hueShift);
  if (context.finish === 'side') return dripleafSide(context, ramp);
  if (context.finish === 'stem') return dripleafStem(context, ramp);
  return dripleafTop(context, ramp);
}

// Pot ------------------------------------------------------------------------------------------

/**
 * The clay of a flower pot: fired clay over the whole face with a light rim line and a groove
 * every few rows, so whichever part of the sheet a pot model shows reads as a pot's wall.
 */
export function pot(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = colourRamp(context.colour, context.hueShift);
  const random = rng(hashSeed('pot', context.seed));
  const noise = faceNoise(context.seed, 'pot-shade');
  const offset = Math.floor(random() * 5);
  for (let y = 0; y < FACE; y += 1) {
    const row = (y + offset) % 5;
    for (let x = 0; x < FACE; x += 1) {
      let shade = 2 + lean(x, y) * 1.3 + noise(x, y) * 0.9 * context.noise;
      if (row === 0) shade += 0.9;
      if (row === 4) shade -= 1;
      paint(image, x, y, ramp, five(shade));
    }
  }
  return image;
}
