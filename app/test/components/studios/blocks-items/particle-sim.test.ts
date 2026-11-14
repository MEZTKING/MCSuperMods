/// <reference types="node" />
/**
 * The Particle Studio's simulation against the cross-language golden (ADR 0081 D6 (a), brief
 * B353): `fixtures/particle-look/golden.json`, whose expected values the runtime's
 * `ParticleLook` computes. The runtime is the reference; this test never rewrites the file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  frame,
  lifetime,
  type ParticleState,
  resolveSpec,
  rgba,
  roll,
  size,
  step,
} from '../../../../src/renderer/src/studios/blocks-items/particle-sim';

const GOLDEN = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'particle-look',
  'golden.json',
);
/** The README's tolerance. */
const TOLERANCE = 1e-5;

interface Look {
  age: number;
  partial: number;
  frame: number;
  size: number;
  rgba: number[];
  roll: number;
}
interface Position {
  steps: number;
  position: number[];
  velocity: number[];
}
interface Case {
  name: string;
  definition: Json;
  frames: number;
  lifetime: number;
  random_frame: number;
  start: number[];
  velocity: number[];
  looks: Look[];
  positions: Position[];
  translucent: boolean;
}
interface Golden {
  format: number;
  cases: Case[];
  lifetimes: { min: number; max: number; r: number; lifetime: number }[];
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;

function near(actual: number, expected: number, what: string): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    TOLERANCE,
  );
}

describe('particle-sim against fixtures/particle-look/golden.json', () => {
  it('reads format 1 with cases and lifetimes', () => {
    expect(golden.format).toBe(1);
    expect(golden.cases.length).toBeGreaterThanOrEqual(12);
    expect(golden.lifetimes.length).toBeGreaterThan(0);
  });

  for (const entry of golden.cases) {
    it(`matches the case "${entry.name}"`, () => {
      const spec = resolveSpec(entry.definition);
      expect(spec.translucent, 'translucent').toBe(entry.translucent);
      for (const look of entry.looks) {
        const at = `age ${look.age} + ${look.partial}`;
        expect(
          frame(spec, look.age, entry.lifetime, entry.frames, entry.random_frame),
          `${at} frame`,
        ).toBe(look.frame);
        near(size(spec, look.age, entry.lifetime, look.partial), look.size, `${at} size`);
        const colour = rgba(spec, look.age, entry.lifetime);
        look.rgba.forEach((expected, index) => {
          near(colour[index] as number, expected, `${at} rgba[${index}]`);
        });
        near(roll(spec, look.age), look.roll, `${at} roll`);
      }
      for (const position of entry.positions) {
        let state: ParticleState = {
          x: entry.start[0] as number,
          y: entry.start[1] as number,
          z: entry.start[2] as number,
          xd: entry.velocity[0] as number,
          yd: entry.velocity[1] as number,
          zd: entry.velocity[2] as number,
        };
        for (let tick = 0; tick < position.steps; tick += 1) state = step(state, spec);
        const at = `${position.steps} steps`;
        [state.x, state.y, state.z].forEach((value, index) => {
          near(value, position.position[index] as number, `${at} position[${index}]`);
        });
        [state.xd, state.yd, state.zd].forEach((value, index) => {
          near(value, position.velocity[index] as number, `${at} velocity[${index}]`);
        });
      }
    });
  }

  it('draws lifetimes of a range as the runtime does', () => {
    for (const entry of golden.lifetimes) {
      expect(lifetime(entry.min, entry.max, entry.r), JSON.stringify(entry)).toBe(entry.lifetime);
    }
  });

  it('resolves the defaults of ADR 0080 D1', () => {
    const spec = resolveSpec({ format: 1, textures: ['demo:spark'] });
    expect(spec).toMatchObject({
      animation: 'age',
      frameTicks: 2,
      lifetimeMin: 20,
      lifetimeMax: 20,
      gravity: 0,
      collision: true,
      color: 0xffffff,
      colorEnd: 0xffffff,
      alpha: 1,
      fade: 'none',
      emissive: false,
      translucent: false,
      spin: 0,
      alwaysShow: false,
    });
    expect(spec.size).toBeCloseTo(0.2, 6);
    expect(spec.friction).toBeCloseTo(0.98, 6);
    expect(resolveSpec({ lifetime: { min: 5, max: 9 } })).toMatchObject({
      lifetimeMin: 5,
      lifetimeMax: 9,
    });
    expect(resolveSpec({ fade: 'out' }).translucent).toBe(true);
  });
});
