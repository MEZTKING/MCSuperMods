/**
 * The camera of a showcase clip between its keys (ADR 0118 D4, B566): eye, yaw and pitch eased
 * from one key to the next (smoothstep), yaw the short way round. Pure maths; the poses are
 * Try it's `CameraPose` (yaw 0 faces south, 90 west; negative pitch looks up).
 *
 * @packageDocumentation
 */

import type { CameraPose } from '../tryit/render/camera';
import type { CameraKey, ClipPoint } from './clip';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smoothstep: starts and stops gently. */
export function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** The yaw `t` of the way from `a` to `b`, turning the short way round (degrees). */
export function lerpYaw(a: number, b: number, t: number): number {
  let delta = ((((b - a) % 360) + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return a + delta * t;
}

/** The pose at `time` (ticks, fractions allowed); before the first key or after the last, the key. */
export function cameraAt(keys: readonly CameraKey[], time: number): CameraPose {
  const first = keys[0];
  if (first === undefined) return { eye: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
  if (time <= first.tick) return poseOf(first);
  for (let index = 1; index < keys.length; index += 1) {
    const b = keys[index] as CameraKey;
    const a = keys[index - 1] as CameraKey;
    if (time <= b.tick) {
      const t = ease((time - a.tick) / (b.tick - a.tick));
      return {
        eye: {
          x: lerp(a.eye.x, b.eye.x, t),
          y: lerp(a.eye.y, b.eye.y, t),
          z: lerp(a.eye.z, b.eye.z, t),
        },
        yaw: lerpYaw(a.yaw, b.yaw, t),
        pitch: lerp(a.pitch, b.pitch, t),
      };
    }
  }
  return poseOf(keys[keys.length - 1] as CameraKey);
}

function poseOf(key: CameraKey): CameraPose {
  return { eye: { ...key.eye }, yaw: key.yaw, pitch: key.pitch };
}

const DEGREES = 180 / Math.PI;

/** The pose at `eye` looking at `target`. */
export function lookAt(eye: ClipPoint, target: ClipPoint): CameraPose {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const flat = Math.hypot(dx, dz);
  // Yaw 0 faces +z and 90 faces -x; pitch is negative when looking up.
  const yaw = flat === 0 ? 0 : Math.atan2(-dx, dz) * DEGREES;
  const pitch = flat === 0 && dy === 0 ? 0 : -Math.atan2(dy, flat) * DEGREES;
  // `+ 0` turns -0 into 0.
  return { eye: { x: eye.x, y: eye.y, z: eye.z }, yaw: yaw + 0, pitch: pitch + 0 };
}
