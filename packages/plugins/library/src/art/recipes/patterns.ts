/**
 * Pattern pictures of the vanilla-style generator (ADR 0092 D7, D8; ADR 0106 D4, B508): what the
 * data-only flows Banner pattern, Armour trim, Glider and Pot pattern draw. Three items (a banner
 * pattern sheet, a pottery sherd and a folded glider) and six entity textures: the banner and
 * shield pattern masks (64 by 64), the two armour trim layers (64 by 32), the glider wings (64 by
 * 32, the elytra layout) and a decorated pot face (16 by 16). Every shape here is an original
 * drawing made in code; no Minecraft texture was opened, traced or measured to make it. Only the
 * texture layouts follow the game's models (where a face lies on the texture), as the worn
 * layers in `worn.ts` do.
 *
 * - The banner and shield masks are drawn in the colour asked; the game multiplies a banner
 *   pattern by the dye colour, so the flows ask for a pale grey ({@link PATTERN_MASK_GREY}).
 * - A trim layer uses only the eight shades of {@link trimKeyColours} of its colour. The Armour
 *   trim flow writes those eight shades as the layer's own palette key, so the game can swap each
 *   for the trim material's shade of the same place in its palette.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { drawSprite, pick, type SpriteRamps, setPixel } from '../canvas';
import { type ArtImage, blankImage, oklchToRgb } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { ART_HUE_SHIFT, handleRamp, materialRamp, type Ramp } from '../materials';
import { hashSeed, rng } from '../noise';
import { generateRamp } from '../ramp';
import { type BoxFace, boxFaces, faceLean, SIDE_SHADE } from '../skins';
import type { Silhouette } from '../sprites';
import { itemRamps, sharedOutline, shortRamp } from './items';
import { HUMANOID_ARMOUR_BOXES, wornRegion } from './worn';

/** The pale grey the flows draw banner and shield masks in (the game dyes them). */
export const PATTERN_MASK_GREY: Rgb = Object.freeze([228, 228, 224]) as Rgb;

/** The grey the Armour trim flow draws its layers and their palette key in. */
export const TRIM_KEY_GREY: Rgb = Object.freeze([150, 150, 150]) as Rgb;

/** Sheet paper, the ground of a banner pattern sheet. */
const PAPER: Rgb = Object.freeze([224, 214, 186]) as Rgb;

/** Fired clay, the ground of a sherd and of a pot face. */
const CLAY: Rgb = Object.freeze([158, 92, 64]) as Rgb;

/**
 * The groove between a picture and its clay: dark and almost grey, so it reads as neither and the
 * clay's shades never sit beside the colour's.
 */
const GROOVE: Rgb = oklchToRgb([0.3, 0.02, 40]);

/** The banner pattern shapes (the first is the default). */
export const BANNER_SHAPES = Object.freeze(['diamond', 'ring', 'chevrons', 'star'] as const);

/** The trim styles (the first is the default). */
export const TRIM_STYLES = Object.freeze(['bands', 'edges', 'studs'] as const);

/** The pot face pictures (the first is the default). */
export const POT_PICTURES = Object.freeze(['sun', 'fish', 'leaf'] as const);

/**
 * The eight shades of a trim layer and of its palette key, lightest first: an eight-shade ramp
 * of `colour` (no two equal, so each shade names one place in a trim material's palette).
 */
export function trimKeyColours(colour: Rgb, hueShift: number = ART_HUE_SHIFT): Rgb[] {
  return generateRamp(colour, { count: 8, anchor: 4, hueShift }).reverse();
}

// Shapes ---------------------------------------------------------------------------------------

/**
 * Whether pixel (x, y) of a `w` by `h` face is inside `shape`, drawn about the face's middle,
 * as wide as the face allows and on a banner no taller than it is wide (with margins).
 */
