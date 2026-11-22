/**
 * The ground "My world generation" (ADR 0119 D8, B584): a window cut from the world a project
 * dimension or world preset generates. The generation itself runs in the app's terrain worker
 * (`@msm/terrain`); this module holds the pure parts the area needs around it:
 *
 * - **The window.** 48 by 48 blocks and 32 high (the area's size, limit WL8; reserve B594 holds),
 *   its x and z aligned to whole chunks (3 by 3), its height placed so the surface at the centre
 *   sits a third of the way up, kept inside the world's own heights. **Move up** and **Move down**
 *   shift it by {@link GENERATED_MOVE_BLOCKS}; **Make the land around me** centres it again.
 * - **The engine's columns as a ground.** The engine's `buildColumns` already gives the ground's
 *   layout (palette `[0]` air, `(y * sizeZ + z) * sizeX + x`); {@link generatedGround} checks it
 *   and copies it into the area's size.
 * - **Keeping the user's blocks.** Changes the user made are kept by world position
 *   ({@link GroundEdit}); when the land is made again (an edit, a new stage, a moved window) they
 *   are laid over it where they still fit ({@link applyEdits}): a placed block where the new land
 *   is air (or already that block), a broken block always. The rest are counted, never silent.
 * - **Standing.** {@link liftedFeet} lifts the player out of land that grew over them.
 *
 * Pure and deterministic: no `Date`, no `Math.random`.
 */

import type { Vec3 } from '../types.js';
import { GROUND_AIR, GROUND_SIZE, type GroundBlocks } from './ground.js';

/** Blocks along one side of a chunk. */
export const CHUNK_BLOCKS = 16;

/** How far Move up and Move down shift the window, in blocks (half its height). */
export const GENERATED_MOVE_BLOCKS = 16;

/** The window's part of the world: its lowest corner in world blocks and its size. */
export interface GeneratedWindow {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/** The heights a world has (its dimension type's `min_y` and `height`). */
export interface WorldHeights {
  readonly minY: number;
  readonly height: number;
}

/** The window's lowest y for a surface at `surfaceY`: a third of the way up, inside the world. */
export function windowY0(surfaceY: number, heights: WorldHeights): number {
  const wanted = Math.round(surfaceY) - Math.floor(GROUND_SIZE.y / 3);
  return clampY0(wanted, heights);
}

/** `y0` kept so the whole window lies inside the world's heights (or at its floor when shorter). */
export function clampY0(y0: number, heights: WorldHeights): number {
  const highest = heights.minY + heights.height - GROUND_SIZE.y;
  return Math.max(heights.minY, Math.min(Math.max(heights.minY, highest), Math.round(y0)));
}

/**
 * The window around block `(x, z)`: the chunk holding it and one chunk on each side (3 by 3),
 * with the surface there (`surfaceY`, or `null` when not known: the sea level) a third of the way
 * up.
 */
export function windowAround(
  centre: { readonly x: number; readonly z: number },
  surfaceY: number | null,
  heights: WorldHeights & { readonly seaLevel: number },
): GeneratedWindow {
  const chunksX = Math.max(1, Math.round(GROUND_SIZE.x / CHUNK_BLOCKS));
  const chunksZ = Math.max(1, Math.round(GROUND_SIZE.z / CHUNK_BLOCKS));
  const x0 = (Math.floor(centre.x / CHUNK_BLOCKS) - Math.floor(chunksX / 2)) * CHUNK_BLOCKS;
  const z0 = (Math.floor(centre.z / CHUNK_BLOCKS) - Math.floor(chunksZ / 2)) * CHUNK_BLOCKS;
  return {
    x0,
    y0: windowY0(surfaceY ?? heights.seaLevel, heights),
    z0,
    sizeX: GROUND_SIZE.x,
    sizeY: GROUND_SIZE.y,
    sizeZ: GROUND_SIZE.z,
  };
}

/** The window moved up (`dy > 0`) or down, kept inside the world; the same one at either end. */
export function shiftWindow(
  window: GeneratedWindow,
  dy: number,
  heights: WorldHeights,
): GeneratedWindow {
  return { ...window, y0: clampY0(window.y0 + dy, heights) };
}

/** The block at the middle of the window, in world blocks (where its surface is measured). */
export function windowCentre(window: GeneratedWindow): { x: number; z: number } {
  return {
    x: window.x0 + Math.floor(window.sizeX / 2),
    z: window.z0 + Math.floor(window.sizeZ / 2),
  };
}

/** Whether two windows are the same part of the world. */
export function sameWindow(a: GeneratedWindow | null, b: GeneratedWindow | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.x0 === b.x0 &&
    a.y0 === b.y0 &&
    a.z0 === b.z0 &&
    a.sizeX === b.sizeX &&
    a.sizeY === b.sizeY &&
    a.sizeZ === b.sizeZ
  );
}

/** The engine's columns (`@msm/terrain` `buildColumns`), as far as this module reads them. */
export interface ColumnBlocks {
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
}

/**
 * The engine's columns as a ground of the area's size: the same layout, copied (the answer's
 * array may be handed out again); a window of another size is cut or padded with air, and a
 * palette whose first entry is not air gets air put first.
 */
