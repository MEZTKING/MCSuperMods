/**
 * The test area's blocks (ADR 0085 D2, D11): a dense grid of palette indices over the area,
 * with change events by 8-block chunk so the view rebuilds only what changed (B385 chose
 * `chunkSize: 8`). Air is `null`. Pure and deterministic; it knows nothing about block types.
 */
import { AREA_SIZE_X, AREA_SIZE_Y, AREA_SIZE_Z, type BlockPos, type BlockState } from '../types.js';

/** The edge of one chunk in blocks, as the view meshes the area (B385). */
export const SIM_CHUNK_SIZE = 8;

/** A chunk position: block coordinates divided by {@link SIM_CHUNK_SIZE}, rounded down. */
export interface ChunkPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One block that changed, with the chunk it lies in. */
export interface WorldChange {
  readonly pos: BlockPos;
  /** The new state; `null` for air. */
  readonly state: BlockState | null;
  /** The previous state; `null` for air. */
  readonly previous: BlockState | null;
  readonly chunk: ChunkPos;
}

/** Receives every change of a {@link SimWorld}, in the order they happen. */
export type WorldChangeListener = (change: WorldChange) => void;

/** The stable text key of a state: `name[a=1,b=2]` with properties sorted by name. */
export function stateKey(state: BlockState): string {
  const names = Object.keys(state.properties).sort();
  if (names.length === 0) return state.name;
  return `${state.name}[${names.map((name) => `${name}=${state.properties[name]}`).join(',')}]`;
}

/** Whether two states are the same block with the same properties (`null` is air). */
export function sameState(a: BlockState | null, b: BlockState | null): boolean {
  if (a === null || b === null) return a === b;
  return stateKey(a) === stateKey(b);
}

/** A frozen copy of a state with its properties in name order. */
export function freezeState(state: BlockState): BlockState {
  const properties: Record<string, string> = {};
  for (const name of Object.keys(state.properties).sort()) {
    properties[name] = state.properties[name] as string;
  }
  return Object.freeze({ name: state.name, properties: Object.freeze(properties) });
}

/** The chunk a block lies in. */
export function chunkOf(pos: BlockPos): ChunkPos {
  return {
    x: Math.floor(pos.x / SIM_CHUNK_SIZE),
    y: Math.floor(pos.y / SIM_CHUNK_SIZE),
    z: Math.floor(pos.z / SIM_CHUNK_SIZE),
  };
}

/** The text key `x,y,z` of a chunk, for sets. */
export const chunkKey = (chunk: ChunkPos): string => `${chunk.x},${chunk.y},${chunk.z}`;

/**
 * The test area's block grid. Positions run from 0 to the size minus one on each axis; the
 * floor the view draws lies just below `y = 0` and is not a block.
 */
export class SimWorld {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Palette index per block, x fastest, then z, then y; 0 is air. */
  private readonly cells: Uint16Array;
  /** The palette: index 0 is air, then each distinct state in first-seen order. */
  private readonly palette: (BlockState | null)[] = [null];
  private readonly paletteIndex = new Map<string, number>();
  private readonly listeners = new Set<WorldChangeListener>();
  private readonly dirty = new Map<string, ChunkPos>();
  private filled = 0;

  /** An empty area, by default the size of ADR 0085 (48 by 32 by 48). */
  constructor(sizeX = AREA_SIZE_X, sizeY = AREA_SIZE_Y, sizeZ = AREA_SIZE_Z) {
    for (const size of [sizeX, sizeY, sizeZ]) {
      if (!Number.isInteger(size) || size < 1) throw new RangeError(`Bad area size ${size}.`);
    }
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.cells = new Uint16Array(sizeX * sizeY * sizeZ);
  }

  /** Whether a position lies inside the area. */
  inBounds(pos: BlockPos): boolean {
    return (
      Number.isInteger(pos.x) &&
      Number.isInteger(pos.y) &&
      Number.isInteger(pos.z) &&
      pos.x >= 0 &&
      pos.y >= 0 &&
      pos.z >= 0 &&
      pos.x < this.sizeX &&
      pos.y < this.sizeY &&
      pos.z < this.sizeZ
    );
  }