function inShape(shape: string, x: number, y: number, w: number, h: number): boolean {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const dx = x - cx;
  const dy = y - cy;
  const r = (w - 2) / 2;
  switch (shape) {
    case 'ring': {
      const d = Math.sqrt(dx * dx + dy * dy * 0.81);
      return d <= r * 0.92 && d >= r * 0.55;
    }
    case 'chevrons': {
      // V shapes down the face: three pixels thick, five apart.
      if (Math.abs(dx) > r) return false;
      const v = (((y - Math.abs(dx) * 0.8) % 6) + 6) % 6;
      return v < 3 && y >= 1 && y <= h - 2;
    }
    case 'star': {
      // A four-pointed star: |dx|^0.6 + |dy|^0.6 below the radius's.
      const ry = Math.min(r * 1.6, (h - 2) / 2);
      const t = (Math.abs(dx) / r) ** 0.6 + (Math.abs(dy) / ry) ** 0.6;
      return t <= 1;
    }
    default: {
      // diamond
      const ry = Math.min(r * 1.5, (h - 2) / 2);
      return Math.abs(dx) / r + Math.abs(dy) / ry <= 1;
    }
  }
}

/** Seeded one-shade grain: -1, 0 or 1 per pixel, more of it with more detail. */
function grain(width: number, height: number, seed: number, noise: number): Int8Array {
  const out = new Int8Array(width * height);
  const random = rng(seed);
  const dark = 0.07 * noise;
  const light = 1 - 0.06 * noise;
  for (let i = 0; i < out.length; i += 1) {
    const r = random();
    out[i] = r < dark ? -1 : r > light ? 1 : 0;
  }
  return out;
}

/**
 * Draws `shape` on the face at (`fx0`, `fy0`) of `w` by `h` of `image`, mirrored when `mirror`
 * (the back of a banner): a raised shape lit from the top left, a shade lighter along its top and
 * left edges and darker along its bottom and right ones, with seeded grain.
 */
function drawMask(
  image: ArtImage,
  ramp: Ramp,
  shape: string,
  fx0: number,
  fy0: number,
  w: number,
  h: number,
  mirror: boolean,
  texture: Int8Array,
): void {
  const top = ramp.length - 1;
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && inShape(shape, mirror ? w - 1 - x : x, y, w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!inside(x, y)) continue;
      const lit = !inside(x - 1, y) || !inside(x, y - 1);
      const shadow = !inside(x + 1, y) || !inside(x, y + 1);
      const shade =
        3 +
        faceLean(x, y, w, h) * 0.8 +
        (lit ? 1 : 0) -
        (shadow ? 1 : 0) +
        (texture[(fy0 + y) * image.width + fx0 + x] ?? 0);
      setPixel(image, fx0 + x, fy0 + y, pick(ramp, Math.max(1, Math.min(top, shade))));
    }
  }
}

/** The banner mask: the shape on the flag's front (1, 1) and, mirrored, its back (22, 1). */
function drawBanner(context: DrawContext): ArtImage {
  const image = blankImage(64, 64);
  const { material } = materialRamp(context.colour, context.hueShift);
  const shape = context.finish ?? 'diamond';
  const texture = grain(64, 64, hashSeed('banner_pattern', shape, context.seed), context.noise);
  drawMask(image, material, shape, 1, 1, 20, 40, false, texture);
  drawMask(image, material, shape, 22, 1, 20, 40, true, texture);
  return image;
}

/** The shield mask: the shape on the shield plate's front (1, 1), 12 by 22. */
function drawShield(context: DrawContext): ArtImage {
  const image = blankImage(64, 64);
  const { material } = materialRamp(context.colour, context.hueShift);
  const shape = context.finish ?? 'diamond';
  const texture = grain(64, 64, hashSeed('shield_pattern', shape, context.seed), context.noise);
  drawMask(image, material, shape, 1, 1, 12, 22, false, texture);
  return image;
}

// Trims ----------------------------------------------------------------------------------------

/** Whether a face pixel carries the trim of `style`. */
function onTrim(style: string, face: BoxFace, fx: number, fy: number): boolean {
  if (face.side === 'top' || face.side === 'bottom') {
    return style === 'edges' && (fx === 0 || fx === face.w - 1);
  }
  switch (style) {
    case 'edges':
      return fx === 0 || fy === 0 || fx === face.w - 1 || fy === face.h - 1;
    case 'studs':
      return fy % 3 === 1 && fx % 3 === 1;
    default:
      // bands: two-pixel bands every five rows, and the bottom edge.
      return fy % 5 === 1 || fy % 5 === 2 || fy === face.h - 1;
  }
}

