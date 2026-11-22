/**
 * The extension types and corrections of B581 (`src/extensions/`), each on a hand-written case.
 * Their parity with the real game is `parity.test.ts`'s.
 */

import { XoroshiroRandom } from 'deepslate/math';
import { DensityFunction, Interval, MaterialRuleContext } from 'deepslate/worldgen';
import { describe, expect, it } from 'vitest';
import { buildColumns, createTerrainWorld } from '../src';
import { BAND_COUNT, bandIndex, makeBands } from '../src/extensions/bandlands';
import { correctedTypes } from '../src/extensions/corrections';
import { type DomainWarp, domainWarp } from '../src/extensions/domain-warp';
import { flat } from '../src/extensions/flat';
import { Hole } from '../src/extensions/hole';
import { positionSeed } from '../src/extensions/positional-random';
import { isSteep, STEEP_RISE } from '../src/extensions/steep';
import { ColdEnoughToSnow, SNOW_TEMPERATURE } from '../src/extensions/temperature';
import { interpolate, Upscale, upscale } from '../src/extensions/upscale';
import type { DensityParser } from '../src/parser';
import { FACTS, HILLS_FILES } from './fixture';

const constant = (v: number) => new DensityFunction.Constant(v);
/** A tiny parser for the cases: numbers, and the x, y and z of the position as `"x"`, `"y"`, `"z"`. */
const child: DensityParser = (json) => {
  if (typeof json === 'number') return constant(json);
  if (json === 'x' || json === 'y' || json === 'z') {
    const axis = json;
    return new (class extends DensityFunction {
      compute(c: DensityFunction.Context) {
        return c[axis];
      }
      mapChildren() {
        return this;
      }
      range() {
        return Interval.INFINITE;
      }
    })();
  }
  return DensityFunction.Constant.ZERO;
};

describe('corrected density function types', () => {
  const byType = new Map(correctedTypes.map((t) => [t.type, t]));
  it('rounds to whole numbers when `multiple` is left out', () => {
    const at = { x: 0, y: 0, z: 0 };
    expect(byType.get('floor')?.parse({ input: 2.7 }, child).compute(at)).toBe(2);
    expect(byType.get('ceil')?.parse({ input: 2.2 }, child).compute(at)).toBe(3);
    expect(byType.get('round')?.parse({ input: -2.5 }, child).compute(at)).toBe(-2);
    expect(byType.get('truncate')?.parse({ input: -2.7 }, child).compute(at)).toBe(-2);
    expect(byType.get('floor')?.parse({ input: 2.7, multiple: 0.5 }, child).compute(at)).toBe(2.5);
  });

  it('slices on the named axis at the coordinate', () => {
    const at = { x: 3, y: 5, z: 7 };
    const slice = byType.get('slice');
    expect(slice?.parse({ axis: 'x', coordinate: 9, input: 'x' }, child).compute(at)).toBe(9);
    expect(slice?.parse({ axis: 'y', coordinate: 9, input: 'x' }, child).compute(at)).toBe(3);
    expect(slice?.parse({ axis: 'y', coordinate: 9, input: 'y' }, child).compute(at)).toBe(9);
    expect(slice?.parse({ axis: 'z', coordinate: 9, input: 'z' }, child).compute(at)).toBe(9);
  });
});

describe('upscale', () => {
  it('interpolates per mode', () => {
    expect(interpolate('nearest_neighbor', 0.7, [2])).toBe(2);
    expect(interpolate('interpolate_linear', 0.25, [0, 4])).toBe(1);
    expect(interpolate('interpolate_cosine', 0.5, [0, 4])).toBeCloseTo(2, 12);
    expect(interpolate('interpolate_cosine', 0.25, [0, 4])).toBeLessThan(1);
    // A Catmull-Rom curve passes through its middle corners; a B-spline does not.
    expect(interpolate('interpolate_cubic', 0, [9, 1, 5, 9])).toBe(1);
    expect(interpolate('b_spline_cubic', 0, [0, 6, 0, 0])).toBe(4);
    // Both reproduce a straight line.
    expect(interpolate('interpolate_cubic', 0.3, [0, 1, 2, 3])).toBeCloseTo(1.3, 12);
    expect(interpolate('b_spline_cubic', 0.3, [0, 1, 2, 3])).toBeCloseTo(1.3, 12);
  });

  it('reads the input at the corners of its cells, one mode an axis', () => {
    const fn = upscale.parse(
      {
        input: 'x',
        x: { cell_size: 4, mode: 'interpolate_linear' },
        y: { cell_size: 8, mode: 'nearest_neighbor' },
        z: { cell_size: 2, mode: 'b_spline_cubic' },
      },
      child,
    ) as Upscale;
    expect(fn).toBeInstanceOf(Upscale);
    expect(fn.compute({ x: 5, y: 3, z: 1 })).toBe(5);
    expect(fn.compute({ x: -3, y: 3, z: 1 })).toBe(-3);
  });
});

describe('domain_warp', () => {
  it('moves the input by whole blocks, the fraction dropped towards 0', () => {
    const fn = domainWarp.parse({ input: 'x', offset_x: 2.9 }, child) as DomainWarp;
    expect(fn.compute({ x: 10, y: 0, z: 0 })).toBe(12);
    const back = domainWarp.parse({ input: 'z', offset_z: -2.9 }, child);
    expect(back.compute({ x: 0, y: 0, z: 10 })).toBe(8);
  });
});

