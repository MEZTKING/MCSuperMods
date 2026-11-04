import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  type RawMcdocType,
  type SchemaNode,
  type VanillaMcdocSymbols,
} from '../src/index';

const ref = (path: string) => ({ kind: 'reference', path });
const concrete = (path: string, ...typeArgs: unknown[]) => ({
  kind: 'concrete',
  child: ref(path),
  typeArgs,
});
const pair = (key: string, type: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'pair',
  key,
  type,
  ...extra,
});

/** Hand-written generics modelled on vanilla-mcdoc's `::java::util` and number providers. */
const mcdoc: Record<string, unknown> = {
  '::g::InclusiveRange': {
    kind: 'template',
    typeParams: [{ path: '::g::T' }],
    child: {
      kind: 'union',
      members: [
        ref('::g::T'),
        { kind: 'list', item: ref('::g::T'), lengthRange: { kind: 0, min: 2, max: 2 } },
        // A named type hoisted out of the template body that mentions its parameter.
        ref('::g::ExplicitInclusiveRange'),
      ],
    },
  },
  '::g::ExplicitInclusiveRange': {
    kind: 'struct',
    fields: [pair('min_inclusive', ref('::g::T')), pair('max_inclusive', ref('::g::T'))],
  },
  '::g::Pack': {
    kind: 'struct',
    fields: [
      pair('supported_formats', concrete('::g::InclusiveRange', { kind: 'int' }), {
        optional: true,
      }),
      pair('scale', concrete('::g::InclusiveRange', { kind: 'float' })),
      pair('again', concrete('::g::InclusiveRange', { kind: 'int' })),
      pair('tagged', {
        ...concrete('::g::InclusiveRange', { kind: 'int' }),
        attributes: [{ name: 'pack_format' }],
      }),
    ],
  },
  '::g::Wrapper': {
    kind: 'template',
    typeParams: [{ path: '::g::W' }],
    child: {
      kind: 'struct',
      fields: [
        pair('value', ref('::g::W')),
        // Nested instantiation whose argument is the outer parameter.
        pair('range', concrete('::g::InclusiveRange', ref('::g::W'))),
        pair('ranges', { kind: 'list', item: concrete('::g::InclusiveRange', ref('::g::W')) }),
      ],
    },
  },
  '::g::Holder': {
    kind: 'struct',
    fields: [pair('wrapped', concrete('::g::Wrapper', { kind: 'double' }))],
  },
  '::g::IntProvider': {
    kind: 'template',
    typeParams: [{ path: '::g::P' }],
    child: {
      kind: 'union',
      members: [ref('::g::P'), concrete('::g::Clamped', ref('::g::P'))],
    },
  },
  '::g::Clamped': {
    kind: 'template',
    typeParams: [{ path: '::g::P' }],
    child: {
      kind: 'struct',
      fields: [
        pair('source', concrete('::g::IntProvider', ref('::g::P'))),
        pair('min', ref('::g::P')),
      ],
    },
  },
  '::g::UsesProvider': {
    kind: 'struct',
    fields: [pair('count', concrete('::g::IntProvider', { kind: 'int' }))],
  },
  '::g::Inline': {
    kind: 'concrete',
    child: {
      kind: 'template',
      typeParams: [{ path: '::g::I' }],
      child: { kind: 'list', item: ref('::g::I') },
    },
    typeArgs: [{ kind: 'boolean' }],
  },
  '::g::NotGeneric': concrete('::g::ExplicitInclusiveRange', { kind: 'int' }),
};

function makeIndex() {
  const symbols: VanillaMcdocSymbols = {
    ref: 'test',
    mcdoc: mcdoc as Record<string, RawMcdocType>,
    dispatchers: {},
  };
  return createSchemaIndex(symbols, { mcVersion: '1.0' });
}

function expectKind<K extends SchemaNode['kind']>(
  node: SchemaNode | undefined,
  kind: K,
): Extract<SchemaNode, { kind: K }> {
  expect(node?.kind).toBe(kind);
  return node as Extract<SchemaNode, { kind: K }>;
}

function fieldType(node: SchemaNode | undefined, key: string): SchemaNode | undefined {
  return expectKind(node, 'struct').fields.find((f) => f.key === key)?.type;
}

