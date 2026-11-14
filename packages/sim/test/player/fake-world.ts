/** A small fake world and fake `BlockShapes` for the player tests: full cubes, slabs, stairs and doors. */

import type { BlockLookup } from '../../src/player/index.js';
import type { BlockShapes, BlockState, Box } from '../../src/types.js';

export const FULL: Box = [0, 0, 0, 1, 1, 1];
export const BOTTOM_SLAB: Box = [0, 0, 0, 1, 0.5, 1];
/** A closed door's thin box along the block's north side. */
export const DOOR_NORTH: Box = [0, 0, 0, 1, 1, 0.1875];
/** An open door's thin box along the block's west side. */
export const DOOR_WEST: Box = [0, 0, 0, 0.1875, 1, 1];

export const STONE: BlockState = { name: 'test:stone', properties: {} };
export const SLAB: BlockState = { name: 'test:slab', properties: { type: 'bottom' } };
/** A stair rising towards the east. */
export const STAIR_EAST: BlockState = { name: 'test:stair', properties: { facing: 'east' } };

export function door(half: 'lower' | 'upper', open = false): BlockState {
  return { name: 'test:door', properties: { half, open: String(open) } };
}

function boxesOf(state: BlockState): readonly Box[] {
  switch (state.name) {
    case 'test:stone':
      return [FULL];
    case 'test:slab':
      return [BOTTOM_SLAB];
    case 'test:stair':
      return [BOTTOM_SLAB, [0.5, 0.5, 0, 1, 1, 1]];
    case 'test:door':
      return [state.properties.open === 'true' ? DOOR_WEST : DOOR_NORTH];
    case 'test:flower':
      return [];
    default:
      return [FULL];
  }
}

export const SHAPES: BlockShapes = {
  collision: (state) => boxesOf(state),
  outline: (state) =>
    state.name === 'test:flower' ? [[0.3, 0, 0.3, 0.7, 0.6, 0.7]] : boxesOf(state),
};

/** A world with a stone floor at y 0 (unless `floor` is false) and the given blocks above it. */
export class FakeWorld {
  private readonly blocks = new Map<string, BlockState>();
  private readonly floor: boolean;

  constructor(floor = true) {
    this.floor = floor;
  }

  set(x: number, y: number, z: number, state: BlockState): this {
    this.blocks.set(`${x},${y},${z}`, state);
    return this;
  }

  readonly lookup: BlockLookup = (x, y, z) => {
    const placed = this.blocks.get(`${x},${y},${z}`);
    if (placed !== undefined) return placed;
    return this.floor && y === 0 ? STONE : null;
  };
}
