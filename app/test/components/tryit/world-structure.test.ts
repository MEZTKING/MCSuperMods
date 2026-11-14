import { type BlockPos, type BlockState, SIM_CHUNK_SIZE, SimWorld } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import {
  chunksTouchingBlock,
  FULL_REBUILD_CHUNKS,
  stateKeyOf,
  TRYIT_CHUNK_SIZE,
  type TryItGrid,
  WorldStructure,
} from '../../../src/renderer/src/tryit/render/world-structure';

const RUBY: BlockState = { name: 'demo:ruby_block', properties: {} };
const SLAB: BlockState = {
  name: 'demo:ruby_slab',
  properties: { type: 'top', waterlogged: 'false' },
};
const SIZE: [number, number, number] = [48, 32, 48];
const keys = (chunks: readonly (readonly number[])[]): string[] =>
  chunks.map((chunk) => chunk.join(',')).sort();

/** A hand-made grid with no change events: the owner marks changes itself. */
function handGrid(size: [number, number, number] = [16, 8, 16]) {
  const cells = new Map<string, BlockState>();
  const key = (pos: BlockPos) => `${pos.x},${pos.y},${pos.z}`;
  const grid: TryItGrid & { put(pos: BlockPos, state: BlockState | null): void } = {
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    get: (pos) => cells.get(key(pos)) ?? null,
    *blocks() {
      for (const [text, state] of cells) {
        const [x, y, z] = text.split(',').map(Number) as [number, number, number];
        yield { pos: { x, y, z }, state };
      }
    },
    put(pos, state) {
      if (state === null) cells.delete(key(pos));
      else cells.set(key(pos), state);
    },
  };
  return grid;
}

