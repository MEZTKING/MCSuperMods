/**
 * Boat and villager look recipes of the vanilla-style generator (ADR 0092 D7, D8; ADR 0110,
 * ADR 0107 D5; B539): what the Wood set's "Has boats" answer and the Villager look flow draw.
 *
 * - **Boat** (an item, 16 by 16): a small wooden boat seen from the side with its two paddles,
 *   in the main colour; the `chest` finish puts a chest in it, for the chest boat's item.
 * - **Boat body** (128 by 64) and **Chest boat body** (128 by 128): the pictures the game draws a
 *   boat and a chest boat with. They are drawn as one sheet of boards edge to edge, four pixels
 *   to a board with staggered joints, so every face of the model, wherever it lies on the sheet,
 *   shows planks of the wood. No layout is needed, and none was looked up: no Minecraft
 *   texture or model was opened, traced or measured to make them.
 * - **Villager clothes** (64 by 64, the villager layout MSM's job aprons already use): a robe
 *   over the body and the long coat of a villager, each face shaded by its side, with a hem in
 *   the second colour and, with the `sash` finish, a sash across the body. Everything else stays
 *   clear, so the villager's own look shows through. The faces' places are the body box (8 by 12
 *   by 6 at 16, 20) and the coat box (8 by 20 by 6 at 0, 38), as `professionApronPng` paints.
 *
 * Every shape here is MSM's own drawing made in code.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { drawSprite, pick, type SpriteRamps, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { handleRamp, spreadShades, woodRamp } from '../materials';
import { clusteredField, hashSeed, quantise, rng } from '../noise';
import { generateRamp } from '../ramp';
import { boxFaces, faceLean, SIDE_SHADE } from '../skins';
import type { Silhouette } from '../sprites';
import { itemRamps, sharedOutline } from './items';

/** The finishes of the boat item: the boat alone, or with a chest in it. */
export const BOAT_ITEM_FINISHES = Object.freeze(['boat', 'chest'] as const);

/** The finishes of the villager clothes: a hem only, or a hem and a sash. */
export const VILLAGER_ROBE_FINISHES = Object.freeze(['hem', 'sash'] as const);

/** The second colour of the villager clothes when none is asked: an undyed cream. */
export const ROBE_TRIM_CREAM: Rgb = Object.freeze([222, 206, 160]) as Rgb;

/** The sizes of the boat bodies, as the game reads them (ADR 0110; B524). */
export const BOAT_BODY_SIZES = Object.freeze({
  boat: Object.freeze({ width: 128, height: 64 }),
  chest_boat: Object.freeze({ width: 128, height: 128 }),
});

// The boat item --------------------------------------------------------------------------------

/** A boat from the side: the hull (`M`) and its paddles (`H`). */
const BOAT: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..H.........H...',
  '...H.......H....',
  '....H.....H.....',
  '................',
  '.MM..........MM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '..MMMMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '................',
  '................',
];

/**
 * The same boat with a chest standing in it, drawn in fixed shades of the hull's colour (a lit
 * lid, a body a shade down and a dark lock), so it reads as a chest and stays lit from the top.
 */
const CHEST_BOAT: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '.....444444.....',
  '..H..333333.H...',
  '...H.331133H....',
  '....H333333.....',
  '.....333333.....',
  '.MM..333333..MM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '..MMMMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '................',
  '................',
];

/** The boat's ramps: the hull in the colour, the paddles of handle wood, one outline shade. */
function boatRamps(context: DrawContext): SpriteRamps {
  const ramps = itemRamps(context);
  return sharedOutline({ ...ramps, parts: { H: handleRamp(context.hueShift) } }, 'H');
}

/** The boat item, with a chest in it for the `chest` finish. */
function drawBoatItem(context: DrawContext): ArtImage {
  const chest = context.finish === 'chest';
  return drawSprite(chest ? CHEST_BOAT : BOAT, boatRamps(context), {
    seed: hashSeed(chest ? 'chest_boat_item' : 'boat_item', context.seed),
    noise: context.noise,
  });
}

// The boat bodies ------------------------------------------------------------------------------

/**
 * A sheet of boards `width` by `height`: four pixels to a board, grain running along it, its top
 * row lit and its bottom row a dark gap, with joints every 14 to 25 pixels, staggered from one
 * board to the next and each followed by a lit pixel. The wood ramp is the planks' one, so a
 * boat matches the planks it is crafted from.
 */
