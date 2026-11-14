import { describe, expect, it } from 'vitest';
import { type BlockPos, placeBlock, useBlock } from '../../src/index.js';
import { floor, placeOn, propsAt, setUp, YAW } from './helpers.js';

const P = (x: number, y: number, z: number): BlockPos => ({ x, y, z });
const C = P(5, 0, 5);

describe('useBlock', () => {
  it('opens and closes a wooden door, both halves together', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('door', floor(5, 5)));
    const opened = useBlock(ctx.world, ctx.catalogue, { pos: P(5, 1, 5), yaw: 0 });
    expect(opened.handled).toBe(true);
    expect(propsAt(ctx.world, C)?.open).toBe('true');
    expect(propsAt(ctx.world, P(5, 1, 5))?.open).toBe('true');
    useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 });
    expect(propsAt(ctx.world, C)?.open).toBe('false');
    expect(propsAt(ctx.world, P(5, 1, 5))?.open).toBe('false');
  });

  it('does not open iron doors or gold trapdoors by hand, and says why', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('iron_door', floor(5, 5)));
    placeBlock(ctx.world, ctx.catalogue, placeOn('gold_trapdoor', floor(7, 5)));
    const door = useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 });
    const trapdoor = useBlock(ctx.world, ctx.catalogue, { pos: P(7, 0, 5), yaw: 0 });
    expect(door).toEqual({
      handled: true,
      changes: [],
      message: 'Iron Door does not open by hand; it needs a redstone signal',
    });
    expect(trapdoor.handled && trapdoor.changes).toEqual([]);
    expect(propsAt(ctx.world, C)?.open).toBe('false');
  });

  it('opens a wooden trapdoor', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('trapdoor', floor(5, 5)));
    useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 });
    expect(propsAt(ctx.world, C)?.open).toBe('true');
  });

  it('opens a fence gate away from the player and closes it as it is', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('gate', floor(5, 5), { yaw: YAW.north }));
    useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: YAW.south });
    expect(propsAt(ctx.world, C)).toMatchObject({ facing: 'south', open: 'true' });
    useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: YAW.north });
    expect(propsAt(ctx.world, C)).toMatchObject({ facing: 'south', open: 'false' });
    useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: YAW.east });
    expect(propsAt(ctx.world, C)).toMatchObject({ facing: 'south', open: 'true' });
  });

  it('presses a button for its press time, once', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('button', floor(5, 5)));
    placeBlock(ctx.world, ctx.catalogue, placeOn('stone_button', floor(6, 5)));
    const wooden = useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 });
    expect(wooden.handled && wooden.releaseAfterTicks).toBe(30);
    expect(propsAt(ctx.world, C)?.powered).toBe('true');
    const again = useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 });
    expect(again).toEqual({ handled: true, changes: [] });
    const stone = useBlock(ctx.world, ctx.catalogue, { pos: P(6, 0, 5), yaw: 0 });
    expect(stone.handled && stone.releaseAfterTicks).toBe(20);
  });

  it('leaves other blocks and air to the caller', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('furnace', floor(5, 5)));
    expect(useBlock(ctx.world, ctx.catalogue, { pos: C, yaw: 0 })).toEqual({ handled: false });
    expect(useBlock(ctx.world, ctx.catalogue, { pos: P(1, 0, 1), yaw: 0 })).toEqual({
      handled: false,
    });
  });
});
