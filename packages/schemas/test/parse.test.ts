import { describe, expect, it } from 'vitest';
import { parseVanillaMcdocSymbols, SymbolsFormatError } from '../src/index';
import { loadFixtureJson } from './fixture';

describe('parseVanillaMcdocSymbols', () => {
  it('parses the fixture subset', () => {
    const symbols = parseVanillaMcdocSymbols(loadFixtureJson());
    expect(symbols.ref).toMatch(/^[0-9a-f]{40}$/);
    expect(symbols.mcdoc['::java::data::recipe::Recipe']?.kind).toBe('struct');
    expect(Object.keys(symbols.dispatchers).sort()).toEqual([
      'minecraft:recipe_serializer',
      'minecraft:resource',
    ]);
  });

  it('throws with a path when mcdoc/dispatcher is missing', () => {
    const json = { ...(loadFixtureJson() as Record<string, unknown>) };
    delete json['mcdoc/dispatcher'];
    expect(() => parseVanillaMcdocSymbols(json)).toThrow(SymbolsFormatError);
    try {
      parseVanillaMcdocSymbols(json);
    } catch (error) {
      expect((error as SymbolsFormatError).path).toBe('/mcdoc~1dispatcher');
    }
  });

  it('reports the path of a malformed nested type', () => {
    const json = {
      ref: 'x',
      mcdoc: { '::a::B': { kind: 'struct', fields: [{ kind: 'pair', key: 'k', type: {} }] } },
      'mcdoc/dispatcher': {},
    };
    expect(() => parseVanillaMcdocSymbols(json)).toThrow('/mcdoc/::a::B/fields/0/type/kind');
  });

  it('rejects a non-object root and a missing ref', () => {
    expect(() => parseVanillaMcdocSymbols([])).toThrow(SymbolsFormatError);
    expect(() => parseVanillaMcdocSymbols({ mcdoc: {}, 'mcdoc/dispatcher': {} })).toThrow('/ref');
  });

  it('accepts unknown kinds for forward compatibility', () => {
    const symbols = parseVanillaMcdocSymbols({
      ref: 'x',
      mcdoc: { '::a::B': { kind: 'something_new' } },
      'mcdoc/dispatcher': {},
    });
    expect(symbols.mcdoc['::a::B']?.kind).toBe('something_new');
  });

  it('checks the shape of generics, tuples and primitive arrays', () => {
    const parse = (type: unknown) =>
      parseVanillaMcdocSymbols({ ref: 'x', mcdoc: { '::a::B': type }, 'mcdoc/dispatcher': {} });
    expect(() =>
      parse({ kind: 'template', typeParams: [{ path: '::a::T' }], child: { kind: 'int' } }),
    ).not.toThrow();
    expect(() => parse({ kind: 'template', typeParams: [{}], child: { kind: 'int' } })).toThrow(
      '/mcdoc/::a::B/typeParams/0/path',
    );
    expect(() => parse({ kind: 'template', typeParams: [] })).toThrow('/mcdoc/::a::B/child');
    expect(() =>
      parse({ kind: 'concrete', child: { kind: 'reference', path: '::a::C' }, typeArgs: [{}] }),
    ).toThrow('/mcdoc/::a::B/typeArgs/0/kind');
    expect(() => parse({ kind: 'concrete', child: { kind: 'int' } })).toThrow(
      '/mcdoc/::a::B/typeArgs',
    );
    expect(() => parse({ kind: 'tuple', items: [{ kind: 'int' }, 3] })).toThrow(
      '/mcdoc/::a::B/items/1',
    );
    expect(() => parse({ kind: 'int_array', valueRange: { kind: 'x' } })).toThrow(
      '/mcdoc/::a::B/valueRange/kind',
    );
    expect(() => parse({ kind: 'long_array', lengthRange: { kind: 0, min: 1 } })).not.toThrow();
  });
});
