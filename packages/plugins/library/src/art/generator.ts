/**
 * Approach B of ADR 0092 (Proposed): an original generator that follows vanilla's art rules
 * instead of copying vanilla's pixels. Every recipe draws on a 16 by 16 grid with hue-shifted
 * ramps of four to six shades ({@link generateRamp}), light from the top left, clustered noise
 * ({@link clusteredField}) rather than uniform random, a dark outline on items and none on full
 * blocks, and a structure per material (gem clusters in stone, boards in planks, rings in a log
 * end). The output depends only on the recipe, the colours and the seed.
 *
 * @packageDocumentation
 */

import { encodePng, type Rgb } from '../assets/png';
import { type ArtImage, blankImage, oklchToRgb, rgbToOklch } from './colour';
import { clusteredField, hashSeed, quantise, rng } from './noise';
import { generateRamp } from './ramp';
import {
  AXE,
  BOOTS,
  CHESTPLATE,
  FRUIT,
  GEM,
  HELMET,
  HOE,
  INGOT,
  LEGGINGS,
  PICKAXE,
  PIE,
  SHOVEL,
  type Silhouette,
  SWORD,
} from './sprites';

/** The recipes {@link generateArt} draws. */
export type ArtRecipe =
  | 'ore'
  | 'deepslate_ore'
  | 'gem'
  | 'ingot'
  | 'block'
  | 'sword'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'hoe'
  | 'helmet'
  | 'chestplate'
  | 'leggings'
  | 'boots'
  | 'fruit'
  | 'pie'
  | 'planks'
  | 'log'
  | 'log_top'
  | 'leaves';

/** Every recipe, in documentation order. */
export const ART_RECIPES: readonly ArtRecipe[] = Object.freeze([
  'ore',
  'deepslate_ore',
  'gem',
  'ingot',
  'block',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'fruit',
  'pie',
  'planks',
  'log',
  'log_top',
  'leaves',
]);

/** Options for {@link generateArt}. */
export interface ArtOptions {
  /** The material colour (the gem, the metal, the fruit, the pie filling, the wood). */
  readonly colour: Rgb;
  /** The seed; the same recipe, colours and seed always give the same pixels. Defaults to 0. */
  readonly seed?: number;
  /** `gem` (bevelled, glinting) or `metal` (plated) for `block`; defaults to `gem`. */
  readonly finish?: 'gem' | 'metal';
  /** The leaf colour of `fruit` and `leaves`; defaults to {@link LEAF_GREEN}. */
  readonly leafColour?: Rgb;
  /** Learned or tuned style numbers; defaults to {@link DEFAULT_STYLE}. */
  readonly style?: ArtStyle;
}

/**
 * Style numbers the recipes use. The defaults are tuned by eye and original; a host may learn
 * them from the user's own textures at run time ({@link learnStyle}), as numbers only.
 */
export interface ArtStyle {
  /** Blur passes of the stone and leaf noise (1 gives blobs of about two pixels). */
  readonly clusterBlur: number;
  /** Hue shift in degrees at the ends of a ramp. */
  readonly hueShift: number;
}

/** The built-in style numbers. */
export const DEFAULT_STYLE: ArtStyle = Object.freeze({ clusterBlur: 1, hueShift: 16 });

/** The default leaf colour. */
export const LEAF_GREEN: Rgb = Object.freeze([78, 132, 44]) as Rgb;

/** Handle wood, stone, deepslate and pastry base colours (original values). */
const HANDLE_BROWN: Rgb = [128, 94, 52];
const STONE_GREY: Rgb = [124, 124, 126];
const DEEPSLATE_GREY: Rgb = [82, 82, 90];
const CRUST: Rgb = [214, 158, 92];

type Ramp = readonly Rgb[];

