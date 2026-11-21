/**
 * Wooden block recipes (B492, ADR 0092 D7, D8): the stripped log's side and end, the two halves
 * of a door and a trapdoor, all on the wood ramp of the user's colour (the ramp planks use).
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { pick, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import type { DrawContext } from '../info';
import { type Ramp, spreadShades, woodRamp } from '../materials';
import { clusteredField, hashSeed, quantise, rng } from '../noise';
import { generateRamp } from '../ramp';
import { FACE, lean, paint } from './blocks-common';

/** The grey of a door's handle. */
const HANDLE_GREY: Rgb = Object.freeze([150, 150, 154]) as Rgb;

/** A stripped log's side: smooth, light vertical grain with a few darker streaks. */
export function strippedLog(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = woodRamp(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('stripped_log', context.seed), { blurX: 0, blurY: 3 }),
    spreadShades([0.26, 0.52, 0.22], 1, context.noise),
  );
  for (let i = 0; i < FACE * FACE; i += 1)
    paint(image, i % FACE, i >> 4, ramp, 2 + (shades[i] ?? 1));
  const random = rng(hashSeed('stripped_log-streaks', context.seed));
  const streaks = 2 + Math.round(2 * context.noise);
  for (let s = 0; s < streaks; s += 1) {
    const x = Math.floor(random() * FACE);
    const y0 = Math.floor(random() * FACE);
    const length = 3 + Math.floor(random() * 4);
    for (let k = 0; k < length; k += 1) paint(image, x, (y0 + k) % FACE, ramp, 1);
  }
  return image;
}

/**
 * A stripped log's end: a rim of wood lit on its top and left, then rings of growth alternating
 * light and dark, rounded at the corners, with a few clustered flecks; no bark.
 */
export function strippedLogTop(context: DrawContext): ArtImage {
  const wood = woodRamp(context.colour, context.hueShift);
  const image = blankImage(FACE, FACE);
  const field = clusteredField(FACE, FACE, hashSeed('stripped_log_top', context.seed), {
    blurX: 1,
  });
  const dark = 0.08 * context.noise;
  const light = 1 - 0.06 * context.noise;
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const rank = field[y * FACE + x] ?? 0.5;
      const lit = x === ring || y === ring;
      const shadow = x === 15 - ring || y === 15 - ring;
      if (ring === 0) {
        paint(image, x, y, wood, lit && shadow ? 2 : lit ? 4 : 1);
        continue;
      }
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const d = Math.max(dx, dy) * 0.75 + Math.sqrt(dx * dx + dy * dy) * 0.25;
      let shade = Math.floor(d) % 2 === 0 ? 4 : 3;
      if (d < 1.2) shade = 3;
      if (rank < dark) shade -= 1;
      if (rank > light) shade += 1;
      paint(image, x, y, wood, Math.max(1, Math.min(4, shade + lean(x, y) * 0.3)));
    }
  }
  return image;
}

/**
 * Vertical boards three to four pixels wide inside a door or trapdoor: clustered grain along
 * the board, a dark seam at each board's left and a lit column after it.
 */
function boards(
  image: ArtImage,
  ramp: Ramp,
  context: DrawContext,
  id: string,
  seams: number[],
): void {
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed(id, context.seed), { blurX: 0, blurY: 2, wrap: false }),
    spreadShades([0.22, 0.56, 0.22], 1, context.noise),
  );
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      let shade = 1.6 + (shades[y * FACE + x] ?? 1) + lean(x, y) * 0.7;
      if (seams.includes(x)) shade = 1;
      else if (seams.includes(x - 1)) shade = Math.max(shade, 3);
      paint(image, x, y, ramp, shade);
    }
  }
}

/** The frame of a door half: two pixels at the sides and at the `top` or bottom end, bevelled. */
function doorFrame(image: ArtImage, ramp: Ramp, top: boolean): void {
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const endRow = top ? y : 15 - y;
      if (x > 1 && x < 14 && endRow > 1) continue;
      let shade: number;
      if (x === 0) shade = 4;
      else if (x === 15) shade = 0;
      else if (x === 1) shade = 3;
      else if (x === 14) shade = 1;
      else if (top) shade = y === 0 ? 4 : 3;
      else shade = y === 15 ? 1 : 2;
      paint(image, x, y, ramp, shade);
    }
  }
}

