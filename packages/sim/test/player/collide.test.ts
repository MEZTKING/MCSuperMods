import { describe, expect, it } from 'vitest';
import { collectObstacles, moveWithStep, sweep } from '../../src/player/index.js';
import type { Box } from '../../src/types.js';
import { FakeWorld, SHAPES, SLAB, STONE } from './fake-world.js';

const PLAYER: Box = [10.2, 1, 10.2, 10.8, 2.8, 10.8];

describe('collide', () => {
  it('stops a sweep at the face of a box and leaves the other axes alone', () => {
    const wall: Box = [12, 0, 0, 13, 5, 20];
    const r = sweep(PLAYER, 3, 0, 0.5, [wall]);
    expect(r.dx).toBeCloseTo(1.2, 9);
    expect(r.stoppedX).toBe(true);
    expect(r.dz).toBe(0.5);
    expect(r.stoppedZ).toBe(false);
  });

  it('lets a box move out of something it already overlaps', () => {
    const inside: Box = [10, 1, 10, 11, 2, 11];
    const r = sweep(PLAYER, 1, 0, 0, [inside]);
    expect(r.dx).toBe(1);
  });

  it('gathers block boxes in world coordinates and the area walls', () => {
    const world = new FakeWorld(false).set(5, 3, 6, SLAB);
    const boxes = collectObstacles(world.lookup, SHAPES, [4.5, 2.5, 5.5, 5.5, 4, 6.5]);
    expect(boxes).toContainEqual([5, 3, 6, 6, 3.5, 7]);
    expect(boxes.length).toBe(7);
  });

  it('steps up 0.5 but not 1', () => {
    const slab = new FakeWorld().set(11, 1, 10, SLAB);
    const up = moveWithStep(slab.lookup, SHAPES, PLAYER, 0.4, -0.08, 0, 0.6, true);
    expect(up.stepped).toBe(true);
    expect(up.dy).toBeCloseTo(0.5, 9);
    const block = new FakeWorld().set(11, 1, 10, STONE);
    const stop = moveWithStep(block.lookup, SHAPES, PLAYER, 0.4, -0.08, 0, 0.6, true);
    expect(stop.stepped).toBe(false);
    expect(stop.dx).toBeCloseTo(0.2, 9);
    expect(stop.landed).toBe(true);
  });
});
