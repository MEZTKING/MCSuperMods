/**
 * Boxes of whole blocks for the jigsaw assembler (B637; spike B634 rules J9, J10, J12, J13).
 * Both corners inclusive, as `PieceBox` says. Pure.
 */

import type { PieceBox } from './api';

/** A position or a vector of whole blocks. */
export type Vec3 = readonly [number, number, number];

/** A box moved by `offset`. */
export function boxAt(box: PieceBox, offset: Vec3): PieceBox {
  return {
    minX: box.minX + offset[0],
    minY: box.minY + offset[1],
    minZ: box.minZ + offset[2],
    maxX: box.maxX + offset[0],
    maxY: box.maxY + offset[1],
    maxZ: box.maxZ + offset[2],
  };
}

/** The smallest box holding both. */
export function unionBox(a: PieceBox, b: PieceBox): PieceBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

/** Whether the two boxes share at least one block. */
export function intersects(a: PieceBox, b: PieceBox): boolean {
  return (
    a.minX <= b.maxX &&
    b.minX <= a.maxX &&
    a.minY <= b.maxY &&
    b.minY <= a.maxY &&
    a.minZ <= b.maxZ &&
    b.minZ <= a.maxZ
  );
}

/** Whether `inner` lies wholly inside `outer` (touching the walls counts as inside). */
export function contains(outer: PieceBox, inner: PieceBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY &&
    inner.minZ >= outer.minZ &&
    inner.maxZ <= outer.maxZ
  );
}

/**
 * The start box's centre in x and z (J12): `(min + max) / 2` by integer division that truncates
 * toward zero, as the spike's `chain4_d17` showed (a 4-wide start splits by the sign of the sum).
 */
export function horizontalCentre(box: PieceBox): readonly [number, number] {
  return [Math.trunc((box.minX + box.maxX) / 2), Math.trunc((box.minZ + box.maxZ) / 2)];
}

/** J12: every block of the box within the centre ± `limit` in x and in z, inclusive. */
export function withinHorizontal(
  box: PieceBox,
  centre: readonly [number, number],
  limit: number,
): boolean {
  return (
    box.minX >= centre[0] - limit &&
    box.maxX <= centre[0] + limit &&
    box.minZ >= centre[1] - limit &&
    box.maxZ <= centre[1] + limit
  );
}

/** J13: every block of the box within the start height ± `limit`, inclusive. */
export function withinVertical(box: PieceBox, startY: number, limit: number): boolean {
  return box.minY >= startY - limit && box.maxY <= startY + limit;
}

const CELL = 32;

/**
 * The placed boxes, bucketed by 32 by 32 columns, so an overlap test reads only the boxes near
 * the new one (a lattice of 841 pieces is tried thousands of times).
 */
export class BoxIndex {
  private readonly cells = new Map<string, number[]>();
  private readonly boxes: PieceBox[] = [];

  /** Adds a box under `id` (the piece's number). */
  insert(id: number, box: PieceBox): void {
    this.boxes[id] = box;
    for (const key of cellKeys(box)) {
      const list = this.cells.get(key);
      if (list) list.push(id);
      else this.cells.set(key, [id]);
    }
  }

  /** The ids of every placed box that shares a block with `box`, each once, in number order. */
  intersecting(box: PieceBox): number[] {
    const found = new Set<number>();
    for (const key of cellKeys(box)) {
      const list = this.cells.get(key);
      if (!list) continue;
      for (const id of list) {
        if (found.has(id)) continue;
        const other = this.boxes[id];
        if (other && intersects(other, box)) found.add(id);
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  /** The box stored under `id`. */
  box(id: number): PieceBox | undefined {
    return this.boxes[id];
  }
}

function* cellKeys(box: PieceBox): Generator<string> {
  const x0 = Math.floor(box.minX / CELL);
  const x1 = Math.floor(box.maxX / CELL);
  const z0 = Math.floor(box.minZ / CELL);
  const z1 = Math.floor(box.maxZ / CELL);
  for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) yield `${x},${z}`;
}
