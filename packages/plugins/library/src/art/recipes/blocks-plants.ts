/**
 * Plant block recipes (B492, ADR 0092 D7, D8): the sapling and the four crop stages, drawn on a
 * transparent face. Their shapes come from the seed only, never from the colour.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import type { DrawContext } from '../info';
import { handleRamp } from '../materials';
import { clusteredField, hashSeed, rng } from '../noise';
import { generateRamp } from '../ramp';
import { colourRamp, FACE, lean, paint, rampsAgree } from './blocks-common';

/** The produce of a ripe crop when no second colour is given: a warm wheat gold. */
export const CROP_PRODUCE: Rgb = Object.freeze([214, 168, 60]) as Rgb;

/** A leaf clump of a sapling: its centre and radius. */
interface Clump {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/**
 * A sapling: a thin stem of handle wood from the bottom edge and two or three leaf clumps in
 * the colour, each lit on its top left, with ragged edges; transparent around them.
 */
export function sapling(context: DrawContext): ArtImage {
  const image = blankImage(FACE, FACE);
  const leaf = colourRamp(context.colour, context.hueShift);
  const stem = handleRamp(context.hueShift);
  const random = rng(hashSeed('sapling', context.seed));
  const clumps: Clump[] = [
    { cx: 7.5 + (random() - 0.5) * 1.6, cy: 4.6 + random() * 0.8, r: 3 + random() * 0.6 },
    { cx: 4.2 + (random() - 0.5) * 1.2, cy: 8.6 + random(), r: 2.1 + random() * 0.5 },
  ];
  if (random() < 0.7) {
    clumps.push({ cx: 11 + (random() - 0.5) * 1.2, cy: 8.2 + random(), r: 2.1 + random() * 0.5 });
  }
  const field = clusteredField(FACE, FACE, hashSeed('sapling-leaves', context.seed), {
    wrap: false,
  });
  const lean01 = random() < 0.5 ? 0 : 1;
  for (let y = 7; y < FACE; y += 1) {
    const x = 7 + (y < 9 ? lean01 : 0);
    paint(image, x, y, stem, y < 11 ? 2 : 1);
  }
  const dark = 0.12 * context.noise;
  const light = 1 - 0.1 * context.noise;
  for (let y = 0; y < FACE; y += 1) {
    for (let x = 0; x < FACE; x += 1) {
      const rank = field[y * FACE + x] ?? 0.5;
      for (const { cx, cy, r } of clumps) {
        const ox = x + 0.5 - cx;
        const oy = y + 0.5 - cy;
        const d2 = ox * ox + oy * oy;
        if (d2 > r * r + (rank - 0.5) * 3) continue;
        const facing = -(ox + oy) / (r * 1.4);
        let shade = 2 + facing * 1.3 + lean(x, y) * 0.5;
        if (d2 > (r - 1) * (r - 1) && facing < 0) shade -= 0.7;
        if (rank < dark) shade -= 1;
        if (rank > light) shade += 1;
        paint(image, x, y, leaf, Math.max(0, Math.min(4, shade)));
        break;
      }
    }
  }
  return image;
}

/** The stalk height of each crop stage in pixels from the bottom (ADR 0092 D7: 4, 8, 11, 14). */
const CROP_HEIGHTS: readonly number[] = [4, 8, 11, 14];

/** The columns of the stalks. */
const CROP_COLUMNS: readonly number[] = [1, 4, 7, 10, 13];

/**
 * A crop at `stage` (0 to 3): five stalks in the colour, taller each stage, with leaves on
 * alternate sides, lighter towards their tips and towards the top left; the ripe stage carries
 * produce in the second colour near the top of each stalk. Transparent around them.
 */
export function cropStage(stage: number): (context: DrawContext) => ArtImage {
  const full = CROP_HEIGHTS[stage] ?? 4;
  return (context) => {
    const image = blankImage(FACE, FACE);
    const ramp = colourRamp(context.colour, context.hueShift);
    const own = generateRamp(context.accent ?? CROP_PRODUCE, {
      count: 4,
      anchor: 2,
      hueShift: context.hueShift,
    });
    // A second colour close to the stalks' own is drawn from the stalks' ramp, so the two
    // never disagree on which shade is warmer where they touch.
    const produce = rampsAgree(own, ramp) ? own : ramp.slice(1);
    const random = rng(hashSeed(`crop_stage${stage}`, context.seed));
    for (const column of CROP_COLUMNS) {
      const height = Math.max(2, full - Math.floor(random() * Math.min(3, 1 + stage)));
      const top = FACE - height;
      const side = random() < 0.5 ? -1 : 1;
      const shadeAt = (x: number, y: number, extra: number): number =>
        Math.max(0, Math.min(4, 1.2 + 2.2 * (1 - (y - top) / height) + lean(x, y) * 0.9 + extra));
      for (let y = top; y < FACE; y += 1) paint(image, column, y, ramp, shadeAt(column, y, 0));
      for (let y = top + 2; y < FACE - 1; y += 3) {
        const k = Math.floor((y - top - 2) / 3);
        const dir = k % 2 === 0 ? side : -side;
        const x = column + dir;
        if (x < 0 || x >= FACE) continue;
        paint(image, x, y, ramp, shadeAt(x, y, dir < 0 ? 0.3 : -0.5));
        if (stage >= 2 && y - 1 > top) {
          const x2 = column + 2 * dir;
          if (x2 >= 0 && x2 < FACE)
            paint(image, x2, y - 1, ramp, shadeAt(x2, y - 1, dir < 0 ? 0.3 : -0.5));
        }
      }
      if (stage === 3) {
        for (let y = top + 1; y <= top + 3; y += 1) {
          for (const x of [column, column + 1]) {
            if (x >= FACE) continue;
            const lit = x === column && y === top + 1;
            const shade = Math.max(
              0,
              Math.min(
                3,
                (lit ? 3 : x === column ? 2 : 1) + lean(x, y) * 0.8 - (y === top + 3 ? 0.6 : 0),
              ),
            );
            setPixel(image, x, y, produce[Math.round(shade)] as Rgb);
          }
        }
      }
    }
    return image;
  };
}
