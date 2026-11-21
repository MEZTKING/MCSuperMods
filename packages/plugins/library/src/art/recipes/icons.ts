/**
 * Icons and particles of the vanilla-style generator (ADR 0092 D7, D8): the effect icon (18 by
 * 18, a round badge lit from the top left with a light symbol chosen by the finish: a drop, a
 * heart, a star, a flame or a swirl) and the four particle pictures (8 by 8, four frames each:
 * a spark that twinkles, an orb that pulses, a puff that thins and a leaf that turns), which
 * use at most three see-through levels (85, 170 and 255). Shapes depend on the seed only, never
 * on the colour.
 *
 * @packageDocumentation
 */

import { EFFECT_ICON_SIZE, PARTICLE_FRAMES, PARTICLE_SIZE, type Rgb } from '../../assets/png';
import { pick, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import {
  type ArtPixels,
  type ArtRecipeEntry,
  type DrawContext,
  type RecipeRow,
  recipeEntry,
} from '../info';
import { materialRamp, type Ramp } from '../materials';
import { clusteredField, hashSeed, rng } from '../noise';
import { generateRamp } from '../ramp';

// The effect icon ----------------------------------------------------------------------------

/** The symbols of the effect icon, 8 by 8, by finish (`#` the symbol). */
const SYMBOLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  drop: [
    '...##...',
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '.######.',
    '..####..',
  ],
  heart: [
    '.##..##.',
    '########',
    '########',
    '########',
    '.######.',
    '..####..',
    '...##...',
    '........',
  ],
  star: [
    '...##...',
    '...##...',
    '########',
    '.######.',
    '..####..',
    '.######.',
    '.##..##.',
    '##....##',
  ],
  flame: [
    '...#....',
    '...##...',
    '..###.#.',
    '..#####.',
    '.######.',
    '.#######',
    '.#######',
    '..#####.',
  ],
  swirl: [
    '..####..',
    '.##..##.',
    '##....#.',
    '#..##.##',
    '#.#..#.#',
    '#.##.#.#',
    '##...#.#',
    '.#####..',
  ],
});

/** The squared radius of the badge round the icon's centre. */
const BADGE_RADIUS = 8.5 * 8.5;
/** The squared radius inside which the badge's rim ends. */
const RIM_RADIUS = 7.5 * 7.5;

/**
 * The effect icon: a round badge in the colour's ramp, lighter towards the top left, its rim a
 * shade or two darker (three shades round the ring, so it reads as a lit rim, not an outline),
 * a few clustered shade variations, and a light symbol with a shadow under its bottom-right
 * edges. The seed moves the symbol by a pixel and changes the clusters.
 */
function effectIcon(context: DrawContext): ArtImage {
  const size = EFFECT_ICON_SIZE;
  const image = blankImage(size, size);
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  const top = material.length - 1;
  const random = rng(hashSeed('effect_icon', context.seed));
  const field = clusteredField(size, size, hashSeed('effect_icon_field', context.seed), {
    wrap: false,
  });
  const symbol = SYMBOLS[context.finish ?? 'drop'] ?? (SYMBOLS.drop as readonly string[]);
  const sx = 5 + Math.floor(random() * 2);
  const sy = 5 + Math.floor(random() * 2);
  const isSymbol = (x: number, y: number): boolean => symbol[y - sy]?.[x - sx] === '#';
  const centre = (size - 1) / 2;
  const dark = 0.07 * context.noise;
  const light = 1 - 0.06 * context.noise;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - centre;
      const dy = y - centre;
      const squared = dx * dx + dy * dy;
      if (squared > BADGE_RADIUS) continue;
      const lean = -(dx + dy) / (2 * centre);
      if (isSymbol(x, y)) {
        const lower = !isSymbol(x + 1, y) || !isSymbol(x, y + 1);
        const upper = !isSymbol(x - 1, y) || !isSymbol(x, y - 1);
        setPixel(image, x, y, lower && !upper ? pick(material, top) : shine);
        continue;
      }
      let shade: number;
      if (squared > RIM_RADIUS) {
        shade = 1 + Math.round(lean * 1.6);
      } else {
        shade = 3 + lean * 2.2;
        const rank = field[y * size + x] ?? 0.5;
        if (rank < dark) shade -= 1;
        if (rank > light) shade += 1;
        // The symbol's shadow on the badge.
        if (isSymbol(x - 1, y) || isSymbol(x, y - 1) || isSymbol(x - 1, y - 1)) shade -= 1;
        shade = Math.max(2, Math.min(top - 1, Math.round(shade)));
      }
      setPixel(image, x, y, pick(material, shade));
    }
  }
  return image;
}

// Particles ----------------------------------------------------------------------------------

/** The see-through levels of particle pictures (ADR 0092 D8). */
const FAINT = 85;
const HALF = 170;
const SOLID = 255;

/** A particle strip: four 8 by 8 frames one under the other. */
function particleStrip(): ArtPixels {
  return {
    width: PARTICLE_SIZE,
    height: PARTICLE_SIZE,
    frames: PARTICLE_FRAMES,
    data: new Uint8Array(PARTICLE_SIZE * PARTICLE_SIZE * 4 * PARTICLE_FRAMES),
  };
}

