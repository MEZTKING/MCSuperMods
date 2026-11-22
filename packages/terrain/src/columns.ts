/**
 * Block columns (ADR 0119 D3 seam 4, D8; spike B574 F6): the terrain of a column, then our own
 * surface pass over every column with a biome per cell (deepslate's `buildSurface` walks one z row
 * with one biome a chunk). The pass follows deepslate's (deepslate 0.27.2, MIT, Copyright (c)
 * Misode): from the top down, stone depth above counts solid blocks since the last air, the water
 * height is the top of the fluid below that air, and the depth below runs to the next air or fluid.
 *
 * A window fills only its own height, the column above it up to the first air (the depth above
 * needs it) and below it only as far as a ceiling condition could still be true (the rule front's
 * bound). The `features` stage hands the window to `features/index.ts`.
 */

import {
  BlockState,
  type Chunk,
  type Identifier,
  MaterialRuleContext,
  type NoiseChunk,
  type RuleEvaluator,
} from 'deepslate/worldgen';
import type { ColumnStage, ColumnWindow, Unsupported } from './api';
import { placeFeatures } from './features';
import { ChunkFills } from './fill';
import type { EngineWorld, NoiseParts } from './world';

export const AIR_NAME = 'minecraft:air';

/** A block grid as `@msm/sim`'s ground: palette (air first) and `(y * sizeZ + z) * sizeX + x`. */
export interface ColumnsResult {
  readonly size: { x: number; y: number; z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
  readonly notes: readonly Unsupported[];
}

/** Palette indices for block states, air first. */
export class Palette {
  readonly names: string[] = [AIR_NAME];
  private readonly byState = new Map<BlockState, number>();
  private readonly byName = new Map<string, number>([[AIR_NAME, 0]]);

  index(state: BlockState): number {
    let i = this.byState.get(state);
    if (i === undefined) {
      i = this.name(state.toString());
      this.byState.set(state, i);
    }
    return i;
  }

  name(name: string): number {
    let i = this.byName.get(name);
    if (i === undefined) {
      i = this.names.length;
      this.names.push(name);
      this.byName.set(name, i);
    }
    return i;
  }
}

/** The biome of a block, cached per quart (a biome is per 4 by 4 by 4 cell). */
export class BiomeCache {
  private readonly cells = new Map<number, Identifier>();
  private readonly parts: NoiseParts;

  constructor(parts: NoiseParts) {
    this.parts = parts;
  }

  at(x: number, y: number, z: number): Identifier {
    const qx = x >> 2;
    const qy = y >> 2;
    const qz = z >> 2;
    const key = (qx * 2097152 + (qz + 1048576)) * 512 + (qy + 256);
    let biome = this.cells.get(key);
    if (!biome) {
      if (this.cells.size > 65536) this.cells.clear();
      biome = this.parts.biomeSource.getBiome(qx, qy, qz, this.parts.sampler);
      this.cells.set(key, biome);
    }
    return biome;
  }
}

/** One column's terrain, then its surface (reused for every column of a request). */
export class SurfaceColumns {
  readonly fills: ChunkFills;
  readonly biomes: BiomeCache;
  private readonly context: MaterialRuleContext;
  private readonly rule: RuleEvaluator;
  private readonly minY: number;
  private readonly maxY: number;
  private readonly states: (BlockState | undefined)[];
  private readonly touched: number[] = [];
  private x = 0;
  private z = 0;

  private readonly parts: NoiseParts;
  private readonly surface: boolean;

  constructor(world: EngineWorld, parts: NoiseParts, surface: boolean) {
    this.parts = parts;
    this.surface = surface;
    this.minY = world.minY;
    this.maxY = world.minY + world.height - 1;
    this.states = new Array(world.height);
    this.fills = new ChunkFills(parts);
    this.biomes = new BiomeCache(parts);
    const noiseChunk = { randomState: { router: parts.router } } as unknown as NoiseChunk;
    this.context = new MaterialRuleContext(
      parts.randomState.surfaceSystem,
      parts.randomState,
      undefined as unknown as Chunk,
      noiseChunk,
      { minY: world.minY, height: world.height, seaLevel: parts.settings.seaLevel },
      (pos) => this.biomes.at(pos[0], pos[1], pos[2]),
    );
    this.rule = parts.materialRule.compile(this.context);
  }

  private state(y: number): BlockState {
    const i = y - this.minY;
    let s = this.states[i];
    if (s === undefined) {
      s = this.fills.at(this.x, this.z).state(this.x, y, this.z);
      this.states[i] = s;
      this.touched.push(i);
    }
    return s;
  }

