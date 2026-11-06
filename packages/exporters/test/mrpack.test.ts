import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createMrpack, type MrpackInput, mrpackFileName, mrpackIndex } from '../src/index';

const fabricApi = {
  fileName: 'fabric-api-0.1.0+test.jar',
  url: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/abcdefgh/fabric-api-0.1.0%2Btest.jar',
  sha1: '1'.repeat(40),
  sha512: '2'.repeat(128),
  size: 10,
};

function input(overrides: Partial<MrpackInput> = {}): MrpackInput {
  return {
    name: 'Ruby pack',
    version: '1.0.0',
    minecraft: '26.3',
    fabricLoader: '0.20.1',
    downloads: [fabricApi],
    jars: [
      { fileName: 'ruby_mod.jar', data: new Uint8Array([1, 2, 3]) },
      { fileName: 'golem.jar', data: new Uint8Array([4]) },
    ],
    ...overrides,
  };
}

describe('mrpack', () => {
  it('writes the index and the member jars as overrides', () => {
    const files = unzipSync(createMrpack(input({ summary: 'Shiny' })));
    expect(Object.keys(files).sort()).toEqual([
      'modrinth.index.json',
      'overrides/mods/golem.jar',
      'overrides/mods/ruby_mod.jar',
    ]);
    expect(files['overrides/mods/ruby_mod.jar']).toEqual(new Uint8Array([1, 2, 3]));
    expect(JSON.parse(strFromU8(files['modrinth.index.json'] ?? new Uint8Array()))).toEqual({
      dependencies: { 'fabric-loader': '0.20.1', minecraft: '26.3' },
      files: [
        {
          downloads: [fabricApi.url],
          env: { client: 'required', server: 'required' },
          fileSize: 10,
          hashes: { sha1: fabricApi.sha1, sha512: fabricApi.sha512 },
          path: 'mods/fabric-api-0.1.0+test.jar',
        },
      ],
      formatVersion: 1,
      game: 'minecraft',
      name: 'Ruby pack',
      summary: 'Shiny',
      versionId: '1.0.0',
    });
  });

  it('is deterministic', () => {
    expect(createMrpack(input())).toEqual(createMrpack(input()));
    expect(mrpackIndex(input())).not.toHaveProperty('summary');
  });

  it('refuses unsafe or clashing file names', () => {
    expect(() =>
      createMrpack(input({ jars: [{ fileName: '../x.jar', data: new Uint8Array() }] })),
    ).toThrow();
    expect(() =>
      createMrpack(
        input({ jars: [{ fileName: 'Fabric-API-0.1.0+test.jar', data: new Uint8Array() }] }),
      ),
    ).toThrow(/Two files/);
  });

  it('names the file after the modpack', () => {
    expect(mrpackFileName('Ruby pack', '1.0.0')).toBe('Ruby pack-1.0.0.mrpack');
    expect(mrpackFileName('a/b:c', '')).toBe('a_b_c-modpack.mrpack');
  });
});
