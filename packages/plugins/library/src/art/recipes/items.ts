/**
 * Item recipes of the vanilla-style generator (ADR 0092 D7, D8): 16 by 16 silhouettes
 * (`sprites.ts`) on a transparent background with a dark one-pixel outline, drawn by
 * {@link drawSprite}. Every item row is drawn (B491 the prototype's twenty, B493 the rest); bows
 * and crossbows add a one-pixel string (and an arrow shaft) without an outline on top, and keep
 * the grip or stock of their first frame in every frame.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { drawSprite, type SpriteRamps, setPixel } from '../canvas';
import { type ArtImage, oklchToRgb, rgbToOklab, rgbToOklch } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import {
  CRUST,
  DEEPSLATE_GREY,
  handleRamp,
  LEAF_GREEN,
  materialRamp,
  type Ramp,
} from '../materials';
import { hashSeed } from '../noise';
import { generateRamp } from '../ramp';
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
} from '../sprites';
import {
  BALL,
  BOOMERANG,
  BOTTLE,
  BOW,
  BOW_ARROWHEAD,
  BOW_STRING_ENDS,
  CROSSBOW,
  CROSSBOW_BOLT,
  CROSSBOW_ROCKET,
  CROSSBOW_STRING_ENDS,
  DISC,
  FLASK,
  HORSE_ARMOR,
  KNIFE,
  MACE,
  type Point,
  PRODUCE,
  SEEDS,
  SHIELD,
  SMITHING_TEMPLATE,
  SPAWN_EGG,
  SPEAR,
  TOTEM,
  WOLF_ARMOR,
} from '../sprites-items';

/**
 * The ramps of an item: the material and its shine from the main colour, `H` the shared handle
 * wood, `L` a leaf in the second colour ({@link LEAF_GREEN} by default) and a fruit's stem
 * `S` in the same green (a brown stem would take the fruit past ten colours), `C` pastry crust.
 */
function itemRamps(context: DrawContext): SpriteRamps {
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  // A leaf takes three shades of a six-shade ramp, so a leaf and a fruit of one green lean
  // the same way.
  const leafRamp = generateRamp(context.accent ?? LEAF_GREEN, {
    count: 6,
    anchor: 3,
    hueShift: context.hueShift,
  });
  const leaf = [0, 2, 4].map((i) => leafRamp[i] as Rgb);
  return {
    material,
    shine,
    parts: {
      H: handleRamp(context.hueShift),
      S: leaf,
      L: leaf,
      C: generateRamp(CRUST, { count: 4, anchor: 2, hueShift: context.hueShift }),
    },
  };
}

/** A drawing function for a silhouette. */
const sprite =
  (id: string, rows: Silhouette) =>
  (context: DrawContext): ArtImage =>
    drawSprite(rows, itemRamps(context), {
      seed: hashSeed(id, context.seed),
      noise: context.noise,
    });

/**
 * A drawing function for a silhouette whose parts share one outline shade (a weapon with a long
 * handle, which would otherwise spend an eleventh colour on the handle's own outline).
 */
const oneOutline =
  (id: string, rows: Silhouette) =>
  (context: DrawContext): ArtImage =>
    drawSprite(rows, sharedOutline(itemRamps(context), 'H'), {
      seed: hashSeed(id, context.seed),
      noise: context.noise,
    });

type ItemRow = Parameters<typeof recipeEntry>[0];

const item = (
  id: ItemRow['id'],
  label: string,
  fallback: ItemRow['fallback'],
  more: Partial<ItemRow> = {},
): ItemRow => ({ id, label, kind: 'item', fallback, ...more });

/** The pale string of bows and crossbows, and the feathers of an arrow. */
const STRING: Rgb = Object.freeze([226, 222, 210]) as Rgb;

/** Neutral glass: a pale grey with a breath of blue, below the ramp rule's chroma. */
const GLASS: Rgb = Object.freeze([210, 216, 222]) as Rgb;

