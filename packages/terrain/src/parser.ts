/**
 * The parser front for density functions (ADR 0119 D3 seam 2, spike B574 WS10) and the engine's
 * own density function nodes.
 *
 * The front handles the types the extensions add (`extensions/index.ts`), `interpolated` (our cell
 * grid, F10) and `cache` (a last-position cache), and hands every other node to deepslate's
 * `DensityFunction.fromJson` with itself as the child parser. A reference to a missing named
 * function or noise becomes 0; the walker (`unsupported.ts`) has already reported it.
 *
 * `CellInterpolated` and `PointCache` adapt the lerp order and corner positions of deepslate's
 * `Interpolated` (deepslate 0.27.2, MIT, Copyright (c) Misode), so their values are identical.
 */

import {
  DensityFunction,
  Holder,
  Identifier,
  type Interval,
  WorldgenRegistries,
} from 'deepslate/worldgen';
import { densityFunctionTypes } from './extensions';
import { shortType } from './prepass';

/**
 * One density function type the engine adds to deepslate (B581 fills `densityFunctionTypes` in
 * `extensions/index.ts` with entries of this shape).
 */
export interface DensityFunctionType {
  /** The type id, with or without `minecraft:`. */
  readonly type: string;
  /** Parses one node; `child` is the front, for its child functions. */
  parse(json: Readonly<Record<string, unknown>>, child: DensityParser): DensityFunction;
}

/** The front: parses any density function JSON (a reference, a number or a node). */
export type DensityParser = (json: unknown) => DensityFunction;

/** The world's vertical range, which bounds a cell grid's corner columns. */
export interface VerticalRange {
  readonly minY: number;
  readonly height: number;
}

/** Entries of a list that have the {@link DensityFunctionType} shape. */
export function densityTypesFrom(list: readonly unknown[]): Map<string, DensityFunctionType> {
  const out = new Map<string, DensityFunctionType>();
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Partial<DensityFunctionType>;
    if (typeof e.type === 'string' && typeof e.parse === 'function') {
      out.set(shortType(e.type) ?? e.type, e as DensityFunctionType);
    }
  }
  return out;
}

const NOISE_TYPES = new Set(['noise', 'shift_a', 'shift_b', 'shift']);

function readInt(value: unknown, fallback: number): number {
  return typeof value === 'number' ? Math.floor(value) : fallback;
}

/**
 * Makes the front. `hasFunction` and `hasNoise` say whether a named function or noise exists in
 * the world's files.
 */
export function makeDensityParser(options: {
  readonly range: VerticalRange;
  readonly hasFunction: (id: string) => boolean;
  readonly hasNoise: (id: string) => boolean;
  readonly extensions?: readonly unknown[];
}): DensityParser {
  const extensions = densityTypesFrom(options.extensions ?? densityFunctionTypes);
  const parse: DensityParser = (json) => {
    if (typeof json === 'string') {
      if (!options.hasFunction(json)) return DensityFunction.Constant.ZERO;
      return new DensityFunction.HolderHolder(
        Holder.reference(WorldgenRegistries.DENSITY_FUNCTION, Identifier.parse(json)),
      );
    }
    if (typeof json === 'number') return new DensityFunction.Constant(json);
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return DensityFunction.Constant.ZERO;
    }
    const node = json as Record<string, unknown>;
    const type = shortType(node.type) ?? '';
    const extension = extensions.get(type);
    if (extension) return extension.parse(node, parse);
    if (type === 'interpolated') {
      return new CellInterpolated(
        parse(node.input ?? node.argument),
        readInt(node.cell_size_xz, 4),
        readInt(node.cell_size_y, 4),
        options.range,
      );
    }
    if (type === 'cache') return new PointCache(parse(node.input ?? node.argument));
    if (NOISE_TYPES.has(type)) {
      const noise = node.noise ?? node.argument;
      // An inline noise has no id to seed it from, and a missing one cannot be made: both are 0.
      if (typeof noise !== 'string' || !options.hasNoise(noise)) {
        return DensityFunction.Constant.ZERO;
      }
    }
    return DensityFunction.fromJson(node, parse);
  };
  return parse;
}

/** Packs a corner column's cell coordinates into one number key. */
function columnKey(cx: number, cz: number): number {
  return cx * 67108864 + (cz + 33554432);
}

/** How many corner columns a cell grid keeps before it starts again (bounded memory, F10). */
export const CELL_GRID_COLUMNS = 8192;

/**
 * `interpolated` over a cell grid (F10): corner values are kept per corner column in a typed
 * array over the world's cell rows, keyed by a number, and the grid starts again past
 * {@link CELL_GRID_COLUMNS} columns. Corners are computed only when a lerp needs them, at the
 * positions and in the order deepslate's `Interpolated` uses, so the values are identical.
 */
export class CellInterpolated extends DensityFunction {
  private readonly columns = new Map<number, Float64Array>();
  private readonly rowMin: number;
  private readonly rows: number;

  readonly input: DensityFunction;
  readonly cellSizeXz: number;
  readonly cellSizeY: number;
  readonly verticalRange: VerticalRange;

