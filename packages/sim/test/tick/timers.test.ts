import { describe, expect, it } from 'vitest';
import {
  type BlockPos,
  BlockTimers,
  type Box,
  PLATE_RELEASE_TICKS,
  placeBlock,
  playerBox,
  useBlock,
  WEIGHTED_PLATE_RELEASE_TICKS,
  weightedSignal,
} from '../../src/index.js';
import { floor, placeOn, propsAt, setUp } from '../blocks/helpers.js';

const P = (x: number, y: number, z: number): BlockPos => ({ x, y, z });

/** Ticks the timers `n` times with the same boxes. */
function run(timers: BlockTimers, n: number, boxes: readonly Box[] = []): void {
  for (let i = 0; i < n; i++) timers.tick(boxes);
}

/** Places a button on the floor, presses it by hand and schedules its release. */
function pressed(block: string, x: number) {
  const ctx = setUp();
  const timers = new BlockTimers(ctx.world, ctx.catalogue);
  const pos = P(x, 0, 5);
  placeBlock(ctx.world, ctx.catalogue, placeOn(block, floor(x, 5)));
  timers.afterUse(pos, useBlock(ctx.world, ctx.catalogue, { pos, yaw: 0 }));
  return { ...ctx, timers, pos };
}

describe('buttons', () => {
  it('lets a wooden button go after 30 ticks', () => {
    const { world, timers, pos } = pressed('button', 5);
    run(timers, 29);
    expect(propsAt(world, pos)?.powered).toBe('true');
    const changes = timers.tick([]);
    expect(propsAt(world, pos)?.powered).toBe('false');
    expect(changes).toEqual([{ pos, state: world.get(pos) }]);
    expect(timers.pending).toBe(0);
  });

  it('lets a stone button go after 20 ticks', () => {
    const { world, timers, pos } = pressed('stone_button', 6);
    run(timers, 19);
    expect(propsAt(world, pos)?.powered).toBe('true');
    timers.tick([]);
    expect(propsAt(world, pos)?.powered).toBe('false');
  });

  it('honours press_ticks and forgets a broken button', () => {
    const quick = pressed('quick_button', 7);
    run(quick.timers, 5);
    expect(propsAt(quick.world, quick.pos)?.powered).toBe('false');
    const broken = pressed('button', 5);
    broken.world.set(broken.pos, null);
    run(broken.timers, 30);
    expect(broken.world.get(broken.pos)).toBeNull();
    expect(broken.timers.pending).toBe(0);
  });
});

describe('pressure plates', () => {
  it('is pressed while the player stands on it and lets go after the player leaves', () => {
    const ctx = setUp();
    const timers = new BlockTimers(ctx.world, ctx.catalogue);
    const pos = P(5, 0, 5);
    placeBlock(ctx.world, ctx.catalogue, placeOn('plate', floor(5, 5)));
    const on = [playerBox({ x: 5.5, y: 0, z: 5.5 })];
    const off = [playerBox({ x: 8.5, y: 0, z: 5.5 })];
    run(timers, 3, off);
    expect(propsAt(ctx.world, pos)?.powered).toBe('false');
    timers.tick(on);
    expect(propsAt(ctx.world, pos)?.powered).toBe('true');
    run(timers, 50, on);
    expect(propsAt(ctx.world, pos)?.powered).toBe('true');
    run(timers, PLATE_RELEASE_TICKS - 1, off);
    expect(propsAt(ctx.world, pos)?.powered).toBe('true');
    timers.tick(off);
    expect(propsAt(ctx.world, pos)?.powered).toBe('false');
    expect(timers.pending).toBe(0);
  });

  it('is not pressed by a box above it or beside its edge', () => {
    const ctx = setUp();
    const timers = new BlockTimers(ctx.world, ctx.catalogue);
    placeBlock(ctx.world, ctx.catalogue, placeOn('plate', floor(5, 5)));
    run(timers, 2, [playerBox({ x: 5.5, y: 0.5, z: 5.5 }), playerBox({ x: 4.6, y: 0, z: 5.5 })]);
    expect(propsAt(ctx.world, P(5, 0, 5))?.powered).toBe('false');
  });

  it('gives a weighted plate a signal by the number of entities on it', () => {
    const ctx = setUp();
    const timers = new BlockTimers(ctx.world, ctx.catalogue);
    const pos = P(5, 0, 5);
    placeBlock(ctx.world, ctx.catalogue, placeOn('weighted_plate', floor(5, 5)));
    const one = playerBox({ x: 5.5, y: 0, z: 5.5 });
    timers.tick([one]);
    expect(propsAt(ctx.world, pos)?.power).toBe('2');
    timers.tick([one, playerBox({ x: 5.4, y: 0, z: 5.6 })]);
    expect(propsAt(ctx.world, pos)?.power).toBe('3');
    run(timers, WEIGHTED_PLATE_RELEASE_TICKS - 1);
    expect(propsAt(ctx.world, pos)?.power).toBe('3');
    timers.tick([]);
    expect(propsAt(ctx.world, pos)?.power).toBe('0');
  });

  it('works out weighted signals', () => {
    expect(weightedSignal(0, 15)).toBe(0);
    expect(weightedSignal(1, 15)).toBe(1);
    expect(weightedSignal(20, 15)).toBe(15);
    expect(weightedSignal(10, 150)).toBe(1);
    expect(weightedSignal(11, 150)).toBe(2);
  });

  it('forgets everything on clear', () => {
    const ctx = setUp();
    const timers = new BlockTimers(ctx.world, ctx.catalogue);
    placeBlock(ctx.world, ctx.catalogue, placeOn('plate', floor(5, 5)));
    timers.tick([playerBox({ x: 5.5, y: 0, z: 5.5 })]);
    timers.scheduleRelease(P(5, 0, 5), 10);
    expect(timers.pending).toBe(2);
    timers.clear();
    expect(timers.pending).toBe(0);
  });
});
