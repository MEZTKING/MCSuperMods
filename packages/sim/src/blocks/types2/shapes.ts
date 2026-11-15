/**
 * The boxes of the twenty types (B463): MSM's own reading of the game's visible outlines, in
 * pixels, turned with the block's facing or axis as `../shapes.ts` turns the older types. Plants,
 * vines, torches, signs, stems and scaffolding stop nothing (scaffolding's top that the game lets
 * you stand on is said out loud by the local source); layers stop the player one layer lower, as
 * snow does.
 */
import type { BlockState, Box } from '../../types.js';
import { facingTurn, NO_BOXES, type PixelBox, pillarTurn, toBox } from '../shapes.js';
import type { SimBlockType2, Types2Facts } from './facts.js';

const boxes = (...pixels: PixelBox[]): readonly Box[] => Object.freeze(pixels.map(toBox));
const num = (state: BlockState, name: string, fallback: number): number => {
  const value = Number(state.properties[name]);
  return Number.isFinite(value) ? value : fallback;
};
const turned = (state: BlockState, box: PixelBox): PixelBox =>
  facingTurn(state.properties.facing ?? 'north')(box);

/** The outline of a companion block: a wall torch, wall sign, wall hanging sign or attached stem. */
function companionOutline(type: SimBlockType2, state: BlockState): readonly Box[] {
  switch (type) {
    case 'torch':
      return boxes(turned(state, [5.5, 3, 11, 10.5, 13, 16]));
    case 'sign':
      return boxes(turned(state, [0, 4.5, 14, 16, 12.5, 16]));
    case 'hanging_sign':
      return boxes(turned(state, [0, 0, 6, 16, 10, 10]));
    default:
      return boxes([6, 0, 6, 10, 10, 10]);
  }
}

const VINE_SIDES: Readonly<Record<string, PixelBox>> = {
  up: [0, 15, 0, 16, 16, 16],
  north: [0, 0, 0, 16, 16, 1],
  south: [0, 0, 15, 16, 16, 16],
  west: [0, 0, 0, 1, 16, 16],
  east: [15, 0, 0, 16, 16, 16],
};

const PICKLES: readonly PixelBox[] = [
  [6, 0, 6, 10, 6, 10],
  [3, 0, 3, 13, 6, 13],
  [2, 0, 2, 14, 6, 14],
  [2, 0, 2, 14, 7, 14],
];

const CANDLES: readonly PixelBox[] = [
  [7, 0, 7, 9, 6, 9],
  [5, 0, 6, 11, 6, 9],
  [5, 0, 6, 10, 6, 11],
  [5, 0, 5, 11, 6, 10],
];

/** The outline of a block of the twenty types in a state. */
export function types2Outline(
  type: SimBlockType2,
  facts: Types2Facts | undefined,
  state: BlockState,
): readonly Box[] {
  if (facts?.companion !== undefined) return companionOutline(type, state);
  switch (type) {
    case 'cake':
      return boxes([1 + 2 * num(state, 'bites', 0), 0, 1, 15, 8, 15]);
    case 'berry_bush':
      return num(state, 'age', 0) === 0
        ? boxes([3, 0, 3, 13, 8, 13])
        : boxes([1, 0, 1, 15, 16, 15]);
    case 'tall_plant':
      return boxes([2, 0, 2, 14, 16, 14]);
    case 'potted_plant':
      return boxes([5, 0, 5, 11, 6, 11]);
    case 'vine': {
      const sides = Object.keys(VINE_SIDES).filter((side) => state.properties[side] === 'true');
      return sides.length === 0
        ? boxes([0, 0, 0, 16, 1, 16])
        : boxes(...sides.map((side) => VINE_SIDES[side] as PixelBox));
    }
    case 'sea_pickle':
      return boxes(PICKLES[Math.min(3, Math.max(0, num(state, 'pickles', 1) - 1))] as PixelBox);
    case 'carpet':
      return boxes([0, 0, 0, 16, 1, 16]);
    case 'layers':
      return boxes([0, 0, 0, 16, 2 * num(state, 'layers', 1), 16]);
    case 'cocoa': {
      const age = num(state, 'age', 0);
      const half = 2 + age;
      const height = 5 + 2 * age;
      return boxes(turned(state, [8 - half, 12 - height, 1, 8 + half, 12, 1 + 2 * half]));
    }
    case 'candle':
      return boxes(CANDLES[Math.min(3, Math.max(0, num(state, 'candles', 1) - 1))] as PixelBox);
    case 'bed':
      return boxes([0, 0, 0, 16, 9, 16]);
    case 'ladder':
      return boxes(turned(state, [0, 0, 13, 16, 16, 16]));
    case 'torch':
      return boxes([6, 0, 6, 10, 10, 10]);
    case 'lantern':
      return state.properties.hanging === 'true'
        ? boxes([5, 1, 5, 11, 10, 11])
        : boxes([5, 0, 5, 11, 9, 11]);
    case 'chain':
      return boxes(pillarTurn(state.properties.axis ?? 'y')([6.5, 0, 6.5, 9.5, 16, 9.5]));
    case 'rod': {
      const facing = state.properties.facing ?? 'up';
      const axis =
        facing === 'up' || facing === 'down'
          ? 'y'
          : facing === 'north' || facing === 'south'
            ? 'z'
            : 'x';
      return boxes(pillarTurn(axis)([6, 0, 6, 10, 16, 10]));
    }
    case 'sign':
      return boxes([4, 0, 4, 12, 16, 12]);
    case 'hanging_sign':
      return boxes([1, 0, 7, 15, 10, 9]);
    case 'stem':
      return boxes([7, 0, 7, 9, 2 + 2 * num(state, 'age', 0), 9]);
    default:
      return boxes([0, 0, 0, 16, 16, 16]);
  }
}

/** The types that stop nothing: plants, vines, torches, signs, stems and scaffolding. */
const WALK_THROUGH: readonly SimBlockType2[] = [
  'berry_bush',
  'tall_plant',
  'vine',
  'torch',
  'sign',
  'hanging_sign',
  'stem',
  'scaffolding',
];

/** The boxes a block of the twenty types stops the player with. */
export function types2Collision(
  type: SimBlockType2,
  facts: Types2Facts | undefined,
  state: BlockState,
): readonly Box[] {
  if (WALK_THROUGH.includes(type)) return NO_BOXES;
  if (type === 'layers') {
    const layers = num(state, 'layers', 1);
    return layers <= 1 ? NO_BOXES : boxes([0, 0, 0, 16, 2 * (layers - 1), 16]);
  }
  return types2Outline(type, facts, state);
}
