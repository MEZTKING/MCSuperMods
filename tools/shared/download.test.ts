import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareCodePoints,
  jsDelivrUrl,
  parseJsonStrict,
  rawGitHubUrl,
  stringifySorted,
  writeFileAtomic,
} from './download.ts';

describe('stringifySorted', () => {
  it('sorts keys at every depth, 2-space indent, trailing newline', () => {
    const value = { b: 1, a: { d: true, c: null }, e: [] };
    expect(stringifySorted(value)).toBe(
      '{\n  "a": {\n    "c": null,\n    "d": true\n  },\n  "b": 1,\n  "e": []\n}\n',
    );
  });

  it('keeps array order and sorts objects inside arrays', () => {
    const value = [3, { z: 0, y: [2, 1] }, 'x'];
    expect(stringifySorted(value)).toBe(
      '[\n  3,\n  {\n    "y": [\n      2,\n      1\n    ],\n    "z": 0\n  },\n  "x"\n]\n',
    );
  });

  it('sorts integer-like keys as strings rather than in engine order', () => {
    expect(stringifySorted({ b: 0, '10': 1, '9': 2, a: 3 })).toBe(
      '{\n  "10": 1,\n  "9": 2,\n  "a": 3,\n  "b": 0\n}\n',
    );
  });

  it('matches JSON.stringify for scalars and empty containers', () => {
    expect(stringifySorted('a"b\n')).toBe(`${JSON.stringify('a"b\n')}\n`);
    expect(stringifySorted(1.5)).toBe('1.5\n');
    expect(stringifySorted({})).toBe('{}\n');
    expect(stringifySorted([])).toBe('[]\n');
  });

  it('is stable under re-parsing', () => {
    const once = stringifySorted({ b: [{ d: 1, c: 2 }], a: 'x' });
    expect(stringifySorted(JSON.parse(once))).toBe(once);
  });

  it('rejects non-JSON values with a path', () => {
    expect(() => stringifySorted({ a: [1, undefined] })).toThrow(TypeError);
    expect(() => stringifySorted({ a: Number.NaN })).toThrow(/\$\.a: non-finite/);
  });
});

describe('compareCodePoints', () => {
  it('orders by code point, shorter prefix first', () => {
    expect(['b', 'B', 'a', 'ab', '_'].sort(compareCodePoints)).toEqual(['B', '_', 'a', 'ab', 'b']);
  });

  it('orders astral characters after the BMP private use area', () => {
    expect(['\u{1F600}', '～'].sort(compareCodePoints)).toEqual(['～', '\u{1F600}']);
  });
});

describe('URL builders', () => {
  it('builds jsDelivr fallback URLs', () => {
    expect(jsDelivrUrl('misode/mcmeta', '1.0-summary', 'registries/data.min.json')).toBe(
      'https://cdn.jsdelivr.net/gh/misode/mcmeta@1.0-summary/registries/data.min.json',
    );
    expect(jsDelivrUrl('owner/repo', 'main', '/version.json')).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/version.json',
    );
  });

  it('builds raw.githubusercontent.com URLs', () => {
    expect(rawGitHubUrl('owner/repo', 'abc', 'LICENSE')).toBe(
      'https://raw.githubusercontent.com/owner/repo/abc/LICENSE',
    );
  });
});

describe('parseJsonStrict', () => {
  it('parses ordinary JSON', () => {
    expect(parseJsonStrict('{"a":[1,2.5,9007199254740991]}')).toEqual({
      a: [1, 2.5, 9007199254740991],
    });
  });

  it('rejects integers that would lose precision', () => {
    expect(() => parseJsonStrict('{"a":9223372036854775807}', 'x')).toThrow(
      /x: integer 9223372036854775807/,
    );
  });
});

describe('writeFileAtomic', () => {
  it('creates parent directories and leaves no temporary files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msm-download-test-'));
    try {
      const path = join(root, 'nested', 'file.json');
      await writeFileAtomic(path, 'one\n');
      await writeFileAtomic(path, 'two\n');
      expect(await readFile(path, 'utf8')).toBe('two\n');
      expect(await readdir(join(root, 'nested'))).toEqual(['file.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
