import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  normaliseRange,
  type RawMcdocType,
  type SchemaNode,
  type VanillaMcdocSymbols,
} from '../src/index';

const since = (value: string) => ({
  name: 'since',
  value: { kind: 'literal' as const, value: { kind: 'string', value } },
});
const until = (value: string) => ({
  name: 'until',
  value: { kind: 'literal' as const, value: { kind: 'string', value } },
});

function indexOf(
  mcdoc: Record<string, unknown>,
  dispatchers: Record<string, Record<string, unknown>> = {},
  mcVersion = '2.0',
) {
  const symbols: VanillaMcdocSymbols = {
    ref: 'test',
    mcdoc: mcdoc as Record<string, RawMcdocType>,
    dispatchers: dispatchers as Record<string, Record<string, RawMcdocType>>,
  };
  return createSchemaIndex(symbols, { mcVersion });
}

function expectKind<K extends SchemaNode['kind']>(
  node: SchemaNode | undefined,
  kind: K,
): Extract<SchemaNode, { kind: K }> {
  expect(node?.kind).toBe(kind);
  return node as Extract<SchemaNode, { kind: K }>;
}

describe('normalisation rules', () => {
  it('turns a non-string pair key into an optional "*" field', () => {
    const index = indexOf({
      '::t::Map': {
        kind: 'struct',
        fields: [{ kind: 'pair', key: { kind: 'string' }, type: { kind: 'int' } }],
      },
    });
    const node = expectKind(index.resolve('::t::Map'), 'struct');
    expect(node.fields).toHaveLength(1);
    expect(node.fields[0]?.key).toBe('*');
    expect(node.fields[0]?.optional).toBe(true);
    expect(expectKind(node.fields[0]?.type, 'number').numberKind).toBe('int');
  });

  it('inlines spreads of references and anonymous structs, after gating', () => {
    const index = indexOf({
      '::t::Base': {
        kind: 'struct',
        fields: [
          { kind: 'pair', key: 'a', type: { kind: 'boolean' } },
          { kind: 'pair', key: 'old', type: { kind: 'boolean' }, attributes: [until('2.0')] },
        ],
      },
      '::t::Alias': { kind: 'reference', path: '::t::Base' },
      '::t::Child': {
        kind: 'struct',
        fields: [
          { kind: 'spread', type: { kind: 'reference', path: '::t::Alias' } },
          {
            kind: 'spread',
            type: {
              kind: 'struct',
              fields: [{ kind: 'pair', key: 'b', type: { kind: 'string' }, optional: true }],
            },
          },
          { kind: 'pair', key: 'a', type: { kind: 'string' } },
        ],
      },
    });
    const node = expectKind(index.resolve('::t::Child'), 'struct');
    expect(node.fields.map((f) => f.key)).toEqual(['a', 'b']);
    // The later pair replaces the spread field of the same key, in place.
    expect(node.fields[0]?.type.kind).toBe('string');
    expect(node.spreads).toEqual([]);
  });

  it('keeps spread cycles as references instead of looping', () => {
    const index = indexOf({
      '::t::A': {
        kind: 'struct',
        fields: [
          { kind: 'pair', key: 'a', type: { kind: 'int' } },
          { kind: 'spread', type: { kind: 'reference', path: '::t::B' } },
        ],
      },
      '::t::B': {
        kind: 'struct',
        fields: [
          { kind: 'pair', key: 'b', type: { kind: 'int' } },
          { kind: 'spread', type: { kind: 'reference', path: '::t::A' } },
        ],
      },
    });
    const a = expectKind(index.resolve('::t::A'), 'struct');
    expect(a.fields.map((f) => f.key)).toEqual(['a', 'b']);
    expect(expectKind(a.spreads[0], 'reference').path).toBe('::t::A');
  });

  it('pushes dispatcher spreads and maps dynamic accessors', () => {
    const index = indexOf(
      {
        '::t::S': {
          kind: 'struct',
          fields: [
            {
              kind: 'spread',
              type: {
                kind: 'dispatcher',
                registry: 'msm:test',
                parallelIndices: [
                  { kind: 'dynamic', accessor: [{ keyword: 'parent' }, 'id', { keyword: 'key' }] },
                ],
              },
            },
          ],
        },
      },
      {
        'msm:test': {
          x: { kind: 'boolean' },
          new: { kind: 'int', attributes: [since('3.0')] },
        },
      },
    );
    const node = expectKind(index.resolve('::t::S'), 'struct');
    const dispatcher = expectKind(node.spreads[0], 'dispatcher');
    expect(dispatcher.discriminator).toEqual(['%parent', 'id', '%key']);
    expect(dispatcher.keys()).toEqual(['x']);
    expect(dispatcher.dispatch('x')?.kind).toBe('boolean');
    expect(dispatcher.dispatch('new')).toBeUndefined();
  });

  it('resolves static dispatchers regardless of the key argument', () => {
    const index = indexOf(
      {
        '::t::Static': {
          kind: 'dispatcher',
          registry: 'msm:test',
          parallelIndices: [{ kind: 'static', value: 'fallback' }],
        },
        '::t::Named': {
          kind: 'dispatcher',
          registry: 'msm:test',
          parallelIndices: [{ kind: 'static', value: 'named' }],
        },
      },
      { 'msm:test': { '%fallback': { kind: 'any' }, named: { kind: 'boolean' } } },
    );
    const fallback = expectKind(index.resolve('::t::Static'), 'dispatcher');
    expect(fallback.discriminator).toEqual([]);
    expect(fallback.keys()).toEqual(['%fallback']);
    expect(fallback.dispatch('ignored')?.kind).toBe('any');
    const named = expectKind(index.resolve('::t::Named'), 'dispatcher');
    expect(named.dispatch('')?.kind).toBe('boolean');
  });

  it('maps unsupported kinds to "unsupported" with the raw kind', () => {
    const rawKinds = ['template', 'indexed', 'mapped', 'unsafe', 'brand_new'];
    const index = indexOf(Object.fromEntries(rawKinds.map((kind) => [`::t::${kind}`, { kind }])));
    for (const kind of rawKinds) {
      const node = expectKind(index.resolve(`::t::${kind}`), 'unsupported');
      expect(node.rawKind).toBe(kind);
      expect(node.reason.length).toBeGreaterThan(0);
    }
  });

  it('maps Spyglass RangeKind bits to exclusivity flags', () => {
    expect(normaliseRange({ kind: 0b00, min: 1, max: 2 })).toEqual({ min: 1, max: 2 });
    expect(normaliseRange({ kind: 0b10, min: 0 })).toEqual({ min: 0, minExclusive: true });
    expect(normaliseRange({ kind: 0b01, max: 5 })).toEqual({ max: 5, maxExclusive: true });
    expect(normaliseRange({ kind: 0b11, min: 0, max: 1 })).toEqual({
      min: 0,
      max: 1,
      minExclusive: true,
      maxExclusive: true,
    });
    const index = indexOf({
      '::t::F': { kind: 'float', valueRange: { kind: 0b10, min: 0, max: 1 } },
      '::t::L': { kind: 'list', item: { kind: 'byte' }, lengthRange: { kind: 0, min: 3, max: 3 } },
    });
    expect(expectKind(index.resolve('::t::F'), 'number').range).toEqual({
      min: 0,
      max: 1,
      minExclusive: true,
    });
    expect(expectKind(index.resolve('::t::L'), 'list').lengthRange).toEqual({ min: 3, max: 3 });
  });

  it('reads #[id] in string and tree form, gates union members and enum values', () => {
    const idTree = {
      name: 'id',
      value: {
        kind: 'tree',
        values: { registry: { kind: 'literal', value: { kind: 'string', value: 'item' } } },
      },
    };
    const pathTree = {
      name: 'id',
      value: {
        kind: 'tree',
        values: {
          registry: { kind: 'literal', value: { kind: 'string', value: 'texture' } },
          path: { kind: 'literal', value: { kind: 'string', value: 'entity/banner/' } },
        },
      },
    };
    const index = indexOf({
      '::t::Id': { kind: 'string', attributes: [idTree] },
      '::t::Texture': { kind: 'string', attributes: [pathTree] },
      '::t::U': {
        kind: 'union',
        members: [
          { kind: 'boolean' },
          { kind: 'int', attributes: [since('3.0')] },
          { kind: 'string', attributes: [{ name: 'deprecated' }] },
        ],
      },
      '::t::E': {
        kind: 'enum',
        enumKind: 'string',
        values: [
          { identifier: 'A', value: 'a', desc: 'first' },
          { identifier: 'B', value: 'b', attributes: [until('1.5')] },
        ],
      },
    });
    expect(expectKind(index.resolve('::t::Id'), 'string').idRegistry).toBe('item');
    expect(expectKind(index.resolve('::t::Id'), 'string').idPath).toBeUndefined();
    const texture = expectKind(index.resolve('::t::Texture'), 'string');
    expect([texture.idRegistry, texture.idPath]).toEqual(['texture', 'entity/banner/']);
    const union = expectKind(index.resolve('::t::U'), 'union');
    expect(union.members.map((m) => m.kind)).toEqual(['boolean', 'string']);
    expect(union.members[1]?.deprecated).toBe(true);
    expect(expectKind(index.resolve('::t::E'), 'enum').values).toEqual([
      { identifier: 'A', value: 'a', desc: 'first' },
    ]);
  });

  it('marks deprecated fields and keeps descriptions', () => {
    const index = indexOf({
      '::t::D': {
        kind: 'struct',
        fields: [
          { kind: 'pair', key: 'x', type: { kind: 'int' }, desc: 'Doc.', deprecated: true },
          { kind: 'pair', key: 'y', type: { kind: 'int' }, attributes: [{ name: 'deprecated' }] },
        ],
      },
    });
    const node = expectKind(index.resolve('::t::D'), 'struct');
    expect(node.fields[0]).toMatchObject({
      key: 'x',
      desc: 'Doc.',
      deprecated: true,
      optional: false,
    });
    expect(node.fields[1]?.deprecated).toBe(true);
  });

  it('normalises tuples item by item', () => {
    const index = indexOf({
      '::t::Pair': {
        kind: 'tuple',
        items: [{ kind: 'int' }, { kind: 'int', valueRange: { kind: 0, min: 0 } }],
      },
    });
    const tuple = expectKind(index.resolve('::t::Pair'), 'tuple');
    expect(tuple.items.map((item) => item.kind)).toEqual(['number', 'number']);
    expect(expectKind(tuple.items[1], 'number').range).toEqual({ min: 0 });
  });

  it('normalises primitive arrays to lists of numbers', () => {
    const index = indexOf({
      '::t::Ints': {
        kind: 'int_array',
        lengthRange: { kind: 0, min: 4, max: 4 },
        valueRange: { kind: 0, min: 0, max: 255 },
      },
      '::t::Bytes': { kind: 'byte_array' },
      '::t::Longs': { kind: 'long_array' },
    });
    const ints = expectKind(index.resolve('::t::Ints'), 'list');
    expect(ints.primitiveArray).toBe('int');
    expect(ints.lengthRange).toEqual({ min: 4, max: 4 });
    expect(ints.item).toEqual({ kind: 'number', numberKind: 'int', range: { min: 0, max: 255 } });
    const bytes = expectKind(index.resolve('::t::Bytes'), 'list');
    expect(bytes.primitiveArray).toBe('byte');
    expect(expectKind(bytes.item, 'number').numberKind).toBe('byte');
    expect(expectKind(index.resolve('::t::Longs'), 'list').primitiveArray).toBe('long');
  });

  it('collects attribute names other than since, until, deprecated and id as sorted tags', () => {
    const named = (name: string) => ({ name });
    const index = indexOf({
      '::t::Tagged': {
        kind: 'string',
        attributes: [
          named('translation_key'),
          since('1.0'),
          named('color'),
          { name: 'id', value: { kind: 'literal', value: { kind: 'string', value: 'item' } } },
          named('deprecated'),
          named('color'),
        ],
      },
      '::t::Plain': { kind: 'string', attributes: [since('1.0')] },
    });
    const tagged = expectKind(index.resolve('::t::Tagged'), 'string');
    expect(tagged.tags).toEqual(['color', 'translation_key']);
    expect(tagged.deprecated).toBe(true);
    expect(tagged.idRegistry).toBe('item');
    expect(index.resolve('::t::Plain').tags).toBeUndefined();
  });

  it('records the normalised key type of map-like fields', () => {
    const index = indexOf({
      '::t::Lang': {
        kind: 'struct',
        fields: [
          {
            kind: 'pair',
            key: { kind: 'string', attributes: [{ name: 'translation_key' }] },
            type: { kind: 'string', attributes: [{ name: 'translation_value' }] },
          },
          { kind: 'pair', key: 'named', type: { kind: 'int' } },
        ],
      },
    });
    const lang = expectKind(index.resolve('::t::Lang'), 'struct');
    const keyType = expectKind(lang.fields[0]?.keyType, 'string');
    expect(keyType.tags).toEqual(['translation_key']);
    expect(lang.fields[0]?.type.tags).toEqual(['translation_value']);
    expect(lang.fields[1]?.keyType).toBeUndefined();
  });
});