describe('Try it world structure', () => {
  it('meshes in the simulation’s chunk size', () => {
    expect(TRYIT_CHUNK_SIZE).toBe(SIM_CHUNK_SIZE);
    expect(TRYIT_CHUNK_SIZE).toBe(8);
  });

  it('reads blocks and bounds from a SimWorld', () => {
    const world = new SimWorld();
    world.set({ x: 3, y: 0, z: 5 }, SLAB);
    const structure = new WorldStructure(world);
    expect(structure.getSize()).toEqual(SIZE);
    const block = structure.getBlock([3, 0, 5]);
    expect(block?.pos).toEqual([3, 0, 5]);
    expect(block?.state.getName().toString()).toBe('demo:ruby_slab');
    expect(block?.state.getProperties()).toEqual({ type: 'top', waterlogged: 'false' });
    expect(structure.getBlock([4, 0, 5])).toBeNull();
    for (const outside of [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [48, 0, 0],
      [0, 32, 0],
      [0, 0, 48],
    ]) {
      expect(structure.getBlock(outside)).toBeNull();
      expect(structure.inside(outside)).toBe(false);
    }
    expect(structure.inside([47, 31, 47])).toBe(true);
  });

  it('shares one mutable deepslate state per distinct state', () => {
    const world = new SimWorld();
    world.set({ x: 0, y: 0, z: 0 }, RUBY);
    world.set({ x: 1, y: 0, z: 0 }, { name: 'demo:ruby_block', properties: {} });
    const structure = new WorldStructure(world);
    const a = structure.getBlock([0, 0, 0])?.state;
    const b = structure.getBlock([1, 0, 0])?.state;
    expect(a).toBe(b);
    // deepslate's chunk builder writes default properties into the state; the world's
    // states are frozen, so the copy must not be.
    expect(Object.isFrozen(a?.getProperties())).toBe(false);
    expect(stateKeyOf({ name: 'x:y', properties: { b: '2', a: '1' } })).toBe('x:y[a=1,b=2]');
  });

  it('marks the changed chunk dirty, and the chunk across a chunk face', () => {
    const world = new SimWorld();
    const structure = new WorldStructure(world);
    expect(structure.hasDirty).toBe(false);
    world.set({ x: 12, y: 3, z: 12 }, RUBY);
    expect(structure.hasDirty).toBe(true);
    expect(structure.takeDirty()).toEqual({ all: false, chunks: [[1, 0, 1]] });
    expect(structure.hasDirty).toBe(false);
    // x 8 is the low face of chunk 1, y 7 the high face of chunk 0, z 15 the high face of chunk 1.
    world.set({ x: 8, y: 7, z: 15 }, RUBY);
    expect(keys(structure.takeDirty().chunks)).toEqual(
      keys([
        [1, 0, 1],
        [0, 0, 1],
        [1, 1, 1],
        [1, 0, 2],
      ]),
    );
  });

  it('keeps chunks across faces inside the area', () => {
    expect(keys(chunksTouchingBlock({ x: 0, y: 0, z: 0 }, SIZE))).toEqual(['0,0,0']);
    expect(keys(chunksTouchingBlock({ x: 47, y: 31, z: 47 }, SIZE))).toEqual(['5,3,5']);
    expect(keys(chunksTouchingBlock({ x: 7, y: 8, z: 3 }, SIZE))).toEqual(
      ['0,1,0', '0,0,0', '1,1,0'].sort(),
    );
  });

  it('agrees with SimWorld.chunksTouching', () => {
    const world = new SimWorld();
    for (const pos of [
      { x: 0, y: 0, z: 0 },
      { x: 7, y: 7, z: 7 },
      { x: 8, y: 16, z: 23 },
      { x: 40, y: 31, z: 47 },
      { x: 15, y: 24, z: 32 },
    ]) {
      expect(keys(chunksTouchingBlock(pos, SIZE))).toEqual(
        keys(world.chunksTouching(pos).map((chunk) => [chunk.x, chunk.y, chunk.z])),
      );
    }
  });

  it('lists the same dirty chunk once, in the order first changed', () => {
    const world = new SimWorld();
    const structure = new WorldStructure(world);
    world.set({ x: 20, y: 2, z: 2 }, RUBY);
    world.set({ x: 2, y: 2, z: 2 }, RUBY);
    world.set({ x: 21, y: 2, z: 2 }, SLAB);
    expect(structure.takeDirty().chunks).toEqual([
      [2, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('asks for a full rebuild after many changes, and after markAllDirty', () => {
    const world = new SimWorld();
    const structure = new WorldStructure(world);
    let n = 0;
    for (let x = 1; x < 48 && n <= FULL_REBUILD_CHUNKS; x += 8) {
      for (let z = 1; z < 48 && n <= FULL_REBUILD_CHUNKS; z += 8) {
        for (let y = 1; y < 32 && n <= FULL_REBUILD_CHUNKS; y += 8) {
          world.set({ x, y, z }, RUBY);
          n += 1;
        }
      }
    }
    expect(structure.takeDirty()).toEqual({ all: true, chunks: [] });
    structure.markAllDirty();
    world.set({ x: 1, y: 1, z: 1 }, null);
    expect(structure.takeDirty()).toEqual({ all: true, chunks: [] });
    expect(structure.takeDirty()).toEqual({ all: false, chunks: [] });
  });

  it('returns only the scoped chunks’ blocks during a partial rebuild', () => {
    const world = new SimWorld();
    world.set({ x: 1, y: 1, z: 1 }, RUBY);
    world.set({ x: 9, y: 1, z: 1 }, SLAB);
    world.set({ x: 47, y: 31, z: 47 }, RUBY);
    const structure = new WorldStructure(world);
    expect(structure.getBlocks()).toHaveLength(3);
    const scoped = structure.withScope([[1, 0, 0]], () => structure.getBlocks());
    expect(scoped.map((block) => block.pos)).toEqual([[9, 1, 1]]);
    expect(structure.withScope([[5, 3, 5]], () => structure.getBlocks()).map((b) => b.pos)).toEqual(
      [[47, 31, 47]],
    );
    expect(structure.getBlocks()).toHaveLength(3);
    world.set({ x: 2, y: 1, z: 1 }, RUBY);
    expect(structure.getBlocks()).toHaveLength(4);
  });

  it('reports block ids it has not seen before', () => {
    const world = new SimWorld();
    world.set({ x: 0, y: 0, z: 0 }, RUBY);
    const structure = new WorldStructure(world);
    expect([...structure.blockIds()]).toEqual(['demo:ruby_block']);
    world.set({ x: 1, y: 0, z: 0 }, RUBY);
    world.set({ x: 2, y: 0, z: 0 }, SLAB);
    world.set({ x: 3, y: 0, z: 0 }, { name: 'minecraft:stone', properties: {} });
    expect(structure.takeNewBlockIds()).toEqual(['demo:ruby_slab', 'minecraft:stone']);
    expect(structure.takeNewBlockIds()).toEqual([]);
  });

  it('works with a hand-made grid without change events', () => {
    const grid = handGrid();
    grid.put({ x: 4, y: 4, z: 4 }, RUBY);
    const structure = new WorldStructure(grid);
    expect(structure.getSize()).toEqual([16, 8, 16]);
    expect(structure.getBlocks()).toHaveLength(1);
    grid.put({ x: 15, y: 7, z: 15 }, SLAB);
    structure.markDirty({ x: 15, y: 7, z: 15 });
    expect(structure.takeDirty().chunks).toEqual([[1, 0, 1]]);
    expect(structure.takeNewBlockIds()).toEqual(['demo:ruby_slab']);
    expect(structure.getBlocks()).toHaveLength(2);
  });

  it('stops listening when disposed', () => {
    const world = new SimWorld();
    const structure = new WorldStructure(world);
    structure.dispose();
    world.set({ x: 1, y: 1, z: 1 }, RUBY);
    expect(structure.hasDirty).toBe(false);
  });
});