function drawBoards(id: string, width: number, height: number, context: DrawContext): ArtImage {
  const ramp = woodRamp(context.colour, context.hueShift);
  const image = blankImage(width, height);
  // Grain along the boards: a shade drawn by the proportions that keeps for a few pixels,
  // changing one time in three, so it runs in streaks (cheaper than a blurred field on a sheet
  // this big, which is drawn whenever the boat is).
  const shares = spreadShades([0.22, 0.5, 0.28], 1, context.noise);
  const grainRandom = rng(hashSeed(id, 'grain', context.seed));
  const grain = new Uint8Array(width * height);
  const draw = (): number => {
    const r = grainRandom();
    return r < (shares[0] ?? 0) ? 0 : r < (shares[0] ?? 0) + (shares[1] ?? 0) ? 1 : 2;
  };
  for (let y = 0; y < height; y += 1) {
    let current = draw();
    for (let x = 0; x < width; x += 1) {
      if (grainRandom() < 0.34) current = draw();
      grain[y * width + x] = current;
    }
  }
  const random = rng(hashSeed(id, context.seed));
  for (let board = 0; board * 4 < height; board += 1) {
    const joints = new Set<number>();
    let x = Math.floor(random() * 12);
    while (x < width) {
      joints.add(x);
      x += 14 + Math.floor(random() * 12);
    }
    for (let row = 0; row < 4 && board * 4 + row < height; row += 1) {
      const y = board * 4 + row;
      for (let px = 0; px < width; px += 1) {
        const g = grain[y * width + px] ?? 1;
        let shade = 1 + g;
        if (row === 0) shade = Math.min(4, shade + 1);
        if (row === 3) shade = Math.min(shade, 1) - (g === 0 ? 1 : 0);
        if (row !== 3 && joints.has(px)) shade = 0;
        if (row !== 3 && joints.has(px - 1)) shade = Math.max(shade, 2);
        setPixel(image, px, y, pick(ramp, shade));
      }
    }
  }
  return image;
}

// The villager clothes -------------------------------------------------------------------------

/** The villager's body box and its long coat, in the 64 by 64 villager layout. */
const VILLAGER_BODY = Object.freeze({ u: 16, v: 20, w: 8, h: 12, d: 6 });
const VILLAGER_COAT = Object.freeze({ u: 0, v: 38, w: 8, h: 20, d: 6 });

/**
 * Villager clothes: every face of the body and the coat in cloth of the colour, shaded by its
 * side and lit from its top left, with soft vertical folds; the coat's sides end in a hem of the
 * second colour, and with `sash` a sash of it crosses the body's middle and runs down the coat's
 * front.
 */
function drawRobe(context: DrawContext): ArtImage {
  const size = 64;
  const image = blankImage(size, size);
  const cloth = generateRamp(context.colour, { count: 5, anchor: 2, hueShift: context.hueShift });
  const trim = generateRamp(context.accent ?? ROBE_TRIM_CREAM, {
    count: 3,
    anchor: 1,
    hueShift: context.hueShift,
  });
  const sash = context.finish === 'sash';
  const folds = quantise(
    clusteredField(size, size, hashSeed('villager_robe', context.seed), {
      blurX: 0,
      blurY: 3,
      wrap: false,
    }),
    spreadShades([0.12, 0.76, 0.12], 1, context.noise),
  );
  for (const [box, coat] of [
    [VILLAGER_BODY, false],
    [VILLAGER_COAT, true],
  ] as const) {
    for (const face of boxFaces(box)) {
      const upright = face.side !== 'top' && face.side !== 'bottom';
      for (let fy = 0; fy < face.h; fy += 1) {
        for (let fx = 0; fx < face.w; fx += 1) {
          const x = face.x + fx;
          const y = face.y + fy;
          const lean = faceLean(fx, fy, face.w, face.h);
          const hem = coat && upright && fy >= face.h - 2;
          const band =
            sash &&
            upright &&
            ((!coat && (fy === 6 || fy === 7)) ||
              (coat && face.side === 'front' && (fx === 3 || fx === 4)));
          if (hem || band) {
            const shade = 1 + (fy === face.h - 1 || fy === 7 ? -1 : 0) + Math.round(lean * 0.6);
            setPixel(image, x, y, pick(trim, shade + (face.side === 'front' ? 1 : 0)));
            continue;
          }
          const fold = upright ? (folds[y * size + x] ?? 1) - 1 : 0;
          const shade = 2 + SIDE_SHADE[face.side] + fold + Math.round(lean * 0.7);
          setPixel(image, x, y, pick(cloth, shade));
        }
      }
    }
  }
  return image;
}

// The rows -------------------------------------------------------------------------------------

/** The boat item recipe, in table order (after the pattern items). */
export const BOAT_ITEM_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    { id: 'boat', label: 'Boat', kind: 'item', fallback: 'ingot', finishes: BOAT_ITEM_FINISHES },
    drawBoatItem,
  ),
]);

/** The boat body and villager clothes recipes, in table order (after the pattern pictures). */
export const LOOK_ENTITY_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'boat_layer',
      label: 'Boat body',
      kind: 'entity',
      fallback: 'planks',
      ...BOAT_BODY_SIZES.boat,
    },
    (context) =>
      drawBoards('boat_layer', BOAT_BODY_SIZES.boat.width, BOAT_BODY_SIZES.boat.height, context),
  ),
  recipeEntry(
    {
      id: 'chest_boat_layer',
      label: 'Chest boat body',
      kind: 'entity',
      fallback: 'planks',
      ...BOAT_BODY_SIZES.chest_boat,
    },
    (context) =>
      drawBoards(
        'chest_boat_layer',
        BOAT_BODY_SIZES.chest_boat.width,
        BOAT_BODY_SIZES.chest_boat.height,
        context,
      ),
  ),
  recipeEntry(
    {
      id: 'villager_robe',
      label: 'Villager clothes',
      kind: 'entity',
      fallback: 'horse_armor_layer',
      width: 64,
      height: 64,
      colours: 2,
      finishes: VILLAGER_ROBE_FINISHES,
    },
    drawRobe,
  ),
]);