/** Lightness of a ramp's shade. */
const lightness = (rgb: Rgb): number => rgbToOklab(rgb)[0];

/** The lightness of a shared outline, unless a ramp has a darker shade. */
const OUTLINE_LIGHTNESS = 0.22;

/**
 * The same ramps with one outline shade, so a picture of several parts spends one colour on its
 * outline: a dark shade of `ramps.parts[from]` (the handle wood, a slab) at
 * {@link OUTLINE_LIGHTNESS}, or darker when a ramp has a darker shade. It does not follow the
 * main colour (for the colours of the property tests), so a picture's painted pixels are its own.
 */
function sharedOutline(ramps: SpriteRamps, from: string): SpriteRamps {
  const all = [ramps.material, ...Object.values(ramps.parts)];
  let darkest = OUTLINE_LIGHTNESS;
  for (const ramp of all) darkest = Math.min(darkest, lightness(ramp[0] as Rgb));
  const [, c, h] = rgbToOklch((ramps.parts[from] ?? ramps.material)[0] as Rgb);
  const target = Math.max(0.125, darkest);
  let dark = oklchToRgb([target, c, h]);
  // Rounding to bytes may land a shade lighter; step down until it is the darkest.
  for (let l = target; lightness(dark) > darkest + 0.002 && l > 0.125; l -= 0.002) {
    dark = oklchToRgb([l, c, h]);
  }
  const withDark = (ramp: Ramp): Ramp => [dark, ...ramp.slice(1)];
  return {
    material: withDark(ramps.material),
    shine: ramps.shine,
    parts: Object.fromEntries(
      Object.entries(ramps.parts).map(([key, ramp]) => [key, withDark(ramp)]),
    ),
  };
}

/** A ramp of `count` shades of `colour`, the colour itself the second lightest. */
const shortRamp = (colour: Rgb, count: number, hueShift: number): Ramp =>
  generateRamp(colour, { count, anchor: count - 2, hueShift });

/** A silhouette with some cells replaced. */
function withCells(
  rows: Silhouette,
  cells: readonly (readonly [number, number, string])[],
): Silhouette {
  const grid = rows.map((row) => row.split(''));
  for (const [x, y, ch] of cells) {
    const row = grid[y];
    if (row !== undefined && x >= 0 && x < row.length) row[x] = ch;
  }
  return grid.map((row) => row.join(''));
}

/** The points of a straight line from `a` to `b`, both ends included. */
function line(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let [x, y] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) return points;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Paints `rgb` on the transparent pixels among `points` (a layer without an outline). */
function overlay(image: ArtImage, points: readonly Point[], rgb: Rgb): void {
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    if (image.data[(y * image.width + x) * 4 + 3] === 0) setPixel(image, x, y, rgb);
  }
}

/** Copies the pixels of `part` cells of `rows` from `from` into `to`. */
function copyPart(rows: Silhouette, part: string, from: ArtImage, to: ArtImage): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== part) continue;
      const i = (y * to.width + x) * 4;
      to.data.set(from.data.subarray(i, i + 4), i);
    }
  });
}

/** The ramps of a bow or crossbow: the limbs in a short ramp of the colour, one outline. */
function bowRamps(context: DrawContext, limbShades: number): SpriteRamps {
  const handle = handleRamp(context.hueShift);
  const accent = shortRamp(context.accent ?? FIREWORK_PAPER, 3, context.hueShift);
  return sharedOutline(
    {
      material: shortRamp(context.colour, limbShades, context.hueShift),
      shine: STRING,
      parts: { H: handle, B: handle, A: accent },
    },
    'H',
  );
}

/** The default rocket of a crossbow loaded with a firework: pale paper. */
const FIREWORK_PAPER: Rgb = Object.freeze([222, 208, 186]) as Rgb;

