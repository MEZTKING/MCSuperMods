import { describe, expect, it } from 'vitest';
import {
  adjacentPos,
  EYE_HEIGHT,
  IDLE_INPUT,
  lookDirection,
  PlayerController,
  pick,
} from '../../src/player/index.js';
import { door, FakeWorld, SHAPES, SLAB, STONE } from './fake-world.js';

/** The pitch, in degrees, that looks from the eye down to a point `drop` lower and `ahead` away. */
function pitchTo(drop: number, ahead: number): number {
  return (Math.atan2(drop, ahead) * 180) / Math.PI;
}

function standing(world: FakeWorld): PlayerController {
  const p = new PlayerController(world.lookup, SHAPES, { x: 10.5, y: 1, z: 10.5 });
  p.step(IDLE_INPUT);
  return p;
}

describe('pick', () => {
  it('looks south at yaw 0, west at 90, up at negative pitch', () => {
    const s = lookDirection(0, 0);
    expect(s.z).toBeCloseTo(1, 9);
    const w = lookDirection(90, 0);
    expect(w.x).toBeCloseTo(-1, 9);
    expect(lookDirection(0, -90).y).toBeCloseTo(1, 9);
  });

  it("hits a door's upper box looking level and its lower box looking down", () => {
    const world = new FakeWorld().set(10, 1, 12, door('lower')).set(10, 2, 12, door('upper'));
    const p = standing(world);
    const eye = 1 + EYE_HEIGHT;

    const upper = p.pick(1, 0, 0);
    expect(upper).not.toBeNull();
    expect(upper?.pos).toEqual({ x: 10, y: 2, z: 12 });
    expect(upper?.face).toBe('north');
    expect(upper?.box).toBe(0);
    expect(upper?.hit.x).toBeCloseTo(0.5, 9);
    expect(upper?.hit.y).toBeCloseTo(eye - 2, 9);
    expect(upper?.hit.z).toBeCloseTo(0, 9);
    expect(upper?.distance).toBeCloseTo(1.5, 9);

    const lower = p.pick(1, 0, pitchTo(eye - 1.5, 1.5));
    expect(lower?.pos).toEqual({ x: 10, y: 1, z: 12 });
    expect(lower?.face).toBe('north');
    expect(lower?.hit.y).toBeCloseTo(0.5, 6);
  });

  it("passes through the empty part of an open door's block", () => {
    const world = new FakeWorld().set(10, 2, 12, door('upper', true)).set(10, 2, 13, STONE);
    const p = standing(world);
    const hit = p.pick(1, 0, 0);
    expect(hit?.pos).toEqual({ x: 10, y: 2, z: 13 });
    expect(hit?.face).toBe('north');

    // Aimed at the open door's thin box on the west side, from the east.
    const side = pick(world.lookup, SHAPES, { x: 12.5, y: 2.5, z: 12.5 }, { x: -1, y: 0, z: 0 });
    expect(side?.pos).toEqual({ x: 10, y: 2, z: 12 });
    expect(side?.face).toBe('east');
    expect(side?.hit.x).toBeCloseTo(0.1875, 9);
  });

  it('hits the top of a bottom slab and passes over its empty upper half', () => {
    const world = new FakeWorld().set(10, 1, 12, SLAB);
    const p = standing(world);
    const eye = 1 + EYE_HEIGHT;

    const top = p.pick(1, 0, pitchTo(eye - 1.5, 2));
    expect(top?.pos).toEqual({ x: 10, y: 1, z: 12 });
    expect(top?.face).toBe('up');
    expect(top?.hit.y).toBeCloseTo(0.5, 9);
    expect(top?.hit.z).toBeCloseTo(0.5, 6);
    expect(adjacentPos(top?.pos ?? { x: 0, y: 0, z: 0 }, 'up')).toEqual({ x: 10, y: 2, z: 12 });

    // Aimed just over the slab's far edge: the ray passes the empty upper half to the floor.
    const over = p.pick(1, 0, pitchTo(eye - 1.55, 2.5));
    expect(over?.pos).toEqual({ x: 10, y: 0, z: 14 });
    expect(over?.face).toBe('up');

    // Aimed at the front face's lower half (y 1.25): the slab's north face.
    const front = p.pick(1, 0, pitchTo(eye - 1.25, 1.5));
    expect(front?.pos).toEqual({ x: 10, y: 1, z: 12 });
    expect(front?.face).toBe('north');
    expect(front?.hit.y).toBeCloseTo(0.25, 6);
  });

  it('reaches 4.5 blocks and no further', () => {
    const near = new FakeWorld().set(10, 2, 15, STONE);
    expect(standing(near).pick(1, 0, 0)?.distance).toBeCloseTo(4.5, 9);
    const far = new FakeWorld().set(10, 2, 16, STONE);
    expect(standing(far).pick(1, 0, 0)).toBeNull();
  });

  it('ignores blocks without an outline and returns null into the open', () => {
    const world = new FakeWorld().set(10, 2, 12, { name: 'test:flower', properties: {} });
    const p = standing(world);
    expect(p.pick(1, 0, -45)).toBeNull();
    const flower = p.pick(1, 0, 0);
    expect(flower).toBeNull();
    const lowFlower = new FakeWorld().set(10, 1, 12, { name: 'test:flower', properties: {} });
    const q = standing(lowFlower);
    const hit = q.pick(1, 0, pitchTo(1 + EYE_HEIGHT - 1.3, 1.8));
    expect(hit?.pos).toEqual({ x: 10, y: 1, z: 12 });
    expect(hit?.face).toBe('north');
  });
});