/** Gentle five-shade steps for stone, bark and boards: low contrast, as on vanilla blocks. */
const STONE_STEPS = [
  { lightness: -0.14, chroma: 1 },
  { lightness: -0.065, chroma: 1 },
  { lightness: 0, chroma: 1 },
  { lightness: 0.055, chroma: 0.9 },
  { lightness: 0.105, chroma: 0.8 },
] as const;

const WOOD_STEPS = [
  { lightness: -0.17, chroma: 1.05 },
  { lightness: -0.08, chroma: 1.02 },
  { lightness: 0, chroma: 1 },
  { lightness: 0.06, chroma: 0.95 },
  { lightness: 0.11, chroma: 0.85 },
] as const;

interface Ramps {
  readonly material: Ramp;
  readonly shine: Rgb;
  readonly parts: Readonly<Record<string, Ramp>>;
}

/** The six-shade material ramp and its shine (a near-white of the hue). */
function materialRamps(options: ArtOptions): { material: Ramp; shine: Rgb } {
  const hueShift = (options.style ?? DEFAULT_STYLE).hueShift;
  const material = generateRamp(options.colour, { count: 6, anchor: 3, hueShift });
  const [l, c, h] = rgbToOklch(material[5] as Rgb);
  const shine = oklchToRgb([Math.min(0.97, l + 0.16), c * 0.35, h]);
  return { material, shine };
}

const setPixel = (image: ArtImage, x: number, y: number, rgb: Rgb, alpha = 255): void => {
  const i = (y * image.width + x) * 4;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
  image.data[i + 3] = alpha;
};

const pick = (ramp: Ramp, index: number): Rgb =>
  ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(index)))] as Rgb;

/** Whether a silhouette character is a part (anything drawn). */
const isPart = (ch: string | undefined): boolean => ch !== undefined && ch !== '.';

/** The part a silhouette character belongs to: `M` for the material and its fixed shades. */
const partOf = (ch: string): string => (/[0-5*M]/.test(ch) ? 'M' : ch);

/**
 * Draws a silhouette: each part pixel is shaded from its ramp's middle, one step lighter on an
 * edge facing the top left, one darker on an edge facing the bottom right, plus a gentle
 * gradient across the part; every transparent pixel next to a part (sides only) becomes that
 * part's darkest shade, the outline. Large flat areas get a few clustered one-step variations.
 */
