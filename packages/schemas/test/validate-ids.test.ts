import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createRegistryIndex,
  createSchemaIndex,
  type RawMcdocType,
  type SchemaNode,
  type SchemaProblem,
  type VanillaMcdocSymbols,
  validateJson,
} from '../src/index';

const codes = (problems: SchemaProblem[]): [string, string][] =>
  problems.map((problem) => [problem.path, problem.code]);

const idAttribute = { name: 'id' };
const enumRaw = (...values: string[]) => ({
  kind: 'enum',
  enumKind: 'string',
  values: values.map((value) => ({ identifier: value, value })),
});

function indexOf(
  mcdoc: Record<string, unknown>,
  dispatchers: Record<string, Record<string, unknown>> = {},
) {
  const symbols: VanillaMcdocSymbols = {
    ref: 'test',
    mcdoc: mcdoc as Record<string, RawMcdocType>,
    dispatchers: dispatchers as Record<string, Record<string, RawMcdocType>>,
  };
  return createSchemaIndex(symbols, { mcVersion: '2.0' });
}

describe('#[id] enums accept namespaced values', () => {
  // Like `LootTable.type`: `#[id] LootContextParamSets`, next to a plain direction enum.
  const index = indexOf({
    '::test::ParamSets': enumRaw('block', 'chest'),
    '::test::Direction': enumRaw('north', 'south'),
    '::test::Table': {
      kind: 'struct',
      fields: [
        {
          kind: 'pair',
          key: 'type',
          optional: true,
          type: { kind: 'reference', path: '::test::ParamSets', attributes: [idAttribute] },
        },
        {
          kind: 'pair',
          key: 'facing',
          optional: true,
          type: { kind: 'reference', path: '::test::Direction' },
        },
        {
          kind: 'pair',
          key: 'inline',
          optional: true,
          type: { ...enumRaw('one', 'two'), attributes: [idAttribute] },
        },
      ],
    },
  });
  const table = index.resolve('::test::Table');

  it('marks the #[id] reference and inline enum, not the plain one', () => {
    expect(table.kind).toBe('struct');
    const fields = table.kind === 'struct' ? table.fields : [];
    const byKey = (key: string) => fields.find((f) => f.key === key)?.type;
    expect(byKey('type')).toMatchObject({ kind: 'reference', resourceId: true });
    expect(byKey('inline')).toMatchObject({ kind: 'enum', resourceId: true });
    expect(byKey('facing')?.resourceId).toBeUndefined();
    // The shared enum definition itself is not marked.
    expect(index.resolve('::test::ParamSets').resourceId).toBeUndefined();
  });

  it('accepts bare and minecraft:-prefixed ids', () => {
    expect(validateJson({ type: 'block' }, table)).toEqual([]);
    expect(validateJson({ type: 'minecraft:block' }, table)).toEqual([]);
    expect(validateJson({ inline: 'minecraft:two' }, table)).toEqual([]);
  });

  it('still rejects other namespaces, unknown values and prefixed plain enums', () => {
    expect(codes(validateJson({ type: 'other:block' }, table))).toEqual([
      ['/type', 'schema.invalid-enum'],
    ]);
    expect(codes(validateJson({ type: 'minecraft:barrel' }, table))).toEqual([
      ['/type', 'schema.invalid-enum'],
    ]);
    expect(validateJson({ facing: 'north' }, table)).toEqual([]);
    expect(codes(validateJson({ facing: 'minecraft:north' }, table))).toEqual([
      ['/facing', 'schema.invalid-enum'],
    ]);
    expect(codes(validateJson('minecraft:block', index.resolve('::test::ParamSets')))).toEqual([
      ['', 'schema.invalid-enum'],
    ]);
  });
});

describe('registered discriminator ids without a dispatcher member', () => {
  // Like `minecraft:loot_condition`: `survives_explosion` has no fields, so no member.
  const randomChance: SchemaNode = {
    kind: 'struct',
    fields: [{ key: 'chance', type: { kind: 'number', numberKind: 'float' }, optional: false }],
    spreads: [],
  };
  const conditions: SchemaNode = {
    kind: 'dispatcher',
    registry: 'minecraft:loot_condition',
    discriminator: ['type'],
    keys: () => ['random_chance'],
    dispatch: (key) =>
      key === 'random_chance' || key === 'minecraft:random_chance' ? randomChance : undefined,
  };
  const condition: SchemaNode = {
    kind: 'struct',
    fields: [
      { key: 'type', type: { kind: 'string', idRegistry: 'loot_condition_type' }, optional: false },
    ],
    spreads: [conditions],
  };
  const registries = createRegistryIndex({
    vanilla: { loot_condition_type: ['random_chance', 'survives_explosion'] },
  });
  const check = (value: Json) => codes(validateJson(value, condition, { registries }));

  it('treats a registered id as a member with no extra fields', () => {
    expect(check({ type: 'minecraft:survives_explosion' })).toEqual([]);
    expect(check({ type: 'survives_explosion' })).toEqual([]);
  });

  it('keeps checking known members and reporting unknown keys', () => {
    expect(check({ type: 'minecraft:random_chance' })).toEqual([
      ['/chance', 'schema.missing-field'],
    ]);
    expect(check({ type: 'minecraft:made_up' })).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
      ['/type', 'schema.unknown-id'],
    ]);
    expect(check({ type: '#minecraft:survives_explosion' })).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });

  it('reports the key when no registry index is given', () => {
    expect(codes(validateJson({ type: 'survives_explosion' }, condition))).toEqual([
      ['/type', 'schema.unknown-dispatch-key'],
    ]);
  });
});
