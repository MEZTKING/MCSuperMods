/** The clip camera between its keys (B566). */

import { lookDirection } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import { cameraAt, ease, lerpYaw, lookAt } from '../../../src/renderer/src/showcase/camera-path';
import type { CameraKey } from '../../../src/renderer/src/showcase/clip';

const KEYS: CameraKey[] = [
  { tick: 0, eye: { x: 0, y: 10, z: 0 }, yaw: 350, pitch: 0 },
  { tick: 100, eye: { x: 10, y: 20, z: 40 }, yaw: 10, pitch: 30 },
];

describe('camera path', () => {
  it('eases in and out', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it('turns the yaw the short way round', () => {
    expect(lerpYaw(350, 10, 0.5)).toBeCloseTo(360);
    expect(lerpYaw(10, 350, 0.5)).toBeCloseTo(0);
    expect(lerpYaw(170, -170, 1)).toBeCloseTo(190);
    expect(lerpYaw(0, 90, 0.5)).toBeCloseTo(45);
  });

  it('holds the first and last key and eases between them', () => {
    expect(cameraAt(KEYS, -5)).toEqual({ eye: { x: 0, y: 10, z: 0 }, yaw: 350, pitch: 0 });
    expect(cameraAt(KEYS, 150)).toEqual({ eye: { x: 10, y: 20, z: 40 }, yaw: 10, pitch: 30 });
    const middle = cameraAt(KEYS, 50);
    expect(middle.eye).toEqual({ x: 5, y: 15, z: 20 });
    expect(middle.yaw).toBeCloseTo(360);
    expect(middle.pitch).toBeCloseTo(15);
    const early = cameraAt(KEYS, 10);
    expect(early.eye.x).toBeLessThan(1);
  });

  it('gives an empty pose with no keys', () => {
    expect(cameraAt([], 10)).toEqual({ eye: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  });

  it('looks at a point the way the simulation measures a look', () => {
    const eye = { x: 5, y: 10, z: 5 };
    const target = { x: 2, y: 6, z: 9 };
    const pose = lookAt(eye, target);
    const direction = lookDirection(pose.yaw, pose.pitch);
    const length = Math.hypot(-3, -4, 4);
    expect(direction.x).toBeCloseTo(-3 / length);
    expect(direction.y).toBeCloseTo(-4 / length);
    expect(direction.z).toBeCloseTo(4 / length);
    expect(lookAt(eye, { x: 5, y: 10, z: 9 })).toEqual({ eye, yaw: 0, pitch: 0 });
  });
});
