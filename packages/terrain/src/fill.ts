/**
 * The fill (ADR 0119 D3 seam 5; spike B574 F10 and the Height map's per-column cache):
 *
 * - `optimise` wraps every part of a density function whose value does not depend on y in a
 *   `ColumnCache` (the splines of continents, erosion and ridges, the preliminary surface), so a
 *   column computes them once, not once per cell corner;
 * - `ChunkFill` gives the block a chunk's terrain has at a position (density, then the aquifer),
 *   with one aquifer per chunk as the game has, over the cell grids of `CellInterpolated`;
 * - `HeightSearch` finds the top of a column by bounding the final density over ranges of y
 *   (interval arithmetic, with the column's own exact values for the parts that do not depend on
 *   y) and evaluating exactly only the cells that may hold the surface.
 *
 * The aquifer: deepslate 0.27.2 hands `NoiseAquifer` the settings' unmapped functions, whose
 * noises are all 0, and the spike measured that route against real worlds (WS7: the fluid differs
 * in 0.28 to 0.36 % of cells). Binding the aquifer's noises changes 3.3 % of the cells below y 100
 * (measured by B578) without a check against the game, so the engine keeps deepslate's values
 * (`BIND_AQUIFER_NOISES` false) and only resolves the names, so a world never reads another
 * world's registries (F9). B579's parity decides which matches the game.
 */

import {
  type AquiferConfig,
  BlockState,
  DensityFunction,
  DensityVolume,
  type FluidPicker,
  NoiseAquifer,
  type NoiseGeneratorSettings,
  NoiseRouter,
  type PositionalRandom,
} from 'deepslate/worldgen';
import { CellInterpolated, ColumnCache, PointCache } from './parser';

const DF = DensityFunction;

/** Whether a function's value is the same at every y of a column. */
export function columnConstant(
  fn: DensityFunction,
  memo: WeakMap<DensityFunction, boolean> = new WeakMap(),
): boolean {
  const known = memo.get(fn);
  if (known !== undefined) return known;
  memo.set(fn, false); // a cycle counts as depending on y
  const all = (children: readonly DensityFunction[]) =>
    children.every((c) => columnConstant(c, memo));
  let result: boolean;
  if (fn instanceof ColumnCache || fn instanceof DF.Constant) result = true;
  else if (fn instanceof DF.HolderHolder) result = columnConstant(fn.holder.value(), memo);
  else if (fn instanceof DF.Gradient) result = fn.axis !== 'y';
  else if (fn instanceof DF.ShiftA || fn instanceof DF.ShiftB) result = true;
  else if (fn instanceof DF.EndOuterIslands) result = true;
  else if (fn instanceof DF.FindTopSurface) result = columnConstant(fn.upperBound, memo);
  else if (fn instanceof DF.NoiseFunction) {
    result = fn.yScale === 0 && all([fn.shiftX, fn.shiftY, fn.shiftZ]);
  } else if (fn instanceof DF.Spline) result = all(splineCoordinates(fn.spline));
  else if (
    fn instanceof CellInterpolated ||
    fn instanceof PointCache ||
    fn instanceof DF.Cache ||
    fn instanceof DF.RangeChoice ||
    fn instanceof DF.Clamp ||
    fn instanceof DF.Unary ||
    fn instanceof DF.Binary ||
    fn instanceof DF.MulOrAdd ||
    fn instanceof DF.Lerp ||
    fn instanceof DF.Round ||
    fn instanceof DF.Pow ||
    fn instanceof DF.BlendDensity ||
    fn instanceof DF.IntervalSelect ||
    fn instanceof DF.Slice
  ) {
    result = all(childrenOf(fn));
  } else result = false; // old_blended_noise, shift, distance_to_point and anything unknown
  memo.set(fn, result);
  return result;
}

/** The direct child functions of a node (through its own `mapChildren`). */
export function childrenOf(fn: DensityFunction): DensityFunction[] {
  const out: DensityFunction[] = [];
  fn.mapChildren({
    apply: (child) => {
      out.push(child);
      return child;
    },
  });
  return out;
}

interface SplineLike {
  readonly coordinate?: unknown;
  readonly values?: readonly SplineLike[];
}

