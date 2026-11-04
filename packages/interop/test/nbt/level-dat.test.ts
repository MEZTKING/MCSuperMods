import { NbtCompound, NbtFile, NbtInt, NbtString } from 'deepslate/nbt';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readLevelName } from '../../src/index';

/** A synthetic `level.dat` (never a Mojang file): root `""` with a `Data` compound. */
function levelDat(
  data: NbtCompound | undefined,
  compression: 'gzip' | 'zlib' | 'none' = 'gzip',
): Uint8Array {
  const root = new NbtCompound();
  if (data !== undefined) root.set('Data', data);
  return new NbtFile('', root, compression, false, undefined).write();
}

const named = (name: string) =>
  new NbtCompound().set('LevelName', new NbtString(name)).set('version', new NbtInt(19133));

describe('readLevelName', () => {
  it('reads Data.LevelName from a gzip level.dat', () => {
    const bytes = levelDat(named('My Survival World'));
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    expect(readLevelName(bytes)).toBe('My Survival World');
  });

  it('reads zlib and uncompressed files too, and trims the name', () => {
    expect(readLevelName(levelDat(named('  Zlib  '), 'zlib'))).toBe('Zlib');
    expect(readLevelName(levelDat(named('Plain'), 'none'))).toBe('Plain');
  });

  it('returns null for a corrupt or truncated file and never throws', () => {
    const good = levelDat(named('World'));
    expect(readLevelName(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    expect(readLevelName(new Uint8Array())).toBeNull();
    expect(readLevelName(good.slice(0, good.length >> 1))).toBeNull();
    expect(readLevelName(gzipSync(new TextEncoder().encode('not nbt at all')))).toBeNull();
  });

  it('returns null when Data or LevelName is missing, the wrong type or blank', () => {
    expect(readLevelName(levelDat(undefined))).toBeNull();
    expect(readLevelName(levelDat(new NbtCompound()))).toBeNull();
    expect(readLevelName(levelDat(new NbtCompound().set('LevelName', new NbtInt(1))))).toBeNull();
    expect(readLevelName(levelDat(named('   ')))).toBeNull();
  });
});
