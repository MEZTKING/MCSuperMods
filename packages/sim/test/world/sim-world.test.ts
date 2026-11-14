import { describe, expect, it } from 'vitest';
import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  chunkOf,
  SimWorld,
  sameState,
  stateKey,
  type WorldChange,
} from '../../src/index.js';

const stone = { name: 'minecraft:stone', properties: {} };
const slab = (type: string) => ({ name: 'test:slab', properties: { type } });

describe('SimWorld', () => {
  it('defaults to the area of ADR 0085 and starts empty', () => {
    const world = new SimWorld();
    expect([world.sizeX, world.sizeY, world.sizeZ]).toEqual([
      AREA_SIZE_X,
      AREA_SIZE_Y,
      AREA_SIZE_Z,
    ]);
    expect(world.count).toBe(0);
    expect(world.get({ x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('gets and sets blocks, sharing one frozen state per distinct state', () => {
    const world = new SimWorld(8, 8, 8);
    expect(world.set({ x: 1, y: 2, z: 3 }, slab('top'))).toBe(true);
    expect(
      world.set({ x: 4, y: 2, z: 3 }, { name: 'test:slab', properties: { type: 'top' } }),
    ).toBe(true);
    const a = world.get({ x: 1, y: 2, z: 3 });
    const b = world.get({ x: 4, y: 2, z: 3 });
    expect(a).toEqual(slab('top'));
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(world.count).toBe(2);
    expect(world.set({ x: 1, y: 2, z: 3 }, slab('top'))).toBe(false);
    expect(world.set({ x: 1, y: 2, z: 3 }, null)).toBe(true);
    expect(world.count).toBe(1);
  });

  it('keeps the bounds: outside the area nothing is set and air is read', () => {
    const world = new SimWorld(8, 4, 8);
    for (const pos of [
      { x: -1, y: 0, z: 0 },
      { x: 8, y: 0, z: 0 },
      { x: 0, y: 4, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ]) {
      expect(world.inBounds(pos)).toBe(false);
      expect(world.set(pos, stone)).toBe(false);
      expect(world.get(pos)).toBeNull();
    }
    expect(world.isFloor({ x: 3, y: -1, z: 7 })).toBe(true);
    expect(world.isFloor({ x: 8, y: -1, z: 0 })).toBe(false);
    expect(world.isFloor({ x: 3, y: 0, z: 3 })).toBe(false);
  });

  it('tells listeners each change with its chunk, and tracks dirty chunks', () => {
    const world = new SimWorld();
    const seen: WorldChange[] = [];
    const stop = world.onChange((change) => seen.push(change));
    world.set({ x: 9, y: 0, z: 17 }, stone);
    world.set({ x: 9, y: 0, z: 17 }, slab('bottom'));
    world.set({ x: 40, y: 31, z: 0 }, stone);
    stop();
    world.set({ x: 0, y: 0, z: 0 }, stone);
    expect(seen.map((c) => c.chunk)).toEqual([
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 5, y: 3, z: 0 },
    ]);
    expect(seen[1]?.previous).toEqual(stone);
    expect(world.takeDirtyChunks()).toEqual([
      { x: 1, y: 0, z: 2 },
      { x: 5, y: 3, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
    expect(world.takeDirtyChunks()).toEqual([]);
  });

  it('names the neighbour chunk for a block on a chunk face', () => {
    const world = new SimWorld();
    expect(world.chunksTouching({ x: 3, y: 3, z: 3 })).toEqual([{ x: 0, y: 0, z: 0 }]);
    expect(world.chunksTouching({ x: 8, y: 7, z: 0 })).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]);
    expect(world.chunksTouching({ x: 47, y: 0, z: 0 })).toEqual([{ x: 5, y: 0, z: 0 }]);
  });

  it('lists and clears blocks in a fixed order', () => {
    const world = new SimWorld(4, 4, 4);
    world.set({ x: 3, y: 1, z: 0 }, stone);
    world.set({ x: 0, y: 0, z: 2 }, stone);
    expect([...world.blocks()].map((b) => b.pos)).toEqual([
      { x: 0, y: 0, z: 2 },
      { x: 3, y: 1, z: 0 },
    ]);
    world.clear();
    expect(world.count).toBe(0);
  });

  it('keys states by sorted properties', () => {
    expect(stateKey({ name: 'a:b', properties: { z: '1', a: '2' } })).toBe('a:b[a=2,z=1]');
    expect(sameState(stone, { name: 'minecraft:stone', properties: {} })).toBe(true);
    expect(sameState(null, stone)).toBe(false);
    expect(chunkOf({ x: 15, y: 16, z: 0 })).toEqual({ x: 1, y: 2, z: 0 });
  });
});
