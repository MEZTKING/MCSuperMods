/**
 * The `datapack.*` validators (B600 findings): forms the vendored mcdoc accepts but the real
 * servers refuse, on both built-in targets.
 */
import type { Element, Json, Problem } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { DATAPACK_PROBLEM_CODES } from '../src/index';
import { indexesFor } from './support';

const el = (kind: string, id: `${string}:${string}`, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

async function run(elements: Element[], index = 0): Promise<Problem[]> {
  const bundle = builtInTargets[index];
  if (bundle === undefined) throw new Error('no target');
  const { registries } = await indexesFor(bundle);
  const out = await Promise.all(
    (plugin.contributes.validators ?? []).map((v) =>
      v.validate({ elements, target: bundle.target, registry: registries }),
    ),
  );
  return out.flat().filter((p) => p.code.startsWith('datapack.'));
}

describe.each(builtInTargets.map((_, i) => i))('datapack validators, target %i', (index) => {
  it('lists its codes', () => {
    expect(DATAPACK_PROBLEM_CODES).toHaveLength(5);
  });

  it('refuses a predicate or item modifier file that is a list or a bare id', async () => {
    const problems = await run(
      [
        el('minecraft:predicate', 'demo:a', [
          { condition: 'minecraft:random_chance', chance: 0.5 },
        ]),
        el('minecraft:predicate', 'demo:b', 'demo:other'),
        el('minecraft:item_modifier', 'demo:c', [{ function: 'minecraft:set_count', count: 1 }]),
        el('minecraft:item_modifier', 'demo:d', 'demo:other'),
      ],
      index,
    );
    expect(problems.map((p) => `${p.code}@${p.elementId}`).sort()).toEqual([
      'datapack.item-modifier-not-object@demo:c',
      'datapack.item-modifier-not-object@demo:d',
      'datapack.predicate-not-object@demo:a',
      'datapack.predicate-not-object@demo:b',
    ]);
    expect(problems.every((p) => p.severity === 'error')).toBe(true);
  });

  it('accepts objects, and lists inside them', async () => {
    const problems = await run(
      [
        el('minecraft:predicate', 'demo:a', {
          condition: 'minecraft:all_of',
          terms: [{ condition: 'minecraft:random_chance', chance: 0.5 }],
        }),
        el('minecraft:item_modifier', 'demo:c', {
          function: 'minecraft:sequence',
          functions: [{ function: 'minecraft:set_count', count: 1 }],
        }),
      ],
      index,
    );
    expect(problems).toEqual([]);
  });

  it('refuses a time check without a clock, nested too', async () => {
    const problems = await run(
      [
        el('minecraft:predicate', 'demo:t', {
          condition: 'minecraft:any_of',
          terms: [{ condition: 'minecraft:time_check', value: { min: 0, max: 100 } }],
        }),
        el('minecraft:predicate', 'demo:ok', {
          condition: 'minecraft:time_check',
          clock: 'minecraft:overworld',
          value: 5,
        }),
      ],
      index,
    );
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['datapack.time-check-no-clock', 'demo:t', '/terms/0'],
    ]);
  });

  it('refuses a damage tag without its hash but not a damage type or a tag', async () => {
    const tags = (id: string): Json => ({
      condition: 'minecraft:damage_source_properties',
      predicate: { tags: [{ id, expected: true }] },
    });
    const problems = await run(
      [
        el('minecraft:predicate', 'demo:bad', tags('minecraft:is_fire')),
        el('minecraft:predicate', 'demo:tag', tags('#minecraft:is_fire')),
        el('minecraft:predicate', 'demo:type', tags('minecraft:in_fire')),
      ],
      index,
    );
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['datapack.damage-tag-no-hash', 'demo:bad', '/predicate/tags/0/id'],
    ]);
  });

  it('refuses a block transformer state in the old Name form', async () => {
    const rule = (state: Json): Json => [
      {
        block_state_provider: { type: 'minecraft:simple', state },
      },
    ];
    const problems = await run(
      [
        el('minecraft:block_transformer', 'demo:old', rule({ Name: 'minecraft:dirt' })),
        el('minecraft:block_transformer', 'demo:new', rule({ id: 'minecraft:dirt' })),
        el(
          'minecraft:block_transformer',
          'demo:props',
          rule({ id: 'minecraft:oak_log', properties: { axis: 'x' } }),
        ),
      ],
      index,
    );
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['datapack.block-transformer-state', 'demo:old', '/0/block_state_provider/state'],
    ]);
  });
});