function splineCoordinates(spline: unknown): DensityFunction[] {
  const out: DensityFunction[] = [];
  const walk = (s: SplineLike) => {
    if (s.coordinate instanceof DensityFunction) out.push(s.coordinate);
    for (const v of s.values ?? []) walk(v);
  };
  walk(spline as SplineLike);
  return out;
}

/**
 * Wraps every part that does not depend on y in a `ColumnCache` (the per-column cache), the parts
 * inside it too, so a function shared by several (continents inside the offset, factor and
 * jaggedness splines) is computed once a column. A node reached twice is optimised once.
 */
export function optimise(
  fn: DensityFunction,
  memo: Map<DensityFunction, DensityFunction> = new Map(),
  constants: WeakMap<DensityFunction, boolean> = new WeakMap(),
): DensityFunction {
  const done = memo.get(fn);
  if (done) return done;
  let out: DensityFunction;
  if (fn instanceof DF.Constant || fn instanceof ColumnCache) out = fn;
  else if (fn instanceof DF.HolderHolder) out = optimise(fn.holder.value(), memo, constants);
  else if (columnConstant(fn, constants)) {
    let inner = fn.mapChildren({ apply: (child) => optimise(child, memo, constants) });
    if (inner instanceof DF.Binary) inner = inner.trySimplify();
    out = new ColumnCache(inner);
  } else {
    out = fn.mapChildren({ apply: (child) => optimise(child, memo, constants) });
    if (out instanceof DF.Binary) out = out.trySimplify();
  }
  memo.set(fn, out);
  return out;
}

/**
 * Binds a parsed function to a random state's noises (`RandomState.createVisitor`), resolving
 * each named function once: deepslate's own `mapAll` maps a named function again at every
 * reference (its visitor sees the reference only after the children were mapped), so the
 * `cache` of `sloped_cheese`, read three times a corner, would be three nodes.
 */
export class NoiseBinder {
  private readonly byKey = new Map<string, DensityFunction>();
  private readonly byNode = new Map<DensityFunction, DensityFunction>();
  private readonly visitor: DensityFunction.Visitor;

  constructor(visitor: DensityFunction.Visitor) {
    this.visitor = visitor;
  }

  bind(fn: DensityFunction): DensityFunction {
    if (fn instanceof DF.HolderHolder) {
      const key = fn.holder.key()?.toString();
      if (key === undefined) return this.bind(fn.holder.value());
      let out = this.byKey.get(key);
      if (!out) {
        out = this.bind(fn.holder.value());
        this.byKey.set(key, out);
      }
      return out;
    }
    let out = this.byNode.get(fn);
    if (!out) {
      out = this.visitor.apply(fn.mapChildren({ apply: (child) => this.bind(child) }));
      this.byNode.set(fn, out);
    }
    return out;
  }
}

/** Whether the aquifer's functions get the world's noises (see the module comment). */
export const BIND_AQUIFER_NOISES = false;

/** The router and aquifer functions of one world, bound to its noises and optimised together. */
export function optimiseRouter(
  unbound: NoiseRouter,
  unboundAquifers: AquiferConfig | undefined,
  noiseVisitor: DensityFunction.Visitor,
): { router: NoiseRouter; aquifers: AquiferConfig | undefined } {
  const binder = new NoiseBinder(noiseVisitor);
  const aquiferBinder = BIND_AQUIFER_NOISES ? binder : new NoiseBinder({ apply: (fn) => fn });
  const router = unbound;
  const memo = new Map<DensityFunction, DensityFunction>();
  const constants = new WeakMap<DensityFunction, boolean>();
  const visitor = { apply: (fn: DensityFunction) => optimise(binder.bind(fn), memo, constants) };
  const aquiferVisitor = {
    apply: (fn: DensityFunction) => optimise(aquiferBinder.bind(fn), memo, constants),
  };
  const aquifers = unboundAquifers;
  return {
    router: NoiseRouter.create({
      temperature: visitor.apply(router.temperature),
      vegetation: visitor.apply(router.vegetation),
      continents: visitor.apply(router.continents),
      erosion: visitor.apply(router.erosion),
      depth: visitor.apply(router.depth),
      ridges: visitor.apply(router.ridges),
      chunkSurfaceLevel: visitor.apply(router.chunkSurfaceLevel),
      finalDensity: visitor.apply(router.finalDensity),
    }),
    aquifers: aquifers
      ? {
          barrier: aquiferVisitor.apply(aquifers.barrier),
          fluidLevelFloodedness: aquiferVisitor.apply(aquifers.fluidLevelFloodedness),
          fluidLevelSpread: aquiferVisitor.apply(aquifers.fluidLevelSpread),
          lava: aquiferVisitor.apply(aquifers.lava),
          exclusion: aquiferVisitor.apply(aquifers.exclusion),
          surfaceLevel: aquiferVisitor.apply(aquifers.surfaceLevel),
        }
      : undefined,
  };
}

