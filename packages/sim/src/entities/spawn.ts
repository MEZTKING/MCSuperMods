/**
 * Spawning and hitting mobs (B393): where a mob hatched against a picked block stands, and which
 * mob a pointing ray hits so a hit can remove it. A hit removes the mob at once: health, damage
 * and drops are only in the game (ADR 0085 D6).
 */
import { adjacentPos } from '../player/pick.js';
import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  type BlockPos,
  type Box,
  type Face,
  type Vec3,
} from '../types.js';
import type { CatalogueEntity } from './catalogue.js';

/** Where to spawn: the picked block and the face pointed at (the floor is y -1, face `up`). */
export interface SpawnAt {
  readonly pos: BlockPos;
  readonly face: Face;
}

/**
 * The feet position of a mob spawned against `at`: the middle of the cell across the face, moved
 * in so that its box stays inside the area. `null` when that cell is outside the area or the mob
 * is wider or taller than the area.
 */
export function spawnPosition(
  entity: Pick<CatalogueEntity, 'width' | 'height'>,
  at: SpawnAt,
): Vec3 | null {
  const cell = adjacentPos(at.pos, at.face);
  if (
    cell.x < 0 ||
    cell.x >= AREA_SIZE_X ||
    cell.z < 0 ||
    cell.z >= AREA_SIZE_Z ||
    cell.y < 0 ||
    cell.y >= AREA_SIZE_Y
  ) {
    return null;
  }
  const half = entity.width / 2;
  if (entity.width > AREA_SIZE_X || entity.width > AREA_SIZE_Z) return null;
  if (cell.y + entity.height > AREA_SIZE_Y) return null;
  const clampInside = (v: number, size: number) => Math.min(size - half, Math.max(half, v));
  return {
    x: clampInside(cell.x + 0.5, AREA_SIZE_X),
    y: cell.y,
    z: clampInside(cell.z + 0.5, AREA_SIZE_Z),
  };
}

/**
 * How far along a ray it enters a world box, or `null` when it misses within `reach` (a ray
 * starting inside the box hits it at 0).
 */
export function rayHitsBox(origin: Vec3, direction: Vec3, box: Box, reach: number): number | null {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len === 0) return null;
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x / len, direction.y / len, direction.z / len];
  let near = 0;
  let far = reach;
  for (let a = 0; a < 3; a++) {
    const oa = o[a] as number;
    const da = d[a] as number;
    const lo = box[a] as number;
    const hi = box[a + 3] as number;
    if (da === 0) {
      if (oa < lo || oa > hi) return null;
      continue;
    }
    const t1 = (lo - oa) / da;
    const t2 = (hi - oa) / da;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}

/** A mob a ray hits. */
export interface EntityHit {
  /** The mob's id. */
  readonly id: number;
  /** How far from the ray's start, in blocks. */
  readonly distance: number;
}

/**
 * The nearest of `boxes` (by mob id) a ray hits within `reach`, or `null`. Ties go to the lower
 * id, so the answer is deterministic.
 */
export function pickEntityBox(
  boxes: Iterable<readonly [id: number, box: Box]>,
  origin: Vec3,
  direction: Vec3,
  reach: number,
): EntityHit | null {
  let best: EntityHit | null = null;
  for (const [id, box] of boxes) {
    const t = rayHitsBox(origin, direction, box, reach);
    if (t === null) continue;
    if (best === null || t < best.distance || (t === best.distance && id < best.id)) {
      best = { id, distance: t };
    }
  }
  return best;
}
