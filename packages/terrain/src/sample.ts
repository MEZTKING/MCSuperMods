/**
 * Sampling for the preview panel (ADR 0119 D7): biomes, heights, side cuts and values.
 *
 * Layouts (B580 and B582 read them): a `MapRegion` covers `width` by `depth` blocks from
 * `(x0, z0)`, one sample every `step` blocks, so a map has `ceil(width / step)` columns and
 * `ceil(depth / step)` rows, row-major from the north-west corner (`cells[row * columns + column]`,
 * x along a row). A `SliceRegion` cuts along `axis` from `from` (inclusive) to `to` (exclusive)
 * at `at` on the other axis, one column every `step` blocks and one row every `yStep` blocks from
 * the world's bottom up (`cells[row * columns + column]`, row 0 at `minY`).
 */

import { BlockState, DensityFunction, type Identifier } from 'deepslate/worldgen';
import type { MapRegion, PaletteGrid, SliceRegion } from './api';
import { AIR_NAME, Palette, SurfaceColumns } from './columns';
import { HeightSearch, NoiseBinder, optimise } from './fill';
import { prepassDensityFunction } from './prepass';
import type { EngineWorld } from './world';

const PLAINS = 'minecraft:plains';

/** How many samples a span of blocks has at a step. */
export function samplesOf(span: number, step: number): number {
  const s = Math.max(1, Math.floor(step));
  return Math.max(0, Math.ceil(Math.floor(span) / s));
}

function stepOf(step: number): number {
  return Math.max(1, Math.floor(step));
}

/** The biome map at `region.y` (the sea level when not given). */
export function biomeMap(world: EngineWorld, region: MapRegion): PaletteGrid {
  const columns = samplesOf(region.width, region.step);
  const rows = samplesOf(region.depth, region.step);
  const step = stepOf(region.step);
  const cells = new Uint16Array(columns * rows);
  const palette: string[] = [];
  const index = new Map<string, number>();
  const slot = (id: string) => {
    let i = index.get(id);
    if (i === undefined) {
      i = palette.length;
      palette.push(id);
      index.set(id, i);
    }
    return i;
  };
  const parts = world.noise;
  if (!parts) {
    cells.fill(slot(world.flat?.biome ?? PLAINS));
    return { palette, cells };
  }
  const qy = Math.floor(region.y ?? world.seaLevel) >> 2;
  const byIdentifier = new Map<Identifier, number>();
  for (let row = 0; row < rows; row += 1) {
    const qz = (region.z0 + row * step) >> 2;
    for (let col = 0; col < columns; col += 1) {
      const qx = (region.x0 + col * step) >> 2;
      const biome = parts.biomeSource.getBiome(qx, qy, qz, parts.sampler);
      let i = byIdentifier.get(biome);
      if (i === undefined) {
        i = slot(biome.toString());
        byIdentifier.set(biome, i);
      }
      cells[row * columns + col] = i;
    }
  }
  return { palette, cells };
}

/** Heights of the land (`surface` counts water, `ocean_floor` does not); see `HeightSearch`. */
export function heightMap(
  world: EngineWorld,
  region: MapRegion,
  kind: 'surface' | 'ocean_floor',
): Int16Array {
  const columns = samplesOf(region.width, region.step);
  const rows = samplesOf(region.depth, region.step);
  const step = stepOf(region.step);
  const out = new Int16Array(columns * rows);
  const parts = world.noise;
  if (!parts) {
    out.fill(flatTop(world, kind));
    return out;
  }
  let kept = heightsKept.get(world);
  if (!kept) {
    kept = { search: new HeightSearch(parts), heights: new Map() };
    heightsKept.set(world, kept);
  }
  const { search, heights } = kept;
  const bit = kind === 'surface' ? 1 : 0;
  for (let row = 0; row < rows; row += 1) {
    const z = region.z0 + row * step;
    for (let col = 0; col < columns; col += 1) {
      const x = region.x0 + col * step;
      const key = ((x + 33554432) * 67108864 + (z + 33554432)) * 2 + bit;
      let h = heights.get(key);
      if (h === undefined) {
        h = search.height(x, z, kind);
        if (heights.size >= HEIGHTS_KEPT) heights.clear();
        heights.set(key, h);
      }
      out[row * columns + col] = h;
    }
  }
  return out;
}

