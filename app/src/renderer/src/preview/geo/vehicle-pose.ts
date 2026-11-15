/**
 * The Vehicle Studio's preview pose (B419, ADR 0091 D1): which bones of a vehicle's geometry
 * turn, and how, for a turret aimed at the mouse, wheels and rotors spun by a "Drive" slider and
 * steering bones turned by a "Steer" slider. Pure: no gl-matrix, no DOM, so the Studio can test it
 * and the canvas only multiplies the result through `boneMatrices`.
 *
 * Conventions (ADR 0090 D2, the B414 starter geometries):
 *
 * - Vehicle space counts blocks with x to the vehicle's right, y up and z forwards; the model's
 *   front is north (-z in model units), so a vehicle point `[x, y, z]` is model point
 *   `[-16x, 16y, -16z]` before the geo preview's own x flip (scene point `[16x, 16y, -16z]`).
 * - Yaw is in degrees, 0 straight ahead and positive to the right (clockwise seen from above), as
 *   the game's yaw relative to the hull; pitch is in degrees with negative up, as the game's.
 * - A bone's added Bedrock rotation is `[pitch, yaw, roll]` for these conventions: a turret's yaw
 *   is its y rotation, a barrel's pitch its x rotation.
 *
 * @packageDocumentation
 */

import type { BonePose, Vec3 } from './geometry';

/** The bones a vehicle's data turns, read from `turret` and `parts` (ADR 0090 D7, D10). */
export interface VehicleRig {
  /** The turret, when the vehicle has one with a bone. */
  turret: {
    bone: string;
    pitchBone: string | null;
    /** `[min, max]` yaw relative to the hull, or `null` for all the way round. */
    yawLimit: readonly [number, number] | null;
    /** `[min, max]` pitch (negative up), or `null` for any. */
    pitchLimit: readonly [number, number] | null;
  } | null;
  wheels: readonly string[];
  /** Wheel radius in blocks (0.5 by default). */
  wheelRadius: number;
  steering: readonly string[];
  rotors: readonly string[];
  propellers: readonly string[];
}

/** What the preview has driven so far. */
export interface VehiclePoseState {
  /** The turret's yaw relative to the hull, in degrees (positive right). */
  turretYaw: number;
  /** The barrel's pitch, in degrees (negative up). */
  turretPitch: number;
  /** Blocks driven, for the wheels. */
  distance: number;
  /** Steering from -1 (full left) to 1 (full right). */
  steer: number;
  /** The rotors' and propellers' angle in degrees. */
  spin: number;
}

/** The pose at rest: turret ahead, nothing driven. */
export const REST_POSE_STATE: Readonly<VehiclePoseState> = Object.freeze({
  turretYaw: 0,
  turretPitch: 0,
  distance: 0,
  steer: 0,
  spin: 0,
});

/** The default wheel radius of `parts.wheel_radius`, in blocks. */
export const DEFAULT_WHEEL_RADIUS = 0.5;
/** How far steering bones turn at full lock, in degrees. */
export const MAX_STEER_DEGREES = 30;
/** Rotor and propeller turns a second at full throttle. */
export const SPIN_TURNS_PER_SECOND = 3;
/** Model units (pixels) per block. */
export const PIXELS_PER_BLOCK = 16;

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : [];

const pair = (value: unknown): readonly [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a <= b ? [a, b] : [b, a];
};

/** Reads the rig of a vehicle's element or definition data; anything malformed is left out. */
export function vehicleRig(data: unknown): VehicleRig {
  const object = record(data) ?? {};
  const turret = record(object.turret);
  const parts = record(object.parts) ?? {};
  const bone = typeof turret?.bone === 'string' && turret.bone !== '' ? turret.bone : null;
  const radius = parts.wheel_radius;
  return {
    turret:
      bone === null
        ? null
        : {
            bone,
            pitchBone:
              typeof turret?.pitch_bone === 'string' && turret.pitch_bone !== ''
                ? turret.pitch_bone
                : null,
            yawLimit: pair(turret?.yaw_limit),
            pitchLimit: pair(turret?.pitch_limit),
          },
    wheels: names(parts.wheels),
    wheelRadius:
      typeof radius === 'number' && Number.isFinite(radius) && radius > 0
        ? radius
        : DEFAULT_WHEEL_RADIUS,
    steering: names(parts.steering),
    rotors: names(parts.rotors),
    propellers: names(parts.propellers),
  };
}

