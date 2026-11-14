/**
 * Pointing at blocks (plan B388): a ray from the eye against the outline boxes of the blocks it
 * passes, up to the reach. Gives the block, the face and the point hit, as `PlayerAction`'s
 * `place` and `use` want them.
 */

import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  type BlockPos,
  type BlockShapes,
  type Face,
  type Vec3,
} from '../types.js';
import type { BlockLookup } from './collide.js';
import { REACH } from './constants.js';

/** What a pointing ray hit. */
export interface PickResult {
  /** The block hit. */
  readonly pos: BlockPos;
  /** The face of the box that was hit, named by the direction it looks. */
  readonly face: Face;
  /** Where the ray hit, relative to the block's corner (0 to 1 inside the block). */
  readonly hit: Vec3;
  /** Where the ray hit, in world coordinates. */
  readonly point: Vec3;
  /** How far from the ray's start the hit is, in blocks. */
  readonly distance: number;
  /** Which of the block's outline boxes was hit (its index in `BlockShapes.outline`). */
  readonly box: number;
}

/** The step to the neighbour a face looks at. */
export function faceOffset(face: Face): BlockPos {
  switch (face) {
    case 'down':
      return { x: 0, y: -1, z: 0 };
    case 'up':
      return { x: 0, y: 1, z: 0 };
    case 'north':
      return { x: 0, y: 0, z: -1 };
    case 'south':
      return { x: 0, y: 0, z: 1 };
    case 'west':
      return { x: -1, y: 0, z: 0 };
    case 'east':
      return { x: 1, y: 0, z: 0 };
  }
}

/** The block next to `pos` across `face`: where a block placed against that face goes. */
export function adjacentPos(pos: BlockPos, face: Face): BlockPos {
  const o = faceOffset(face);
  return { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z };
}

/**
 * The unit direction of a look: yaw in degrees (0 faces south, +z; 90 faces west, -x) and pitch
 * in degrees (negative looks up).
 */
export function lookDirection(yaw: number, pitch: number): Vec3 {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const cp = Math.cos(p);
  return { x: -Math.sin(y) * cp, y: -Math.sin(p), z: Math.cos(y) * cp };
}

const FACES_BY_AXIS: readonly (readonly [Face, Face])[] = [
  ['west', 'east'],
  ['down', 'up'],
  ['north', 'south'],
];

/**
 * Where a ray enters a box: the distance along the ray and the face, or `null` when it misses or
 * starts inside the box.
 */
function rayBox(
  o: readonly [number, number, number],
  d: readonly [number, number, number],
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  maxT: number,
): { t: number; face: Face } | null {
  let tNear = Number.NEGATIVE_INFINITY;
  let tFar = Number.POSITIVE_INFINITY;
  let face: Face = 'up';
  for (let a = 0; a < 3; a++) {
    const oa = o[a] as number;
    const da = d[a] as number;
    const lo = min[a] as number;
    const hi = max[a] as number;
    const faces = FACES_BY_AXIS[a] as readonly [Face, Face];
    if (da === 0) {
      if (oa < lo || oa > hi) return null;
      continue;
    }
    const t1 = (lo - oa) / da;
    const t2 = (hi - oa) / da;
    const near = Math.min(t1, t2);
    const far = Math.max(t1, t2);
    if (near > tNear) {
      tNear = near;
      face = da > 0 ? faces[0] : faces[1];
    }
    if (far < tFar) tFar = far;
    if (tNear > tFar) return null;
  }
  if (tNear < 0 || tNear > maxT || tFar < 0) return null;
  return { t: tNear, face };
}

/**
 * Casts a ray from `origin` along `direction` (need not be unit length) and returns the nearest
 * outline box hit within `reach` blocks, or `null`. Blocks are visited in the order the ray passes
 * them; outline boxes that reach outside their own block are hit only where the ray passes that block.
 */
export function pick(
  lookup: BlockLookup,
  shapes: BlockShapes,
  origin: Vec3,
  direction: Vec3,
  reach: number = REACH,
): PickResult | null {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len === 0) return null;
  const d: [number, number, number] = [direction.x / len, direction.y / len, direction.z / len];
  const o: [number, number, number] = [origin.x, origin.y, origin.z];
  const size = [AREA_SIZE_X, AREA_SIZE_Y, AREA_SIZE_Z] as const;

  const cell: [number, number, number] = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  const step: [number, number, number] = [0, 0, 0];
  const tMax: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const tDelta: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  for (let a = 0; a < 3; a++) {
    const da = d[a] as number;
    const c = cell[a] as number;
    const oa = o[a] as number;
    if (da > 0) {
      step[a] = 1;
      tMax[a] = (c + 1 - oa) / da;
      tDelta[a] = 1 / da;
    } else if (da < 0) {
      step[a] = -1;
      tMax[a] = (oa - c) / -da;
      tDelta[a] = 1 / -da;
    }
  }

  let best: PickResult | null = null;
  let tEnter = 0;
  while (tEnter <= reach && (best === null || tEnter <= best.distance)) {
    const [cx, cy, cz] = cell;
    if (cx >= 0 && cy >= 0 && cz >= 0 && cx < size[0] && cy < size[1] && cz < size[2]) {
      const state = lookup(cx, cy, cz);
      if (state !== null) {
        const boxes = shapes.outline(state);
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (b === undefined) continue;
          const hitBox = rayBox(
            o,
            d,
            [cx + b[0], cy + b[1], cz + b[2]],
            [cx + b[3], cy + b[4], cz + b[5]],
            reach,
          );
          if (hitBox === null || (best !== null && hitBox.t >= best.distance)) continue;
          const px = o[0] + d[0] * hitBox.t;
          const py = o[1] + d[1] * hitBox.t;
          const pz = o[2] + d[2] * hitBox.t;
          best = {
            pos: { x: cx, y: cy, z: cz },
            face: hitBox.face,
            hit: { x: px - cx, y: py - cy, z: pz - cz },
            point: { x: px, y: py, z: pz },
            distance: hitBox.t,
            box: i,
          };
        }
      }
    }
    // Step to the next block along the axis whose boundary comes first (x before y before z on a tie).
    let axis = 0;
    if ((tMax[1] as number) < (tMax[axis] as number)) axis = 1;
    if ((tMax[2] as number) < (tMax[axis] as number)) axis = 2;
    tEnter = tMax[axis] as number;
    if (!Number.isFinite(tEnter)) break;
    cell[axis] = (cell[axis] as number) + (step[axis] as number);
    tMax[axis] = tEnter + (tDelta[axis] as number);
  }
  return best;
}
