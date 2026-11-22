/**
 * Grounds (ADR 0087 D1, B405): what the test area starts with. A ground is a block grid of the
 * area's size, in the same shape as the world reader's `WorldArea` (`@msm/interop` `world/`): a
 * palette of block state strings (`palette[0]` is air) and one palette index per cell, indexed
 * `(y * size.z + z) * size.x + x`. {@link LocalWorldSource.loadGround} copies it into the
 * `SimWorld`; vanilla states become props through the catalogue (ADR 0085 L10).
 *
 * Pure and deterministic: no `Date`, no `Math.random`.
 */

import { AREA_SIZE_X, AREA_SIZE_Y, AREA_SIZE_Z, type BlockState } from '../types.js';

/** The grounds Try it offers (ADR 0087 D1). */
export const GROUND_KINDS = Object.freeze(['grid', 'flat', 'quick', 'world', 'generated'] as const);

/** One of {@link GROUND_KINDS}. */
export type GroundKind = (typeof GROUND_KINDS)[number];

/** Air, the first entry of every ground palette. */
export const GROUND_AIR = 'minecraft:air';

/** A ground's blocks: a palette of state strings and one index per cell (see the module comment). */
export interface GroundBlocks {
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  /** Block state strings such as `minecraft:oak_log[axis=y]`; `palette[0]` is air. */
  readonly palette: readonly string[];
  /** One palette index per cell, `(y * size.z + z) * size.x + x`. */
  readonly blocks: Uint16Array;
}

/** The area's size, as every ground uses it. */
export const GROUND_SIZE = Object.freeze({ x: AREA_SIZE_X, y: AREA_SIZE_Y, z: AREA_SIZE_Z });

/**
 * A block state string as a {@link BlockState}: `minecraft:stone`, `stone` (the `minecraft`
 * namespace is added) or `minecraft:oak_stairs[facing=north,half=bottom]`. A malformed property
 * pair is dropped alone.
 */
export function groundState(text: string): BlockState {
  const trimmed = text.trim();
  const bracket = trimmed.indexOf('[');
  const rawName = bracket === -1 ? trimmed : trimmed.slice(0, bracket);
  const name =
    rawName === '' ? GROUND_AIR : rawName.includes(':') ? rawName : `minecraft:${rawName}`;
  const properties: Record<string, string> = {};
  if (bracket !== -1) {
    const inner = trimmed.slice(bracket + 1, trimmed.endsWith(']') ? -1 : undefined);
    for (const pair of inner.split(',')) {
      const equals = pair.indexOf('=');
      if (equals <= 0) continue;
      const key = pair.slice(0, equals).trim();
      const value = pair.slice(equals + 1).trim();
      if (key !== '' && value !== '') properties[key] = value;
    }
  }
  return { name, properties };
}

/** The block id of a state string (`minecraft:oak_log[axis=y]` gives `minecraft:oak_log`). */
export function blockIdOf(text: string): string {
  return groundState(text).name;
}

/** Builds a {@link GroundBlocks} cell by cell. */
export class GroundBuilder {
  readonly size: GroundBlocks['size'];
  private readonly palette: string[] = [GROUND_AIR];
  private readonly index = new Map<string, number>([[GROUND_AIR, 0]]);
  private readonly cells: Uint16Array;

  constructor(size: GroundBlocks['size'] = GROUND_SIZE) {
    this.size = { x: size.x, y: size.y, z: size.z };
    this.cells = new Uint16Array(size.x * size.y * size.z);
  }

  /** Whether `(x, y, z)` is inside the area. */
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.size.x && y < this.size.y && z < this.size.z;
  }

  /** Sets one cell; outside the area it does nothing. */
  set(x: number, y: number, z: number, state: string): void {
    if (!this.inside(x, y, z)) return;
    let slot = this.index.get(state);
    if (slot === undefined) {
      slot = this.palette.length;
      this.palette.push(state);
      this.index.set(state, slot);
    }
    this.cells[(y * this.size.z + z) * this.size.x + x] = slot;
  }

  /** The state string of a cell; air outside the area. */
  get(x: number, y: number, z: number): string {
    if (!this.inside(x, y, z)) return GROUND_AIR;
    return (
      this.palette[this.cells[(y * this.size.z + z) * this.size.x + x] as number] ?? GROUND_AIR
    );
  }

  /** The finished ground (palette entries no cell uses are kept; they cost nothing). */
  build(): GroundBlocks {
    return { size: this.size, palette: [...this.palette], blocks: this.cells.slice() };
  }
}

/** The grid ground: nothing at all, MSM's own floor below (ADR 0085 D7). */
export function emptyGround(): GroundBlocks {
  return new GroundBuilder().build();
}

/** The state string at `(x, y, z)` of a ground; air outside it. */
export function groundStateAt(ground: GroundBlocks, x: number, y: number, z: number): string {
  const { size } = ground;
  if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) return GROUND_AIR;
  return ground.palette[ground.blocks[(y * size.z + z) * size.x + x] as number] ?? GROUND_AIR;
}

/** How many cells of a ground hold each block id (air left out). */
export function countGroundBlocks(ground: GroundBlocks): Map<string, number> {
  const bySlot = new Map<number, number>();
  for (const slot of ground.blocks) {
    if (slot !== 0) bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [slot, count] of bySlot) {
    const id = blockIdOf(ground.palette[slot] ?? GROUND_AIR);
    if (id === GROUND_AIR) continue;
    out.set(id, (out.get(id) ?? 0) + count);
  }
  return out;
}
