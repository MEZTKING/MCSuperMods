import { describe, expect, it } from 'vitest';
import {
  emptyPrepassLog,
  prepassDensityFunction,
  prepassNoiseSettings,
  prepassRule,
} from '../src/prepass';

describe('the pre-pass (F1 to F5)', () => {
  it('F1 renames the router field chunk_surface_level', () => {
    const log = emptyPrepassLog();
    const out = prepassNoiseSettings(
      { noise_router: { chunk_surface_level: 64, final_density: 0 } },
      log,
    );
    expect(out.noise_router).toEqual({ preliminary_surface_level: 64, final_density: 0 });
    expect(log.renamedRouter).toBe(1);
  });

  it('F2 renames add_stone_depth on y_above and water only', () => {
    const log = emptyPrepassLog();
    const rule = {
      type: 'minecraft:sequence',
      sequence: [
        {
          type: 'minecraft:condition',
          if_true: { type: 'minecraft:y_above', anchor: { absolute: 0 }, add_stone_depth: true },
          then_run: { type: 'minecraft:block' },
        },
        {
          type: 'minecraft:condition',
          if_true: { type: 'minecraft:water', offset: 0, add_stone_depth: false },
          then_run: { type: 'minecraft:block' },
        },
        {
          type: 'minecraft:condition',
          if_true: { type: 'minecraft:stone_depth', add_stone_depth: true },
          then_run: { type: 'minecraft:block' },
        },
      ],
    };
    const out = prepassRule(rule, log) as { sequence: { if_true: Record<string, unknown> }[] };
    expect(out.sequence[0]?.if_true).toEqual({
      type: 'minecraft:y_above',
      anchor: { absolute: 0 },
      add_surface_depth: true,
    });
    expect(out.sequence[1]?.if_true).toEqual({
      type: 'minecraft:water',
      offset: 0,
      add_surface_depth: false,
    });
    expect(out.sequence[2]?.if_true).toEqual({
      type: 'minecraft:stone_depth',
      add_stone_depth: true,
    });
    expect(log.renamedStoneDepth).toBe(2);
    expect(rule.sequence[0]?.if_true).toHaveProperty('add_stone_depth');
  });

  it('F3 adds a placeholder default block only when there is none', () => {
    const log = emptyPrepassLog();
    expect(prepassNoiseSettings({}, log).default_block).toEqual({ Name: 'minecraft:stone' });
    expect(
      prepassNoiseSettings({ default_block: { Name: 'minecraft:netherrack' } }, log).default_block,
    ).toEqual({ Name: 'minecraft:netherrack' });
    expect(log.defaultBlockAdded).toBe(1);
  });

  it('F4 maps linear upscale onto interpolated, and leaves other modes', () => {
    const log = emptyPrepassLog();
    const lin = (n: number) => ({ cell_size: n, mode: 'interpolate_linear' });
    expect(
      prepassDensityFunction(
        { type: 'minecraft:upscale', input: 'msm:x', x: lin(4), y: lin(8), z: lin(4) },
        log,
      ),
    ).toEqual({
      type: 'minecraft:interpolated',
      input: 'msm:x',
      cell_size_xz: 4,
      cell_size_y: 8,
    });
    const nearest = {
      type: 'minecraft:upscale',
      input: 1,
      x: { cell_size: 4, mode: 'nearest_neighbor' },
      y: lin(8),
      z: lin(4),
    };
    expect(prepassDensityFunction(nearest, log)).toEqual(nearest);
    const uneven = { type: 'minecraft:upscale', input: 1, x: lin(4), y: lin(8), z: lin(8) };
    expect(prepassDensityFunction(uneven, log)).toEqual(uneven);
    expect(log.upscaleMapped).toBe(1);
  });

  it('F5 turns interval_select into nested range_choice with the last band kept', () => {
    const log = emptyPrepassLog();
    const out = prepassDensityFunction(
      {
        type: 'minecraft:interval_select',
        input: 'msm:in',
        thresholds: [0, 1],
        functions: [10, 20, 30],
      },
      log,
    );
    expect(out).toEqual({
      type: 'minecraft:range_choice',
      input: 'msm:in',
      min_inclusive: Number.NEGATIVE_INFINITY,
      max_exclusive: 0,
      when_in_range: 10,
      when_out_of_range: {
        type: 'minecraft:range_choice',
        input: 'msm:in',
        min_inclusive: Number.NEGATIVE_INFINITY,
        max_exclusive: 1,
        when_in_range: 20,
        when_out_of_range: 30,
      },
    });
    expect(log.intervalSelect).toBe(1);
  });
});
