/**
 * A deepslate `StructureProvider` over Try it's block grid (ADR 0085 D2, D11). The grid is the
 * simulation's `SimWorld`, or any hand-made object with the same few members, so the renderer
 * runs before and without the rest of the simulation.
 *
 * The provider keeps its own list of dirty 8-block chunks (B385: one placed block rebuilds one
 * small chunk). A block that sits on a chunk face also dirties the chunk across that face,
 * because the face between them is culled by both. While a partial rebuild runs,
 * {@link WorldStructure.getBlocks} returns only the dirty chunks' blocks, so deepslate does not
 * walk the whole area for one block.
 *
 * Part of the lazy Try it chunk: it imports deepslate.
 */

import type { BlockPos, BlockState } from '@msm/sim';
import { BlockState as DeepslateBlockState, Identifier } from 'deepslate/core';

/**
 * The edge of one meshed chunk in blocks, as B385 measured (8 rebuilds in about 1 ms, 16 takes
 * 8 to 12 ms). Equal to `SIM_CHUNK_SIZE` in `@msm/sim` (a test checks it).
 */
export const TRYIT_CHUNK_SIZE = 8;

/**
 * Above this many dirty chunks in one frame the whole area is rebuilt at once (about 0.3 s for
 * the full area), rather than chunk by chunk.
 */
export const FULL_REBUILD_CHUNKS = 48;

/** One change of the grid, as {@link TryItGrid.onChange} reports it (only the position is read). */
export interface TryItGridChange {
  readonly pos: BlockPos;
}

/**
 * What the renderer reads from a block grid: `SimWorld` from `@msm/sim` has all of it. Air is
 * `null`. Without `onChange`, the owner calls {@link WorldStructure.markDirty} after each change.
 */
export interface TryItGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  get(pos: BlockPos): BlockState | null;
  blocks(): Iterable<{ readonly pos: BlockPos; readonly state: BlockState }>;
  onChange?(listener: (change: TryItGridChange) => void): () => void;
}

/** A chunk position, `[x, y, z]` in chunks, as deepslate's `updateStructureBuffers` takes it. */
export type ChunkTriple = [number, number, number];

/** A block as deepslate reads it from a structure. */
export interface TryItPlacedBlock {
  pos: [number, number, number];
  state: DeepslateBlockState;
}

/** The text key of a state: `name[a=1,b=2]` with properties in name order. */
export function stateKeyOf(state: BlockState): string {
  const names = Object.keys(state.properties).sort();
  if (names.length === 0) return state.name;
  return `${state.name}[${names.map((name) => `${name}=${state.properties[name]}`).join(',')}]`;
}

const chunkKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** The chunk a block lies in. */
export function chunkOfBlock(pos: BlockPos): ChunkTriple {
  return [
    Math.floor(pos.x / TRYIT_CHUNK_SIZE),
    Math.floor(pos.y / TRYIT_CHUNK_SIZE),
    Math.floor(pos.z / TRYIT_CHUNK_SIZE),
  ];
}

/**
 * The chunks whose meshes can show the block at `pos`: its own, and the chunk across each chunk
 * face it touches, inside an area of `size` blocks.
 */
export function chunksTouchingBlock(
  pos: BlockPos,
  size: readonly [number, number, number],
): ChunkTriple[] {
  const own = chunkOfBlock(pos);
  const out: ChunkTriple[] = [own];
  const coords = [pos.x, pos.y, pos.z];
  for (let axis = 0; axis < 3; axis += 1) {
    const value = coords[axis] as number;
    const local = value - (own[axis] as number) * TRYIT_CHUNK_SIZE;
    if (local === 0 && value > 0) {
      const next: ChunkTriple = [...own];
      next[axis] = (own[axis] as number) - 1;
      out.push(next);
    }
    if (local === TRYIT_CHUNK_SIZE - 1 && value < (size[axis] as number) - 1) {
      const next: ChunkTriple = [...own];
      next[axis] = (own[axis] as number) + 1;
      out.push(next);
    }
  }
  return out;
}

/** The chunks that are due for a rebuild, from {@link WorldStructure.takeDirty}. */
export interface DirtyChunks {
  /** True when the whole area must be rebuilt (a new grid, new resources, or many changes). */
  all: boolean;
  /** The chunks to rebuild when `all` is false, in the order first changed. */
  chunks: ChunkTriple[];
}

/** deepslate's view of a {@link TryItGrid}, with dirty chunk bookkeeping. */
export class WorldStructure {
  readonly grid: TryItGrid;
  private readonly size: [number, number, number];
  private readonly states = new Map<string, DeepslateBlockState>();
  private readonly dirty = new Map<string, ChunkTriple>();
  private allDirty = false;
  private everything: TryItPlacedBlock[] | null = null;
  private scope: ReadonlySet<string> | null = null;
  private readonly seenIds = new Set<string>();
  private readonly newIds = new Set<string>();
  private readonly unsubscribe: () => void;

  constructor(grid: TryItGrid) {
    this.grid = grid;
    this.size = [grid.sizeX, grid.sizeY, grid.sizeZ];
    for (const { state } of grid.blocks()) this.seenIds.add(state.name);
    this.unsubscribe = grid.onChange?.((change) => this.markDirty(change.pos)) ?? (() => {});
  }