/** Where a bow's string is pulled to in each frame, and whether an arrow is nocked. */
const BOW_NOCKS: Readonly<Record<string, { nock: Point | undefined; arrow: boolean }>> = {
  bow: { nock: undefined, arrow: false },
  bow_pulling_0: { nock: [9, 9], arrow: false },
  bow_pulling_1: { nock: [10, 10], arrow: true },
  bow_pulling_2: { nock: [11, 11], arrow: true },
};

/**
 * A bow frame: the limbs and grip (`BOW`) drawn with the seed of `bow` for every frame, the
 * string pulled to the frame's nock, and in the later frames an arrow with its head beyond the
 * grip. The grip's pixels are those of the unpulled bow in every frame.
 */
const bowFrame =
  (id: keyof typeof BOW_NOCKS) =>
  (context: DrawContext): ArtImage => {
    const ramps = bowRamps(context, 5);
    const options = { seed: hashSeed('bow', context.seed), noise: context.noise };
    const frame = BOW_NOCKS[id] ?? { nock: undefined, arrow: false };
    const rows = frame.arrow ? withCells(BOW, BOW_ARROWHEAD) : BOW;
    const image = drawSprite(rows, ramps, options);
    if (rows !== BOW) copyPart(BOW, 'H', drawSprite(BOW, ramps, options), image);
    const [top, bottom] = BOW_STRING_ENDS;
    const nock = frame.nock;
    if (frame.arrow && nock !== undefined) {
      const shaft = line([6, 6], [nock[0] - 1, nock[1] - 1]);
      overlay(image, shaft, ramps.parts.H?.[1] as Rgb);
    }
    const string =
      nock === undefined ? line(top, bottom) : [...line(top, nock), ...line(nock, bottom)];
    overlay(image, string, STRING);
    return image;
  };

/** Where a crossbow's string is pulled to, and what it is loaded with. */
const CROSSBOW_STATES: Readonly<
  Record<string, { nock: Point | undefined; load: 'bolt' | 'rocket' | undefined }>
> = {
  crossbow: { nock: undefined, load: undefined },
  crossbow_pulling_0: { nock: [10, 8], load: undefined },
  crossbow_pulling_1: { nock: [9, 9], load: undefined },
  crossbow_pulling_2: { nock: [8, 10], load: undefined },
  crossbow_arrow: { nock: [8, 10], load: 'bolt' },
  crossbow_firework: { nock: [8, 10], load: 'rocket' },
};

/**
 * A crossbow state: the stock and prod (`CROSSBOW`) drawn with the seed of `crossbow` for every
 * state, the string pulled back along the stock, and a bolt or a rocket on the stock when it is
 * loaded. The stock's pixels are those of the unloaded crossbow in every state.
 */
const crossbowFrame =
  (id: keyof typeof CROSSBOW_STATES) =>
  (context: DrawContext): ArtImage => {
    const ramps = bowRamps(context, 4);
    const options = { seed: hashSeed('crossbow', context.seed), noise: context.noise };
    const state = CROSSBOW_STATES[id] ?? { nock: undefined, load: undefined };
    const rows =
      state.load === 'bolt'
        ? withCells(CROSSBOW, CROSSBOW_BOLT)
        : state.load === 'rocket'
          ? withCells(CROSSBOW, CROSSBOW_ROCKET)
          : CROSSBOW;
    const image = drawSprite(rows, ramps, options);
    if (rows !== CROSSBOW) {
      copyPart(CROSSBOW, 'H', drawSprite(CROSSBOW, ramps, options), image);
    }
    const [top, bottom] = CROSSBOW_STRING_ENDS;
    const nock = state.nock;
    const string =
      nock === undefined ? line(top, bottom) : [...line(top, nock), ...line(nock, bottom)];
    overlay(image, string, STRING);
    return image;
  };