/** What the fill needs of a world. */
export interface FillWorld {
  readonly settings: NoiseGeneratorSettings;
  readonly router: NoiseRouter;
  readonly aquifers: AquiferConfig | undefined;
  readonly aquiferRandom: PositionalRandom;
  readonly fluidPicker: FluidPicker;
}

/**
 * One chunk's terrain: the block at a position is the final density, then the chunk's aquifer
 * (`undefined` from the aquifer is the default block), as deepslate's `doFill` decides it.
 */
export class ChunkFill {
  private readonly aquifer: {
    computeSubstance(x: number, y: number, z: number, d: number): BlockState | undefined;
  };
  private readonly context = { x: 0, y: 0, z: 0 };

  private readonly world: FillWorld;
  readonly chunkX: number;
  readonly chunkZ: number;

  constructor(world: FillWorld, chunkX: number, chunkZ: number) {
    this.world = world;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    const { settings } = world;
    if (world.aquifers) {
      const volume = new DensityVolume(
        16,
        settings.noise.height,
        16,
        chunkX * 16,
        settings.noise.minY,
        chunkZ * 16,
      );
      this.aquifer = new NoiseAquifer(
        world.aquifers,
        world.aquiferRandom,
        volume,
        world.fluidPicker,
      );
    } else {
      const picker = world.fluidPicker;
      this.aquifer = {
        computeSubstance: (x, y, z, density) => (density > 0 ? undefined : picker(x, y, z).at(y)),
      };
    }
  }

  /** The final density at a block. */
  density(x: number, y: number, z: number): number {
    const c = this.context;
    c.x = x;
    c.y = y;
    c.z = z;
    return this.world.router.finalDensity.compute(c);
  }

  /** The block the terrain has at a position of this chunk. */
  state(x: number, y: number, z: number): BlockState {
    const density = this.density(x, y, z);
    return this.aquifer.computeSubstance(x, y, z, density) ?? this.world.settings.defaultBlock;
  }
}

/** A small cache of chunk fills (the aquifer is per chunk). */
export class ChunkFills {
  private readonly fills = new Map<number, ChunkFill>();

  private readonly world: FillWorld;
  private readonly limit: number;

  constructor(world: FillWorld, limit = 64) {
    this.world = world;
    this.limit = limit;
  }

  at(blockX: number, blockZ: number): ChunkFill {
    const cx = blockX >> 4;
    const cz = blockZ >> 4;
    const key = cx * 4194304 + (cz + 2097152);
    let fill = this.fills.get(key);
    if (!fill) {
      if (this.fills.size >= this.limit) this.fills.clear();
      fill = new ChunkFill(this.world, cx, cz);
      this.fills.set(key, fill);
    }
    return fill;
  }
}

// --- Bounds over a column segment, and the height search ---

/**
 * A compiled bound: for column `(x, z)` between `ylo` and `yhi`, writes the lowest and highest
 * value the function can take there into `B.lo` and `B.hi` (never narrower than the values).
 */
export type BoundFn = (x: number, z: number, ylo: number, yhi: number) => void;

/** The bound registers every `BoundFn` writes (no allocation while bounding). */
export const B = { lo: 0, hi: 0 };

function set(lo: number, hi: number): void {
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    B.lo = Number.NEGATIVE_INFINITY;
    B.hi = Number.POSITIVE_INFINITY;
  } else {
    B.lo = lo;
    B.hi = hi;
  }
}

function setProduct(alo: number, ahi: number, blo: number, bhi: number): void {
  const p1 = alo * blo;
  const p2 = alo * bhi;
  const p3 = ahi * blo;
  const p4 = ahi * bhi;
  // 0 * infinity counts as 0, as a bound of a product with an exact 0.
  const a = Number.isNaN(p1) ? 0 : p1;
  const b = Number.isNaN(p2) ? 0 : p2;
  const c = Number.isNaN(p3) ? 0 : p3;
  const d = Number.isNaN(p4) ? 0 : p4;
  set(Math.min(a, b, c, d), Math.max(a, b, c, d));
}