export function generatedGround(columns: ColumnBlocks): GroundBlocks {
  const { size } = columns;
  const out = GROUND_SIZE;
  const airFirst = columns.palette[0] === GROUND_AIR;
  const palette = airFirst ? [...columns.palette] : [GROUND_AIR, ...columns.palette];
  const shift = airFirst ? 0 : 1;
  const expected = size.x * size.y * size.z;
  if (
    size.x === out.x &&
    size.y === out.y &&
    size.z === out.z &&
    shift === 0 &&
    columns.blocks.length === expected
  ) {
    return { size: { ...out }, palette, blocks: columns.blocks.slice() };
  }
  const blocks = new Uint16Array(out.x * out.y * out.z);
  for (let y = 0; y < Math.min(size.y, out.y); y += 1) {
    for (let z = 0; z < Math.min(size.z, out.z); z += 1) {
      for (let x = 0; x < Math.min(size.x, out.x); x += 1) {
        const slot = columns.blocks[(y * size.z + z) * size.x + x] ?? 0;
        blocks[(y * out.z + z) * out.x + x] = slot === 0 && airFirst ? 0 : slot + shift;
      }
    }
  }
  return { size: { ...out }, palette, blocks };
}

/** Whether land reaches the window's top layer (limit WL8: tall land is cut there). */
export function cutAtTop(ground: GroundBlocks): boolean {
  const { size } = ground;
  const start = (size.y - 1) * size.z * size.x;
  for (let i = start; i < start + size.z * size.x; i += 1) {
    const slot = ground.blocks[i] ?? 0;
    if (slot !== 0 && ground.palette[slot] !== GROUND_AIR) return true;
  }
  return false;
}

/** One change the user made to the area, by world position: a state string, or `null` (broken). */
export interface GroundEdit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly state: string | null;
}

/** The text key of a world position, for a map of edits. */
export const editKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** The world position of an area cell in a window. */
export function worldOf(
  window: GeneratedWindow,
  pos: { readonly x: number; readonly y: number; readonly z: number },
): { x: number; y: number; z: number } {
  return { x: pos.x + window.x0, y: pos.y + window.y0, z: pos.z + window.z0 };
}

/** What {@link applyEdits} did. */
export interface EditsApplied {
  /** The land with the user's changes laid over it. */
  readonly ground: GroundBlocks;
  /** The edits still held: every one but those that no longer fit. */
  readonly kept: readonly GroundEdit[];
  /** Placed blocks whose cell the new land now fills with something else (dropped). */
  readonly lost: number;
  /** Edits outside the window (held for when it comes back). */
  readonly outside: number;
}

/**
 * Lays the user's changes over newly made land: a placed block goes in where the new land is air
 * or already that block, else it is dropped and counted as lost; a broken block is broken again.
 * Edits outside the window are held and counted.
 */
export function applyEdits(
  ground: GroundBlocks,
  window: GeneratedWindow,
  edits: readonly GroundEdit[],
): EditsApplied {
  const { size } = ground;
  const palette = [...ground.palette];
  const slots = new Map<string, number>();
  palette.forEach((state, slot) => {
    if (!slots.has(state)) slots.set(state, slot);
  });
  const slotOf = (state: string): number => {
    let slot = slots.get(state);
    if (slot === undefined) {
      slot = palette.length;
      palette.push(state);
      slots.set(state, slot);
    }
    return slot;
  };
  const blocks = ground.blocks.slice();
  const kept: GroundEdit[] = [];
  let lost = 0;
  let outside = 0;
  for (const edit of edits) {
    const x = edit.x - window.x0;
    const y = edit.y - window.y0;
    const z = edit.z - window.z0;
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) {
      outside += 1;
      kept.push(edit);
      continue;
    }
    const index = (y * size.z + z) * size.x + x;
    if (edit.state === null) {
      blocks[index] = 0;
      kept.push(edit);
      continue;
    }
    const now = palette[blocks[index] ?? 0] ?? GROUND_AIR;
    if (now === GROUND_AIR || now === edit.state) {
      blocks[index] = slotOf(edit.state);
      kept.push(edit);
    } else {
      lost += 1;
    }
  }
  return { ground: { size: { ...size }, palette, blocks }, kept, lost, outside };
}

/** The "What happened" line for edits that did not fit or are out of the window, or `null`. */
export function editsLine(lost: number, outside: number): string | null {
  const parts: string[] = [];
  if (lost > 0) {
    parts.push(
      `${lost} block${lost === 1 ? '' : 's'} you placed ${lost === 1 ? 'is' : 'are'} gone: the new land fills ${lost === 1 ? 'its place' : 'their places'}`,
    );
  }
  if (outside > 0) {
    parts.push(
      `${outside} change${outside === 1 ? '' : 's'} of yours ${outside === 1 ? 'is' : 'are'} outside the window now and ${outside === 1 ? 'comes' : 'come'} back when it does`,
    );
  }
  if (parts.length === 0) return null;
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * Where the player's feet go after the land changed: where they are when the feet and head are
 * free, else the lowest y above that has two free cells over the column (the new surface). Inside
 * an area of `sizeY` cells; above it the feet stay at the top.
 */
export function liftedFeet(
  feet: Vec3,
  solid: (x: number, y: number, z: number) => boolean,
  sizeY: number,
): Vec3 {
  const x = Math.floor(feet.x);
  const z = Math.floor(feet.z);
  const free = (y: number): boolean => y >= sizeY || (y >= 0 && !solid(x, y, z));
  // Feet on a slab stand half a block up: the cell they are in is the one above it.
  const y0 = Math.floor(feet.y + 0.5);
  if (free(y0) && free(y0 + 1)) return feet;
  for (let y = y0 + 1; y <= sizeY; y += 1) {
    if (free(y) && free(y + 1)) return { x: feet.x, y, z: feet.z };
  }
  return { x: feet.x, y: sizeY, z: feet.z };
}
