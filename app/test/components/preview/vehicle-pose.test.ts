/**
 * The Vehicle Studio's preview pose (B419, `preview/geo/vehicle-pose.ts`): the rig read from the
 * data, the turret's yaw from the mouse (a ray onto the turret's level) within its limits, wheel
 * spin from the distance driven, steering, rotors and propellers, and that the pose's angles turn
 * the starter tank's barrel and a car's wheels the right way through the real geo baker.
 */
import { vehicleGeometry } from '@msm/plugin-entities';
import { type mat4, vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';
import { bakeGeometry, boneMatrices } from '../../../src/renderer/src/preview/geo/geometry';
import {
  advanceDrive,
  aimYaw,
  clampPitch,
  clampYaw,
  MAX_STEER_DEGREES,
  REST_POSE_STATE,
  rayToPlaneY,
  sceneToVehicle,
  turretYawFromRay,
  vehiclePose,
  vehicleRig,
  vehicleToScene,
  wheelSpinDegrees,
  wrapDegrees,
} from '../../../src/renderer/src/preview/geo/vehicle-pose';

const TANK = {
  turret: { bone: 'turret', pitch_bone: 'barrel', pitch_limit: [-20, 10], yaw_limit: [60, -60] },
  parts: { wheels: ['track_left'], wheel_radius: 0.25, steering: ['track_left'], rotors: ['r'] },
};

describe('vehicleRig', () => {
  it('reads the turret, its limits (sorted) and the part lists', () => {
    const rig = vehicleRig(TANK);
    expect(rig.turret).toEqual({
      bone: 'turret',
      pitchBone: 'barrel',
      yawLimit: [-60, 60],
      pitchLimit: [-20, 10],
    });
    expect(rig.wheels).toEqual(['track_left']);
    expect(rig.wheelRadius).toBe(0.25);
    expect(rig.rotors).toEqual(['r']);
    expect(rig.propellers).toEqual([]);
  });

  it('has no turret without a bone and the default wheel radius', () => {
    const rig = vehicleRig({ turret: { pitch_bone: 'barrel' }, parts: { wheels: ['a', 3, ''] } });
    expect(rig.turret).toBeNull();
    expect(rig.wheels).toEqual(['a']);
    expect(rig.wheelRadius).toBe(0.5);
    expect(vehicleRig(null).wheels).toEqual([]);
  });
});

describe('turret yaw from the mouse', () => {
  it('measures yaw clockwise from ahead (x right, z forwards)', () => {
    expect(aimYaw({ x: 0, z: 5 }, { x: 0, z: 0 })).toBeCloseTo(0);
    expect(aimYaw({ x: 3, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(90);
    expect(aimYaw({ x: -2, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(-90);
    expect(aimYaw({ x: 0, z: -1 }, { x: 0, z: 0 })).toBeCloseTo(180);
    expect(aimYaw({ x: 1, z: 1 }, { x: 0, z: 0 })).toBeCloseTo(45);
    expect(aimYaw({ x: 2, z: 2 }, { x: 2, z: 2 })).toBe(0);
  });

  it('wraps and clamps yaw and pitch', () => {
    expect(wrapDegrees(270)).toBe(-90);
    expect(wrapDegrees(-180)).toBe(180);
    expect(wrapDegrees(540)).toBe(180);
    expect(clampYaw(100, [-60, 60])).toBe(60);
    expect(clampYaw(-300, null)).toBe(60);
    expect(clampPitch(-45, [-20, 10])).toBe(-20);
    expect(clampPitch(120, null)).toBe(90);
  });

  it('meets the plane of the turret pivot along the mouse ray', () => {
    expect(rayToPlaneY([0, 10, 0], [1, -1, 0], 2)).toEqual([8, 2, 0]);
    expect(rayToPlaneY([0, 10, 0], [1, 0, 0], 2)).toBeNull();
    expect(rayToPlaneY([0, 10, 0], [0, 1, 0], 2)).toBeNull();
  });

  it('turns the turret towards where the mouse points, within its limit', () => {
    const rig = vehicleRig({ turret: { bone: 'turret' } });
    const pivot = [0, 1, 0] as const;
    // Camera above and behind; the ray points down to the right of the vehicle (scene +x).
    const right = turretYawFromRay(rig, pivot, [0, 5, 4], [4, -4, -4]);
    expect(right).toBeCloseTo(90);
    // Down and ahead (scene -z is forwards).
    expect(turretYawFromRay(rig, pivot, [0, 5, 4], [0, -4, -8])).toBeCloseTo(0);
    // Down to the left and behind.
    expect(turretYawFromRay(rig, pivot, [0, 5, 0], [-4, -4, 4])).toBeCloseTo(-135);
    const limited = vehicleRig({ turret: { bone: 'turret', yaw_limit: [-30, 30] } });
    expect(turretYawFromRay(limited, pivot, [0, 5, 4], [4, -4, -4])).toBe(30);
    // A ray going up misses the plane; no turret, no yaw.
    expect(turretYawFromRay(rig, pivot, [0, 5, 0], [0, 1, 0])).toBeNull();
    expect(turretYawFromRay(vehicleRig({}), pivot, [0, 5, 4], [4, -4, -4])).toBeNull();
  });
});

describe('driving', () => {
  it('rolls wheels by the distance over the radius', () => {
    expect(wheelSpinDegrees(0, 0.5)).toBe(0);
    expect(wheelSpinDegrees(Math.PI * 0.5 * 0.5, 0.5)).toBeCloseTo(90);
    expect(wheelSpinDegrees(1, 0)).toBe(0);
  });

  it('advances the distance at the top speed and spins with throttle', () => {
    const next = advanceDrive(REST_POSE_STATE, 0.5, 1, 0.4);
    expect(next.distance).toBeCloseTo(4);
    expect(next.spin).not.toBe(0);
    const back = advanceDrive(REST_POSE_STATE, 1, -0.5, 0.4);
    expect(back.distance).toBeCloseTo(-4);
    expect(advanceDrive(REST_POSE_STATE, 1, 3, 0.4).distance).toBeCloseTo(8);
    expect(advanceDrive(REST_POSE_STATE, 1, 0, 0.4)).toEqual(REST_POSE_STATE);
  });

  it('poses wheels, steering, rotors, propellers and the turret', () => {
    const rig = vehicleRig({
      turret: { bone: 'turret', pitch_bone: 'barrel', yaw_limit: [-45, 45] },
      parts: {
        wheels: ['wheel_front_left', 'wheel_back_left'],
        steering: ['wheel_front_left'],
        rotors: ['rotor'],
        propellers: ['propeller'],
      },
    });
    const pose = vehiclePose(rig, {
      turretYaw: 90,
      turretPitch: -10,
      distance: Math.PI / 4,
      steer: -1,
      spin: 30,
    });
    expect(pose.get('wheel_back_left')?.rotation).toEqual([90, 0, 0]);
    // Front left both rolls and steers.
    const front = pose.get('wheel_front_left')?.rotation ?? [];
    expect(front[0]).toBeCloseTo(90);
    expect(front[1]).toBe(-MAX_STEER_DEGREES);
    expect(pose.get('rotor')?.rotation).toEqual([0, 30, 0]);
    expect(pose.get('propeller')?.rotation).toEqual([0, 0, 30]);
    expect(pose.get('turret')?.rotation).toEqual([0, 45, 0]);
    expect(pose.get('barrel')?.rotation).toEqual([-10, 0, 0]);
    expect(pose.get('turret')?.scale).toEqual([1, 1, 1]);
  });

  it('converts vehicle points to scene units and back', () => {
    expect(vehicleToScene([1, 0.5, 2])).toEqual([16, 8, -32]);
    expect(sceneToVehicle([16, 8, -32])).toEqual([1, 0.5, 2]);
  });
});

/** The centre of `bone`'s vertices after `pose`, in scene model units. */
function boneCentre(geometry: unknown, bone: string, pose: ReturnType<typeof vehiclePose>) {
  const model = bakeGeometry(geometry);
  const index = model.bones.findIndex((entry) => entry.name === bone);
  const baked = model.bones[index];
  if (baked === undefined) throw new Error(`No bone ${bone}.`);
  const matrix = boneMatrices(model, pose)[index] as mat4;
  const sum = vec3.create();
  for (let i = baked.first; i < baked.first + baked.count; i += 1) {
    const p = vec3.fromValues(
      model.positions[i * 3] ?? 0,
      model.positions[i * 3 + 1] ?? 0,
      model.positions[i * 3 + 2] ?? 0,
    );
    vec3.add(sum, sum, vec3.transformMat4(p, p, matrix));
  }
  return vec3.scale(sum, sum, 1 / baked.count);
}

describe('the pose on the real baker', () => {
  const tank = vehicleGeometry('tank', 'tank');
  const rig = vehicleRig({ turret: { bone: 'turret', pitch_bone: 'barrel' } });

  it('points the barrel ahead at rest and to the right at a yaw of 90', () => {
    const rest = boneCentre(tank, 'barrel', vehiclePose(rig, REST_POSE_STATE));
    // Ahead is scene -z.
    expect(rest[2]).toBeLessThan(-16);
    expect(Math.abs(rest[0])).toBeLessThan(1);
    const right = boneCentre(
      tank,
      'barrel',
      vehiclePose(rig, { ...REST_POSE_STATE, turretYaw: 90 }),
    );
    // Right is scene +x.
    expect(right[0]).toBeGreaterThan(16);
    expect(Math.abs(right[2])).toBeLessThan(2);
  });

  it('raises the barrel for a negative pitch', () => {
    const rest = boneCentre(tank, 'barrel', vehiclePose(rig, REST_POSE_STATE));
    const up = boneCentre(
      tank,
      'barrel',
      vehiclePose(rig, { ...REST_POSE_STATE, turretPitch: -20 }),
    );
    expect(up[1]).toBeGreaterThan(rest[1] + 3);
  });

  it('rolls a wheel so that its top moves forwards when driving forwards', () => {
    const car = vehicleGeometry('car', 'car');
    const wheelRig = vehicleRig({ parts: { wheels: ['wheel_front_left'], wheel_radius: 0.25 } });
    const model = bakeGeometry(car);
    const index = model.bones.findIndex((entry) => entry.name === 'wheel_front_left');
    const baked = model.bones[index];
    if (baked === undefined) throw new Error('No wheel.');
    // The wheel's highest vertex at rest.
    const restMatrix = boneMatrices(model)[index] as mat4;
    let top = 0;
    let topY = -Infinity;
    for (let i = baked.first; i < baked.first + baked.count; i += 1) {
      const p = vec3.fromValues(
        model.positions[i * 3] ?? 0,
        model.positions[i * 3 + 1] ?? 0,
        model.positions[i * 3 + 2] ?? 0,
      );
      const y = vec3.transformMat4(p, p, restMatrix)[1];
      if (y > topY) {
        topY = y;
        top = i;
      }
    }
    const point = (matrix: mat4) => {
      const p = vec3.fromValues(
        model.positions[top * 3] ?? 0,
        model.positions[top * 3 + 1] ?? 0,
        model.positions[top * 3 + 2] ?? 0,
      );
      return vec3.transformMat4(p, p, matrix);
    };
    const before = point(restMatrix);
    const posed = boneMatrices(
      model,
      vehiclePose(wheelRig, { ...REST_POSE_STATE, distance: 0.05 }),
    )[index] as mat4;
    const after = point(posed);
    expect(after[2]).toBeLessThan(before[2]);
  });
});