/** A drawing function for a silhouette with its own ramps. */
const spriteWith =
  (id: string, rows: Silhouette, ramps: (context: DrawContext) => SpriteRamps) =>
  (context: DrawContext): ArtImage =>
    drawSprite(rows, ramps(context), { seed: hashSeed(id, context.seed), noise: context.noise });

/**
 * A record: a dark body of the colour and a label in the second colour. Without one the label
 * is the light end of the body's own ramp, so the two never disagree on which shade is warmer.
 */
function discRamps(context: DrawContext): SpriteRamps {
  const ramp = generateRamp(context.colour, { count: 8, anchor: 6, hueShift: context.hueShift });
  const body = ramp.slice(0, 5);
  const label =
    context.accent === undefined
      ? [ramp[3] as Rgb, ramp[5] as Rgb, ramp[6] as Rgb, ramp[7] as Rgb]
      : shortRamp(context.accent, 4, context.hueShift);
  return {
    material: body,
    shine: materialRamp(context.colour, context.hueShift).shine,
    parts: { A: label },
  };
}

/** An egg: the colour with spots of the second colour (by default darker shades of the colour). */
function eggRamps(context: DrawContext): SpriteRamps {
  const base = itemRamps(context);
  const spots =
    context.accent === undefined
      ? [base.material[0] as Rgb, base.material[0] as Rgb, base.material[1] as Rgb]
      : shortRamp(context.accent, 4, context.hueShift);
  return { ...base, parts: { ...base.parts, A: spots } };
}

/** A bottle or flask: liquid in the colour, neutral glass and a cork, one outline. */
const glassRamps = (context: DrawContext): SpriteRamps => {
  const [, c, h] = rgbToOklch(GLASS);
  const pale = generateRamp(GLASS, { count: 3, anchor: 2, hueShift: 0 });
  const glass = [oklchToRgb([0.3, c, h]), pale[1] as Rgb, pale[2] as Rgb];
  const cork = handleRamp(context.hueShift);
  return {
    material: shortRamp(context.colour, 4, context.hueShift),
    shine: materialRamp(context.colour, context.hueShift).shine,
    parts: { G: glass, H: [glass[0] as Rgb, cork[1] as Rgb, cork[2] as Rgb] },
  };
};

/** A smithing template: a slab of deepslate with a mark engraved in the colour. */
const templateRamps = (context: DrawContext): SpriteRamps =>
  sharedOutline(
    {
      material: shortRamp(context.colour, 5, context.hueShift),
      shine: materialRamp(context.colour, context.hueShift).shine,
      parts: { P: shortRamp(DEEPSLATE_GREY, 5, context.hueShift) },
    },
    'P',
  );

