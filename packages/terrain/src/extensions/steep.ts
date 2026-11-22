/**
 * The surface condition `steep` (ADR 0119 D3; plan brief B581): true in a column whose land rises
 * by 4 or more blocks from the north neighbour to the south one, or from the east neighbour to the
 * west one. The heights are those of the land and the sea before the surface (the highest block
 * that is not air), and the neighbours are taken inside the column's own chunk (a column at the
 * chunk's edge uses itself for the side outside it). The type has no fields.
 *
 * Learned by observation on the worldgen parity fixture's `condition_steep` dimension (B581): over
 * 300 columns of three seeds the rule above separates the steep columns from the others with no
 * exception (33 and 267); falls the other way (south to north, west to east) are not steep. The
 * fixture's columns are all inside their chunks, so the chunk-edge rule is not checked there.
 * Heights leave aquifers out, as the Height map does (`fill.ts` `HeightSearch`).
 */

import {
  BlockState,
  MaterialCondition,
  type MaterialRuleContext,
  type NoiseGeneratorSettings,
  type NoiseRouter,
} from 'deepslate/worldgen';
import { type FillWorld, HeightSearch } from '../fill';
import type { ConditionType } from '../rules';

/** The fall in blocks at which a slope is steep. */
export const STEEP_RISE = 4;

interface ContextParts {
  readonly context: { readonly minY: number; readonly height: number; readonly seaLevel: number };
  readonly noiseChunk: { readonly randomState: { readonly router: NoiseRouter } };
}

const HEIGHT_SLOTS = 1024;

/** Heights of columns near the surface pass's position, kept in a small table. */
class Heights {
  private readonly search: HeightSearch;
  private readonly keysX = new Float64Array(HEIGHT_SLOTS).fill(Number.NaN);
  private readonly keysZ = new Float64Array(HEIGHT_SLOTS).fill(Number.NaN);
  private readonly values = new Int32Array(HEIGHT_SLOTS);

  constructor(parts: ContextParts) {
    const { minY, height, seaLevel } = parts.context;
    // The sea counts as land here (it is not air); the fluid itself does not matter.
    const world = {
      settings: { noise: { minY, height }, seaLevel } as unknown as NoiseGeneratorSettings,
      router: parts.noiseChunk.randomState.router,
      aquifers: undefined,
      aquiferRandom: undefined,
      fluidPicker: () => ({ at: () => BlockState.WATER }),
    } as unknown as FillWorld;
    this.search = new HeightSearch(world);
  }

  at(x: number, z: number): number {
    const slot = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) & (HEIGHT_SLOTS - 1);
    if (this.keysX[slot] === x && this.keysZ[slot] === z) return this.values[slot] as number;
    const h = this.search.height(x, z, 'surface');
    this.keysX[slot] = x;
    this.keysZ[slot] = z;
    this.values[slot] = h;
    return h;
  }
}

/** Whether the column at `(x, z)` is steep, by the heights `height` gives. */
export function isSteep(x: number, z: number, height: (x: number, z: number) => number): boolean {
  const minX = x & ~15;
  const minZ = z & ~15;
  const north = Math.max(z - 1, minZ);
  const south = Math.min(z + 1, minZ + 15);
  if (height(x, south) >= height(x, north) + STEEP_RISE) return true;
  const west = Math.max(x - 1, minX);
  const east = Math.min(x + 1, minX + 15);
  return height(west, z) >= height(east, z) + STEEP_RISE;
}

/** `steep`. */
export class Steep extends MaterialCondition {
  compile(context: MaterialRuleContext): () => boolean {
    const heights = new Heights(context as unknown as ContextParts);
    const height = (x: number, z: number) => heights.at(x, z);
    let lastUpdate = Number.NaN;
    let result = false;
    return () => {
      if (context.lastUpdateXZ !== lastUpdate) {
        lastUpdate = context.lastUpdateXZ;
        result = isSteep(context.blockX, context.blockZ, height);
      }
      return result;
    };
  }
}

export const steep: ConditionType = {
  type: 'steep',
  parse: () => new Steep(),
};