/** Paints one pixel of a frame of a particle strip, if it lies inside the frame. */
function plot(
  strip: ArtPixels,
  frame: number,
  x: number,
  y: number,
  rgb: Rgb,
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= PARTICLE_SIZE || y >= PARTICLE_SIZE) return;
  const i = ((frame * PARTICLE_SIZE + y) * PARTICLE_SIZE + x) * 4;
  strip.data[i] = rgb[0];
  strip.data[i + 1] = rgb[1];
  strip.data[i + 2] = rgb[2];
  strip.data[i + 3] = alpha;
}

/** How much a pixel of an 8 by 8 frame faces the light: 1 at the top left, -1 at the other. */
const particleLean = (x: number, y: number): number => (7 - x - y) / 7;

/** A glow ramp: five shades of the colour and its shine. */
function glowRamp(context: DrawContext): { ramp: Ramp; shine: Rgb } {
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  return { ramp: material.slice(1), shine };
}

/** The arm length of the spark in each frame: it grows, flares and fades. */
const SPARK_ARMS: readonly number[] = [1, 2, 3, 2];

/**
 * A twinkling spark: a bright core with four arms that grow and shrink over the frames, solid
 * near the core and see-through at the tips, lit from the top left; in its brightest frame it
 * gains diagonal glints. The seed moves the core by a pixel and picks which glints show.
 */
function particleSpark(context: DrawContext): ArtPixels {
  const strip = particleStrip();
  const { ramp, shine } = glowRamp(context);
  const random = rng(hashSeed('particle_spark', context.seed));
  // The core stays in the lit half: (3, 3), (4, 3) or (3, 4).
  const corner = Math.floor(random() * 3);
  const cx = corner === 1 ? 4 : 3;
  const cy = corner === 2 ? 4 : 3;
  const glints = [random() < 0.7, random() < 0.7, random() < 0.7, random() < 0.7];
  const tipLight = random() < 0.5;
  for (let frame = 0; frame < PARTICLE_FRAMES; frame += 1) {
    const arm = SPARK_ARMS[frame] ?? 1;
    plot(strip, frame, cx, cy, shine, SOLID);
    for (const [dx, dy] of [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ] as const) {
      for (let step = 1; step <= arm; step += 1) {
        const x = cx + dx * step;
        const y = cy + dy * step;
        const lit = dx + dy < 0;
        const tip = step === arm && arm > 1;
        const shade = (lit ? 3 : 2) - (tip ? 1 : 0) + (tipLight && step === 1 ? 1 : 0);
        plot(strip, frame, x, y, pick(ramp, shade), tip ? FAINT : step === 1 ? SOLID : HALF);
      }
    }
    if (arm === 3) {
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(([dx, dy], k) => {
        if (!glints[k]) return;
        const lit = (dx ?? 0) + (dy ?? 0) < 0;
        plot(strip, frame, cx + (dx ?? 0), cy + (dy ?? 0), pick(ramp, lit ? 3 : 1), HALF);
      });
    }
  }
  return strip;
}

/** The radius of the orb in each frame: it swells and shrinks as it pulses. */
const ORB_RADII: readonly number[] = [2.4, 2.9, 3.5, 2.9];

/**
 * A pulsing orb: a round glow whose core is solid and bright, its body half see-through and its
 * edge faint, all lit from the top left. The seed moves its centre and its glint.
 */
function particleOrb(context: DrawContext): ArtPixels {
  const strip = particleStrip();
  const { ramp, shine } = glowRamp(context);
  const random = rng(hashSeed('particle_orb', context.seed));
  const cx = 3.5 + (random() - 0.5) * 0.9;
  const cy = 3.5 + (random() - 0.5) * 0.9;
  const glint = Math.floor(random() * 3);
  for (let frame = 0; frame < PARTICLE_FRAMES; frame += 1) {
    const radius = ORB_RADII[frame] ?? 2;
    for (let y = 0; y < PARTICLE_SIZE; y += 1) {
      for (let x = 0; x < PARTICLE_SIZE; x += 1) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d > 1) continue;
        const lean = particleLean(x, y);
        const shade = 2 + lean * 2 + (d < 0.45 ? 1 : 0);
        const alpha = d < 0.45 ? SOLID : d < 0.8 ? HALF : FAINT;
        plot(strip, frame, x, y, pick(ramp, Math.round(shade)), alpha);
      }
    }
    // The glint at the top left of the core.
    const gx = Math.round(cx - 0.5) - (glint === 1 ? 1 : 0);
    const gy = Math.round(cy - 0.5) - (glint === 2 ? 1 : 0);
    plot(strip, frame, gx, gy, shine, SOLID);
  }
  return strip;
}

/** The radius of the puff in each frame, and how many of its pixels have gone. */
const PUFF_RADII: readonly number[] = [3.6, 3.4, 3.1, 2.8];
const PUFF_GONE: readonly number[] = [0, 0.18, 0.36, 0.55];

