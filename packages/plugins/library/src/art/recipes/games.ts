/**
 * Game recipes of the vanilla-style generator (ADR 0092 D7, D8; ADR 0117 D2; B557): what the
 * game flows draw. The islands, arenas and buildings are vanilla blocks named by id, so these are
 * the only new pictures.
 *
 * - **Lucky block** (a block face, 16 by 16, two colours): a storage block's two-ring bevel round a
 *   clustered centre in the main colour, with a mark in the second colour (a pale cream unless
 *   asked) drawn over it and lit from the top left with a one-pixel shadow down and to the right:
 *   a question mark (`question`) or a four-pointed star (`star`).
 * - **Flag** (an item, 16 by 16): a pennant on a wooden pole with a knob on top, in the main
 *   colour; the Goals flow shows it on its tab through an item model of its own.
 * - **Timer** (an item, 16 by 16): a stopwatch with a pale face, two dark hands and a button on
 *   top, its case in the main colour.
 *
 * Every shape here is MSM's own drawing made in code; no Minecraft texture was opened, traced or
 * measured to make them.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { drawSprite, pick, type SpriteRamps, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { handleRamp, materialRamp, spreadShades } from '../materials';
import { clusteredField, hashSeed, quantise } from '../noise';
import { generateRamp } from '../ramp';
import type { Silhouette } from '../sprites';
import { itemRamps, sharedOutline } from './items';

/** The finishes of the lucky block: the mark drawn on its face. */
export const LUCKY_BLOCK_FINISHES = Object.freeze(['question', 'star'] as const);

/** The second colour of the lucky block when none is asked: a pale cream mark. */
export const LUCKY_MARK_CREAM: Rgb = Object.freeze([246, 236, 196]) as Rgb;

// The lucky block -----------------------------------------------------------------------------

/** A question mark, 6 wide and 9 tall (`#` drawn). */
const QUESTION: readonly string[] = [
  '.####.',
  '##..##',
  '....##',
  '...##.',
  '..##..',
  '..##..',
  '......',
  '..##..',
  '..##..',
];

/** A four-pointed star, 7 wide and 9 tall (`#` drawn). */
const STAR: readonly string[] = [
  '...#...',
  '...#...',
  '..###..',
  '.#####.',
  '#######',
  '.#####.',
  '..###..',
  '...#...',
  '...#...',
];

/**
 * The lucky block: the storage block's bevel (light top and left rings, dark bottom and right)
 * round a softly clustered centre, and the mark in the middle in three shades of the second
 * colour (lit on its top and left, a shade down inside, darker at its foot), with a shadow of the
 * main colour's darkest inside shade one pixel down and right where it falls on the face.
 */
function drawLuckyBlock(context: DrawContext): ArtImage {
  const image = blankImage(16, 16);
  const { material } = materialRamp(context.colour, context.hueShift);
  const mark = generateRamp(context.accent ?? LUCKY_MARK_CREAM, {
    count: 4,
    anchor: 2,
    hueShift: context.hueShift,
  });
  const field = clusteredField(16, 16, hashSeed('lucky_block', context.seed), { blurX: 1 });
  const shades = quantise(field, spreadShades([0.15, 0.7, 0.15], 1, context.noise));
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
      }
      setPixel(image, x, y, pick(material, shade));
    }
  }
  const glyph = context.finish === 'star' ? STAR : QUESTION;
  const width = glyph[0]?.length ?? 0;
  const left = Math.floor((16 - width) / 2);
  const top = Math.floor((16 - glyph.length) / 2);
  const on = (gx: number, gy: number): boolean => glyph[gy]?.[gx] === '#';
  // The shadow first, so the mark covers it where they overlap.
  for (let gy = 0; gy < glyph.length; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      if (!on(gx, gy)) continue;
      const x = left + gx + 1;
      const y = top + gy + 1;
      if (x <= 13 && y <= 13) setPixel(image, x, y, pick(material, 2));
    }
  }
  for (let gy = 0; gy < glyph.length; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      if (!on(gx, gy)) continue;
      const lit = !on(gx - 1, gy) || !on(gx, gy - 1);
      const foot = gy >= glyph.length - 2;
      const shade = lit ? 3 : foot ? 1 : 2;
      setPixel(image, left + gx, top + gy, pick(mark, shade));
    }
  }
  return image;
}

// The flag and the timer ----------------------------------------------------------------------

/** A pennant on a pole: the cloth (`M`), the pole (`H`) and a knob in the cloth's light shades. */
const FLAG: Silhouette = [
  '................',
  '..45............',
  '..34............',
  '..HMMMM.........',
  '..HMMMMMMM......',
  '..HMMMMMMMMMM...',
  '..HMMMMMMMMMMM..',
  '..HMMMMMMMMMM...',
  '..HMMMMMMM......',
  '..HMMMM.........',
  '..HH............',
  '..HH............',
  '..HH............',
  '..HH............',
  '..HH............',
  '................',
];

/**
 * A stopwatch: the case (`M`), its button on top, a pale face (`F`), the hands (`1`, the case's
 * dark shade) and the middle pin.
 */
const TIMER: Silhouette = [
  '................',
  '.......MM.......',
  '......MMMM......',
  '.....MMMMMM.....',
  '...MMFFFFFFMM...',
  '..MMFFFF1FFFMM..',
  '..MFFFFF1FFFFM..',
  '.MMFFFFF1FFFFMM.',
  '.MMFFFFF1FFFFMM.',
  '.MMFFFFF111FFMM.',
  '.MMFFFFFFFF1FMM.',
  '..MFFFFFFFFFFM..',
  '..MMFFFFFFFFMM..',
  '...MMFFFFFFMM...',
  '.....MMMMMM.....',
  '................',
];

/** The flag's ramps: the cloth in the colour and the pole of handle wood, one outline shade. */
function flagRamps(context: DrawContext): SpriteRamps {
  const ramps = itemRamps(context);
  return sharedOutline({ ...ramps, parts: { H: handleRamp(context.hueShift) } }, 'H');
}

/** The timer's ramps: the case in the colour and a pale face. */
function timerRamps(context: DrawContext): SpriteRamps {
  const ramps = itemRamps(context);
  const face = generateRamp([232, 228, 214], { count: 3, anchor: 1, hueShift: context.hueShift });
  return { ...ramps, parts: { F: face } };
}

function drawFlag(context: DrawContext): ArtImage {
  return drawSprite(FLAG, flagRamps(context), {
    seed: hashSeed('flag', context.seed),
    noise: context.noise,
  });
}

function drawTimer(context: DrawContext): ArtImage {
  return drawSprite(TIMER, timerRamps(context), {
    seed: hashSeed('timer', context.seed),
    noise: context.noise,
  });
}

// The rows -------------------------------------------------------------------------------------

/** The game recipes, in table order (after the icons and particles). */
export const GAME_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'lucky_block',
      label: 'Lucky block',
      kind: 'block',
      fallback: 'gem',
      colours: 2,
      finishes: LUCKY_BLOCK_FINISHES,
    },
    drawLuckyBlock,
  ),
  recipeEntry({ id: 'flag', label: 'Flag', kind: 'item', fallback: 'ingot' }, drawFlag),
  recipeEntry({ id: 'timer', label: 'Timer', kind: 'item', fallback: 'disc' }, drawTimer),
]);
