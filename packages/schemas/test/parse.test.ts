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
});