/**
 * A puff of smoke: a clustered cloud in pale shades of the colour, lit from the top left,
 * that loosens and fades over the frames (fewer solid pixels, more gaps). The seed shapes the
 * cloud.
 */
function particlePuff(context: DrawContext): ArtPixels {
  const strip = particleStrip();
  const { ramp } = glowRamp(context);
  const field = clusteredField(
    PARTICLE_SIZE,
    PARTICLE_SIZE,
    hashSeed('particle_puff', context.seed),
    {
      wrap: false,
    },
  );
  const fade = clusteredField(PARTICLE_SIZE, PARTICLE_SIZE, hashSeed('puff_fade', context.seed), {
    wrap: false,
  });
  for (let frame = 0; frame < PARTICLE_FRAMES; frame += 1) {
    const radius = PUFF_RADII[frame] ?? 3;
    const gone = PUFF_GONE[frame] ?? 0;
    for (let y = 0; y < PARTICLE_SIZE; y += 1) {
      for (let x = 0; x < PARTICLE_SIZE; x += 1) {
        const rank = field[y * PARTICLE_SIZE + x] ?? 0.5;
        const d = Math.hypot(x - 3.5, y - 3.5) / radius;
        // The cloud's edge is lumpy: the clustered field pushes it in and out.
        if (d > 0.8 + rank * 0.4) continue;
        if ((fade[y * PARTICLE_SIZE + x] ?? 1) < gone) continue;
        const lean = particleLean(x, y);
        const shade = 2.4 + lean * 1.6 + (rank - 0.5) * context.noise;
        const solid = d < 0.5 && frame < 2;
        const alpha = solid ? SOLID : d < 0.85 - frame * 0.15 ? HALF : FAINT;
        plot(strip, frame, x, y, pick(ramp, Math.round(shade)), alpha);
      }
    }
  }
  return strip;
}

/**
 * A falling leaf that turns: a leaf on the diagonal with a darker midrib, lit on its upper
 * half; frames 1 and 3 mirror it and frames 2 and 3 show it narrower, edge on. Solid, as a
 * leaf is. The seed picks its length and where a notch is bitten from its edge.
 */
function particleLeaf(context: DrawContext): ArtPixels {
  const strip = particleStrip();
  const ramp = generateRamp(context.colour, { count: 5, anchor: 2, hueShift: context.hueShift });
  const random = rng(hashSeed('particle_leaf', context.seed));
  const long = random() < 0.5 ? 196 : 169;
  const notch = Math.floor(random() * 4);
  const stem = random() < 0.5;
  const glints = Array.from({ length: PARTICLE_FRAMES }, () => Math.floor(random() * 64));
  for (let frame = 0; frame < PARTICLE_FRAMES; frame += 1) {
    const mirrored = frame % 2 === 1;
    // The squared half-width of the leaf across the diagonal, in doubled units.
    const width = frame < 2 ? 25 : 9;
    for (let y = 0; y < PARTICLE_SIZE; y += 1) {
      for (let x = 0; x < PARTICLE_SIZE; x += 1) {
        const mx = mirrored ? 7 - x : x;
        const u = 2 * mx - 7;
        const v = 2 * y - 7;
        const along = u - v;
        const across = u + v;
        if (along * along * width + across * across * long >= long * width) continue;
        if (frame < 2 && along === -2 * (notch + 1) + 4 && across === 2) continue;
        const lean = particleLean(x, y);
        let shade = across === 0 ? 1 : across < 0 ? 3 : 2;
        shade += lean > 0.4 ? 1 : lean < -0.4 ? -1 : 0;
        if (y * PARTICLE_SIZE + x === glints[frame] && across !== 0) shade += 1;
        plot(strip, frame, x, y, pick(ramp, shade), SOLID);
      }
    }
    if (stem) {
      // At the leaf's lower end, touching its tip.
      plot(strip, frame, mirrored ? 7 : 0, 7, pick(ramp, 1), SOLID);
    }
  }
  return strip;
}

const particle = (id: RecipeRow['id'], label: string): RecipeRow => ({
  id,
  label,
  kind: 'particle',
  fallback: id as RecipeRow['fallback'],
  width: PARTICLE_SIZE,
  height: PARTICLE_SIZE,
  frames: PARTICLE_FRAMES,
});

/** The icon and particle recipes, in table order. */
export const ICON_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'effect_icon',
      label: 'Effect icon',
      kind: 'icon',
      fallback: 'effect_icon',
      width: EFFECT_ICON_SIZE,
      height: EFFECT_ICON_SIZE,
      finishes: ['drop', 'heart', 'star', 'flame', 'swirl'],
    },
    effectIcon,
  ),
  recipeEntry(particle('particle_spark', 'Spark'), particleSpark),
  recipeEntry(particle('particle_orb', 'Glowing orb'), particleOrb),
  recipeEntry(particle('particle_puff', 'Puff of smoke'), particlePuff),
  recipeEntry(particle('particle_leaf', 'Falling leaf'), particleLeaf),
]);
