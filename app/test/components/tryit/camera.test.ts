import { lookDirection } from '@msm/sim';
import { mat4, vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';
import {
  boxInFrustum,
  type CameraPose,
  frustumPlanes,
  viewMatrixFor,
} from '../../../src/renderer/src/tryit/render/camera';

const eye = { x: 24.5, y: 1.62, z: 24.5 };

/** The camera-space position of a world point. */
function toCamera(pose: CameraPose, point: readonly [number, number, number]): vec3 {
  return vec3.transformMat4(vec3.create(), point as vec3, viewMatrixFor(pose));
}

function planesFor(pose: CameraPose): Float32Array {
  const projection = mat4.perspective(mat4.create(), (70 * Math.PI) / 180, 16 / 9, 0.1, 500);
  return frustumPlanes(mat4.multiply(mat4.create(), projection, viewMatrixFor(pose)));
}

describe('Try it camera', () => {
  it('puts the eye at the origin', () => {
    const at = toCamera({ eye, yaw: 37, pitch: -20 }, [eye.x, eye.y, eye.z]);
    for (const value of at) expect(value).toBeCloseTo(0, 4);
  });

  it('looks where the simulation looks, for every yaw and pitch', () => {
    for (const yaw of [0, 45, 90, 180, 270, -135]) {
      for (const pitch of [-89, -30, 0, 30, 89]) {
        const pose = { eye, yaw, pitch };
        const d = lookDirection(yaw, pitch);
        const ahead = toCamera(pose, [eye.x + d.x * 5, eye.y + d.y * 5, eye.z + d.z * 5]);
        expect(ahead[0]).toBeCloseTo(0, 4);
        expect(ahead[1]).toBeCloseTo(0, 4);
        expect(ahead[2]).toBeCloseTo(-5, 4);
      }
    }
  });

  it('keeps up as up and right as right when looking level', () => {
    // Facing south (+z): west (-x) is on the right.
    const pose = { eye, yaw: 0, pitch: 0 };
    const above = toCamera(pose, [eye.x, eye.y + 1, eye.z + 5]);
    expect(above[1]).toBeGreaterThan(0);
    const west = toCamera(pose, [eye.x - 1, eye.y, eye.z + 5]);
    expect(west[0]).toBeGreaterThan(0);
  });

  it('keeps chunks ahead and drops chunks behind', () => {
    const planes = planesFor({ eye, yaw: 0, pitch: 0 });
    // South of the eye (+z): in view.
    expect(boxInFrustum(planes, 24, 0, 32, 32, 8, 40)).toBe(true);
    // North of the eye: behind.
    expect(boxInFrustum(planes, 24, 0, 8, 32, 8, 16)).toBe(false);
    // The chunk the eye stands in is always drawn.
    expect(boxInFrustum(planes, 24, 0, 24, 32, 8, 32)).toBe(true);
    // Far to the side, past the 70 degree field of view.
    expect(boxInFrustum(planes, 0, 0, 24, 8, 8, 32)).toBe(false);
  });

  it('turns culling with the look', () => {
    const planes = planesFor({ eye, yaw: 180, pitch: 0 });
    expect(boxInFrustum(planes, 24, 0, 8, 32, 8, 16)).toBe(true);
    expect(boxInFrustum(planes, 24, 0, 32, 32, 8, 40)).toBe(false);
  });
});