/** Float32 rounding of deepslate's lerps and splines: a bound is widened by it. */
function pad(v: number): number {
  return Math.abs(v) * 1e-6 + 1e-12;
}

function setMonotone(lo: number, hi: number, f: (v: number) => number): void {
  const a = f(lo);
  const c = f(hi);
  set(Math.min(a, c), Math.max(a, c));
}

function squeeze(v: number): number {
  const c = Math.min(1, Math.max(-1, v));
  return c / 2 - (c * c * c) / 24;
}

function unaryBound(type: string): (lo: number, hi: number) => void {
  switch (type) {
    case 'abs':
      return (lo, hi) => {
        if (lo >= 0) set(lo, hi);
        else if (hi <= 0) set(-hi, -lo);
        else set(0, Math.max(-lo, hi));
      };
    case 'square':
      return (lo, hi) => {
        const a = lo >= 0 ? lo : hi <= 0 ? -hi : 0;
        const b = Math.max(Math.abs(lo), Math.abs(hi));
        set(a * a, b * b);
      };
    case 'cube':
      return (lo, hi) => setMonotone(lo, hi, (v) => v * v * v);
    case 'half_negative':
      return (lo, hi) => setMonotone(lo, hi, (v) => (v > 0 ? v : v * 0.5));
    case 'quarter_negative':
      return (lo, hi) => setMonotone(lo, hi, (v) => (v > 0 ? v : v * 0.25));
    case 'squeeze':
      return (lo, hi) => setMonotone(lo, hi, squeeze);
    case 'negate':
      return (lo, hi) => set(-hi, -lo);
    case 'sign':
      return (lo, hi) => setMonotone(lo, hi, Math.sign);
    case 'sqrt':
      return (lo, hi) => (lo >= 0 ? setMonotone(lo, hi, Math.sqrt) : set(Number.NaN, 0));
    case 'log':
      return (lo, hi) => (lo > 0 ? setMonotone(lo, hi, Math.log) : set(Number.NaN, 0));
    default:
      return () => set(Number.NaN, 0);
  }
}

/**
 * How bounds are compiled: `point` bounds are asked at one y only (a cell corner), where the
 * terrain's base noise (`old_blended_noise`) is computed exactly rather than bounded by its range;
 * other noises stay ranges. Each node is compiled once per mode.
 */
interface BoundCompiler {
  readonly memo: Map<DensityFunction, BoundFn>;
  readonly cells: CellInterpolated[];
  readonly point: boolean;
  /** The other mode's compiler (point bounds for a cell grid's corners). */
  pointCompiler?: BoundCompiler;
}

/** Compiles the bound of a function tree (each node once). */
export function compileBound(fn: DensityFunction, cells: CellInterpolated[] = []): BoundFn {
  return compileWith(fn, { memo: new Map(), cells, point: false });
}

function compileWith(fn: DensityFunction, c: BoundCompiler): BoundFn {
  const known = c.memo.get(fn);
  if (known) return known;
  // A placeholder for cycles: no bound.
  c.memo.set(fn, () => set(Number.NaN, 0));
  const out = compileNode(fn, c);
  c.memo.set(fn, out);
  return out;
}

function fromRange(fn: DensityFunction): BoundFn {
  const r = fn.range();
  const lo = r.min;
  const hi = r.max;
  return () => set(lo, hi);
}

