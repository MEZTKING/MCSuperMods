/**
 * The structure ground (ADR 0117 D4, B558): one of the project's structure templates as the
 * ground, centred on the area and standing on its floor, cut at the area's edges (limit M14).
 * The area's corner in the world is chosen so that the template stands where the game puts it:
 * at the corner a games area rebuilds it from, or the world setup starts on, else with its own
 * corner at the world's 0, 0, 0.
 *
 * Also the shared template reader: {@link templateCells} walks a template's blocks, which the
 * void ground and the function engine's `place template` (B558) place.
 *
 * Pure and deterministic.
 */

import type { BlockPos } from '../types.js';
import { GROUND_AIR, GROUND_SIZE, type GroundBlocks, GroundBuilder } from './ground.js';

/** A structure template's blocks, as the `minecraft:structure_template` element holds them. */
export interface StructureTemplateBlocks {
  /** `[x, y, z]`. */
  readonly size: readonly [number, number, number];
  /** Block state strings (`minecraft:oak_log[axis=y]`). */
  readonly palette: readonly string[];
  /** `[x, y, z, paletteIndex]`; a position left out is structure void (nothing is placed). */
  readonly blocks: readonly (readonly [number, number, number, number])[];
}

/** A games ground: its blocks and where the area's corner stands in the world. */
export interface GamesGround {
  readonly ground: GroundBlocks;
  /** The world position of the area's block 0, 0, 0 (the function engine's `corner`). */
  readonly corner: BlockPos;
  /** Where the template's corner went in the area, or `null` without a template. */
  readonly placedAt: BlockPos | null;
  /** True when part of the template lies outside the area (limit M14). */
  readonly cut: boolean;
}

/** Reads a template from element data; `undefined` when it is not one. */
export function readTemplate(data: unknown): StructureTemplateBlocks | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const object = data as Record<string, unknown>;
  const size = object.size;
  const palette = object.palette;
  const blocks = object.blocks;
  if (!Array.isArray(size) || size.length !== 3 || !size.every((n) => Number.isInteger(n))) {
    return undefined;
  }
  if (!Array.isArray(palette) || !Array.isArray(blocks)) return undefined;
  return {
    size: [size[0], size[1], size[2]] as [number, number, number],
    palette: palette.map((entry) => (typeof entry === 'string' ? entry : GROUND_AIR)),
    blocks: blocks.filter(
      (entry): entry is [number, number, number, number] =>
        Array.isArray(entry) && entry.length === 4 && entry.every((n) => Number.isInteger(n)),
    ),
  };
}

/** Each block of a template with its state string, at `corner` plus its own position. */
export function* templateCells(
  template: StructureTemplateBlocks,
  corner: BlockPos,
): Generator<{ readonly pos: BlockPos; readonly state: string }> {
  for (const [x, y, z, index] of template.blocks) {
    const state = template.palette[index];
    if (state === undefined) continue;
    yield { pos: { x: corner.x + x, y: corner.y + y, z: corner.z + z }, state };
  }
}

/** Places a template into a ground builder at `corner`; true when some of it was cut off. */
export function placeInto(
  builder: GroundBuilder,
  template: StructureTemplateBlocks,
  corner: BlockPos,
): boolean {
  let cut = false;
  for (const { pos, state } of templateCells(template, corner)) {
    if (!builder.inside(pos.x, pos.y, pos.z)) {
      cut = true;
      continue;
    }
    builder.set(pos.x, pos.y, pos.z, state);
  }
  return cut;
}

/** Where a template of `size` goes to be centred in x and z at height `y`. */
export function centredCorner(size: readonly [number, number, number], y: number): BlockPos {
  return {
    x: Math.floor((GROUND_SIZE.x - size[0]) / 2),
    y,
    z: Math.floor((GROUND_SIZE.z - size[2]) / 2),
  };
}

/**
 * The structure ground: `template` centred on the floor. `worldCorner` is where the game places
 * the template's corner (an area's rebuild, the world setup's start); without it the template's
 * corner is the world's 0, 0, 0. `keep` lists block ids to hold in the palette (props to draw
 * later, such as a one block's blocks).
 */
export function structureGround(
  template: StructureTemplateBlocks,
  worldCorner: BlockPos = { x: 0, y: 0, z: 0 },
  keep: readonly string[] = [],
): GamesGround {
  const builder = new GroundBuilder();
  const placedAt = centredCorner(template.size, 0);
  const cut = placeInto(builder, template, placedAt);
  keepInPalette(builder, keep);
  return {
    ground: builder.build(),
    corner: {
      x: worldCorner.x - placedAt.x,
      y: worldCorner.y - placedAt.y,
      z: worldCorner.z - placedAt.z,
    },
    placedAt,
    cut,
  };
}

/**
 * Adds block ids to a builder's palette without placing them (a palette entry no cell uses
 * costs nothing), so the view prepares their pictures with the ground's.
 */
export function keepInPalette(builder: GroundBuilder, ids: readonly string[]): void {
  for (const id of ids) builder.keep(id);
}
