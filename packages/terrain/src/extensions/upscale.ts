/**
 * The density function `upscale` (ADR 0119 D3; plan brief B581; a type of the newer target's
 * registry): its input computed at the corners of a grid of cells, `cell_size` blocks on each
 * axis, and the value between the corners made per axis by that axis's `mode`. Every axis
 * `interpolate_linear` with equal x and z cells is mapped onto `interpolated` by the pre-pass
 * (F4); every other `upscale` is this class.
 *
 * The axes are applied one after another, x first, then y, then z (as `interpolated` lerps), each
 * from the corners of the cell the position is in (`t` is the position's fraction of the cell):
 *
 * - `interpolate_linear`: `a + t (b - a)` over the cell's two corners;
 * - `nearest_neighbor`: the cell's lower corner;
 * - `interpolate_cosine`: the linear lerp with `t` eased to `(1 - cos(pi t)) / 2`;
 * - `interpolate_cubic`: a cubic through the four corners around the cell (the two of the cell and
 *   one on each side), which passes through the cell's corners (a Catmull-Rom curve);
 * - `b_spline_cubic`: the uniform cubic B-spline over the same four corners, which smooths and
 *   does not pass through them.
 *
 * Learned by observation on the worldgen parity fixture's `upscale_*` dimensions (B581; the spike
 * B574 learned linear, nearest and cosine on a fixture of its own), never from a method body.
 */

import { DensityFunction, Interval } from 'deepslate/worldgen';
import type { DensityFunctionType, DensityParser } from '../parser';

export type UpscaleMode =
  | 'interpolate_linear'
  | 'nearest_neighbor'
  | 'interpolate_cosine'
  | 'interpolate_cubic'
  | 'b_spline_cubic';

const MODES: readonly UpscaleMode[] = [
  'interpolate_linear',
  'nearest_neighbor',
  'interpolate_cosine',
  'interpolate_cubic',
  'b_spline_cubic',
];

/** One axis of an `upscale`. */
export interface UpscaleAxis {
  readonly cellSize: number;
  readonly mode: UpscaleMode;
}

/** Which corners an axis reads, relative to the cell's lower corner. */
function cornersOf(mode: UpscaleMode): readonly number[] {
  switch (mode) {
    case 'nearest_neighbor':
      return [0];
    case 'interpolate_cubic':
    case 'b_spline_cubic':
      return [-1, 0, 1, 2];
    default:
      return [0, 1];
  }
}

/** The value between corners `v` (as `cornersOf` lists them) at fraction `t`. */
export function interpolate(mode: UpscaleMode, t: number, v: readonly number[]): number {
  switch (mode) {
    case 'nearest_neighbor':
      return v[0] as number;
    case 'interpolate_linear': {
      const a = v[0] as number;
      return t === 0 ? a : a + t * ((v[1] as number) - a);
    }
    case 'interpolate_cosine': {
      const a = v[0] as number;
      if (t === 0) return a;
      const e = (1 - Math.cos(Math.PI * t)) / 2;
      return a + e * ((v[1] as number) - a);
    }
    case 'interpolate_cubic': {
      const p0 = v[0] as number;
      const p1 = v[1] as number;
      const p2 = v[2] as number;
      const p3 = v[3] as number;
      if (t === 0) return p1;
      return (
        0.5 *
        (2 * p1 +
          (p2 - p0) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (3 * (p1 - p2) + p3 - p0) * t * t * t)
      );
    }
    case 'b_spline_cubic': {
      const p0 = v[0] as number;
      const p1 = v[1] as number;
      const p2 = v[2] as number;
      const p3 = v[3] as number;
      const u = 1 - t;
      const t2 = t * t;
      const t3 = t2 * t;
      return (
        (u * u * u * p0 +
          (3 * t3 - 6 * t2 + 4) * p1 +
          (-3 * t3 + 3 * t2 + 3 * t + 1) * p2 +
          t3 * p3) /
        6
      );
    }
  }
}

/** How many corner columns an `upscale` keeps before it starts again (bounded memory). */
export const UPSCALE_COLUMNS = 8192;