  constructor(
    input: DensityFunction,
    cellSizeXz: number,
    cellSizeY: number,
    verticalRange: VerticalRange,
  ) {
    super();
    this.input = input;
    this.cellSizeXz = cellSizeXz;
    this.cellSizeY = cellSizeY;
    this.verticalRange = verticalRange;
    this.rowMin = Math.floor(verticalRange.minY / cellSizeY) - 1;
    this.rows =
      Math.floor((verticalRange.minY + verticalRange.height) / cellSizeY) + 2 - this.rowMin;
  }

  /** The input's value at the corner of cell `(cx, cy, cz)`. */
  corner(cx: number, cy: number, cz: number): number {
    const row = cy - this.rowMin;
    if (row < 0 || row >= this.rows) {
      return this.input.compute({
        x: cx * this.cellSizeXz,
        y: cy * this.cellSizeY,
        z: cz * this.cellSizeXz,
      });
    }
    const key = columnKey(cx, cz);
    let column = this.columns.get(key);
    if (column === undefined) {
      if (this.columns.size >= CELL_GRID_COLUMNS) this.columns.clear();
      column = new Float64Array(this.rows).fill(Number.NaN);
      this.columns.set(key, column);
    }
    let value = column[row] as number;
    if (Number.isNaN(value)) {
      value = this.input.compute({
        x: cx * this.cellSizeXz,
        y: cy * this.cellSizeY,
        z: cz * this.cellSizeXz,
      });
      column[row] = value;
    }
    return value;
  }

  /** Whether a corner is already known (for the height search's bounds). */
  cornerKnown(cx: number, cy: number, cz: number): number | undefined {
    const row = cy - this.rowMin;
    if (row < 0 || row >= this.rows) return undefined;
    const value = this.columns.get(columnKey(cx, cz))?.[row];
    return value === undefined || Number.isNaN(value) ? undefined : value;
  }

  private lerpX(fx: number, cx: number, cy: number, cz: number): number {
    const a = this.corner(cx, cy, cz);
    if (fx === 0) return a;
    return a + fx * (this.corner(cx + 1, cy, cz) - a);
  }

  private plane(fx: number, fy: number, cx: number, cy: number, cz: number): number {
    const a = this.lerpX(fx, cx, cy, cz);
    if (fy === 0) return a;
    return a + fy * (this.lerpX(fx, cx, cy + 1, cz) - a);
  }

  compute(context: DensityFunction.Context): number {
    const w = this.cellSizeXz;
    const h = this.cellSizeY;
    const { x, y, z } = context;
    const fx = (((x % w) + w) % w) / w;
    const fy = (((y % h) + h) % h) / h;
    const fz = (((z % w) + w) % w) / w;
    const cx = Math.floor(x / w);
    const cy = Math.floor(y / h);
    const cz = Math.floor(z / w);
    const a = this.plane(fx, fy, cx, cy, cz);
    if (fz === 0) return a;
    return a + fz * (this.plane(fx, fy, cx, cy, cz + 1) - a);
  }

  mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new CellInterpolated(
      visitor.apply(this.input),
      this.cellSizeXz,
      this.cellSizeY,
      this.verticalRange,
    );
  }

  range(): Interval {
    return this.input.range();
  }
}

/** `cache`: keeps the value of the last position asked (the same node is often asked twice). */
export class PointCache extends DensityFunction {
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastZ = Number.NaN;
  private lastValue = 0;
  readonly input: DensityFunction;

  constructor(input: DensityFunction) {
    super();
    this.input = input;
  }

  compute(context: DensityFunction.Context): number {
    const { x, y, z } = context;
    if (x === this.lastX && y === this.lastY && z === this.lastZ) return this.lastValue;
    const value = this.input.compute(context);
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
    this.lastValue = value;
    return value;
  }

  mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new PointCache(visitor.apply(this.input));
  }

  range(): Interval {
    return this.input.range();
  }
}

const COLUMN_SLOTS = 256;

/**
 * The per-column cache: wraps a function whose value does not depend on y (found by
 * `columnConstant` in `fill.ts`) and keeps its value per column in a small direct-mapped table.
 */
export class ColumnCache extends DensityFunction {
  private readonly keysX = new Float64Array(COLUMN_SLOTS).fill(Number.NaN);
  private readonly keysZ = new Float64Array(COLUMN_SLOTS).fill(Number.NaN);
  private readonly values = new Float64Array(COLUMN_SLOTS);
  readonly input: DensityFunction;

  constructor(input: DensityFunction) {
    super();
    this.input = input;
  }

  /** The value at a column, whatever y is asked. */
  at(x: number, z: number): number {
    const slot = (Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663)) & (COLUMN_SLOTS - 1);
    if (this.keysX[slot] === x && this.keysZ[slot] === z) return this.values[slot] as number;
    const value = this.input.compute({ x, y: 0, z });
    this.keysX[slot] = x;
    this.keysZ[slot] = z;
    this.values[slot] = value;
    return value;
  }

  compute(context: DensityFunction.Context): number {
    return this.at(context.x, context.z);
  }

  mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new ColumnCache(visitor.apply(this.input));
  }

  range(): Interval {
    return this.input.range();
  }
}
