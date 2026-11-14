/**
 * The player's collision against block boxes (plan B388): an axis-aligned box swept one axis at a
 * time against the collision boxes of the blocks around it and the invisible walls of the area.
 * Written for Try it from the game's observable behaviour; it is an approximation (limit L2).
 */

import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  type BlockShapes,
  type BlockState,
  type Box,
} from '../types.js';
import { CEILING_MARGIN } from './constants.js';

/**
 * Reads the block at a whole block position; `null` for air or a position outside the area. A
 * sim world's `get` fits behind it, for example `(x, y, z) => world.get(x, y, z)`.
 */
export type BlockLookup = (x: number, y: number, z: number) => BlockState | null;

/** A box in world coordinates, in blocks: `[minX, minY, minZ, maxX, maxY, maxZ]`. */
export type WorldBox = Box;

/** The movement a sweep allowed, and which axes were stopped. */
export interface SweepResult {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** True when the x movement was cut short. */
  readonly stoppedX: boolean;
  /** True when the y movement was cut short. */
  readonly stoppedY: boolean;
  /** True when the z movement was cut short. */
  readonly stoppedZ: boolean;
}

/** Below this a gap is treated as touching, so rounding never lets a box slip into another. */
const EPSILON = 1e-7;
/** Far enough to stand for "without end" in the walls of the area. */
const FAR = 1e6;

/** The invisible walls around the area (limit L15): the four sides, a floor at y 0 and a ceiling. */
export const AREA_WALLS: readonly WorldBox[] = [
  [-FAR, -FAR, -FAR, 0, FAR, FAR],
  [AREA_SIZE_X, -FAR, -FAR, FAR, FAR, FAR],
  [-FAR, -FAR, -FAR, FAR, FAR, 0],
  [-FAR, -FAR, AREA_SIZE_Z, FAR, FAR, FAR],
  [-FAR, -FAR, -FAR, FAR, 0, FAR],
  [-FAR, AREA_SIZE_Y + CEILING_MARGIN, -FAR, FAR, FAR, FAR],
];

/** Moves a world box by an offset. */
export function offsetBox(box: WorldBox, dx: number, dy: number, dz: number): WorldBox {
  return [box[0] + dx, box[1] + dy, box[2] + dz, box[3] + dx, box[4] + dy, box[5] + dz];
}

/** True when two world boxes overlap by more than a rounding error. */
export function boxesOverlap(a: WorldBox, b: WorldBox): boolean {
  return (
    a[0] < b[3] - EPSILON &&
    a[3] > b[0] + EPSILON &&
    a[1] < b[4] - EPSILON &&
    a[4] > b[1] + EPSILON &&
    a[2] < b[5] - EPSILON &&
    a[5] > b[2] + EPSILON
  );
}

/**
 * The collision boxes in world coordinates of every block that could touch `region`, and the
 * area's walls. One block below the region is included, for boxes taller than a block (a fence).
 * The order is fixed (y, then z, then x), so the result is deterministic.
 */
export function collectObstacles(
  lookup: BlockLookup,
  shapes: BlockShapes,
  region: WorldBox,
): WorldBox[] {
  const out: WorldBox[] = [...AREA_WALLS];
  const x0 = Math.max(0, Math.floor(region[0]));
  const y0 = Math.max(0, Math.floor(region[1]) - 1);
  const z0 = Math.max(0, Math.floor(region[2]));
  const x1 = Math.min(AREA_SIZE_X - 1, Math.floor(region[3]));
  const y1 = Math.min(AREA_SIZE_Y - 1, Math.floor(region[4]));
  const z1 = Math.min(AREA_SIZE_Z - 1, Math.floor(region[5]));
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const state = lookup(x, y, z);
        if (state === null) continue;
        for (const b of shapes.collision(state)) {
          const world = offsetBox(b, x, y, z);
          if (world[3] - world[0] <= 0 || world[4] - world[1] <= 0 || world[5] - world[2] <= 0) {
            continue;
          }
          out.push(world);
        }
      }
    }
  }
  return out;
}

/** An axis: 0 is x, 1 is y, 2 is z. */
type Axis = 0 | 1 | 2;

const OTHER_AXES: Readonly<Record<Axis, readonly Axis[]>> = { 0: [1, 2], 1: [0, 2], 2: [0, 1] };

/** The low side of a box along an axis. */
function lo(box: WorldBox, axis: Axis): number {
  return axis === 0 ? box[0] : axis === 1 ? box[1] : box[2];
}

/** The high side of a box along an axis. */
function hi(box: WorldBox, axis: Axis): number {
  return axis === 0 ? box[3] : axis === 1 ? box[4] : box[5];
}

/**
 * How far `box` may move along one axis (0 x, 1 y, 2 z) by `delta` before it meets `obstacle`.
 * Obstacles it does not share the other two axes with, or already overlaps, do not stop it.
 */