export function renderSprite(rows: Silhouette, ramps: Ramps, seed: number): ArtImage {
  const size = 16;
  const image = blankImage(size, size);
  const at = (x: number, y: number): string =>
    x < 0 || y < 0 || x >= size || y >= size ? '.' : (rows[y]?.[x] ?? '.');
  const rampOf = (part: string): Ramp =>
    part === 'M' ? ramps.material : (ramps.parts[part] ?? ramps.material);
  // Part bounding boxes for the gradient.
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ch = at(x, y);
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
  // Outline: transparent pixels beside a part; the material wins over other parts.
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

/** A grey stone ramp and a field of shade indices in clustered blobs. */
function stoneBase(image: ArtImage, seed: number, deepslate: boolean, style: ArtStyle): Ramp {
  const ramp = generateRamp(deepslate ? DEEPSLATE_GREY : STONE_GREY, { steps: STONE_STEPS });
  const field = deepslate
    ? clusteredField(16, 16, seed, { blurX: 2, blurY: 0 })
    : clusteredField(16, 16, seed, { blurX: style.clusterBlur });
  const shades = quantise(field, [0.08, 0.22, 0.38, 0.22, 0.1]);
  for (let i = 0; i < 256; i += 1) setPixel(image, i % 16, i >> 4, pick(ramp, shades[i] ?? 2));
  return ramp;
}

/** Small original vein shapes for ores, as offsets. */
const VEINS: readonly (readonly [number, number])[][] = [
  'XX.|XXX|.X.',
  '.XX|XXX|XX.',
  'XX..|XXX.|.XXX',
  '.X.|XXX|.XX',
  'XXX|.XX|..X',
  'X..|XXX|.XX',
].map((shape) =>
  shape
    .split('|')
    .flatMap((row, y) =>
      [...row].flatMap((ch, x): [number, number][] => (ch === 'X' ? [[x, y]] : [])),
    ),
);

function ore(options: ArtOptions, deepslate: boolean): ArtImage {
  const seed = options.seed ?? 0;
  const style = options.style ?? DEFAULT_STYLE;
  const image = blankImage(16, 16);
  const stone = stoneBase(image, hashSeed('stone', seed, deepslate ? 1 : 0), deepslate, style);
  const { material, shine } = materialRamps(options);
  const random = rng(hashSeed('ore', seed, ...options.colour));
  const gem = new Set<number>();
  const centres: [number, number][] = [];
  const wrap = (v: number): number => (v + 16) % 16;
  const count = 3 + Math.floor(random() * 2);
  for (let attempt = 0; attempt < 400 && centres.length < count; attempt += 1) {
    const cx = Math.floor(random() * 16);
    const cy = Math.floor(random() * 16);
    const far = centres.every(([x, y]) => {
      const dx = Math.min(Math.abs(x - cx), 16 - Math.abs(x - cx));
      const dy = Math.min(Math.abs(y - cy), 16 - Math.abs(y - cy));
      return dx * dx + dy * dy >= 30;
    });
    if (!far) continue;
    centres.push([cx, cy]);
    const vein = VEINS[Math.floor(random() * VEINS.length)] ?? [];
    for (const [dx, dy] of vein) gem.add(wrap(cy + dy) * 16 + wrap(cx + dx));
    // A stray pixel or two beside the vein, so the clusters are not stamped shapes.
    for (let k = 0; k < 2; k += 1) {
      const [dx, dy] = vein[Math.floor(random() * vein.length)] ?? [0, 0];
      const side = Math.floor(random() * 4);
      const ox = side === 0 ? -1 : side === 1 ? 1 : 0;
      const oy = side === 2 ? -1 : side === 3 ? 1 : 0;
      if (random() < 0.6) gem.add(wrap(cy + dy + oy) * 16 + wrap(cx + dx + ox));
    }
  }
  const has = (x: number, y: number): boolean => gem.has(wrap(y) * 16 + wrap(x));
  // Dark rim below and right of each vein (the vein's own darkest shades), then the vein.
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (has(x, y)) continue;
      if (has(x - 1, y) || has(x, y - 1)) setPixel(image, x, y, pick(material, 1));
      else if (has(x + 1, y) || has(x, y + 1)) setPixel(image, x, y, pick(stone, 1));
    }
  }
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (!has(x, y)) continue;
      const lit = !has(x - 1, y) && !has(x, y - 1);
      const shadow = !has(x + 1, y) && !has(x, y + 1);
      let shade = shadow ? 2 : lit ? 4 : 3;
      if (lit && !shadow && random() < 0.4) {
        setPixel(image, x, y, shine);
        continue;
      }
      if (!lit && !shadow && has(x - 1, y) && has(x, y - 1)) shade = 4;
      setPixel(image, x, y, pick(material, shade));
    }
  }
  return image;
}