/** A door's top half: boards in a frame with a two-pane window of dark glass. */
export function doorTop(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = woodRamp(context.colour, context.hueShift);
  boards(image, ramp, context, 'door_top', [6, 10]);
  doorFrame(image, ramp, true);
  const random = rng(hashSeed('door_top-glint', context.seed));
  for (const x0 of [3, 9]) {
    const glint = Math.floor(random() * 2);
    for (let y = 3; y <= 8; y += 1) {
      for (let x = x0; x <= x0 + 3; x += 1) {
        const onGlint = x - x0 + (y - 3) === 3 + glint || x - x0 + (y - 3) === 4 + glint;
        paint(image, x, y, ramp, onGlint ? 2 : 0);
      }
    }
    // The sill under each pane catches the light; the rim above it is in shadow.
    for (let x = x0; x <= x0 + 3; x += 1) {
      paint(image, x, 9, ramp, 4);
      paint(image, x, 2, ramp, 1);
    }
  }
  return image;
}

/** A door's bottom half: boards in a frame with a sunken panel and a grey handle on the right. */
export function doorBottom(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = woodRamp(context.colour, context.hueShift);
  boards(image, ramp, context, 'door_bottom', [6, 10]);
  doorFrame(image, ramp, false);
  for (let y = 5; y <= 12; y += 1) {
    for (let x = 3; x <= 12; x += 1) {
      if (y === 5 || x === 3) paint(image, x, y, ramp, 1);
      else if (y === 12 || x === 12) paint(image, x, y, ramp, 3);
    }
  }
  const metal = generateRamp(HANDLE_GREY, { count: 3, anchor: 1, hueShift: context.hueShift });
  setPixel(image, 12, 2, pick(metal, 2));
  setPixel(image, 12, 3, pick(metal, 0));
  return image;
}

/**
 * A trapdoor: a bevelled frame, a cross of bars and boards in the four quarters, each with a
 * square hole (shaded on its top and left lip, lit on its bottom and right one).
 */
export function trapdoor(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const ramp = woodRamp(context.colour, context.hueShift);
  const shades = quantise(
    clusteredField(FACE, FACE, hashSeed('trapdoor', context.seed), {
      blurX: 3,
      blurY: 0,
      wrap: false,
    }),
    spreadShades([0.22, 0.56, 0.22], 1, context.noise),
  );
  const random = rng(hashSeed('trapdoor-holes', context.seed));
  const holes = [0, 1, 2, 3].map(() => Math.floor(random() * 2));
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const lit = x === ring || y === ring;
      const shadow = x === 15 - ring || y === 15 - ring;
      let shade: number;
      if (ring === 0) shade = lit && shadow ? 2 : lit ? 4 : 1;
      else if (ring === 1) shade = lit && shadow ? 2 : lit ? 3 : 2;
      else if (x === 7 || y === 7) shade = 3;
      else if (x === 8 || y === 8) shade = 1;
      else {
        shade = 1.6 + (shades[y * FACE + x] ?? 1) + lean(x, y) * 0.4;
        if (y === 4 || y === 11) shade = 1;
      }
      paint(image, x, y, ramp, shade);
    }
  }
  [
    [3, 3],
    [10, 3],
    [3, 10],
    [10, 10],
  ].forEach(([hx, hy], quarter) => {
    const x0 = (hx ?? 3) + (holes[quarter] ?? 0);
    const y0 = hy ?? 3;
    for (let y = y0 - 1; y <= y0 + 2; y += 1) {
      for (let x = x0 - 1; x <= x0 + 2; x += 1) {
        const inside = x >= x0 && x <= x0 + 1 && y >= y0 && y <= y0 + 1;
        if (inside) setPixel(image, x, y, [0, 0, 0], 0);
        else if (x === x0 - 1 || y === y0 - 1) paint(image, x, y, ramp, 1);
        else paint(image, x, y, ramp, 3);
      }
    }
  });
  return image;
}