/** A trim layer: the style on every face of the humanoid boxes, inside the armour's region. */
function drawTrim(id: string, region: Uint8Array, context: DrawContext): ArtImage {
  const width = 64;
  const height = 32;
  const image = blankImage(width, height);
  // Lightest first in the key; shaded here darkest first.
  const shades = trimKeyColours(context.colour, context.hueShift).reverse();
  const top = shades.length - 1;
  const style = context.finish ?? 'bands';
  const texture = grain(width, height, hashSeed(id, style, context.seed), context.noise);
  for (const box of HUMANOID_ARMOUR_BOXES) {
    for (const face of boxFaces(box)) {
      for (let fy = 0; fy < face.h; fy += 1) {
        for (let fx = 0; fx < face.w; fx += 1) {
          const x = face.x + fx;
          const y = face.y + fy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if ((region[y * width + x] ?? 0) === 0 || !onTrim(style, face, fx, fy)) continue;
          const shade = 4.5 + SIDE_SHADE[face.side] * 1.5 + faceLean(fx, fy, face.w, face.h) * 1.5;
          const value = shade + (texture[y * width + x] ?? 0);
          setPixel(image, x, y, pick(shades, Math.max(0, Math.min(top, Math.round(value)))));
        }
      }
    }
  }
  return image;
}

// Glider wings ---------------------------------------------------------------------------------

/** The wing box of the elytra layout: 10 wide, 20 tall, 2 deep at (22, 0). */
const WING_BOX = { u: 22, v: 0, w: 10, h: 20, d: 2 } as const;

/**
 * The glider wings (64 by 32, the elytra layout; the game mirrors the other wing): a membrane in
 * the colour on every face of the wing box, lit from the top left, a light leading edge along
 * the top, ribs a shade darker fanning out from the shoulder, and seeded grain.
 */
function drawWings(context: DrawContext): ArtImage {
  const width = 64;
  const height = 32;
  const image = blankImage(width, height);
  const { material } = materialRamp(context.colour, context.hueShift);
  const top = material.length - 1;
  const texture = grain(width, height, hashSeed('glider_wings', context.seed), context.noise);
  for (const face of boxFaces(WING_BOX)) {
    const broad = face.side === 'front' || face.side === 'back';
    for (let fy = 0; fy < face.h; fy += 1) {
      for (let fx = 0; fx < face.w; fx += 1) {
        const x = face.x + fx;
        const y = face.y + fy;
        let shade = 3 + SIDE_SHADE[face.side] + faceLean(fx, fy, face.w, face.h) * 1.2;
        if (broad) {
          // The rib: from the shoulder (the face's top left) out to the wing's tip.
          const rib = Math.abs(fx - Math.round(fy * 0.45)) === 0 && fy > 1;
          const rib2 = Math.abs(fx - Math.round(fy * 0.25)) === 0 && fy > 5;
          if (fy === 0) shade += 1;
          else if (rib || rib2) shade -= 1;
          else shade += texture[y * width + x] ?? 0;
        }
        setPixel(image, x, y, pick(material, Math.max(1, Math.min(top, Math.round(shade)))));
      }
    }
  }
  return image;
}

// Pot faces ------------------------------------------------------------------------------------

/** The pictures of a pot face, 12 by 12, `#` the figure. */
const POT_GLYPHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  sun: [
    '.....##.....',
    '.#...##...#.',
    '..#......#..',
    '....####....',
    '...######...',
    '##.######.##',
    '##.######.##',
    '...######...',
    '....####....',
    '..#......#..',
    '.#...##...#.',
    '.....##.....',
  ],
  fish: [
    '............',
    '............',
    '.....####...',
    '...#######..',
    '#.####.####.',
    '###########.',
    '###########.',
    '#.#########.',
    '...#######..',
    '.....####...',
    '............',
    '............',
  ],
  leaf: [
    '.........##.',
    '.......####.',
    '.....######.',
    '....#######.',
    '...###.####.',
    '...##.#####.',
    '..##.######.',
    '..#.######..',
    '..#.#####...',
    '.#..###.....',
    '.#..........',
    '#...........',
  ],
});