describe('surface conditions', () => {
  it('hole: the surface depth is 0 or less', () => {
    const context = { surfaceDepth: 0 } as unknown as MaterialRuleContext;
    const test = new Hole().compile(context);
    expect(test()).toBe(true);
    (context as unknown as { surfaceDepth: number }).surfaceDepth = 1;
    expect(test()).toBe(false);
  });

  it('steep: a rise of 4 to the south or to the west, inside the chunk', () => {
    const slope = (dx: number, dz: number) => (x: number, z: number) => x * dx + z * dz;
    expect(isSteep(5, 5, slope(0, STEEP_RISE / 2))).toBe(true);
    expect(isSteep(5, 5, slope(0, -STEEP_RISE / 2))).toBe(false);
    expect(isSteep(5, 5, slope(-STEEP_RISE / 2, 0))).toBe(true);
    expect(isSteep(5, 5, slope(STEEP_RISE / 2, 0))).toBe(false);
    // At the chunk's north edge the column itself stands for the neighbour outside it.
    expect(isSteep(5, 16, slope(0, STEEP_RISE / 2))).toBe(false);
    expect(isSteep(5, 16, slope(0, STEEP_RISE))).toBe(true);
  });

  it('temperature: the biome is below the snow temperature', () => {
    const files: Record<string, unknown> = {
      'msm:cold': { temperature: SNOW_TEMPERATURE - 0.01 },
      'msm:warm': { temperature: SNOW_TEMPERATURE },
    };
    const cold = new ColdEnoughToSnow({
      rule: () => ({}) as never,
      condition: () => ({}) as never,
      biome: (id) => files[id],
    });
    expect(cold.temperatureOf('msm:cold')).toBeLessThan(SNOW_TEMPERATURE);
    expect(cold.temperatureOf('msm:warm')).toBe(SNOW_TEMPERATURE);
    expect(cold.temperatureOf('msm:missing')).toBe(0.5);
  });
});

describe('bandlands', () => {
  it('indexes the bands by height and the offset noise times 4', () => {
    expect(bandIndex(10, 0)).toBe(10);
    expect(bandIndex(10, 0.6)).toBe(12);
    expect(bandIndex(0, -0.3)).toBe(BAND_COUNT - 1);
  });

  it("makes the same bands for the same random, MSM's own recipe", () => {
    const a = makeBands(XoroshiroRandom.create(5n));
    const b = makeBands(XoroshiroRandom.create(5n));
    expect(a.map(String)).toEqual(b.map(String));
    expect(a).toHaveLength(BAND_COUNT);
    const plain = a.filter((s) => String(s) === 'minecraft:terracotta').length;
    expect(plain).toBeGreaterThan(BAND_COUNT / 4);
    expect(new Set(a.map(String)).size).toBeGreaterThan(4);
  });
});

describe('flat', () => {
  it('stacks layers from the bottom of the world, cut at the top, with the biome', () => {
    const shape = flat({
      generator: {
        settings: {
          biome: 'desert',
          layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block: { Name: 'minecraft:snow', Properties: { layers: '3' } }, height: 2 },
            { block: 'minecraft:stone', height: 99 },
          ],
          features: true,
        },
      },
      dimensionType: { min_y: -16, height: 32 },
      files: { vanilla: null, project: {} },
    });
    expect(shape.minY).toBe(-16);
    expect(shape.biome).toBe('minecraft:desert');
    expect(shape.layers).toHaveLength(32);
    expect(shape.layers.slice(0, 3)).toEqual([
      'minecraft:bedrock',
      'minecraft:snow[layers=3]',
      'minecraft:snow[layers=3]',
    ]);
    expect(shape.notes?.map((n) => n.type)).toEqual(['flat.features']);
  });

  it('is drawn by buildColumns', () => {
    const world = createTerrainWorld({
      files: {
        vanilla: null,
        project: {
          ...HILLS_FILES,
          dimension_type: { 'msm:low': { min_y: 0, height: 64 } },
          dimension: {
            'msm:flat': {
              type: 'msm:low',
              generator: {
                type: 'minecraft:flat',
                settings: { layers: [{ block: 'minecraft:dirt', height: 3 }] },
              },
            },
          },
        },
      },
      source: { dimension: 'msm:flat' },
      seed: 0n,
      facts: FACTS,
    });
    expect(world.generator).toBe('flat');
    const ground = buildColumns(
      world,
      { x0: 0, z0: 0, y0: 0, sizeX: 2, sizeY: 4, sizeZ: 2 },
      'surface',
    );
    expect(ground.palette).toEqual(['minecraft:air', 'minecraft:dirt']);
    expect([...ground.blocks]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe('corrections to deepslate', () => {
  it("wraps a position's x term at 32 bits", () => {
    // Below |x| 687 the x term fits in 32 bits and nothing changes.
    const wide = (x: number, y: number, z: number) => {
      let seed = BigInt.asIntN(64, (BigInt(x) * 3129871n) ^ (BigInt(z) * 116129781n) ^ BigInt(y));
      seed = BigInt.asIntN(
        64,
        BigInt.asIntN(64, seed * seed * 42317861n) + BigInt.asIntN(64, seed * 11n),
      );
      return seed >> 16n;
    };
    expect(positionSeed(686, 3, -9000)).toBe(wide(686, 3, -9000));
    expect(positionSeed(1101, 0, 433)).not.toBe(wide(1101, 0, 433));
  });

  it('makes the surface depth a whole number', () => {
    const context = new MaterialRuleContext(
      { getSurfaceDepth: () => 3.9 } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    context.updateXZ(0, 0);
    expect(context.surfaceDepth).toBe(3);
  });
});
