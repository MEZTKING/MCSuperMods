/**
 * The pictures of the vehicle Creator flows (ADR 0091 D2), drawn by MSM: the entity texture
 * painted from the model's own boxes in a picked colour (wheels, tracks and propellers dark,
 * the car's cabin glass, the tank's barrel steel), and a 16 by 16 item picture of each shape
 * seen from the side. Nothing is copied from Minecraft or a mod.
 *
 * @packageDocumentation
 */

import type { JsonObject } from '@msm/plugin-api';
import { boxSkinPixels, encodePng, type Rgb, type SkinBox } from '../png';
import { geometryCubes, type VehicleFlowShape } from './models';

/** Tyres, tracks and propellers. */
export const VEHICLE_DARK: Rgb = Object.freeze([52, 52, 60]) as Rgb;
/** Windows. */
export const VEHICLE_GLASS: Rgb = Object.freeze([150, 198, 222]) as Rgb;
/** Gun barrels. */
export const VEHICLE_STEEL: Rgb = Object.freeze([112, 116, 124]) as Rgb;

/** The tone of a bone by its name: body colour unless it is a wheel, track, glass or barrel. */
function toneOf(bone: string, colour: Rgb): Rgb {
  if (/wheel|track|propeller|rotor/.test(bone)) return VEHICLE_DARK;
  if (/cabin|glass/.test(bone)) return VEHICLE_GLASS;
  if (/barrel/.test(bone)) return VEHICLE_STEEL;
  return colour;
}

/**
 * The entity texture of a flow's geometry in `colour`: each box drawn with box UV (lighter
 * top, darker bottom, a rim), toned by its bone; transparent outside the faces.
 *
 * @param geometry - A geometry of `vehicleFlowGeometry`.
 * @param colour - The body colour.
 */
export function vehicleTexturePng(geometry: JsonObject, colour: Rgb): Uint8Array {
  const { size, cubes } = geometryCubes(geometry);
  const rgba = new Uint8Array(size * size * 4);
  const tones = new Map<string, { tone: Rgb; boxes: SkinBox[] }>();
  for (const cube of cubes) {
    const tone = toneOf(cube.bone, colour);
    const key = tone.join(',');
    const group = tones.get(key) ?? { tone, boxes: [] };
    group.boxes.push({ u: cube.u, v: cube.v, w: cube.w, h: cube.h, d: cube.d });
    tones.set(key, group);
  }
  for (const { tone, boxes } of tones.values()) {
    const layer = boxSkinPixels(boxes, size, size, { colour: tone });
    for (let index = 0; index < layer.length; index += 4) {
      if ((layer[index + 3] ?? 0) > 0) rgba.set(layer.subarray(index, index + 4), index);
    }
  }
  return encodePng(rgba, size, size);
}

/** The item pictures, 16 rows of 16: `.` clear, `X` dark body, `B` body, `L` light body, `G` glass, `K` tyre, `H` steel. */
export const VEHICLE_ITEM_PICTURES: Readonly<Record<VehicleFlowShape, readonly string[]>> = {
  car: [
    '................',
    '................',
    '................',
    '................',
    '.....XXXXXX.....',
    '....XGGXGGGX....',
    '...XGGGXGGGGX...',
    '.XXXXXXXXXXXXXX.',
    'XLLLLLLLLLLLLLLX',
    'XBBBBBBBBBBBBBBX',
    'XBBKKBBBBBBKKBBX',
    '.XKKKKXXXXKKKKX.',
    '..KKHKK..KKHKK..',
    '...KKK....KKK...',
    '................',
    '................',
  ],
  tank: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....XXXXX.......',
    '...XLLLLLX......',
    '...XBBBBBXHHHHHH',
    '.XXXXXXXXXXXX...',
    'XLLLLLLLLLLLLX..',
    'XBBBBBBBBBBBBX..',
    'XKKKKKKKKKKKKKX.',
    'KHKKHKKHKKHKKHK.',
    '.KKKKKKKKKKKKK..',
    '................',
    '................',
  ],
  plane: [
    '................',
    '................',
    '................',
    '....LLLLLLLL....',
    '......X...X.....',
    'X.....X...X....H',
    'XX..XXXXXXXXXX.H',
    'XBBBBBBBGGBBBBXH',
    '.XBBBBBBBBBBBBX.',
    '..XXLLLLLLLLXX..',
    '......X...X.....',
    '.....KKK.KKK....',
    '................',
    '................',
    '................',
    '................',
  ],
  boat: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '........XX......',
    '.......XGGX.....',
    'XXXXXXXXXXXXXXXX',
    'XLLLLLLLLLLLLLLX',
    '.XBBBBBBBBBBBBX.',
    '..XBBBBBBBBBBX..',
    '...XXXXXXXXXX...',
    '................',
    '................',
    '................',
  ],
};

/** The tank shell's item picture, upright, with a band in the tank's colour. */
export const SHELL_ITEM_PICTURE: readonly string[] = [
  '................',
  '.......LL.......',
  '......LHHL......',
  '......HHHH......',
  '.....XHHHHX.....',
  '.....XHHHHX.....',
  '.....XBBBBX.....',
  '.....XBBBBX.....',
  '.....XHHHHX.....',
  '.....XHHHHX.....',
  '.....XHHHHX.....',
  '.....XHHHHX.....',
  '.....XKKKKX.....',
  '.....XXXXXX.....',
  '................',
  '................',
];

const mix = (from: Rgb, to: Rgb, amount: number): Rgb =>
  from.map((channel, index) =>
    Math.round(channel + ((to[index] ?? channel) - channel) * amount),
  ) as unknown as Rgb;

/**
 * The 16 by 16 item picture of a shape in `colour`.
 *
 * @param shape - The flow's shape.
 * @param colour - The body colour.
 */
export function vehicleItemPng(shape: VehicleFlowShape, colour: Rgb): Uint8Array {
  return picturePng(VEHICLE_ITEM_PICTURES[shape], colour);
}

/** The 16 by 16 picture of the tank's shell with a band in `colour`. */
export function shellItemPng(colour: Rgb): Uint8Array {
  return picturePng(SHELL_ITEM_PICTURE, colour);
}

function picturePng(rows: readonly string[], colour: Rgb): Uint8Array {
  const tones: Readonly<Record<string, Rgb>> = {
    X: mix(colour, [0, 0, 0], 0.45),
    B: colour,
    L: mix(colour, [255, 255, 255], 0.3),
    G: VEHICLE_GLASS,
    K: VEHICLE_DARK,
    H: VEHICLE_STEEL,
  };
  const rgba = new Uint8Array(16 * 16 * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x += 1) {
      const tone = tones[row[x] ?? '.'];
      if (tone !== undefined) rgba.set([...tone, 255], (y * 16 + x) * 4);
    }
  });
  return encodePng(rgba, 16, 16);
}
