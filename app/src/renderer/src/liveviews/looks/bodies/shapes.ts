/**
 * MSM's own simple shapes for paintings, banners, shields and pots (ADR 0121 D5, B623; B628
 * dresses them): Bedrock geo JSON for the geo renderer, the front facing north (-z), feet at 0.
 * Nothing here is measured from the game: the texel layouts are the ones MSM's own Banner pattern
 * and Pot pattern flows draw (`starters/pattern-art.ts` in the library: the banner mask's flag
 * front at (1, 1) and back at (22, 1), 20 by 40; the shield mask's plate front at (1, 1), 12 by
 * 22; a pot face 16 by 16).
 */

import type { JsonObject } from '@msm/plugin-api';
import type { GeoJson } from './index';

type Face = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
/** A texel rectangle: u, v, width, height (negative to flip). */
type Rect = readonly [number, number, number, number];

const geo = (id: string, width: number, height: number, bones: JsonObject[]): GeoJson => ({
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: `geometry.msm.shape.${id}`,
        texture_width: width,
        texture_height: height,
      },
      bones,
    },
  ],
});

/** A bone of one cube: per-face UV from `faces` (faces left out are not drawn). */
function part(
  name: string,
  origin: readonly [number, number, number],
  size: readonly [number, number, number],
  faces: Partial<Record<Face, Rect>>,
): JsonObject {
  const uv: JsonObject = {};
  for (const [face, [u, v, w, h]] of Object.entries(faces) as [Face, Rect][]) {
    // The renderer swaps the corners of up and down; store those pre-swapped.
    uv[face] =
      face === 'up' || face === 'down'
        ? { uv: [u + w, v + h], uv_size: [-w, -h] }
        : { uv: [u, v], uv_size: [w, h] };
  }
  const pivot = [origin[0] + size[0] / 2, origin[1], origin[2] + size[2] / 2];
  return { name, pivot, cubes: [{ origin: [...origin], size: [...size], uv }] };
}

const all = (rect: Rect): Record<Face, Rect> => ({
  north: rect,
  south: rect,
  east: rect,
  west: rect,
  up: rect,
  down: rect,
});

/**
 * A wall a painting hangs on: one block thick, a block wider than the painting on every side,
 * every face showing the whole of a 16 by 16 picture (stone, plaster or a flat colour).
 */
export function wallShape(widthBlocks: number, heightBlocks: number): GeoJson {
  const w = (Math.max(1, widthBlocks) + 2) * 16;
  const h = (Math.max(1, heightBlocks) + 2) * 16;
  return geo('wall', 16, 16, [part('wall', [-w / 2, 0, 0], [w, h, 16], all([0, 0, 16, 16]))]);
}

/**
 * A painting of `widthBlocks` by `heightBlocks` (a `painting_variant`'s `width` and `height`):
 * one pixel deep, standing on the wall shape's face (z = 0) one block up. The front shows the
 * whole picture (`pictureWidth` by `pictureHeight` texels, 16 per block by default), the edges
 * its border texels; the back is left to the view.
 */
export function frameShape(
  widthBlocks: number,
  heightBlocks: number,
  pictureWidth = Math.max(1, widthBlocks) * 16,
  pictureHeight = Math.max(1, heightBlocks) * 16,
): GeoJson {
  const w = Math.max(1, widthBlocks) * 16;
  const h = Math.max(1, heightBlocks) * 16;
  const pw = pictureWidth;
  const ph = pictureHeight;
  return geo('frame', pw, ph, [
    part('picture', [-w / 2, 16, -1], [w, h, 1], {
      north: [0, 0, pw, ph],
      up: [0, 0, pw, 1],
      down: [0, ph - 1, pw, 1],
      east: [0, 0, 1, ph],
      west: [pw - 1, 0, 1, ph],
    }),
  ]);
}

/** The texel the banner's pole and bar and the shield's handle sample: the view paints it wood. */
export const WOOD_TEXEL: Rect = [62, 62, 2, 2];

/**
 * A standing banner on a 64 by 64 picture: the flag (20 by 40, front at (1, 1), back at
 * (22, 1), the banner pattern layout) hanging from a bar on a pole. Layers are drawn by the view
 * into one picture (pattern times dye over the base, 3S6).
 */
export function bannerShape(): GeoJson {
  return geo('banner', 64, 64, [
    part('flag', [-10, 2, -2], [20, 40, 1], {
      north: [1, 1, 20, 40],
      south: [22, 1, 20, 40],
      east: [0, 1, 1, 40],
      west: [21, 1, 1, 40],
      up: [1, 0, 20, 1],
      down: [21, 0, 20, 1],
    }),
    part('bar', [-10, 42, -1], [20, 2, 2], all(WOOD_TEXEL)),
    part('pole', [-1, 0, -1], [2, 44, 2], all(WOOD_TEXEL)),
  ]);
}

/**
 * A shield on a 64 by 64 picture: the plate (12 by 22, front at (1, 1), the shield pattern
 * layout) and a handle behind it. About right: shields were not measured (3S6).
 */
export function shieldShape(): GeoJson {
  return geo('shield', 64, 64, [
    part('plate', [-6, 0, -1], [12, 22, 1], {
      north: [1, 1, 12, 22],
      south: [14, 1, 12, 22],
      east: [0, 1, 1, 22],
      west: [13, 1, 1, 22],
      up: [1, 0, 12, 1],
      down: [13, 0, 12, 1],
    }),
    part('handle', [-1, 8, 0], [2, 6, 6], all(WOOD_TEXEL)),
  ]);
}

/**
 * The pot's picture: its four sides side by side in the top row (one 16 by 16 pot face each,
 * the `decorated_pot_pattern` pictures, or plain clay for a side without one), and a clay strip
 * below for the top, the bottom and the neck.
 */
export const POT_ATLAS = Object.freeze({
  width: 64,
  height: 32,
  sides: Object.freeze({
    north: [0, 0, 16, 16] as Rect,
    east: [16, 0, 16, 16] as Rect,
    south: [32, 0, 16, 16] as Rect,
    west: [48, 0, 16, 16] as Rect,
  }),
  clay: [0, 16, 64, 16] as Rect,
});

/** A decorated pot: a body with one picture per side, a neck and a lip. */
export function potShape(): GeoJson {
  const clay: Rect = [0, 16, 16, 16];
  const { sides } = POT_ATLAS;
  return geo('pot', POT_ATLAS.width, POT_ATLAS.height, [
    part('body', [-7, 0, -7], [14, 16, 14], { ...sides, up: clay, down: clay }),
    part('neck', [-3, 16, -3], [6, 2, 6], all(clay)),
    part('lip', [-4, 18, -4], [8, 2, 8], all(clay)),
  ]);
}
