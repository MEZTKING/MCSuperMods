/**
 * Camera maths for Try it's view: the first-person view matrix from the simulation's look
 * (`@msm/sim` conventions: yaw 0 faces +z, 90 faces west; negative pitch looks up; degrees) and
 * per-chunk frustum culling (B385: drawing only the chunks in view takes the area from about 16
 * to about 24 frames a second under SwiftShader).
 *
 * Part of the lazy Try it chunk: it imports gl-matrix.
 */

import type { Box, Vec3 } from '@msm/sim';
import { mat4 } from 'gl-matrix';

/** Where the camera is and where it looks, as the view draws one frame. */
export interface CameraPose {
  /** The eye, in blocks (the area's corner is 0, 0, 0). */
  readonly eye: Vec3;
  /** Degrees; 0 faces south (+z), 90 faces west (-x). */
  readonly yaw: number;
  /** Degrees; negative looks up, clamped to ±90 by the controller. */
  readonly pitch: number;
}

/** The selection outline of the block the player points at. */
export interface PickedOutline {
  /** The block. */
  readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  /** Its outline boxes in block units (`BlockShapes.outline(state)`); empty draws nothing. */
  readonly boxes: readonly Box[];
}

const RADIANS = Math.PI / 180;

/** The view matrix of a pose: world blocks to camera space (camera looks down -z). */
export function viewMatrixFor(pose: CameraPose, out: mat4 = mat4.create()): mat4 {
  mat4.identity(out);
  mat4.rotateX(out, out, pose.pitch * RADIANS);
  mat4.rotateY(out, out, pose.yaw * RADIANS + Math.PI);
  mat4.translate(out, out, [-pose.eye.x, -pose.eye.y, -pose.eye.z]);
  return out;
}

/**
 * The six clip planes (`a, b, c, d` each) of a projection-times-view matrix, for
 * {@link boxInFrustum}. A point is inside when `a x + b y + c z + d >= 0` for every plane.
 */
export function frustumPlanes(clip: mat4, out: Float32Array = new Float32Array(24)): Float32Array {
  for (let plane = 0; plane < 6; plane += 1) {
    const row = plane >> 1;
    const sign = plane & 1 ? -1 : 1;
    out[plane * 4] = (clip[3] as number) + sign * (clip[row] as number);
    out[plane * 4 + 1] = (clip[7] as number) + sign * (clip[4 + row] as number);
    out[plane * 4 + 2] = (clip[11] as number) + sign * (clip[8 + row] as number);
    out[plane * 4 + 3] = (clip[15] as number) + sign * (clip[12 + row] as number);
  }
  return out;
}

/**
 * Whether an axis-aligned box from `(x0, y0, z0)` to `(x1, y1, z1)` may be in view: false only
 * when it lies wholly outside one plane (a box near a corner may pass and be drawn for nothing).
 */
export function boxInFrustum(
  planes: Float32Array,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): boolean {
  for (let plane = 0; plane < 6; plane += 1) {
    const a = planes[plane * 4] as number;
    const b = planes[plane * 4 + 1] as number;
    const c = planes[plane * 4 + 2] as number;
    const d = planes[plane * 4 + 3] as number;
    const x = a >= 0 ? x1 : x0;
    const y = b >= 0 ? y1 : y0;
    const z = c >= 0 ? z1 : z0;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