function block(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const image = blankImage(16, 16);
  const { material, shine } = materialRamps(options);
  const metal = options.finish === 'metal';
  const field = metal
    ? clusteredField(16, 16, hashSeed('block', seed), { blurX: 3, blurY: 0 })
    : clusteredField(16, 16, hashSeed('block', seed), { blurX: 1 });
  const shades = metal ? quantise(field, [0.2, 0.55, 0.25]) : quantise(field, [0.1, 0.8, 0.1]);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let shade: number;
      if (ring === 0) {
        if (x === 0 || y === 0) shade = x === 15 || y === 15 ? 3 : 5;
        else shade = 1;
      } else if (ring === 1) {
        if (x === 1 || y === 1) shade = x === 14 || y === 14 ? 3 : 4;
        else shade = 2;
      } else {
        shade = 2 + (shades[y * 16 + x] ?? 1);
        if (metal && (y === 5 || y === 10)) shade = 2;
        if (metal && (y === 6 || y === 11)) shade = 4;
      }
      setPixel(image, x, y, pick(material, shade));
    }
  }
  if (!metal) {
    // Two or three glints running from bottom left to top right.
    const random = rng(hashSeed('glint', seed, ...options.colour));
    const glints = 2 + Math.floor(random() * 2);
    for (let g = 0; g < glints; g += 1) {
      const length = 3 + Math.floor(random() * 3);
      const x0 = 3 + Math.floor(random() * 7);
      const y0 = 5 + Math.floor(random() * 8);
      for (let k = 0; k < length; k += 1) {
        const x = x0 + k;
        const y = y0 - k;
        if (x < 2 || y < 2 || x > 13 || y > 13) continue;
        setPixel(image, x, y, k === 1 ? shine : pick(material, 5));
        if (x + 1 <= 13) setPixel(image, x + 1, y, pick(material, 4));
      }
    }
  }
  return image;
}

function woodRamp(colour: Rgb, hueShift: number): Ramp {
  return generateRamp(colour, { steps: WOOD_STEPS, hueShift });
}

function barkRamp(colour: Rgb, hueShift: number): Ramp {
  const [l, c, h] = rgbToOklch(colour);
  return generateRamp(oklchToRgb([Math.max(0.2, l - 0.13), c * 0.8, h]), {
    steps: WOOD_STEPS,
    hueShift,
  });
}

function planks(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const style = options.style ?? DEFAULT_STYLE;
  const ramp = woodRamp(options.colour, style.hueShift);
  const image = blankImage(16, 16);
  const grain = quantise(
    clusteredField(16, 16, hashSeed('grain', seed), { blurX: 3, blurY: 0 }),
    [0.22, 0.5, 0.28],
  );
  const random = rng(hashSeed('planks', seed));
  const joints = [0, 1, 2, 3].map((board) => (board * 7 + 3 + Math.floor(random() * 4)) % 16);
  for (let y = 0; y < 16; y += 1) {
    const board = y >> 2;
    const row = y & 3;
    for (let x = 0; x < 16; x += 1) {
      let shade = 1 + (grain[y * 16 + x] ?? 1);
      if (row === 0) shade = Math.min(4, shade + 1);
      if (row === 3) shade = Math.min(shade, 1) - (grain[y * 16 + x] === 0 ? 1 : 0);
      const joint = joints[board] ?? 0;
      if (row !== 3 && x === joint) shade = 0;
      if (row !== 3 && x === (joint + 1) % 16) shade = Math.max(shade, 2);
      setPixel(image, x, y, pick(ramp, shade));
    }
  }
  return image;
}

function log(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const style = options.style ?? DEFAULT_STYLE;
  const ramp = barkRamp(options.colour, style.hueShift);
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('bark', seed), { blurX: 0, blurY: 3 });
  const shades = quantise(field, [0.12, 0.24, 0.32, 0.22, 0.1]);
  for (let i = 0; i < 256; i += 1) setPixel(image, i % 16, i >> 4, pick(ramp, shades[i] ?? 2));
  const random = rng(hashSeed('cracks', seed));
  for (let c = 0; c < 4; c += 1) {
    const x = Math.floor(random() * 16);
    const y0 = Math.floor(random() * 16);
    const length = 3 + Math.floor(random() * 5);
    for (let k = 0; k < length; k += 1) {
      setPixel(image, x, (y0 + k) % 16, pick(ramp, 0));
      setPixel(image, (x + 1) % 16, (y0 + k) % 16, pick(ramp, 3));
    }
  }
  return image;
}