function clipAxis(box: WorldBox, obstacle: WorldBox, axis: Axis, delta: number): number {
  for (const other of OTHER_AXES[axis]) {
    if (
      lo(box, other) >= hi(obstacle, other) - EPSILON ||
      hi(box, other) <= lo(obstacle, other) + EPSILON
    ) {
      return delta;
    }
  }
  if (delta > 0) {
    const gap = lo(obstacle, axis) - hi(box, axis);
    if (gap >= -EPSILON && gap < delta) return Math.max(0, gap);
  } else if (delta < 0) {
    const gap = hi(obstacle, axis) - lo(box, axis);
    if (gap <= EPSILON && gap > delta) return Math.min(0, gap);
  }
  return delta;
}

/** Moves `box` along one axis as far as the obstacles allow. */
function sweepAxis(
  box: WorldBox,
  obstacles: readonly WorldBox[],
  axis: Axis,
  delta: number,
): number {
  if (delta === 0) return 0;
  let allowed = delta;
  for (const obstacle of obstacles) {
    allowed = clipAxis(box, obstacle, axis, allowed);
    if (allowed === 0) return 0;
  }
  return allowed;
}

/**
 * Sweeps `box` by the wanted movement against `obstacles`, y first, then x, then z (a fixed order,
 * so the same input always gives the same result).
 */
export function sweep(
  box: WorldBox,
  dx: number,
  dy: number,
  dz: number,
  obstacles: readonly WorldBox[],
): SweepResult {
  const my = sweepAxis(box, obstacles, 1, dy);
  let moved = offsetBox(box, 0, my, 0);
  const mx = sweepAxis(moved, obstacles, 0, dx);
  moved = offsetBox(moved, mx, 0, 0);
  const mz = sweepAxis(moved, obstacles, 2, dz);
  return {
    dx: mx,
    dy: my,
    dz: mz,
    stoppedX: mx !== dx,
    stoppedY: my !== dy,
    stoppedZ: mz !== dz,
  };
}

/** The region a box covers while it moves by an offset, for gathering obstacles. */
export function sweptRegion(box: WorldBox, dx: number, dy: number, dz: number): WorldBox {
  return [
    Math.min(box[0], box[0] + dx),
    Math.min(box[1], box[1] + dy),
    Math.min(box[2], box[2] + dz),
    Math.max(box[3], box[3] + dx),
    Math.max(box[4], box[4] + dy),
    Math.max(box[5], box[5] + dz),
  ];
}

/** The result of `moveWithStep`: the movement made and what it met. */
export interface MoveResult extends SweepResult {
  /** True when the box came to rest on something below it during this move. */
  readonly landed: boolean;
  /** True when the move climbed a ledge of up to the step height. */
  readonly stepped: boolean;
}

/**
 * Moves the player's box by the wanted movement, stepping up a ledge of at most `stepHeight` when
 * it stands on the ground (or lands this move) and something stops it sideways: the box is raised,
 * moved sideways and lowered again, and that is kept when it went further than the plain move.
 */
export function moveWithStep(
  lookup: BlockLookup,
  shapes: BlockShapes,
  box: WorldBox,
  dx: number,
  dy: number,
  dz: number,
  stepHeight: number,
  onGround: boolean,
): MoveResult {
  const obstacles = collectObstacles(
    lookup,
    shapes,
    sweptRegion(sweptRegion(box, dx, dy, dz), 0, stepHeight, 0),
  );
  const plain = sweep(box, dx, dy, dz, obstacles);
  const plainLanded = dy < 0 && plain.stoppedY;
  const canStep = stepHeight > 0 && (onGround || plainLanded) && (plain.stoppedX || plain.stoppedZ);
  if (!canStep) return { ...plain, landed: plainLanded, stepped: false };

  const up = sweepAxis(box, obstacles, 1, stepHeight);
  let raised = offsetBox(box, 0, up, 0);
  const sx = sweepAxis(raised, obstacles, 0, dx);
  raised = offsetBox(raised, sx, 0, 0);
  const sz = sweepAxis(raised, obstacles, 2, dz);
  raised = offsetBox(raised, 0, 0, sz);
  const downWanted = -up + Math.min(0, dy);
  const down = sweepAxis(raised, obstacles, 1, downWanted);

  const plainDist = plain.dx * plain.dx + plain.dz * plain.dz;
  const stepDist = sx * sx + sz * sz;
  if (stepDist <= plainDist + EPSILON) return { ...plain, landed: plainLanded, stepped: false };
  const stepDy = up + down;
  return {
    dx: sx,
    dy: stepDy,
    dz: sz,
    stoppedX: sx !== dx,
    stoppedY: down !== downWanted,
    stoppedZ: sz !== dz,
    landed: down !== downWanted,
    stepped: stepDy > EPSILON,
  };
}
