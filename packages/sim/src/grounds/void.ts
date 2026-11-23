/**
 * The void ground (ADR 0117 D4, B558): empty sky, with the world setup's start structure
 * centred in the area and lifted off the floor, as a Skyblock island floats over the void.
 * Its area corner is chosen so that the start's world position (`at`, `[0, 64, 0]` by default)
 * lands where the template stands: the lowered functions' world positions (a one block, areas,
 * the start's teleport) then fall inside the area. Without a start the area is centred on
 * `focus` (a one block) or the default `at`.
 *
 * The game places the start at the first join (B551's `start`); Try it has it in the ground so
 * "Clear the area" brings it back, which is the same island the game places once.
 *
 * Pure and deterministic.
 */

import type { BlockPos } from '../types.js';
import { GROUND_SIZE, GroundBuilder } from './ground.js';
import {
  centredCorner,
  type GamesGround,
  keepInPalette,
  placeInto,
  type StructureTemplateBlocks,
} from './structure.js';

/** How high the start structure's base stands above the floor, at most (blocks). */
export const VOID_BASE_Y = 8;

/** Where the start's corner goes when the world setup gives no `at` (ADR 0114 D2). */
export const DEFAULT_START_AT: readonly [number, number, number] = [0, 64, 0];

/** What the void ground is made from. */
export interface VoidGroundOptions {
  /** The start structure, when the world setup names one the project has. */
  readonly template?: StructureTemplateBlocks;
  /** The start's world corner (`start.at`); the default `[0, 64, 0]`. */
  readonly at?: readonly [number, number, number];
  /** Without a template: a world position to centre on (a one block). */
  readonly focus?: readonly [number, number, number];
  /** Block ids to keep in the palette (pictures to prepare: a one block's blocks). */
  readonly keep?: readonly string[];
}

/** The base height of a template `height` blocks tall: {@link VOID_BASE_Y}, lower for tall ones. */
export function voidBaseY(height: number): number {
  return Math.max(0, Math.min(VOID_BASE_Y, GROUND_SIZE.y - height - 2));
}

/** The void ground; see the module comment. */
export function voidGround(options: VoidGroundOptions = {}): GamesGround {
  const builder = new GroundBuilder();
  const at = options.at ?? DEFAULT_START_AT;
  keepInPalette(builder, options.keep ?? []);
  if (options.template !== undefined) {
    const placedAt = centredCorner(options.template.size, voidBaseY(options.template.size[1]));
    const cut = placeInto(builder, options.template, placedAt);
    return { ground: builder.build(), corner: minus(at, placedAt), placedAt, cut };
  }
  const focus = options.focus ?? at;
  const centre: BlockPos = {
    x: Math.floor(GROUND_SIZE.x / 2),
    y: VOID_BASE_Y,
    z: Math.floor(GROUND_SIZE.z / 2),
  };
  return { ground: builder.build(), corner: minus(focus, centre), placedAt: null, cut: false };
}

const minus = (world: readonly [number, number, number], area: BlockPos): BlockPos => ({
  x: world[0] - area.x,
  y: world[1] - area.y,
  z: world[2] - area.z,
});