/** Heights already found, per world (a panned or zoomed map asks for many of them again). */
const heightsKept = new WeakMap<
  EngineWorld,
  { search: HeightSearch; heights: Map<number, number> }
>();
const HEIGHTS_KEPT = 1 << 20;

function flatTop(world: EngineWorld, kind: 'surface' | 'ocean_floor'): number {
  const layers = world.flat?.layers ?? [];
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const name = layers[i] as string;
    if (name === AIR_NAME) continue;
    if (
      kind === 'ocean_floor' &&
      (name.startsWith('minecraft:water') || name.startsWith('minecraft:lava'))
    ) {
      continue;
    }
    return world.minY + i;
  }
  return world.minY - 1;
}

/** A side cut: the blocks of a vertical slice, with the surface rules. */
export function sliceGrid(world: EngineWorld, region: SliceRegion): PaletteGrid {
  const step = stepOf(region.step);
  const yStep = stepOf(region.yStep);
  const columns = samplesOf(region.to - region.from, step);
  const rows = samplesOf(world.height, yStep);
  const cells = new Uint16Array(columns * rows);
  const palette = new Palette();
  const parts = world.noise;
  if (parts) {
    world.activate();
    const surface = new SurfaceColumns(world, parts, true);
    for (let col = 0; col < columns; col += 1) {
      const along = region.from + col * step;
      const x = region.axis === 'x' ? along : region.at;
      const z = region.axis === 'x' ? region.at : along;
      surface.column(x, z, world.minY, world.minY + world.height - 1, (y, s) => {
        const offset = y - world.minY;
        if (offset % yStep !== 0 || s === BlockState.AIR) return;
        cells[(offset / yStep) * columns + col] = palette.index(s);
      });
    }
  } else if (world.flat) {
    const { layers, minY } = world.flat;
    for (let row = 0; row < rows; row += 1) {
      const name = layers[world.minY + row * yStep - minY];
      if (name === undefined || name === AIR_NAME) continue;
      cells.fill(palette.name(name), row * columns, (row + 1) * columns);
    }
  }
  return { palette: palette.names, cells };
}

/**
 * The values of a density function (a named one by id, or a function written out) over a map at
 * `region.y` (0 when not given) or a side cut. Unknown functions give 0.
 */
export function valueGrid(
  world: EngineWorld,
  fn: string | unknown,
  region: MapRegion | SliceRegion,
): Float32Array {
  const parts = world.noise;
  let density: DensityFunction = DensityFunction.Constant.ZERO;
  if (parts) {
    world.activate();
    const binder = new NoiseBinder(
      parts.randomState.createVisitor(parts.settings.legacyRandomSource),
    );
    const json = typeof fn === 'string' ? fn : prepassDensityFunction(fn);
    density = optimise(binder.bind(parts.parse(json)));
  }
  const context = { x: 0, y: 0, z: 0 };
  if ('axis' in region) {
    const step = stepOf(region.step);
    const yStep = stepOf(region.yStep);
    const columns = samplesOf(region.to - region.from, step);
    const rows = samplesOf(world.height, yStep);
    const out = new Float32Array(columns * rows);
    for (let col = 0; col < columns; col += 1) {
      const along = region.from + col * step;
      context.x = region.axis === 'x' ? along : region.at;
      context.z = region.axis === 'x' ? region.at : along;
      for (let row = 0; row < rows; row += 1) {
        context.y = world.minY + row * yStep;
        out[row * columns + col] = density.compute(context);
      }
    }
    return out;
  }
  const step = stepOf(region.step);
  const columns = samplesOf(region.width, step);
  const rows = samplesOf(region.depth, step);
  const out = new Float32Array(columns * rows);
  context.y = Math.floor(region.y ?? 0);
  for (let row = 0; row < rows; row += 1) {
    context.z = region.z0 + row * step;
    for (let col = 0; col < columns; col += 1) {
      context.x = region.x0 + col * step;
      out[row * columns + col] = density.compute(context);
    }
  }
  return out;
}