function compileNode(fn: DensityFunction, c: BoundCompiler): BoundFn {
  const sub = (f: DensityFunction) => compileWith(f, c);
  if (fn instanceof ColumnCache) {
    return (x, z) => {
      const v = fn.at(x, z);
      set(v, v);
    };
  }
  if (fn instanceof DF.Constant) {
    const v = fn.value;
    return () => set(v, v);
  }
  if (fn instanceof DF.HolderHolder) return sub(fn.holder.value());
  if (fn instanceof PointCache || fn instanceof DF.Cache || fn instanceof DF.BlendDensity) {
    return sub(fn.input);
  }
  if (fn instanceof CellInterpolated) {
    if (!c.point) c.cells.push(fn);
    c.pointCompiler ??= c.point ? c : { memo: new Map(), cells: c.cells, point: true };
    return cellBound(fn, sub(fn.input), compileWith(fn.input, c.pointCompiler));
  }
  if (fn instanceof DF.OldBlendedNoise && c.point) {
    const range = fn.range();
    const ctx = { x: 0, y: 0, z: 0 };
    return (x, z, ylo, yhi) => {
      if (ylo !== yhi) {
        set(range.min, range.max);
        return;
      }
      ctx.x = x;
      ctx.y = ylo;
      ctx.z = z;
      const v = fn.compute(ctx);
      set(v, v);
    };
  }
  if (fn instanceof DF.Gradient) {
    const ctx = { x: 0, y: 0, z: 0 };
    if (fn.axis !== 'y') {
      return (x, z, ylo) => {
        ctx.x = x;
        ctx.y = ylo;
        ctx.z = z;
        const v = fn.compute(ctx);
        set(v, v);
      };
    }
    if (fn.tiling !== 'clamp_to_edge') {
      const lo = Math.min(fn.fromValue, fn.toValue);
      const hi = Math.max(fn.fromValue, fn.toValue);
      return () => set(lo, hi);
    }
    return (x, z, ylo, yhi) => {
      ctx.x = x;
      ctx.z = z;
      ctx.y = ylo;
      const a = fn.compute(ctx);
      ctx.y = yhi;
      const b = fn.compute(ctx);
      set(Math.min(a, b), Math.max(a, b));
    };
  }
  if (fn instanceof DF.NoiseFunction) {
    if (!fn.noiseSampler) return () => set(0, 0);
    return fromRange(fn);
  }
  if (fn instanceof DF.RangeChoice) {
    const input = sub(fn.input);
    const inRange = sub(fn.whenInRange);
    const outRange = sub(fn.whenOutOfRange);
    const min = fn.minInclusive;
    const max = fn.maxExclusive;
    return (x, z, ylo, yhi) => {
      input(x, z, ylo, yhi);
      const lo = B.lo;
      const hi = B.hi;
      if (lo >= min && hi < max) inRange(x, z, ylo, yhi);
      else if (hi < min || lo >= max) outRange(x, z, ylo, yhi);
      else {
        inRange(x, z, ylo, yhi);
        const alo = B.lo;
        const ahi = B.hi;
        outRange(x, z, ylo, yhi);
        set(Math.min(alo, B.lo), Math.max(ahi, B.hi));
      }
    };
  }
  if (fn instanceof DF.Clamp) {
    const input = sub(fn.input);
    const min = fn.min;
    const max = fn.max;
    return (x, z, ylo, yhi) => {
      input(x, z, ylo, yhi);
      set(Math.min(max, Math.max(min, B.lo)), Math.min(max, Math.max(min, B.hi)));
    };
  }
  if (fn instanceof DF.Unary) {
    const input = sub(fn.input);
    const op = unaryBound(fn.type);
    return (x, z, ylo, yhi) => {
      input(x, z, ylo, yhi);
      op(B.lo, B.hi);
    };
  }
  if (fn instanceof DF.Binary) {
    const left = sub(fn.left);
    const right = sub(fn.right);
    const type = fn.type;
    if (type === 'div') return fromRange(fn);
    return (x, z, ylo, yhi) => {
      left(x, z, ylo, yhi);
      const alo = B.lo;
      const ahi = B.hi;
      right(x, z, ylo, yhi);
      const blo = B.lo;
      const bhi = B.hi;
      switch (type) {
        case 'add':
          set(alo + blo, ahi + bhi);
          break;
        case 'sub':
          set(alo - bhi, ahi - blo);
          break;
        case 'mul':
          setProduct(alo, ahi, blo, bhi);
          break;
        case 'min':
          set(Math.min(alo, blo), Math.min(ahi, bhi));
          break;
        default:
          set(Math.max(alo, blo), Math.max(ahi, bhi));
      }
    };
  }
  if (fn instanceof DF.MulOrAdd) {
    const m = fn as unknown as { type: 'mul' | 'add'; value: number; input: DensityFunction };
    const input = sub(m.input);
    const v = m.value;
    if (m.type === 'add') {
      return (x, z, ylo, yhi) => {
        input(x, z, ylo, yhi);
        set(B.lo + v, B.hi + v);
      };
    }
    return (x, z, ylo, yhi) => {
      input(x, z, ylo, yhi);
      setProduct(B.lo, B.hi, v, v);
    };
  }
  if (fn instanceof DF.Lerp) {
    const alpha = sub(fn.alpha);
    const first = sub(fn.first);
    const second = sub(fn.second);
    return (x, z, ylo, yhi) => {
      alpha(x, z, ylo, yhi);
      const alo = B.lo;
      const ahi = B.hi;
      if (alo === 0 && ahi === 0) {
        first(x, z, ylo, yhi);
        return;
      }
      if (alo === 1 && ahi === 1) {
        second(x, z, ylo, yhi);
        return;
      }
      first(x, z, ylo, yhi);
      const flo = B.lo;
      const fhi = B.hi;
      second(x, z, ylo, yhi);
      const slo = B.lo;
      const shi = B.hi;
      if (alo >= 0 && ahi <= 1) {
        const lo = Math.min(flo, slo);
        const hi = Math.max(fhi, shi);
        set(lo - pad(lo), hi + pad(hi));
        return;
      }
      // first + alpha * (second - first), outside [0, 1] too.
      setProduct(alo, ahi, slo - fhi, shi - flo);
      const lo = flo + B.lo;
      const hi = fhi + B.hi;
      set(lo - pad(lo), hi + pad(hi));
    };
  }
  return fromRange(fn);
}

