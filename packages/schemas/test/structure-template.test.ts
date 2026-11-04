import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_EXTENSIONS,
  collectReferences,
  createRegistryIndex,
  createSchemaIndex,
  validateJson,
} from '../src/index';

const node = BUILT_IN_EXTENSIONS['msm:structure_template'];
if (node === undefined) throw new Error('msm:structure_template is not a built-in extension');

const template = {
  size: [2, 1, 1],
  palette: ['minecraft:oak_planks', 'minecraft:jigsaw[orientation=north_up]'],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 1],
  ],
  block_entities: [{ pos: [0, 0, 0], nbt: '{Items:[{Slot:0b,id:"minecraft:bread",count:3}]}' }],
  jigsaws: [
    {
      pos: [1, 0, 0],
      pool: 'demo:streets',
      name: 'demo:street_start',
      target: 'demo:street_end',
      final_state: 'minecraft:dirt_path',
      joint: 'rollable',
      placement_priority: 0,
      selection_priority: 0,
    },
  ],
  entities: [{ pos: [0.5, 1, 0.5], block_pos: [0, 1, 0], nbt: '{id:"minecraft:armor_stand"}' }],
} satisfies Json;

const codes = (value: Json): string[] =>
  validateJson(value, node).map((p) => `${p.path} ${p.code}`);

describe('msm:structure_template', () => {
  it('resolves through the schema index and is frozen', () => {
    const index = createSchemaIndex({ ref: 'x', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });
    expect(index.resolveSchemaRef('msm:structure_template')).toBe(node);
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('accepts a two-block template with one jigsaw', () => {
    const registries = createRegistryIndex({
      vanilla: { 'worldgen/template_pool': ['empty'] },
      project: { 'worldgen/template_pool': ['demo:streets'] },
    });
    expect(validateJson(template, node, { registries })).toEqual([]);
    expect(codes({ size: [1, 1, 1], palette: [], blocks: [] })).toEqual([]);
  });

  it('reports a missing size and a bad blocks tuple', () => {
    const { size: _size, ...withoutSize } = template;
    expect(codes(withoutSize)).toEqual(['/size schema.missing-field']);
    const badBlocks = codes({ ...template, blocks: [[0, 0, 0]] });
    expect(badBlocks.length).toBeGreaterThan(0);
    expect(badBlocks.every((line) => line.startsWith('/blocks/0'))).toBe(true);
    expect(codes({ ...template, size: [0, 1, 1] })).toEqual(['/size/0 schema.out-of-range']);
  });

  it('checks jigsaw pools against the template pool registry', () => {
    const registries = createRegistryIndex({
      vanilla: { 'worldgen/template_pool': ['empty'] },
      project: {},
    });
    const problems = validateJson(template, node, { registries });
    expect(problems.map((p) => `${p.path} ${p.code} ${p.severity}`)).toEqual([
      '/jigsaws/0/pool schema.unknown-id warning',
    ]);
    expect(collectReferences(template, node)).toEqual([
      { path: '/jigsaws/0/pool', registry: 'worldgen/template_pool', id: 'demo:streets' },
    ]);
  });
});
