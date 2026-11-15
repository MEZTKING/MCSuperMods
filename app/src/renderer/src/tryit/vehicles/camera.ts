/**
 * The driver's view in Try it (B428, ADR 0090 D8): while the player sits in a vehicle the camera
 * rides on the seat, between ticks, with the player's own look. A vehicle with
 * `camera.distance` is seen from behind at that distance, as the runtime's camera modifier
 * does, pulled in where a block stands between the seat and the camera.
 */

import { lookDirection, type Vec3 } from '@msm/sim';
import type { CameraPose } from '../render/camera';

/** How close the third-person camera stays to a block it is pulled in by. */
export const CAMERA_MARGIN = 0.2;
/** The camera never goes below the area's floor. */
const LOWEST_EYE = 0.1;

/** What the driver's view reads from the simulation's vehicles. */
export interface DriverView {
  readonly riding: number | null;
  riderEye(alpha: number): Vec3 | null;
  kindOf(id: number): { readonly cameraDistance?: number } | undefined;
}

/**
 * The camera of a seated player, or `null` when the player walks. `clip(origin, direction,
 * distance)` gives how far the camera may go back before a block (the full distance when
 * nothing is in the way).
 */
export function driverCamera(
  vehicles: DriverView,
  alpha: number,
  look: { readonly yaw: number; readonly pitch: number },
  clip: (origin: Vec3, direction: Vec3, distance: number) => number = (_o, _d, distance) =>
    distance,
): CameraPose | null {
  const id = vehicles.riding;
  if (id === null) return null;
  const seat = vehicles.riderEye(alpha);
  if (seat === null) return null;
  const distance = vehicles.kindOf(id)?.cameraDistance;
  if (distance === undefined || distance <= 0) {
    return { eye: seat, yaw: look.yaw, pitch: look.pitch };
  }
  const forward = lookDirection(look.yaw, look.pitch);
  const back = { x: -forward.x, y: -forward.y, z: -forward.z };
  const room = Math.max(0, Math.min(distance, clip(seat, back, distance) - CAMERA_MARGIN));
  return {
    eye: {
      x: seat.x + back.x * room,
      y: Math.max(LOWEST_EYE, seat.y + back.y * room),
      z: seat.z + back.z * room,
    },
    yaw: look.yaw,
    pitch: look.pitch,
  };
}