const INPUT_SLOTS = 1024;
/** Up to this many cell rows, unknown corners are bounded one by one at their points. */
const POINT_ROWS = 3;

/**
 * A cell grid's values over a column segment: the corners it knows, else its input's bound over
 * the cells (kept per corner column and rows, so columns sharing a cell share it).
 */
function cellBound(fn: CellInterpolated, input: BoundFn, pointInput: BoundFn): BoundFn {
  const w = fn.cellSizeXz;
  const h = fn.cellSizeY;
  const keyX = new Float64Array(INPUT_SLOTS).fill(Number.NaN);
  const keyZ = new Float64Array(INPUT_SLOTS);
  const keyLo = new Float64Array(INPUT_SLOTS);
  const keyHi = new Float64Array(INPUT_SLOTS);
  const valLo = new Float64Array(INPUT_SLOTS);
  const valHi = new Float64Array(INPUT_SLOTS);
  const corner = (ix: number, iz: number, rowLo: number, rowHi: number) => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let row = rowLo;
    for (; row <= rowHi; row += 1) {
      const v = fn.cornerKnown(ix, row, iz);
      if (v === undefined) break;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (row > rowHi) {
      B.lo = lo;
      B.hi = hi;
      return;
    }
    if (rowHi - rowLo < POINT_ROWS) {
      // Few rows: each unknown corner bounded at its own point (the base noise exact there).
      for (; row <= rowHi; row += 1) {
        const v = fn.cornerKnown(ix, row, iz);
        if (v !== undefined) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          continue;
        }
        cached(ix, iz, row, row, pointInput);
        if (B.lo < lo) lo = B.lo;
        if (B.hi > hi) hi = B.hi;
      }
      B.lo = lo;
      B.hi = hi;
      return;
    }
    cached(ix, iz, rowLo, rowHi, input);
  };
  const cached = (ix: number, iz: number, rowLo: number, rowHi: number, bound: BoundFn) => {
    const slot =
      (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(rowLo, 83492791) ^ rowHi) &
      (INPUT_SLOTS - 1);
    if (keyX[slot] === ix && keyZ[slot] === iz && keyLo[slot] === rowLo && keyHi[slot] === rowHi) {
      B.lo = valLo[slot] as number;
      B.hi = valHi[slot] as number;
      return;
    }
    bound(ix * w, iz * w, rowLo * h, rowHi * h);
    keyX[slot] = ix;
    keyZ[slot] = iz;
    keyLo[slot] = rowLo;
    keyHi[slot] = rowHi;
    valLo[slot] = B.lo;
    valHi[slot] = B.hi;
  };
  return (x, z, ylo, yhi) => {
    const cx = Math.floor(x / w);
    const cz = Math.floor(z / w);
    const nx = ((x % w) + w) % w === 0 ? cx : cx + 1;
    const nz = ((z % w) + w) % w === 0 ? cz : cz + 1;
    const rowLo = Math.floor(ylo / h);
    const rowHi = Math.floor(yhi / h) + (((yhi % h) + h) % h === 0 ? 0 : 1);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let ix = cx; ix <= nx; ix += 1) {
      for (let iz = cz; iz <= nz; iz += 1) {
        corner(ix, iz, rowLo, rowHi);
        if (B.lo < lo) lo = B.lo;
        if (B.hi > hi) hi = B.hi;
      }
    }
    set(lo - pad(lo), hi + pad(hi));
  };
}