describe('generic instantiation', () => {
  it('instantiates InclusiveRange<int> as a union whose struct fields are int numbers', () => {
    const index = makeIndex();
    const range = expectKind(fieldType(index.resolve('::g::Pack'), 'supported_formats'), 'union');
    expect(range.members.map((m) => m.kind)).toEqual(['number', 'list', 'struct']);
    expect(expectKind(range.members[0], 'number').numberKind).toBe('int');
    const list = expectKind(range.members[1], 'list');
    expect(expectKind(list.item, 'number').numberKind).toBe('int');
    expect(list.lengthRange).toEqual({ min: 2, max: 2 });
    const explicit = expectKind(range.members[2], 'struct');
    expect(explicit.fields.map((f) => f.key)).toEqual(['min_inclusive', 'max_inclusive']);
    for (const f of explicit.fields) {
      expect(expectKind(f.type, 'number').numberKind).toBe('int');
    }
  });

  it('caches instantiations per type arguments and keeps shared nodes undecorated', () => {
    const index = makeIndex();
    const pack = index.resolve('::g::Pack');
    const ints = fieldType(pack, 'supported_formats');
    expect(fieldType(pack, 'again')).toBe(ints);
    const floats = expectKind(fieldType(pack, 'scale'), 'union');
    expect(floats).not.toBe(ints);
    expect(expectKind(floats.members[0], 'number').numberKind).toBe('float');
    // Attributes on one use are applied to a copy, not to the shared instantiation.
    const tagged = fieldType(pack, 'tagged');
    expect(tagged?.tags).toEqual(['pack_format']);
    expect(tagged).not.toBe(ints);
    expect(ints?.tags).toBeUndefined();
  });

  it('passes an outer parameter through a nested instantiation inside a struct', () => {
    const index = makeIndex();
    const wrapped = fieldType(index.resolve('::g::Holder'), 'wrapped');
    expect(expectKind(fieldType(wrapped, 'value'), 'number').numberKind).toBe('double');
    const range = expectKind(fieldType(wrapped, 'range'), 'union');
    expect(expectKind(range.members[0], 'number').numberKind).toBe('double');
    const ranges = expectKind(fieldType(wrapped, 'ranges'), 'list');
    expect(ranges.item).toBe(range);
  });

  it('breaks recursive instantiations with a lazy reference', () => {
    const index = makeIndex();
    const provider = expectKind(fieldType(index.resolve('::g::UsesProvider'), 'count'), 'union');
    expect(expectKind(provider.members[0], 'number').numberKind).toBe('int');
    const clamped = provider.members[1];
    expect(expectKind(fieldType(clamped, 'min'), 'number').numberKind).toBe('int');
    const source = expectKind(fieldType(clamped, 'source'), 'reference');
    expect(source.path).toBe('::g::IntProvider');
    expect(source.resolve()).toBe(provider);
  });

  it('instantiates an inline template', () => {
    const list = expectKind(makeIndex().resolve('::g::Inline'), 'list');
    expect(list.item.kind).toBe('boolean');
  });

  it('normalises a concrete type over a non-template as its child', () => {
    const index = makeIndex();
    const reference = expectKind(index.resolve('::g::NotGeneric'), 'reference');
    expect(reference.path).toBe('::g::ExplicitInclusiveRange');
    const node = expectKind(reference.resolve(), 'struct');
    // The child mentions ::g::T, which nothing binds here.
    const min = expectKind(node.fields[0]?.type, 'unsupported');
    expect(min.reason).toContain('unbound type parameter');
  });

  it('leaves a template reached without arguments unsupported', () => {
    const index = makeIndex();
    const template = expectKind(index.resolve('::g::InclusiveRange'), 'unsupported');
    expect(template.rawKind).toBe('template');
    expect(template.reason).toBe('uninstantiated template');
    // A hoisted body type resolved on its own has its parameter unbound, without throwing.
    const explicit = expectKind(index.resolve('::g::ExplicitInclusiveRange'), 'struct');
    expect(expectKind(explicit.fields[0]?.type, 'unsupported').rawKind).toBe('reference');
  });
});
