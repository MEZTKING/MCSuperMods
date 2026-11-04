import { describe, expect, it } from 'vitest';
import { type Json, parseJson, stableStringify, utf8 } from '../src/index';

describe('stableStringify', () => {
  it('sorts keys at every depth and keeps array order', () => {
    const value = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } };
    expect(stableStringify(value)).toBe(
      '{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
    );
  });

  it('matches JSON.stringify with two spaces for sorted input', () => {
    const value = { a: [1, 'x', true, false, null], b: { c: 'd' }, e: [], f: {} };
    expect(stableStringify(value)).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it('sorts unicode keys by code point', () => {
    // U+FF21 (fullwidth A) is a BMP character; U+1F600 is astral. UTF-16 order would put the
    // astral key (surrogate 0xD83D) before U+FF21; code-point order puts it after.
    const value = { '\u{1F600}': 1, Ａ: 2, é: 3, a: 4, Z: 5 };
    const keys = Object.keys(JSON.parse(stableStringify(value)));
    expect(keys).toEqual(['Z', 'a', 'é', 'Ａ', '\u{1F600}']);
  });

  it('prints numbers as JSON does', () => {
    expect(stableStringify({ a: 3.0, b: 0.5, c: -0, d: 1e21 })).toBe(
      '{\n  "a": 3,\n  "b": 0.5,\n  "c": 0,\n  "d": 1e+21\n}\n',
    );
  });

  it('ends with a newline for scalars', () => {
    expect(stableStringify('x')).toBe('"x"\n');
    expect(stableStringify([])).toBe('[]\n');
  });

  it('throws on undefined anywhere', () => {
    expect(() => stableStringify({ a: undefined } as unknown as Json)).toThrow(TypeError);
    expect(() => stableStringify([1, undefined] as unknown as Json)).toThrow(TypeError);
    expect(() => stableStringify(undefined as unknown as Json)).toThrow(TypeError);
  });

  it('throws on non-JSON values', () => {
    expect(() => stableStringify(Number.NaN)).toThrow(TypeError);
    expect(() => stableStringify({ d: new Date(0) } as unknown as Json)).toThrow(TypeError);
    expect(() => stableStringify({ f: () => 1 } as unknown as Json)).toThrow(TypeError);
  });

  it('round-trips through parseJson', () => {
    const value = { b: [1, { c: 'é' }], a: 'x' };
    expect(parseJson(stableStringify(value))).toEqual(value);
  });
});

describe('utf8', () => {
  it('encodes and decodes', () => {
    expect(utf8.decode(utf8.encode('Grüße \u{1F600}'))).toBe('Grüße \u{1F600}');
  });

  it('rejects malformed bytes', () => {
    expect(() => utf8.decode(new Uint8Array([0xff, 0xfe]))).toThrow();
  });
});