/** The bound of a function over a column segment (compiled each call; for tests). */
export function boundOf(
  fn: DensityFunction,
  x: number,
  z: number,
  ylo: number,
  yhi: number,
): {
  lo: number;
  hi: number;
} {
  compileBound(fn)(x, z, ylo, yhi);
  return { lo: B.lo, hi: B.hi };
}

/**
 * The top of a column: the highest block whose final density is above 0 (`ocean_floor`), or,
 * for `surface`, that or the sea's top block when the land is below the sea level. Ranges of y
 * whose bound is at most 0 are skipped (wide ranges first, narrowing where the bound is above 0);
 * the rest is evaluated block by block over the cell grid. Aquifers are left out: a height map
 * shows the land's shape and the sea.
 */
export class HeightSearch {
  private readonly context = { x: 0, y: 0, z: 0 };
  private readonly world: FillWorld;
  private readonly bound: BoundFn;
  private readonly cells: CellInterpolated[] = [];
  private readonly minY: number;
  private readonly maxY: number;

  constructor(world: FillWorld) {
    this.world = world;
    this.bound = compileBound(world.router.finalDensity, this.cells);
    this.minY = world.settings.noise.minY;
    this.maxY = this.minY + world.settings.noise.height - 1;
  }

  height(x: number, z: number, kind: 'surface' | 'ocean_floor'): number {
    const fd = this.world.router.finalDensity;
    const c = this.context;
    c.x = x;
    c.z = z;
    let top = this.minY - 1;
    let hi = this.maxY;
    let size = 64;
    while (hi >= this.minY) {
      const lo = Math.max(this.minY, hi - size + 1);
      this.bound(x, z, lo, hi);
      if (B.hi <= 0) {
        hi = lo - 1;
        size = Math.min(size * 2, 128);
        continue;
      }
      if (size > 8) {
        size >>= 1;
        continue;
      }
      // Work out the cell grids' corners here, then bound again: the corners make it tight.
      this.warm(x, z, lo, hi);
      this.bound(x, z, lo, hi);
      if (B.hi <= 0) {
        hi = lo - 1;
        continue;
      }
      for (let y = hi; y >= lo; y -= 1) {
        c.y = y;
        if (fd.compute(c) > 0) {
          top = y;
          break;
        }
      }
      if (top >= lo) break;
      hi = lo - 1;
    }
    return this.withSea(x, z, top, kind);
  }

  /** Computes the corners every cell grid of the final density needs between `lo` and `hi`. */
  private warm(x: number, z: number, lo: number, hi: number): void {
    for (const cell of this.cells) {
      const w = cell.cellSizeXz;
      const h = cell.cellSizeY;
      const cx = Math.floor(x / w);
      const cz = Math.floor(z / w);
      const nx = ((x % w) + w) % w === 0 ? cx : cx + 1;
      const nz = ((z % w) + w) % w === 0 ? cz : cz + 1;
      const rowLo = Math.floor(lo / h);
      const rowHi = Math.floor(hi / h) + (((hi % h) + h) % h === 0 ? 0 : 1);
      for (let ix = cx; ix <= nx; ix += 1) {
        for (let iz = cz; iz <= nz; iz += 1) {
          for (let row = rowHi; row >= rowLo; row -= 1) cell.corner(ix, row, iz);
        }
      }
    }
  }

  private withSea(x: number, z: number, found: number, kind: 'surface' | 'ocean_floor'): number {
    let top = found;
    if (kind === 'surface') {
      const sea = Math.min(this.world.settings.seaLevel - 1, this.maxY);
      if (sea > top && sea >= this.minY) {
        const fluid = this.world.fluidPicker(x, sea, z).at(sea);
        if (!fluid.equals(BlockState.AIR)) top = sea;
      }
    }
    return top;
  }
}
