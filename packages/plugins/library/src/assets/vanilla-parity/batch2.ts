/**
 * The pictures of the batch 2 Creator flows and examples (B481, ADR 0101 D2, D3): a bucket of a
 * fluid, a still and a flowing liquid, a job site block's top and sides, and a villager's
 * working apron for a new job. MSM's own drawings in the Minecraft-style rules of ADR 0092 (ramps
 * lit from the top left), never Mojang pictures. Output depends only on the arguments.
 *
 * @packageDocumentation
 */

import type { Silhouette } from '../../art/sprites';
import type { Rgb } from '../png';
import { Canvas, lighten, mix, rampOf, shade, spritePng } from './painter';

/** A bucket: the pail (`M`), its handle (`H`) and the liquid at the brim (`L`). */
export const BUCKET_ITEM: Silhouette = [
  '................',
  '................',
  '.....HHHHHH.....',
  '....H......H....',
  '...H........H...',
  '..MMMMMMMMMMMM..',
  '..MLLLLLLLLLLM..',
  '..MMLLLLLLLLMM..',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '....MMMMMMMM....',
  '....MMMMMMMM....',
  '.....MMMMMM.....',
  '................',
  '................',
];

const IRON: Rgb = [168, 172, 180];

/** A bucket of a liquid of `liquid`, its pail of `metal` (iron by default). */
export function bucketItemPng(liquid: Rgb, metal: Rgb = IRON): Uint8Array {
  return spritePng(
    BUCKET_ITEM,
    metal,
    { L: lighten(liquid, 0.04), H: lighten(metal, -0.12) },
    'bucket',
  );
}

/**
 * A 16 by 16 liquid picture in `colour` that tiles: soft ripples for the still picture, slanted
 * streaks for the flowing one. Both are one frame (no `.mcmeta`): the game draws them without
 * moving, and the flowing faces still slide in the direction of the flow.
 */
export function liquidPng(colour: Rgb, flowing: boolean): Uint8Array {
  const ramp = rampOf(colour, 5);
  const canvas = new Canvas(16, 16);
  const tau = Math.PI * 2;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      // Waves whose periods divide 16, so the picture tiles without seams.
      const wave = flowing
        ? Math.sin(((x + 2 * y) / 16) * tau) * 0.9 + Math.sin(((3 * x - y) / 16) * tau) * 0.35
        : Math.sin((x / 16) * tau * 2 + Math.sin((y / 16) * tau) * 1.6) * 0.6 +
          Math.sin((y / 16) * tau * 3 + Math.cos((x / 16) * tau) * 1.2) * 0.5;
      canvas.set(x, y, shade(ramp, 2 + wave * 1.4));
    }
  }
  return canvas.png();
}

/** The top of a job site block: a worn metal plate with a raised rim and two rivets. */
export function jobSiteTopPng(metal: Rgb): Uint8Array {
  const ramp = rampOf(metal, 5);
  const canvas = new Canvas(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rim = x === 0 || y === 0 || x === 15 || y === 15;
      const inner = x === 1 || y === 1 || x === 14 || y === 14;
      const lit = x + y < 15;
      let index = 2;
      if (rim) index = lit ? 4 : 0;
      else if (inner) index = lit ? 1 : 3;
      else if ((x * 7 + y * 3) % 11 === 0) index = 1;
      else if ((x * 5 + y * 9) % 13 === 0) index = 3;
      canvas.set(x, y, shade(ramp, index));
    }
  }
  for (const [x, y] of [
    [3, 3],
    [12, 12],
  ] as const) {
    canvas.set(x, y, shade(ramp, 4));
    canvas.set(x + 1, y + 1, shade(ramp, 0));
  }
  return canvas.png();
}

/** The sides of a job site block: wooden boards of `wood` under a metal band of `metal`. */
export function jobSiteSidePng(wood: Rgb, metal: Rgb): Uint8Array {
  const planks = rampOf(wood, 5);
  const band = rampOf(metal, 5);
  const canvas = new Canvas(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (y < 3) {
        canvas.set(x, y, shade(band, y === 0 ? 4 : y === 2 ? 0 : 2));
        continue;
      }
      // Boards four pixels wide, a dark seam between them, a grain line now and then.
      const seam = x % 4 === 3;
      const grain = (x * 3 + y * 5) % 9 === 0;
      const index = seam ? 0 : grain ? 1 : y === 15 ? 1 : x % 4 === 0 ? 3 : 2;
      canvas.set(x, y, shade(planks, index));
    }
  }
  return canvas.png();
}

/** The bottom of a job site block: plain boards of `wood`. */
export function jobSiteBottomPng(wood: Rgb): Uint8Array {
  const planks = rampOf(wood, 5);
  const canvas = new Canvas(16, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      canvas.set(x, y, shade(planks, y % 4 === 3 ? 0 : (x * 5 + y * 3) % 7 === 0 ? 1 : 2));
    }
  }
  return canvas.png();
}

/** The size of a villager picture: the profession layer is drawn over the villager. */
export const VILLAGER_TEXTURE_SIZE = 64;

/**
 * A villager's job picture: a working apron of `apron` with a belt and a pocket, drawn on the
 * front of the body and the robe of the 64 by 64 villager layout; everything else stays clear,
 * so the villager's own look shows through. The zombie villager uses the same layout.
 */
export function professionApronPng(apron: Rgb): Uint8Array {
  const ramp = rampOf(apron, 5);
  const belt = rampOf(mix(apron, [40, 28, 20], 0.6), 3);
  const canvas = new Canvas(VILLAGER_TEXTURE_SIZE, VILLAGER_TEXTURE_SIZE);
  // The body's front face (8 by 12 at 22, 26) and the robe's front face (8 by 20 at 6, 44).
  const paint = (x0: number, y0: number, height: number): void => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 1; x < 7; x += 1) {
        const edge = x === 1 || x === 6;
        canvas.set(x0 + x, y0 + y, shade(ramp, edge ? 1 : (x + y) % 5 === 0 ? 3 : 2));
      }
    }
  };
  paint(22, 26, 12);
  paint(6, 44, 18);
  // Straps over the shoulders and a belt across the body.
  for (let y = 26; y < 30; y += 1) {
    canvas.set(23, y, shade(belt, 1));
    canvas.set(28, y, shade(belt, 1));
  }
  for (let x = 22; x < 30; x += 1) canvas.set(x, 33, shade(belt, x === 25 || x === 26 ? 2 : 0));
  // A pocket on the robe.
  for (let y = 50; y < 54; y += 1) {
    for (let x = 9; x < 13; x += 1) {
      canvas.set(x, y, shade(ramp, y === 50 ? 4 : x === 12 || y === 53 ? 0 : 3));
    }
  }
  return canvas.png();
}