  /** Stops listening to the grid. */
  dispose(): void {
    this.unsubscribe();
  }

  /** The area's size, `[x, y, z]`. */
  getSize(): [number, number, number] {
    return this.size;
  }

  /** Whether a position lies inside the area. */
  inside(pos: readonly number[]): boolean {
    const [x, y, z] = pos as [number, number, number];
    return x >= 0 && y >= 0 && z >= 0 && x < this.size[0] && y < this.size[1] && z < this.size[2];
  }

  /** The deepslate state for a simulation state, one shared object per distinct state. */
  deepslateState(state: BlockState): DeepslateBlockState {
    const key = stateKeyOf(state);
    let found = this.states.get(key);
    if (found === undefined) {
      // A mutable copy: deepslate's chunk builder adds the definition's default properties.
      found = new DeepslateBlockState(Identifier.parse(state.name), { ...state.properties });
      this.states.set(key, found);
    }
    return found;
  }

  /** The block at `pos`, or `null` for air and outside the area. */
  getBlock(pos: readonly number[]): TryItPlacedBlock | null {
    if (!this.inside(pos)) return null;
    const [x, y, z] = pos as [number, number, number];
    const state = this.grid.get({ x, y, z });
    if (state === null) return null;
    return { pos: [x, y, z], state: this.deepslateState(state) };
  }

  /**
   * Every block, or during {@link withScope} only the blocks of the chunks being rebuilt.
   */
  getBlocks(): TryItPlacedBlock[] {
    const scope = this.scope;
    if (scope !== null) return this.scopedBlocks(scope);
    if (this.everything === null) {
      const all: TryItPlacedBlock[] = [];
      for (const { pos, state } of this.grid.blocks()) {
        all.push({ pos: [pos.x, pos.y, pos.z], state: this.deepslateState(state) });
      }
      this.everything = all;
    }
    return this.everything;
  }

  private scopedBlocks(scope: ReadonlySet<string>): TryItPlacedBlock[] {
    const out: TryItPlacedBlock[] = [];
    for (const key of scope) {
      const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number];
      const x0 = cx * TRYIT_CHUNK_SIZE;
      const y0 = cy * TRYIT_CHUNK_SIZE;
      const z0 = cz * TRYIT_CHUNK_SIZE;
      const x1 = Math.min(x0 + TRYIT_CHUNK_SIZE, this.size[0]);
      const y1 = Math.min(y0 + TRYIT_CHUNK_SIZE, this.size[1]);
      const z1 = Math.min(z0 + TRYIT_CHUNK_SIZE, this.size[2]);
      for (let y = Math.max(0, y0); y < y1; y += 1) {
        for (let z = Math.max(0, z0); z < z1; z += 1) {
          for (let x = Math.max(0, x0); x < x1; x += 1) {
            const state = this.grid.get({ x, y, z });
            if (state !== null) out.push({ pos: [x, y, z], state: this.deepslateState(state) });
          }
        }
      }
    }
    return out;
  }

  /** Runs `rebuild` with {@link getBlocks} limited to `chunks`. */
  withScope<T>(chunks: readonly ChunkTriple[], rebuild: () => T): T {
    this.scope = new Set(chunks.map(([x, y, z]) => chunkKey(x, y, z)));
    try {
      return rebuild();
    } finally {
      this.scope = null;
    }
  }

  /** Marks the chunks that show the block at `pos` for a rebuild. */
  markDirty(pos: BlockPos): void {
    this.everything = null;
    const state = this.grid.get(pos);
    if (state !== null) this.noteId(state.name);
    if (this.allDirty) return;
    for (const chunk of chunksTouchingBlock(pos, this.size)) {
      const key = chunkKey(...chunk);
      if (!this.dirty.has(key)) this.dirty.set(key, chunk);
    }
    if (this.dirty.size > FULL_REBUILD_CHUNKS) this.markAllDirty();
  }

  /** Marks the whole area for a rebuild, for example after the resources changed. */
  markAllDirty(): void {
    this.everything = null;
    this.allDirty = true;
    this.dirty.clear();
  }

  /** The chunks due for a rebuild since the last call; clears the list. */
  takeDirty(): DirtyChunks {
    const result: DirtyChunks = { all: this.allDirty, chunks: [...this.dirty.values()] };
    this.allDirty = false;
    this.dirty.clear();
    return result;
  }

  /** Whether anything is due for a rebuild. */
  get hasDirty(): boolean {
    return this.allDirty || this.dirty.size > 0;
  }

  private noteId(id: string): void {
    if (this.seenIds.has(id)) return;
    this.seenIds.add(id);
    this.newIds.add(id);
  }

  /** Every block id the grid has held since this provider was made. */
  blockIds(): ReadonlySet<string> {
    return this.seenIds;
  }

  /** Block ids seen for the first time since the last call; clears the list. */
  takeNewBlockIds(): string[] {
    const out = [...this.newIds];
    this.newIds.clear();
    return out;
  }
}