/** The item recipes, in table order. */
export const ITEM_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(item('gem', 'Gem', 'gem'), sprite('gem', GEM)),
  recipeEntry(item('ingot', 'Ingot', 'ingot'), sprite('ingot', INGOT)),
  recipeEntry(
    item('disc', 'Music disc', 'disc', { colours: 2 }),
    spriteWith('disc', DISC, discRamps),
  ),
  recipeEntry(
    item('spawn_egg', 'Spawn egg', 'egg', { colours: 2 }),
    spriteWith('spawn_egg', SPAWN_EGG, eggRamps),
  ),
  recipeEntry(item('sword', 'Sword', 'sword'), sprite('sword', SWORD)),
  recipeEntry(item('pickaxe', 'Pickaxe', 'pickaxe'), sprite('pickaxe', PICKAXE)),
  recipeEntry(item('axe', 'Axe', 'axe'), sprite('axe', AXE)),
  recipeEntry(item('shovel', 'Shovel', 'shovel'), sprite('shovel', SHOVEL)),
  recipeEntry(item('hoe', 'Hoe', 'hoe'), sprite('hoe', HOE)),
  recipeEntry(item('spear', 'Spear', 'spear'), oneOutline('spear', SPEAR)),
  recipeEntry(item('mace', 'Mace', 'mace'), oneOutline('mace', MACE)),
  recipeEntry(item('knife', 'Throwing knife', 'knife'), oneOutline('knife', KNIFE)),
  recipeEntry(item('boomerang', 'Boomerang', 'boomerang'), sprite('boomerang', BOOMERANG)),
  recipeEntry(item('ball', 'Ball', 'ball'), sprite('ball', BALL)),
  recipeEntry(item('bow', 'Bow', 'bow'), bowFrame('bow')),
  recipeEntry(
    item('bow_pulling_0', 'Bow, pulled a little', 'bow_pulling_0'),
    bowFrame('bow_pulling_0'),
  ),
  recipeEntry(
    item('bow_pulling_1', 'Bow, pulled further', 'bow_pulling_1'),
    bowFrame('bow_pulling_1'),
  ),
  recipeEntry(
    item('bow_pulling_2', 'Bow, pulled all the way', 'bow_pulling_2'),
    bowFrame('bow_pulling_2'),
  ),
  recipeEntry(item('crossbow', 'Crossbow', 'crossbow'), crossbowFrame('crossbow')),
  recipeEntry(
    item('crossbow_pulling_0', 'Crossbow, pulled a little', 'crossbow_pulling_0'),
    crossbowFrame('crossbow_pulling_0'),
  ),
  recipeEntry(
    item('crossbow_pulling_1', 'Crossbow, pulled further', 'crossbow_pulling_1'),
    crossbowFrame('crossbow_pulling_1'),
  ),
  recipeEntry(
    item('crossbow_pulling_2', 'Crossbow, pulled all the way', 'crossbow_pulling_2'),
    crossbowFrame('crossbow_pulling_2'),
  ),
  recipeEntry(
    item('crossbow_arrow', 'Crossbow with a bolt', 'crossbow_arrow'),
    crossbowFrame('crossbow_arrow'),
  ),
  recipeEntry(
    item('crossbow_firework', 'Crossbow with a rocket', 'crossbow_firework', { colours: 2 }),
    crossbowFrame('crossbow_firework'),
  ),
  recipeEntry(item('shield', 'Shield', 'shield'), sprite('shield', SHIELD)),
  recipeEntry(item('bottle', 'Bottle', 'bottle'), spriteWith('bottle', BOTTLE, glassRamps)),
  recipeEntry(item('flask', 'Flask', 'flask'), spriteWith('flask', FLASK, glassRamps)),
  recipeEntry(item('totem', 'Totem', 'totem'), sprite('totem', TOTEM)),
  recipeEntry(
    item('smithing_template', 'Smithing template', 'smithing_template'),
    spriteWith('smithing_template', SMITHING_TEMPLATE, templateRamps),
  ),
  recipeEntry(
    item('horse_armor', 'Horse armour', 'horse_armor'),
    sprite('horse_armor', HORSE_ARMOR),
  ),
  recipeEntry(item('wolf_armor', 'Wolf armour', 'wolf_armor'), sprite('wolf_armor', WOLF_ARMOR)),
  recipeEntry(item('helmet', 'Helmet', 'helmet'), sprite('helmet', HELMET)),
  recipeEntry(item('chestplate', 'Chestplate', 'chestplate'), sprite('chestplate', CHESTPLATE)),
  recipeEntry(item('leggings', 'Leggings', 'leggings'), sprite('leggings', LEGGINGS)),
  recipeEntry(item('boots', 'Boots', 'boots'), sprite('boots', BOOTS)),
  recipeEntry(item('fruit', 'Fruit', 'produce', { colours: 2 }), sprite('fruit', FRUIT)),
  recipeEntry(item('pie', 'Pie', 'produce'), sprite('pie', PIE)),
  recipeEntry(item('seeds', 'Seeds', 'seeds'), sprite('seeds', SEEDS)),
  recipeEntry(item('produce', 'Vegetable', 'produce', { colours: 2 }), sprite('produce', PRODUCE)),
]);
