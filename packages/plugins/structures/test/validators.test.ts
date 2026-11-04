import type { Element, Json, Problem, ResourceLocation, Target } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { structureValidators } from '../src/index';

const target: Target = (builtInTargets[0] as TargetBundle).target;
const registry = { has: () => true, ids: () => [] as string[] };

const el = (kind: string, id: ResourceLocation, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const piece = (id: ResourceLocation, jigsaws: Json[]): Element =>
  el('minecraft:structure_template', id, {
    size: [3, 1, 3],
    palette: ['minecraft:dirt_path', 'minecraft:jigsaw[orientation=north_up]'],
    blocks: [[1, 0, 0, 1]],
    jigsaws,
  });

const jigsaw = (pool: string, name: string, target: string): Json => ({
  pos: [1, 0, 0],
  pool,
  name,
  target,
  final_state: 'minecraft:dirt_path',
});

const pool = (id: ResourceLocation, locations: string[], fallback = 'minecraft:empty'): Element =>
  el('minecraft:worldgen/template_pool', id, {
    fallback,
    elements: locations.map((location) => ({
      weight: 1,
      element: {
        element_type: 'minecraft:single_pool_element',
        location,
        processors: 'minecraft:empty',
        projection: 'rigid',
      },
    })),
  });

const structure = (id: ResourceLocation, startPool: string): Element =>
  el('minecraft:worldgen/structure', id, {
    type: 'minecraft:jigsaw',
    biomes: '#minecraft:is_forest',
    step: 'surface_structures',
    spawn_overrides: {},
    start_pool: startPool,
    size: 3,
    start_height: { absolute: 0 },
  });

const set = (id: ResourceLocation, structures: string[], spacing = 34, separation = 8): Element =>
  el('minecraft:worldgen/structure_set', id, {
    structures: structures.map((entry) => ({ structure: entry, weight: 1 })),
    placement: { type: 'minecraft:random_spread', spacing, separation, salt: 1 },
  });

/** A clean jigsaw village: centre → streets (with a terminator fallback) → houses. */
function village(): Element[] {
  return [
    piece('ex:centre', [jigsaw('ex:streets', 'ex:centre_exit', 'ex:street')]),
    piece('ex:street', [
      jigsaw('ex:streets', 'ex:street', 'ex:street'),
      jigsaw('ex:houses', 'ex:street', 'ex:door'),
    ]),
    piece('ex:house', [jigsaw('ex:streets', 'ex:door', 'ex:street')]),
    piece('ex:lamp', [jigsaw('minecraft:empty', 'ex:street', 'minecraft:empty')]),
    pool('ex:centre', ['ex:centre']),
    pool('ex:streets', ['ex:street'], 'ex:terminators'),
    pool('ex:terminators', ['ex:lamp']),
    pool('ex:houses', ['ex:house']),
    structure('ex:village', 'ex:centre'),
    set('ex:village', ['ex:village']),
  ];
}

const run = (elements: Element[]): Problem[] =>
  structureValidators.flatMap((validator) => validator.validate({ elements, target, registry }));

const codes = (problems: Problem[]) =>
  problems.map((problem) => [problem.code, problem.severity, problem.elementId, problem.path]);

describe('structures validators', () => {
  it('reports nothing for a clean village', () => {
    expect(run(village())).toEqual([]);
  });

  it('set-spacing: separation not less than spacing is an error', () => {
    const elements = [
      ...village().filter((e) => e.kind !== 'minecraft:worldgen/structure_set'),
      set('ex:village', ['ex:village'], 8, 8),
    ];
    expect(codes(run(elements))).toEqual([
      ['structures.set-spacing', 'error', 'ex:village', '/placement/separation'],
    ]);
  });

  it('unplaced-structure: a structure in no set is a warning', () => {
    const elements = [...village(), structure('ex:ruin', 'ex:centre')];
    expect(codes(run(elements))).toEqual([
      ['structures.unplaced-structure', 'warning', 'ex:ruin', undefined],
    ]);
  });

  it('pool-empty: no elements and the empty fallback is a warning', () => {
    const elements = [...village(), pool('ex:nothing', [])];
    expect(codes(run(elements))).toEqual([
      ['structures.pool-empty', 'warning', 'ex:nothing', '/elements'],
    ]);
  });

  it('jigsaw-target-missing: a target no piece of the pool offers is a warning', () => {
    const elements = [
      ...village(),
      piece('ex:well', [jigsaw('ex:houses', 'ex:well', 'ex:chimney')]),
    ];
    expect(codes(run(elements))).toEqual([
      ['structures.jigsaw-target-missing', 'warning', 'ex:well', '/jigsaws/0/target'],
    ]);
  });

  it('jigsaw-target-missing: skipped when the pool or a piece is vanilla', () => {
    const elements = [
      ...village(),
      piece('ex:a', [jigsaw('minecraft:village/plains/streets', 'ex:a', 'ex:none')]),
      pool('ex:mixed', ['minecraft:village/plains/terminators/terminator_01']),
      piece('ex:b', [jigsaw('ex:mixed', 'ex:b', 'ex:none')]),
    ];
    expect(run(elements)).toEqual([]);
  });

  it('template-too-large: over 48 blocks on an axis is a warning', () => {
    const big = el('minecraft:structure_template', 'ex:tower', {
      size: [5, 64, 5],
      palette: [],
      blocks: [],
    });
    expect(codes(run([...village(), big]))).toEqual([
      ['structures.template-too-large', 'warning', 'ex:tower', '/size'],
    ]);
  });

  it('tolerates malformed data without throwing', () => {
    const odd = [
      el('minecraft:worldgen/structure_set', 'ex:a', null),
      el('minecraft:worldgen/template_pool', 'ex:b', { elements: 'x' }),
      el('minecraft:structure_template', 'ex:c', { jigsaws: [1, { pool: 2 }] }),
    ];
    expect(() => run(odd)).not.toThrow();
  });
});
