import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_EXTENSIONS,
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaNode,
  SchemaNotFoundError,
  SymbolsFormatError,
  validateJson,
} from '../src/index';

// Raw builders ----------------------------------------------------------------------

const lit = (value: string) => ({ kind: 'literal', value: { kind: 'string', value } });
const id = (registry: string) => ({
  kind: 'string',
  attributes: [{ name: 'id', value: lit(registry) }],
});
const ref = (path: string) => ({ kind: 'reference', path });
const pair = (key: unknown, type: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'pair',
  key,
  type,
  ...extra,
});
const struct = (...fields: unknown[]) => ({ kind: 'struct', fields });
const dynamic = (registry: string, ...accessor: unknown[]) => ({
  kind: 'dispatcher',
  registry,
  parallelIndices: [{ kind: 'dynamic', accessor }],
});
const indexed = (child: unknown, index: unknown) => ({
  kind: 'indexed',
  child,
  parallelIndices: [index],
});
const staticIndex = (value: string) => ({ kind: 'static', value });
const keyIndex = { kind: 'dynamic', accessor: [{ keyword: 'key' }] };

/** Hand-written export modelled on vanilla-mcdoc's environment attributes, block states and tags. */
const symbolsJson = {
  ref: 'test',
  mcdoc: {
    '::t::AttributeCheck': struct(
      pair('attribute', id('environment_attribute')),
      pair(
        'value',
        indexed(dynamic('minecraft:environment_attribute', 'attribute'), staticIndex('value')),
      ),
    ),
    '::t::AttributeMap': struct(
      pair(
        id('environment_attribute'),
        indexed(
          dynamic('minecraft:environment_attribute', { keyword: 'key' }),
          staticIndex('modifier'),
        ),
      ),
    ),
    '::t::States': struct(
      pair('block', id('block')),
      pair(
        'state',
        struct(
          pair(
            { kind: 'string' },
            indexed(dynamic('test:states', { keyword: 'parent' }, 'block'), keyIndex),
          ),
        ),
      ),
    ),
    '::t::Pair': struct(pair('left', { kind: 'int' }), pair('right', { kind: 'boolean' })),
    '::t::Left': indexed(ref('::t::Pair'), staticIndex('left')),
    '::t::AnyField': indexed(ref('::t::Pair'), keyIndex),
    '::t::Missing': indexed(ref('::t::Pair'), staticIndex('nope')),
    '::t::OfString': indexed({ kind: 'string' }, staticIndex('x')),
    '::t::Provider': {
      kind: 'template',
      typeParams: [{ path: '::t::T' }],
      child: struct(pair('type', id('provider_type')), {
        kind: 'spread',
        type: {
          kind: 'concrete',
          child: dynamic('test:provider', 'type'),
          typeArgs: [ref('::t::T')],
        },
      }),
    },
    '::t::UsesProvider': struct(
      pair('count', { kind: 'concrete', child: ref('::t::Provider'), typeArgs: [{ kind: 'int' }] }),
    ),
    '::java::data::tag::Tag': {
      kind: 'template',
      typeParams: [{ path: '::java::data::tag::E' }],
      child: struct(
        pair('replace', { kind: 'boolean' }, { optional: true }),
        pair('values', {
          kind: 'list',
          item: {
            kind: 'union',
            members: [
              ref('::java::data::tag::E'),
              struct(
                pair('id', ref('::java::data::tag::E')),
                pair('required', { kind: 'boolean' }, { optional: true }),
              ),
            ],
          },
        }),
      ),
    },
  },
  'mcdoc/dispatcher': {
    'minecraft:environment_attribute': {
      'gameplay/flag': struct(
        pair('value', { kind: 'boolean' }),
        pair('modifier', { kind: 'literal', value: { kind: 'string', value: 'override' } }),
      ),
      'visual/fog': struct(pair('value', { kind: 'float' }), pair('modifier', { kind: 'float' })),
      'odd/any': { kind: 'any' },
      'odd/list': { kind: 'list', item: { kind: 'int' } },
    },
    'test:states': {
      '%unknown': struct(pair({ kind: 'string' }, { kind: 'string' })),
    },
    'test:provider': {
      constant: {
        kind: 'template',
        typeParams: [{ path: '::t::P' }],
        child: struct(pair('value', ref('::t::P'))),
      },
      plain: struct(pair('n', { kind: 'double' })),
    },
  },
};

const symbols = parseVanillaMcdocSymbols(symbolsJson);
const index = createSchemaIndex(symbols, { mcVersion: '2.0' });

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