  /**
   * The blocks of column `(x, z)` from `yLo` to `yHi` (inside the world), passed to `out` from the
   * top down.
   */
  column(
    x: number,
    z: number,
    yLo: number,
    yHi: number,
    out: (y: number, s: BlockState) => void,
  ): void {
    for (const i of this.touched) this.states[i] = undefined;
    this.touched.length = 0;
    this.x = x;
    this.z = z;
    const lo = Math.max(yLo, this.minY);
    const hi = Math.min(yHi, this.maxY);
    if (lo > hi) return;
    if (!this.surface) {
      for (let y = hi; y >= lo; y -= 1) out(y, this.state(y));
      return;
    }
    // The depth above counts from the last air: scan up from the window to it.
    let top = hi;
    while (top < this.maxY && !isAir(this.state(top + 1))) top += 1;
    const front = this.parts.ruleFront;
    const floor = front.ceilingUnbounded
      ? this.minY
      : Math.max(this.minY, lo - front.ceilingDepth - 2);
    const ctx = this.context;
    ctx.updateXZ(x, z);
    let stoneAbove = 0;
    let waterHeight = Number.MIN_SAFE_INTEGER;
    let nextCeiling = Number.MAX_SAFE_INTEGER;
    for (let y = top; y >= lo; y -= 1) {
      const old = this.state(y);
      if (isAir(old)) {
        stoneAbove = 0;
        waterHeight = Number.MIN_SAFE_INTEGER;
        if (y <= hi) out(y, old);
        continue;
      }
      if (old.isFluid()) {
        if (waterHeight === Number.MIN_SAFE_INTEGER) waterHeight = y + 1;
        if (y <= hi) out(y, old);
        continue;
      }
      if (nextCeiling >= y) {
        // Past `floor` no ceiling condition can be true, so the next ceiling counts as there.
        nextCeiling = floor > this.minY ? floor : Number.MIN_SAFE_INTEGER;
        for (let ly = y - 1; ly >= floor; ly -= 1) {
          const s = this.state(ly);
          if (isAir(s) || s.isFluid()) {
            nextCeiling = ly + 1;
            break;
          }
        }
      }
      stoneAbove += 1;
      if (y > hi) continue;
      ctx.updateY(stoneAbove, y - nextCeiling + 1, waterHeight, y);
      out(y, this.rule(x, y, z) ?? old);
    }
  }
}

function isAir(state: BlockState): boolean {
  return state === BlockState.AIR || state.equals(BlockState.AIR);
}

/** The window's blocks at a stage (`api.ts` `buildColumns`). */
export function buildWindow(
  world: EngineWorld,
  window: ColumnWindow,
  stage: ColumnStage,
): ColumnsResult {
  const sizeX = Math.max(0, Math.floor(window.sizeX));
  const sizeY = Math.max(0, Math.floor(window.sizeY));
  const sizeZ = Math.max(0, Math.floor(window.sizeZ));
  const blocks = new Uint16Array(sizeX * sizeY * sizeZ);
  const palette = new Palette();
  const notes = [...world.unsupported()];
  const y1 = window.y0 + sizeY - 1;
  const parts = world.noise;
  if (parts) {
    world.activate();
    const columns = new SurfaceColumns(world, parts, stage !== 'terrain');
    // Chunk by chunk, so a chunk's aquifer and cell grid serve all its columns.
    const cx0 = window.x0 >> 4;
    const cz0 = window.z0 >> 4;
    const cx1 = (window.x0 + sizeX - 1) >> 4;
    const cz1 = (window.z0 + sizeZ - 1) >> 4;
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const xa = Math.max(window.x0, cx * 16);
        const xb = Math.min(window.x0 + sizeX - 1, cx * 16 + 15);
        const za = Math.max(window.z0, cz * 16);
        const zb = Math.min(window.z0 + sizeZ - 1, cz * 16 + 15);
        for (let x = xa; x <= xb; x += 1) {
          for (let z = za; z <= zb; z += 1) {
            const lx = x - window.x0;
            const lz = z - window.z0;
            columns.column(x, z, window.y0, y1, (y, s) => {
              if (s === BlockState.AIR) return;
              blocks[((y - window.y0) * sizeZ + lz) * sizeX + lx] = palette.index(s);
            });
          }
        }
      }
    }
  } else if (world.flat) {
    const { layers, minY } = world.flat;
    for (let y = window.y0; y <= y1; y += 1) {
      const name = layers[y - minY];
      if (name === undefined || name === AIR_NAME) continue;
      const index = palette.name(name);
      for (let lz = 0; lz < sizeZ; lz += 1) {
        for (let lx = 0; lx < sizeX; lx += 1) {
          blocks[((y - window.y0) * sizeZ + lz) * sizeX + lx] = index;
        }
      }
    }
  }
  const result: ColumnsResult = {
    size: { x: sizeX, y: sizeY, z: sizeZ },
    palette: palette.names,
    blocks,
    notes,
  };
  if (stage !== 'features') return result;
  const placed = placeFeatures({ ...result, palette: [...result.palette] });
  return { size: placed.size, palette: placed.palette, blocks: placed.blocks, notes: placed.notes };
}