/**
 * A decorated pot face (16 by 16, opaque): fired clay lit from the top left with seeded grain and
 * a raised picture in the colour, a shade lighter along its top and left edges.
 */
function drawPot(context: DrawContext): ArtImage {
  const size = 16;
  const image = blankImage(size, size);
  const clay = generateRamp(CLAY, { count: 5, anchor: 2, hueShift: context.hueShift });
  const { material } = materialRamp(context.colour, context.hueShift);
  const glyph = POT_GLYPHS[context.finish ?? 'sun'] ?? (POT_GLYPHS.sun as readonly string[]);
  const texture = grain(
    size,
    size,
    hashSeed('pot_pattern', context.finish ?? '', context.seed),
    context.noise,
  );
  const figure = (x: number, y: number): boolean => glyph[y - 2]?.[x - 2] === '#';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const lean = faceLean(x, y, size, size);
      const near = figure(x - 1, y) || figure(x + 1, y) || figure(x, y - 1) || figure(x, y + 1);
      if (!figure(x, y) && near) {
        // The groove round the picture, a dull dark that is neither clay nor the colour.
        setPixel(image, x, y, GROOVE);
      } else if (figure(x, y)) {
        const lit = !figure(x - 1, y) || !figure(x, y - 1);
        const shadow = !figure(x + 1, y) || !figure(x, y + 1);
        const shade = 2.5 + lean * 0.8 + (lit ? 1 : 0) - (shadow ? 1 : 0);
        setPixel(image, x, y, pick(material, Math.max(1, Math.min(5, Math.round(shade)))));
      } else {
        const shade = 2 + lean * 1.2 + (texture[y * size + x] ?? 0);
        setPixel(image, x, y, pick(clay, Math.max(0, Math.min(4, Math.round(shade)))));
      }
    }
  }
  return image;
}

// Items ----------------------------------------------------------------------------------------

/** A banner pattern sheet: paper with a dog-eared corner and a mark in the colour. */
const PATTERN_SHEET: Silhouette = [
  '................',
  '..PPPPPPPPPP....',
  '..PPPPPPPPPPP...',
  '..PPPPPPPPPPPP..',
  '..PPPPPMMPPPPP..',
  '..PPPPMMMMPPPP..',
  '..PPPMMPPMMPPP..',
  '..PPMMPPPPMMPP..',
  '..PPMMPPPPMMPP..',
  '..PPPMMPPMMPPP..',
  '..PPPPMMMMPPPP..',
  '..PPPPPMMPPPPP..',
  '..PPPPPPPPPPPP..',
  '..PPPPPPPPPPPP..',
  '...PPPPPPPPPPP..',
  '................',
];

/** A pottery sherd: a broken piece of fired clay with a mark in the colour. */
const POTTERY_SHERD: Silhouette = [
  '................',
  '...PP...........',
  '...PPPP.........',
  '..PPPPPPP.......',
  '..PPPPGGPPP.....',
  '..PPPGMMGPPPP...',
  '.PPPGMMMMGPPPP..',
  '.PPGMMGGMMGPPP..',
  '.PPGMMGGMMGPPPP.',
  '..PPGMMMMGPPPPP.',
  '..PPPGMMGPPPPP..',
  '...PPPGGPPPPP...',
  '....PPPPPPPP....',
  '.....PPPPPP.....',
  '.......PP.......',
  '................',
];

/** A glider: a cloth wing in the colour on a wooden frame, with a bar to hold. */
const GLIDER: Silhouette = [
  '................',
  '................',
  '.......HH.......',
  '......HMMH......',
  '.....HMMMMH.....',
  '....HMMMMMMH....',
  '...HMMMMMMMMH...',
  '..HMMMMMMMMMMH..',
  '.HMMMMMMMMMMMMH.',
  '.HMMMMMMMMMMMMH.',
  '..MMMMMHHMMMMM..',
  '...MMM.HH.MMM...',
  '.......HH.......',
  '.....HHHHHH.....',
  '................',
  '................',
];