const codes = (value: Json, node: SchemaNode): string[] =>
  validateJson(value, node).map((p) => `${p.path} ${p.code}`);

describe('indexed types', () => {
  it('parses indexed types and rejects malformed indices', () => {
    expect(symbols.mcdoc['::t::Left']?.kind).toBe('indexed');
    const bad = {
      ref: 'x',
      mcdoc: {
        '::a::B': { kind: 'indexed', child: { kind: 'any' }, parallelIndices: [{ kind: 'odd' }] },
      },
      'mcdoc/dispatcher': {},
    };
    expect(() => parseVanillaMcdocSymbols(bad)).toThrow(SymbolsFormatError);
    expect(() => parseVanillaMcdocSymbols(bad)).toThrow('/mcdoc/::a::B/parallelIndices/0/kind');
  });

  it('maps a static index on a dispatcher to a dispatcher over the indexed field', () => {
    const value = expectKind(
      fieldType(index.resolve('::t::AttributeCheck'), 'value'),
      'dispatcher',
    );
    expect(value.registry).toBe('minecraft:environment_attribute');
    expect(value.discriminator).toEqual(['attribute']);
    expect(value.keys()).toEqual(['gameplay/flag', 'odd/any', 'odd/list', 'visual/fog']);
    expect(value.dispatch('gameplay/flag')?.kind).toBe('boolean');
    expect(value.dispatch('minecraft:visual/fog')).toMatchObject({
      kind: 'number',
      numberKind: 'float',
    });
    expect(value.dispatch('odd/any')?.kind).toBe('any');
    expect(value.dispatch('odd/list')).toBeUndefined();
    expect(value.dispatch('absent')).toBeUndefined();
    expect(value.dispatch('gameplay/flag')).toBe(value.dispatch('gameplay/flag'));
  });

  it('validates the indexed field against the sibling discriminator', () => {
    const check = index.resolve('::t::AttributeCheck');
    expect(codes({ attribute: 'minecraft:gameplay/flag', value: true }, check)).toEqual([]);
    expect(codes({ attribute: 'gameplay/flag', value: 3 }, check)).toEqual([
      '/value schema.type-mismatch',
    ]);
    expect(codes({ attribute: 'visual/fog', value: 0.5 }, check)).toEqual([]);
    expect(codes({ attribute: 'nope', value: 1 }, check)).toEqual([
      '/attribute schema.unknown-dispatch-key',
    ]);
  });

  it('reads a %key discriminator from the map key', () => {
    const map = index.resolve('::t::AttributeMap');
    expect(codes({ 'visual/fog': 2 }, map)).toEqual([]);
    expect(codes({ 'gameplay/flag': 'override' }, map)).toEqual([]);
    expect(codes({ 'gameplay/flag': 'other' }, map)).toEqual([
      '/gameplay~1flag schema.invalid-literal',
    ]);
  });

  it('maps a dynamic index to the member wildcard field and accepts %parent accessors', () => {
    const states = index.resolve('::t::States');
    const wildcard = expectKind(fieldType(states, 'state'), 'struct').fields[0];
    const member = expectKind(wildcard?.type, 'dispatcher');
    expect(member.discriminator).toEqual(['%parent', 'block']);
    expect(member.dispatch('%unknown')?.kind).toBe('string');
    expect(codes({ block: 'stone', state: { facing: 'north' } }, states)).toEqual([]);
  });

  it('indexes a struct directly', () => {
    expect(index.resolve('::t::Left')).toMatchObject({ kind: 'number', numberKind: 'int' });
    const anyField = expectKind(index.resolve('::t::AnyField'), 'union');
    expect(anyField.members.map((m) => m.kind)).toEqual(['number', 'boolean']);
    expect(expectKind(index.resolve('::t::Missing'), 'unsupported').rawKind).toBe('indexed');
    expect(expectKind(index.resolve('::t::OfString'), 'unsupported').rawKind).toBe('indexed');
  });
});

describe('generic dispatchers', () => {
  it('instantiates template members with the dispatcher type arguments', () => {
    const count = fieldType(index.resolve('::t::UsesProvider'), 'count');
    const provider = expectKind(count, 'struct');
    const spread = expectKind(provider.spreads[0], 'dispatcher');
    const constant = expectKind(spread.dispatch('constant'), 'struct');
    expect(constant.fields[0]?.type).toMatchObject({ kind: 'number', numberKind: 'int' });
    expect(spread.dispatch('constant')).toBe(constant);
    expect(expectKind(spread.dispatch('plain'), 'struct').fields[0]?.key).toBe('n');
    expect(codes({ type: 'constant', value: 2 }, provider)).toEqual([]);
    expect(codes({ type: 'constant', value: 'x' }, provider)).toEqual([
      '/value schema.type-mismatch',
    ]);
  });
});

