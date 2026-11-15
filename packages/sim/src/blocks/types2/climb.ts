/**
 * Climbing (B463, ADR 0101 D5: ladders and vines climbable; B446: scaffolding too), in the game's
 * observable numbers: while the player's feet are in a climbable block, sideways speed is held to
 * 0.15 blocks a tick and falling to 0.15; sneaking holds them in place; walking into a wall or
 * pressing jump lifts them at 0.2 blocks a tick before gravity. Approximate (limit L2): no
 * climbing while flying, and scaffolding's "stand on top unless sneaking" is not simulated.
 */
import type { WorldBox } from '../../player/collide.js';

/** Upward speed when climbing, before gravity, in blocks a tick. */
export const CLIMB_UP_SPEED = 0.2;
/** The fastest fall on a climbable block, in blocks a tick. */
export const CLIMB_MAX_FALL = 0.15;
/** The fastest sideways speed on a climbable block, in blocks a tick. */
export const CLIMB_MAX_SIDEWAYS = 0.15;

/** Whether the block at a position can be climbed. */
export type ClimbCheck = (x: number, y: number, z: number) => boolean;

/** Whether a player with this box is on something climbable: the block their feet are in. */
export function onClimbable(climbable: ClimbCheck, box: WorldBox): boolean {
  const x = Math.floor((box[0] + box[3]) / 2);
  const y = Math.floor(box[1] + 1e-7);
  const z = Math.floor((box[2] + box[5]) / 2);
  return climbable(x, y, z);
}

/** The speed before moving on a climbable block: sideways and falling held, sneaking stops. */
export function climbingVelocity(
  vx: number,
  vy: number,
  vz: number,
  sneak: boolean,
): { vx: number; vy: number; vz: number } {
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
  let y = Math.max(vy, -CLIMB_MAX_FALL);
  if (sneak && y < 0) y = 0;
  return { vx: clamp(vx, CLIMB_MAX_SIDEWAYS), vy: y, vz: clamp(vz, CLIMB_MAX_SIDEWAYS) };
}

/** The upward speed after moving: lifted when the player walked into a wall or jumped. */
export function climbAfterMove(vy: number, intoWall: boolean, jump: boolean): number {
  return intoWall || jump ? CLIMB_UP_SPEED : vy;
}