/** `upscale`. */
export class Upscale extends DensityFunction {
  private readonly columns = new Map<number, Map<number, number>>();
  private readonly context = { x: 0, y: 0, z: 0 };
  private readonly scratch: number[][];

  readonly input: DensityFunction;
  readonly x: UpscaleAxis;
  readonly y: UpscaleAxis;
  readonly z: UpscaleAxis;

  constructor(input: DensityFunction, x: UpscaleAxis, y: UpscaleAxis, z: UpscaleAxis) {
    super();
    this.input = input;
    this.x = x;
    this.y = y;
    this.z = z;
    this.scratch = [[], [], []];
  }

  /** The input at the corner `(i, j, k)` (in cells). */
  corner(i: number, j: number, k: number): number {
    const key = (i + 33554432) * 67108864 + (k + 33554432);
    let column = this.columns.get(key);
    if (column === undefined) {
      if (this.columns.size >= UPSCALE_COLUMNS) this.columns.clear();
      column = new Map();
      this.columns.set(key, column);
    }
    let value = column.get(j);
    if (value === undefined) {
      const c = this.context;
      c.x = i * this.x.cellSize;
      c.y = j * this.y.cellSize;
      c.z = k * this.z.cellSize;
      value = this.input.compute(c);
      column.set(j, value);
    }
    return value;
  }

  compute(context: DensityFunction.Context): number {
    const { x: ax, y: ay, z: az } = this;
    const fx = cell(context.x, ax.cellSize);
    const fy = cell(context.y, ay.cellSize);
    const fz = cell(context.z, az.cellSize);
    const cx = cornersOf(ax.mode);
    const cy = cornersOf(ay.mode);
    const cz = cornersOf(az.mode);
    // x first, then y, then z.
    const alongZ = this.scratch[2] as number[];
    alongZ.length = 0;
    for (const dz of cz) {
      const alongY = this.scratch[1] as number[];
      alongY.length = 0;
      for (const dy of cy) {
        const alongX = this.scratch[0] as number[];
        alongX.length = 0;
        for (const dx of cx) alongX.push(this.corner(fx.i + dx, fy.i + dy, fz.i + dz));
        alongY.push(interpolate(ax.mode, fx.t, alongX));
      }
      alongZ.push(interpolate(ay.mode, fy.t, alongY));
    }
    return interpolate(az.mode, fz.t, alongZ);
  }

  mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new Upscale(visitor.apply(this.input), this.x, this.y, this.z);
  }

  range(): Interval {
    const r = this.input.range();
    // Linear, nearest and cosine stay between corners; the cubics can overshoot them.
    const cubic = [this.x, this.y, this.z].some(
      (a) => a.mode === 'interpolate_cubic' || a.mode === 'b_spline_cubic',
    );
    if (!cubic) return r;
    const span = r.max - r.min;
    // Catmull-Rom overshoots by at most an eighth of the span per axis; three axes compound it.
    const pad = Number.isFinite(span) ? span * 1.5 : Number.POSITIVE_INFINITY;
    return Interval.of(r.min - pad, r.max + pad);
  }
}

function cell(coordinate: number, size: number): { i: number; t: number } {
  const i = Math.floor(coordinate / size);
  return { i, t: (coordinate - i * size) / size };
}

function readAxis(value: unknown): UpscaleAxis {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const size = typeof o.cell_size === 'number' ? Math.max(1, Math.floor(o.cell_size)) : 1;
  const raw = typeof o.mode === 'string' ? o.mode.replace(/^minecraft:/, '') : 'interpolate_linear';
  const mode = (MODES as readonly string[]).includes(raw)
    ? (raw as UpscaleMode)
    : 'interpolate_linear';
  return { cellSize: size, mode };
}

export const upscale: DensityFunctionType = {
  type: 'upscale',
  parse(json, child: DensityParser): DensityFunction {
    return new Upscale(
      child(json.input ?? json.argument),
      readAxis(json.x),
      readAxis(json.y),
      readAxis(json.z),
    );
  },
};