/**
 * A mark in the colour on a ground of `ground` (paper or clay), with one outline shade; `G` is
 * the groove a sherd's mark is cut into, in {@link GROOVE}.
 */
const markOn =
  (ground: Rgb) =>
  (context: DrawContext): SpriteRamps => {
    const ramps = sharedOutline(
      {
        material: shortRamp(context.colour, 5, context.hueShift),
        shine: materialRamp(context.colour, context.hueShift).shine,
        parts: { P: shortRamp(ground, 5, context.hueShift) },
      },
      'P',
    );
    return { ...ramps, parts: { ...ramps.parts, G: [GROOVE] } };
  };

/** A drawing function for a silhouette with its own ramps. */
const spriteWith =
  (id: string, rows: Silhouette, ramps: (context: DrawContext) => SpriteRamps) =>
  (context: DrawContext): ArtImage =>
    drawSprite(rows, ramps(context), { seed: hashSeed(id, context.seed), noise: context.noise });

/** The glider: the item ramps with the handle wood as its frame, one outline shade. */
const gliderRamps = (context: DrawContext): SpriteRamps => {
  const ramps = itemRamps(context);
  return sharedOutline({ ...ramps, parts: { H: handleRamp(context.hueShift) } }, 'H');
};

/** The pattern item recipes, in table order (after the other items). */
export const PATTERN_ITEM_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'pattern_sheet',
      label: 'Banner pattern sheet',
      kind: 'item',
      fallback: 'smithing_template',
    },
    spriteWith('pattern_sheet', PATTERN_SHEET, markOn(PAPER)),
  ),
  recipeEntry(
    { id: 'pottery_sherd', label: 'Pottery sherd', kind: 'item', fallback: 'gem' },
    spriteWith('pottery_sherd', POTTERY_SHERD, markOn(CLAY)),
  ),
  recipeEntry(
    { id: 'glider', label: 'Glider', kind: 'item', fallback: 'chestplate' },
    spriteWith('glider', GLIDER, gliderRamps),
  ),
]);

/** The pattern entity recipes, in table order (after the worn pictures). */
export const PATTERN_ENTITY_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'banner_pattern',
      label: 'Banner pattern',
      kind: 'entity',
      fallback: 'horse_armor_layer',
      width: 64,
      height: 64,
      finishes: BANNER_SHAPES,
    },
    drawBanner,
  ),
  recipeEntry(
    {
      id: 'shield_pattern',
      label: 'Shield pattern',
      kind: 'entity',
      fallback: 'horse_armor_layer',
      width: 64,
      height: 64,
      finishes: BANNER_SHAPES,
    },
    drawShield,
  ),
  recipeEntry(
    {
      id: 'trim_layer_1',
      label: 'Armour trim: helmet, chestplate and boots',
      kind: 'entity',
      fallback: 'armor_layer_1',
      width: 64,
      height: 32,
      finishes: TRIM_STYLES,
    },
    (context) => drawTrim('trim_layer_1', wornRegion('armor_layer_1'), context),
  ),
  recipeEntry(
    {
      id: 'trim_layer_2',
      label: 'Armour trim: leggings',
      kind: 'entity',
      fallback: 'armor_layer_2',
      width: 64,
      height: 32,
      finishes: TRIM_STYLES,
    },
    (context) => drawTrim('trim_layer_2', wornRegion('armor_layer_2'), context),
  ),
  recipeEntry(
    {
      id: 'glider_wings',
      label: 'Glider wings',
      kind: 'entity',
      fallback: 'wolf_armor_layer',
      width: 64,
      height: 32,
    },
    drawWings,
  ),
  recipeEntry(
    {
      id: 'pot_pattern',
      label: 'Pot pattern',
      kind: 'entity',
      fallback: 'plain',
      finishes: POT_PICTURES,
    },
    drawPot,
  ),
]);
