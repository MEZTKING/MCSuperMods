/**
 * Directions and the player's look, as block states name them. Yaw and pitch follow
 * `EntitySnapshot`: yaw 0 looks south and 90 west; a negative pitch looks up.
 */
import type { BlockPos, Face } from '../types.js';

/** A horizontal direction. */
export type Horizontal = 'north' | 'east' | 'south' | 'west';

/** Every face, in a fixed order (down, up, north, south, west, east). */
export const FACES: readonly Face[] = Object.freeze([
  'down',
  'up',
  'north',
  'south',
  'west',
  'east',
]);

/** The four horizontal directions, clockwise from north (seen from above). */
export const HORIZONTALS: readonly Horizontal[] = Object.freeze(['north', 'east', 'south', 'west']);

const OFFSETS: Readonly<Record<Face, BlockPos>> = Object.freeze({
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
});

const OPPOSITE: Readonly<Record<Face, Face>> = Object.freeze({
  down: 'up',
  up: 'down',
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
});

/** The block next to `pos` across `face`. */
export function offset(pos: BlockPos, face: Face, distance = 1): BlockPos {
  const step = OFFSETS[face];
  return {
    x: pos.x + step.x * distance,
    y: pos.y + step.y * distance,
    z: pos.z + step.z * distance,
  };
}

/** The opposite direction (horizontal for a horizontal one). */
export function opposite(face: Horizontal): Horizontal;
export function opposite(face: Face): Face;
export function opposite(face: Face): Face {
  return OPPOSITE[face];
}

/** The next horizontal direction clockwise, seen from above (north to east). */
export function clockwise(direction: Horizontal): Horizontal {
  return HORIZONTALS[(HORIZONTALS.indexOf(direction) + 1) % 4] as Horizontal;
}

/** The next horizontal direction counter-clockwise, seen from above (north to west). */
export function counterClockwise(direction: Horizontal): Horizontal {
  return HORIZONTALS[(HORIZONTALS.indexOf(direction) + 3) % 4] as Horizontal;
}

/** The axis of a direction. */
export function axisOf(face: Face): 'x' | 'y' | 'z' {
  if (face === 'up' || face === 'down') return 'y';
  return face === 'north' || face === 'south' ? 'z' : 'x';
}

/** Whether a face is horizontal. */
export const isHorizontal = (face: Face | string): face is Horizontal =>
  face === 'north' || face === 'east' || face === 'south' || face === 'west';

/** The horizontal direction the player looks towards (yaw 0 is south, 90 west). */
export function lookHorizontal(yaw: number): Horizontal {
  const quarter = (((Math.floor(yaw / 90 + 0.5) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return (['south', 'west', 'north', 'east'] as const)[quarter];
}

/** The unit vector of the look. */
export function lookVector(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const yawRad = (yaw * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;
  const flat = Math.cos(pitchRad);
  return { x: -Math.sin(yawRad) * flat, y: -Math.sin(pitchRad), z: Math.cos(yawRad) * flat };
}

/** The direction, of all six, closest to where the player looks. */
export function lookNearest(yaw: number, pitch: number): Face {
  const look = lookVector(yaw, pitch);
  const ax = Math.abs(look.x);
  const ay = Math.abs(look.y);
  const az = Math.abs(look.z);
  if (ay > ax && ay > az) return look.y > 0 ? 'up' : 'down';
  if (ax > az) return look.x > 0 ? 'east' : 'west';
  return look.z > 0 ? 'south' : 'north';
}
