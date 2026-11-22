/**
 * The boxes of the five types of ADR 0103 (B519): MSM's own reading of the game's visible
 * outlines, in pixels. Strands, cane, shoots, lichen, stems and small dripleaves stop nothing; a
 * cactus stops the player a pixel inside its sides; bamboo is a thin post; a big dripleaf's leaf is
 * a floor that gives way as it tilts (none at a full tilt); a pot is a small box.
 */
import type { BlockState, Box } from '../../types.js';
import { NO_BOXES, type PixelBox, toBox } from '../shapes.js';
import { MULTIFACE_SIDES, type SimBlockType3, type Types3Facts } from './facts.js';

const boxes = (...pixels: PixelBox[]): readonly Box[] => Object.freeze(pixels.map(toBox));

const FACE_BOXES: Readonly<Record<string, PixelBox>> = {
  down: [0, 0, 0, 16, 1, 16],
  up: [0, 15, 0, 16, 16, 16],
  north: [0, 0, 0, 16, 16, 1],
  south: [0, 0, 15, 16, 16, 16],
  west: [0, 0, 0, 1, 16, 16],
  east: [15, 0, 0, 16, 16, 16],
};

/** A pot's box (and a potted plant's), as vanilla's pot's outline. */
export const POT_BOX: PixelBox = [5, 0, 5, 11, 6, 11];

const LEAF: PixelBox = [0, 11, 0, 16, 15, 16];
const STEM: PixelBox = [5, 0, 5, 11, 16, 11];

/** The outline of a block of the five types in a state. */
export function types3Outline(
  type: SimBlockType3,
  facts: Types3Facts | undefined,
  state: BlockState,
): readonly Box[] {
  const companion = facts?.companion?.kind;
  switch (type) {
    case 'growing_plant':
      return companion === 'plant' ? boxes([1, 0, 1, 15, 16, 15]) : boxes([4, 0, 4, 12, 15, 12]);
    case 'column_plant': {
      if (companion === 'shoot') return boxes([4, 0, 4, 12, 12, 12]);
      const style = facts?.column?.style;
      if (style === 'cactus') return boxes([1, 0, 1, 15, 16, 15]);
      if (style === 'bamboo') {
        return state.properties.age === '1'
          ? boxes([5, 0, 5, 11, 16, 11])
          : boxes([6.5, 0, 6.5, 9.5, 16, 9.5]);
      }
      return boxes([2, 0, 2, 14, 16, 14]);
    }
    case 'multiface': {
      const faces = MULTIFACE_SIDES.filter((side) => state.properties[side] === 'true');
      return faces.length === 0
        ? boxes([0, 0, 0, 16, 1, 16])
        : boxes(...faces.map((side) => FACE_BOXES[side] as PixelBox));
    }
    case 'dripleaf':
      if (companion === 'stem') return boxes(STEM);
      if (facts?.dripleaf?.size === 'small') {
        return state.properties.half === 'upper'
          ? boxes([2, 0, 2, 14, 13, 14])
          : boxes([2, 0, 2, 14, 16, 14]);
      }
      return boxes(LEAF, [5, 0, 5, 11, 11, 11]);
    case 'flower_pot':
      return boxes(POT_BOX);
  }
}

/** The boxes a block of the five types stops the player with. */
export function types3Collision(
  type: SimBlockType3,
  facts: Types3Facts | undefined,
  state: BlockState,
): readonly Box[] {
  const companion = facts?.companion?.kind;
  switch (type) {
    case 'column_plant':
      if (companion === 'shoot') return NO_BOXES;
      if (facts?.column?.style === 'cactus') return boxes([1, 0, 1, 15, 15, 15]);
      if (facts?.column?.style === 'bamboo') return types3Outline(type, facts, state);
      return NO_BOXES;
    case 'dripleaf': {
      if (companion === 'stem' || facts?.dripleaf?.size === 'small') return NO_BOXES;
      const tilt = state.properties.tilt ?? 'none';
      if (tilt === 'full') return NO_BOXES;
      return tilt === 'partial' ? boxes([0, 11, 0, 16, 13, 16]) : boxes(LEAF);
    }
    case 'flower_pot':
      return boxes(POT_BOX);
    default:
      return NO_BOXES;
  }
}