function logTop(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const style = options.style ?? DEFAULT_STYLE;
  const wood = woodRamp(options.colour, style.hueShift);
  const bark = barkRamp(options.colour, style.hueShift);
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('end', seed), { blurX: 1 });
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const rank = field[y * 16 + x] ?? 0.5;
      if (ring === 0) {
        setPixel(image, x, y, pick(bark, rank < 0.3 ? 0 : rank < 0.75 ? 1 : 2));
        continue;
      }
      // Rings of growth: alternate light and dark, rounded at the corners.
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const d = Math.max(dx, dy) * 0.75 + Math.hypot(dx, dy) * 0.25;
      const band = Math.floor(d) % 2;
      let shade = band === 0 ? 3 : 2;
      if (ring === 1) shade = 1;
      if (d < 1.2) shade = 2;
      if (rank < 0.08) shade -= 1;
      if (rank > 0.94) shade += 1;
      setPixel(image, x, y, pick(wood, shade));
    }
  }
  return image;
}

function leaves(options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  const style = options.style ?? DEFAULT_STYLE;
  const ramp = generateRamp(options.leafColour ?? LEAF_GREEN, {
    count: 5,
    anchor: 2,
    hueShift: style.hueShift,
  });
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('leaves', seed), { blurX: style.clusterBlur });
  const shades = quantise(field, [0.1, 0.14, 0.26, 0.3, 0.14, 0.06]);
  for (let i = 0; i < 256; i += 1) {
    const s = shades[i] ?? 3;
    if (s === 0) continue; // a gap in the foliage
    setPixel(image, i % 16, i >> 4, pick(ramp, s - 1));
  }
  // Leaves facing the light: a lighter pixel above-left of each dark one, for depth.
  return image;
}

function itemRamps(options: ArtOptions): Ramps {
  const { material, shine } = materialRamps(options);
  const hueShift = (options.style ?? DEFAULT_STYLE).hueShift;
  return {
    material,
    shine,
    parts: {
      H: generateRamp(HANDLE_BROWN, { count: 4, anchor: 2, hueShift }),
      S: generateRamp(HANDLE_BROWN, { count: 4, anchor: 1, hueShift }),
      L: generateRamp(options.leafColour ?? LEAF_GREEN, { count: 4, anchor: 2, hueShift }),
      C: generateRamp(CRUST, { count: 5, anchor: 3, hueShift }),
    },
  };
}

const SILHOUETTES: Partial<Record<ArtRecipe, Silhouette>> = {
  gem: GEM,
  ingot: INGOT,
  sword: SWORD,
  pickaxe: PICKAXE,
  axe: AXE,
  shovel: SHOVEL,
  hoe: HOE,
  helmet: HELMET,
  chestplate: CHESTPLATE,
  leggings: LEGGINGS,
  boots: BOOTS,
  fruit: FRUIT,
  pie: PIE,
};

/**
 * The RGBA pixels of a recipe, 16 by 16.
 *
 * @param recipe - What to draw.
 * @param options - The colours, the seed and the style numbers.
 */
export function generateArt(recipe: ArtRecipe, options: ArtOptions): ArtImage {
  const seed = options.seed ?? 0;
  switch (recipe) {
    case 'ore':
      return ore(options, false);
    case 'deepslate_ore':
      return ore(options, true);
    case 'block':
      return block(options);
    case 'planks':
      return planks(options);
    case 'log':
      return log(options);
    case 'log_top':
      return logTop(options);
    case 'leaves':
      return leaves(options);
    default: {
      const rows = SILHOUETTES[recipe];
      if (rows === undefined) throw new Error(`Unknown art recipe ${String(recipe)}.`);
      return renderSprite(rows, itemRamps(options), hashSeed(recipe, seed, ...options.colour));
    }
  }
}

/** A byte-stable PNG of {@link generateArt}. */
export function generateArtPng(recipe: ArtRecipe, options: ArtOptions): Uint8Array {
  const image = generateArt(recipe, options);
  return encodePng(image.data, image.width, image.height);
}