describe('schema references', () => {
  it('instantiates tag:<registry> per registry, memoised', () => {
    const items = index.resolveSchemaRef('tag:item');
    expect(index.resolveSchemaRef('tag:item')).toBe(items);
    const blocks = index.resolveSchemaRef('tag:block');
    expect(blocks).not.toBe(items);
    const values = expectKind(fieldType(items, 'values'), 'list');
    const entry = expectKind(values.item, 'union');
    expect(entry.members[0]).toMatchObject({ kind: 'string', idRegistry: 'item' });
    expect(fieldType(entry.members[1], 'id')).toMatchObject({ kind: 'string', idRegistry: 'item' });
    const blockEntry = expectKind(expectKind(fieldType(blocks, 'values'), 'list').item, 'union');
    expect(blockEntry.members[0]).toMatchObject({ kind: 'string', idRegistry: 'block' });

    const registries = createRegistryIndex({
      vanilla: { item: ['stone'], 'tag/item': ['logs'] },
      project: { 'tag/item': ['demo:gems'] },
    });
    const tag = {
      values: [
        'stone',
        '#minecraft:logs',
        '#demo:gems',
        { id: 'minecraft:stone', required: false },
      ],
    };
    expect(validateJson(tag, items, { registries })).toEqual([]);
    const problems = validateJson({ values: ['#demo:nope', 'dirt'] }, items, { registries });
    expect(problems.map((p) => `${p.path} ${p.code} ${p.severity}`)).toEqual([
      '/values/0 schema.unknown-id warning',
      '/values/1 schema.unknown-id warning',
    ]);
  });

  it('throws SchemaNotFoundError for an empty registry or a missing tag template', () => {
    expect(() => index.resolveSchemaRef('tag:')).toThrow(SchemaNotFoundError);
    const bare = createSchemaIndex({ ref: 'x', mcdoc: {}, dispatchers: {} }, { mcVersion: '2.0' });
    expect(() => bare.resolveSchemaRef('tag:item')).toThrow(SchemaNotFoundError);
  });

  it('resolves built-in and caller extensions', () => {
    const fn = index.resolveSchemaRef('msm:function');
    expect(fn).toBe(BUILT_IN_EXTENSIONS['msm:function']);
    expect(codes({ lines: ['say hi', ''] }, fn)).toEqual([]);
    expect(codes({}, fn)).toEqual(['/lines schema.missing-field']);
    expect(codes({ lines: [1] }, fn)).toEqual(['/lines/0 schema.type-mismatch']);
    expect(Object.isFrozen(fn)).toBe(true);

    const custom: SchemaNode = { kind: 'boolean' };
    const override: SchemaNode = { kind: 'any' };
    const extended = createSchemaIndex(symbols, {
      mcVersion: '2.0',
      extensions: { 'msm:flag': custom, 'msm:function': override },
    });
    expect(extended.resolveSchemaRef('msm:flag')).toBe(custom);
    expect(extended.resolveSchemaRef('msm:function')).toBe(override);
    expect(() => index.resolveSchemaRef('msm:flag')).toThrow(SchemaNotFoundError);
    expect(() => index.resolveSchemaRef('::t::Absent')).toThrow(SchemaNotFoundError);
    expect(index.resolveSchemaRef('::t::Left').kind).toBe('number');
  });

  it('resolves msm:script as a frozen lines struct like msm:function', () => {
    const script = index.resolveSchemaRef('msm:script');
    expect(script).toBe(BUILT_IN_EXTENSIONS['msm:script']);
    expect(script).toEqual(BUILT_IN_EXTENSIONS['msm:function']);
    expect(codes({ lines: ['import { msm } from "msm:runtime";', ''] }, script)).toEqual([]);
    expect(codes({}, script)).toEqual(['/lines schema.missing-field']);
    expect(codes({ lines: [1] }, script)).toEqual(['/lines/0 schema.type-mismatch']);
    expect(codes({ lines: [], extra: true }, script)).toEqual(['/extra schema.unknown-field']);
    expect(Object.isFrozen(script)).toBe(true);
  });
});
