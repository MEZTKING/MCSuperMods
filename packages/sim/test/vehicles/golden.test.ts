/**
 * The vehicle physics golden (ADR 0091 D6, B428): the simulation's twin of the runtime's
 * `VehiclePhysics` recomputes every case of `fixtures/vehicle-physics/golden.json` from its
 * inputs and compares the resolved constants and each step's state within 1e-5 (yaw modulo
 * 360), as the fixture's README asks. Each step starts from the twin's own previous state, so
 * rounding in the file never adds up. The file is only read here, never written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type MovementSpec,
  resolveMovement,
  stepVehicle,
  VEHICLE_MODES,
  type VehicleConstants,
  type VehicleState,
} from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';

interface GoldenStep {
  input: {
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    view_yaw: number;
    view_pitch: number;
  };
  env: { on_ground: boolean; water_depth: number; engine: boolean };
  state: Record<keyof VehicleState, number>;
}

interface GoldenCase {
  name: string;
  movement: MovementSpec;
  resolved: Record<string, number | boolean | string>;
  start: Record<keyof VehicleState, number>;
  steps: GoldenStep[];
}

const golden = JSON.parse(
  readFileSync(join(REPO_ROOT, 'fixtures', 'vehicle-physics', 'golden.json'), 'utf8'),
) as { format: number; cases: GoldenCase[] };

const TOLERANCE = 1e-5;

/** The golden's snake_case names of the resolved constants. */
const RESOLVED_KEYS: Readonly<Record<string, keyof VehicleConstants>> = {
  mode: 'mode',
  max_speed: 'maxSpeed',
  reverse_factor: 'reverseFactor',
  acceleration: 'acceleration',
  braking: 'braking',
  turn_rate: 'turnRate',
  turns_in_place: 'turnsInPlace',
  step_height: 'stepHeight',
  grip: 'grip',
  lift_speed: 'liftSpeed',
  takeoff_speed: 'takeoffSpeed',
  floats: 'floats',
};

const STATE_KEYS = ['vx', 'vy', 'vz', 'pitch', 'throttle', 'speed', 'steering'] as const;

const yawDifference = (a: number, b: number): number => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe('vehicle physics golden', () => {
  it('has format 1, every mode and at least 30 steps', () => {
    expect(golden.format).toBe(1);
    const modes = new Set(golden.cases.map((one) => one.movement.mode));
    for (const mode of VEHICLE_MODES) expect(modes).toContain(mode);
    expect(golden.cases.reduce((sum, one) => sum + one.steps.length, 0)).toBeGreaterThanOrEqual(30);
  });

  for (const one of golden.cases) {
    it(one.name, () => {
      const constants = resolveMovement(one.movement);
      for (const [key, value] of Object.entries(one.resolved)) {
        const name = RESOLVED_KEYS[key];
        expect(name, `resolved key ${key}`).toBeDefined();
        const ours = constants[name as keyof VehicleConstants];
        if (typeof value === 'number') {
          expect(Math.abs((ours as number) - value), `resolved ${key}`).toBeLessThanOrEqual(
            TOLERANCE,
          );
        } else {
          expect(ours, `resolved ${key}`).toBe(value);
        }
      }
      let state: VehicleState = {
        vx: one.start.vx,
        vy: one.start.vy,
        vz: one.start.vz,
        yaw: one.start.yaw,
        pitch: one.start.pitch,
        throttle: one.start.throttle,
        speed: 0,
        steering: 0,
      };
      one.steps.forEach((step, index) => {
        state = stepVehicle(
          constants,
          state,
          {
            forward: step.input.forward,
            back: step.input.back,
            left: step.input.left,
            right: step.input.right,
            up: step.input.up,
            down: step.input.down,
            viewYaw: step.input.view_yaw,
            viewPitch: step.input.view_pitch,
          },
          {
            onGround: step.env.on_ground,
            waterDepth: step.env.water_depth,
            engine: step.env.engine,
          },
        );
        for (const key of STATE_KEYS) {
          expect(
            Math.abs(state[key] - step.state[key]),
            `step ${index + 1} ${key}: ours ${state[key]}, golden ${step.state[key]}`,
          ).toBeLessThanOrEqual(TOLERANCE);
        }
        expect(
          yawDifference(state.yaw, step.state.yaw),
          `step ${index + 1} yaw: ours ${state.yaw}, golden ${step.state.yaw}`,
        ).toBeLessThanOrEqual(TOLERANCE);
      });
    });
  }
});