  /**
   * Whether a position is the drawn floor: the layer just below the area, inside its width and
   * depth. The floor is solid but holds no block.
   */
  isFloor(pos: BlockPos): boolean {
    return pos.y === -1 && this.inBounds({ x: pos.x, y: 0, z: pos.z });
  }

  private index(pos: BlockPos): number {
    return (pos.y * this.sizeZ + pos.z) * this.sizeX + pos.x;
  }

  /** The block at a position; `null` for air or outside the area. */
  get(pos: BlockPos): BlockState | null {
    if (!this.inBounds(pos)) return null;
    return this.palette[this.cells[this.index(pos)] as number] ?? null;
  }

  /**
   * Sets a block (`null` for air). Returns whether anything changed; a position outside the
   * area changes nothing and returns false. Listeners hear each change at once.
   */
  set(pos: BlockPos, state: BlockState | null): boolean {
    if (!this.inBounds(pos)) return false;
    const i = this.index(pos);
    const before = this.cells[i] as number;
    const after = state === null ? 0 : this.paletteSlot(state);
    if (before === after) return false;
    this.cells[i] = after;
    if (before === 0) this.filled += 1;
    if (after === 0) this.filled -= 1;
    const chunk = chunkOf(pos);
    this.dirty.set(chunkKey(chunk), chunk);
    const change: WorldChange = {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      state: this.palette[after] ?? null,
      previous: this.palette[before] ?? null,
      chunk,
    };
    for (const listener of [...this.listeners]) listener(change);
    return true;
  }

  private paletteSlot(state: BlockState): number {
    const key = stateKey(state);
    const known = this.paletteIndex.get(key);
    if (known !== undefined) return known;
    if (this.palette.length > 0xffff) throw new RangeError('The area holds too many states.');
    const slot = this.palette.length;
    this.palette.push(freezeState(state));
    this.paletteIndex.set(key, slot);
    return slot;
  }

  /** How many positions hold a block. */
  get count(): number {
    return this.filled;
  }

  /** Every block, in a fixed order (y, then z, then x). */
  *blocks(): IterableIterator<{ pos: BlockPos; state: BlockState }> {
    for (let y = 0; y < this.sizeY; y += 1) {
      for (let z = 0; z < this.sizeZ; z += 1) {
        for (let x = 0; x < this.sizeX; x += 1) {
          const slot = this.cells[(y * this.sizeZ + z) * this.sizeX + x] as number;
          const state = this.palette[slot];
          if (slot !== 0 && state != null) yield { pos: { x, y, z }, state };
        }
      }
    }
  }

  /** Empties the area, one change event per block removed. */
  clear(): void {
    for (const { pos } of [...this.blocks()]) this.set(pos, null);
  }

  /** Starts listening to changes. Returns a function that stops it. */
  onChange(listener: WorldChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The chunks changed since the last call, in the order first changed; clears the list. */
  takeDirtyChunks(): ChunkPos[] {
    const out = [...this.dirty.values()];
    this.dirty.clear();
    return out;
  }

  /**
   * The chunks whose mesh can show a block at `pos`: its own and, when it sits on a chunk face,
   * the chunk across that face (B385: a face between two chunks is meshed by both).
   */
  chunksTouching(pos: BlockPos): ChunkPos[] {
    const own = chunkOf(pos);
    const out: ChunkPos[] = [own];
    const axes = ['x', 'y', 'z'] as const;
    const sizes = { x: this.sizeX, y: this.sizeY, z: this.sizeZ };
    for (const axis of axes) {
      const local = pos[axis] - own[axis] * SIM_CHUNK_SIZE;
      if (local === 0 && pos[axis] > 0) out.push({ ...own, [axis]: own[axis] - 1 });
      if (local === SIM_CHUNK_SIZE - 1 && pos[axis] < sizes[axis] - 1) {
        out.push({ ...own, [axis]: own[axis] + 1 });
      }
    }
    return out;
  }
}
