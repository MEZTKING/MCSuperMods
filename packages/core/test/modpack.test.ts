import { describe, expect, it } from 'vitest';
import {
  createModpack,
  isModpackProjectPath,
  type Modpack,
  ModpackFormatError,
  parseModpack,
  serialiseModpack,
} from '../src/index';

const mod = {
  projectId: 'P7dR8mSH',
  versionId: 'nJlcvFfj',
  title: 'Sodium',
  fileName: 'sodium-fabric.jar',
  url: 'https://cdn.modrinth.com/data/AANobbMI/versions/abcdefgh/sodium-fabric.jar',
  sha1: 'a'.repeat(40),
  sha512: 'b'.repeat(128),
  size: 1024,
};

function pack(overrides: Partial<Modpack> = {}): Modpack {
  return { ...createModpack('My pack', 'mc-9.9-msm-test'), ...overrides };
}

describe('modpack files', () => {
  it('round-trips through sorted, 2-space JSON', () => {
    const value = pack({
      summary: 'Rubies and more',
      projects: [{ path: '../ruby_mod' }, { path: 'D:/mods/other' }],
      mods: [mod],
    });
    const text = serialiseModpack(value);
    expect(text.startsWith('{\n  "formatVersion": 1,\n  "mods": [')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseModpack(text)).toEqual(value);
  });

  it('drops unknown keys and defaults missing lists', () => {
    const text = JSON.stringify({
      formatVersion: 1,
      name: 'A',
      version: '1',
      targetId: 'mc-9.9-msm-test',
      extra: true,
    });
    expect(parseModpack(text)).toEqual({
      formatVersion: 1,
      name: 'A',
      version: '1',
      targetId: 'mc-9.9-msm-test',
      projects: [],
      mods: [],
    });
  });

  it('refuses bad files with a reason', () => {
    const base = JSON.parse(serialiseModpack(pack())) as Record<string, unknown>;
    const cases: Record<string, unknown>[] = [
      { ...base, formatVersion: 2 },
      { ...base, name: '' },
      { ...base, projects: [{ path: 'a' }, { path: 'A' }] },
      { ...base, projects: [{ path: 'a\\b' }] },
      { ...base, mods: [{ ...mod, url: 'https://example.com/x.jar' }] },
      { ...base, mods: [{ ...mod, sha512: 'xyz' }] },
      { ...base, mods: [{ ...mod, fileName: '../x.jar' }] },
      { ...base, mods: [mod, { ...mod, fileName: 'other.jar' }] },
    ];
    for (const value of cases) {
      expect(() => parseModpack(JSON.stringify(value))).toThrow(ModpackFormatError);
    }
    expect(() => parseModpack('{')).toThrow(ModpackFormatError);
  });

  it('accepts relative, sibling and absolute member paths only', () => {
    for (const path of ['ruby', '../ruby', 'mods/ruby', '/home/me/ruby', 'C:/Users/me/ruby']) {
      expect(isModpackProjectPath(path)).toBe(true);
    }
    for (const path of ['', '/', 'C:/', 'a//b', './a', 'a\\b', 'a/./b']) {
      expect(isModpackProjectPath(path)).toBe(false);
    }
  });
});