/** `degrees` wrapped into -180 (exclusive) to 180 (inclusive). */
export function wrapDegrees(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * The yaw (degrees, positive right, 0 ahead) from `pivot` towards `point`, both in vehicle
 * space (blocks, x right, z forwards); 0 when the two meet.
 */
export function aimYaw(point: { x: number; z: number }, pivot: { x: number; z: number }): number {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

/** `yaw` kept within `limit` (`[min, max]`), or wrapped when there is no limit. */
export function clampYaw(yaw: number, limit: readonly [number, number] | null): number {
  const wrapped = wrapDegrees(yaw);
  if (limit === null) return wrapped;
  return Math.min(limit[1], Math.max(limit[0], wrapped));
}

/** `pitch` kept within `limit`, or within -90 to 90 when there is none. */
export function clampPitch(pitch: number, limit: readonly [number, number] | null): number {
  const [min, max] = limit ?? [-90, 90];
  return Math.min(max, Math.max(min, pitch));
}

/** The wheels' roll in degrees after `distance` blocks on wheels of `radius` blocks. */
export function wheelSpinDegrees(distance: number, radius: number): number {
  if (!(radius > 0)) return 0;
  return wrapDegrees(((distance / radius) * 180) / Math.PI);
}

/**
 * The state after `seconds` of driving with `throttle` (-1 to 1) at `maxSpeed` blocks a tick:
 * the wheels roll the distance (20 ticks a second), rotors and propellers spin with throttle,
 * and the turret and steering are left as they are.
 */
export function advanceDrive(
  state: VehiclePoseState,
  seconds: number,
  throttle: number,
  maxSpeed: number,
): VehiclePoseState {
  const clamped = Math.max(-1, Math.min(1, throttle));
  const speed = Number.isFinite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 0;
  return {
    ...state,
    distance: state.distance + clamped * speed * 20 * seconds,
    spin: wrapDegrees(state.spin + Math.abs(clamped) * SPIN_TURNS_PER_SECOND * 360 * seconds),
  };
}

const pose = (rotation: Vec3): BonePose => ({ rotation, position: [0, 0, 0], scale: [1, 1, 1] });

/** Adds `rotation` to `bone`'s entry (a bone may be both a wheel and a steering bone). */
function add(out: Map<string, BonePose>, bone: string, rotation: Vec3): void {
  const current = out.get(bone);
  if (current === undefined) {
    out.set(bone, pose(rotation));
    return;
  }
  current.rotation = [
    current.rotation[0] + rotation[0],
    current.rotation[1] + rotation[1],
    current.rotation[2] + rotation[2],
  ];
}

/**
 * The added rotation of every turning bone for `state` (degrees, Bedrock orientation; see the
 * module notes). The turret's yaw and pitch are clamped to the rig's limits; wheels roll about
 * x (their tops move forwards when driving forwards), steering bones turn about y, rotors spin
 * about y and propellers about z.
 */
export function vehiclePose(rig: VehicleRig, state: VehiclePoseState): Map<string, BonePose> {
  const out = new Map<string, BonePose>();
  for (const bone of rig.wheels) {
    add(out, bone, [wheelSpinDegrees(state.distance, rig.wheelRadius), 0, 0]);
  }
  const steer = Math.max(-1, Math.min(1, state.steer)) * MAX_STEER_DEGREES;
  for (const bone of rig.steering) add(out, bone, [0, steer, 0]);
  for (const bone of rig.rotors) add(out, bone, [0, state.spin, 0]);
  for (const bone of rig.propellers) add(out, bone, [0, 0, state.spin]);
  if (rig.turret !== null) {
    add(out, rig.turret.bone, [0, clampYaw(state.turretYaw, rig.turret.yawLimit), 0]);
    if (rig.turret.pitchBone !== null) {
      add(out, rig.turret.pitchBone, [clampPitch(state.turretPitch, rig.turret.pitchLimit), 0, 0]);
    }
  }
  return out;
}

/** A vehicle-space point (blocks; x right, z forwards) in the geo preview's scene units. */
export function vehicleToScene(point: readonly [number, number, number]): Vec3 {
  return [point[0] * PIXELS_PER_BLOCK, point[1] * PIXELS_PER_BLOCK, -point[2] * PIXELS_PER_BLOCK];
}

/** A scene point (model units) in vehicle space (blocks; x right, z forwards). */
export function sceneToVehicle(point: readonly [number, number, number]): Vec3 {
  return [point[0] / PIXELS_PER_BLOCK, point[1] / PIXELS_PER_BLOCK, -point[2] / PIXELS_PER_BLOCK];
}

/**
 * Where a ray from `origin` along `direction` meets the horizontal plane at height `y`, or
 * `null` when it runs parallel to the plane or points away from it. Any consistent units.
 */
export function rayToPlaneY(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  y: number,
): Vec3 | null {
  if (Math.abs(direction[1]) < 1e-9) return null;
  const t = (y - origin[1]) / direction[1];
  if (!(t > 0)) return null;
  return [origin[0] + direction[0] * t, y, origin[2] + direction[2] * t];
}

/**
 * The turret yaw that points at the mouse: the mouse ray (scene units, blocks) meets the plane
 * of the turret's pivot height, and the yaw runs from the pivot to that point, within the rig's
 * limit. `null` when the ray misses the plane (the turret then keeps its yaw).
 */
export function turretYawFromRay(
  rig: VehicleRig,
  pivotScene: readonly [number, number, number],
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): number | null {
  if (rig.turret === null) return null;
  const hit = rayToPlaneY(origin, direction, pivotScene[1]);
  if (hit === null) return null;
  // Scene x is the vehicle's right; scene -z its front.
  const yaw = aimYaw({ x: hit[0], z: -hit[2] }, { x: pivotScene[0], z: -pivotScene[2] });
  return clampYaw(yaw, rig.turret.yawLimit);
}
