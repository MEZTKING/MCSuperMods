import type { Element, Json, Problem } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { MODELS_ANIM_PROBLEM_CODES, modelsAnimValidators } from '../src/index';
import { element } from './support';

const bundle = builtInTargets[0] as TargetBundle;

function validate(elements: Element[]): Problem[] {
  const registry = createRegistryIndex({ vanilla: {} });
  return modelsAnimValidators.flatMap((validator) =>
    validator.validate({ elements, target: bundle.target, registry }),
  );
}

const summary = (problems: Problem[]) =>
  problems.map((p) => [p.code, p.severity, p.elementId, p.path]);

const geo = (id: `${string}:${string}`, bones: Json[], size = 64): Element =>
  element('msm:geo_model', id, {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: { identifier: 'geometry.x', texture_width: size, texture_height: size },
        bones,
      },
    ],
  });

const animation = (id: `${string}:${string}`, animations: Json): Element =>
  element('msm:animation', id, { format_version: '1.8.0', animations });

describe('models-anim validators', () => {
  it('lists every code it reports', () => {
    expect(MODELS_ANIM_PROBLEM_CODES).toEqual([
      'models-anim.cube-outside-texture',
      'models-anim.duplicate-bone',
      'models-anim.unknown-parent',
      'models-anim.animation-unknown-bone',
      'models-anim.molang-unsupported',
    ]);
  });

  it('accepts a clean project', () => {
    const problems = validate([
      geo('demo:entity/a', [
        { name: 'body', cubes: [{ origin: [0, 0, 0], size: [16, 16, 16], uv: [0, 0] }] },
        {
          name: 'head',
          parent: 'body',
          cubes: [
            {
              origin: [0, 0, 0],
              size: [4, 4, 4],
              uv: {
                north: { uv: [60, 60], uv_size: [4, 4] },
                up: { uv: [64, 64], uv_size: [-4, -4] },
              },
            },
          ],
        },
      ]),
      animation('demo:entity/a_animations', {
        idle: { bones: { body: { position: [0, '1.5', 0] }, head: { rotation: { '0.0': 1 } } } },
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it('warns about box and face UVs outside the texture', () => {
    const problems = validate([
      geo(
        'demo:entity/a',
        [
          {
            name: 'body',
            cubes: [
              { origin: [0, 0, 0], size: [16, 16, 16], uv: [1, 0] },
              { origin: [0, 0, 0], size: [8, 8, 8], uv: [0, 50] },
              { origin: [0, 0, 0], size: [8, 8, 8], uv: [0, 0] },
              {
                origin: [0, 0, 0],
                size: [4, 4, 4],
                uv: {
                  north: { uv: [62, 0], uv_size: [4, 4] },
                  south: { uv: [2, 2], uv_size: [-4, 4] },
                  east: { uv: [0, 0], uv_size: [4, 4] },
                },
              },
            ],
          },
        ],
        64,
      ),
    ]);
    expect(summary(problems)).toEqual([
      [
        'models-anim.cube-outside-texture',
        'warning',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/0/cubes/0/uv',
      ],
      [
        'models-anim.cube-outside-texture',
        'warning',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/0/cubes/1/uv',
      ],
      [
        'models-anim.cube-outside-texture',
        'warning',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/0/cubes/3/uv/north',
      ],
      [
        'models-anim.cube-outside-texture',
        'warning',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/0/cubes/3/uv/south',
      ],
    ]);
    expect(problems[0]?.message).toContain('64x64');
  });

  it('reports duplicate bones', () => {
    const problems = validate([geo('demo:entity/a', [{ name: 'body' }, { name: 'body' }])]);
    expect(summary(problems)).toEqual([
      [
        'models-anim.duplicate-bone',
        'error',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/1/name',
      ],
    ]);
  });

  it('reports unknown and self parents, including bones of other models', () => {
    const problems = validate([
      geo('demo:entity/a', [
        { name: 'body', parent: 'root' },
        { name: 'head', parent: 'head' },
        { name: 'arm', parent: 'body' },
      ]),
      geo('demo:entity/b', [{ name: 'root' }]),
    ]);
    expect(summary(problems)).toEqual([
      [
        'models-anim.unknown-parent',
        'error',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/0/parent',
      ],
      [
        'models-anim.unknown-parent',
        'error',
        'demo:entity/a',
        '/minecraft:geometry/0/bones/1/parent',
      ],
    ]);
    expect(problems[1]?.message).toContain('itself');
  });

  it('warns about animated bones no geo model declares', () => {
    const anims = animation('demo:entity/a_animations', {
      walk: { bones: { leg: { rotation: [10, 0, 0] }, body: { position: [0, 1, 0] } } },
    });
    expect(summary(validate([anims]))).toEqual([
      [
        'models-anim.animation-unknown-bone',
        'warning',
        'demo:entity/a_animations',
        '/animations/walk/bones/leg',
      ],
      [
        'models-anim.animation-unknown-bone',
        'warning',
        'demo:entity/a_animations',
        '/animations/walk/bones/body',
      ],
    ]);
    expect(
      summary(validate([geo('demo:entity/b', [{ name: 'body' }]), anims])).map((row) => row[3]),
    ).toEqual(['/animations/walk/bones/leg']);
  });

  it('notes Molang channels once per channel', () => {
    const problems = validate([
      geo('demo:entity/a', [{ name: 'body' }]),
      animation('demo:entity/a_animations', {
        idle: {
          bones: {
            body: {
              rotation: [0, 'math.sin(query.anim_time * 90) * 10', 0],
              position: { '0.0': [0, 0, 0], '1.0': { post: ['q.life_time', 0, 0] } },
              scale: 'variable.size',
            },
          },
        },
        calm: { bones: { body: { rotation: { '0.0': [0, '-1e2', '.5'] } } } },
      }),
    ]);
    expect(summary(problems)).toEqual([
      [
        'models-anim.molang-unsupported',
        'info',
        'demo:entity/a_animations',
        '/animations/idle/bones/body/rotation',
      ],
      [
        'models-anim.molang-unsupported',
        'info',
        'demo:entity/a_animations',
        '/animations/idle/bones/body/position',
      ],
      [
        'models-anim.molang-unsupported',
        'info',
        'demo:entity/a_animations',
        '/animations/idle/bones/body/scale',
      ],
    ]);
  });

  it('ignores malformed data instead of throwing', () => {
    expect(
      validate([
        element('msm:geo_model', 'demo:x', 'nope'),
        element('msm:geo_model', 'demo:y', { 'minecraft:geometry': [null, { bones: [1] }] }),
        element('msm:animation', 'demo:z', { animations: { a: { bones: { b: 3 } } } }),
      ]).map((p) => p.code),
    ).toEqual(['models-anim.animation-unknown-bone']);
  });
});
