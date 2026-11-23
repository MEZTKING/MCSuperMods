import { describe, expect, it } from 'vitest';
import {
  isStructureSaveId,
  listStructureSaves,
  structureSaveFileName,
  structureSaveIdOf,
  structureSavePath,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';

const WORLD = '/inst/minecraft/saves/msm-test-ruby';

describe('structure-block saves (ADR 0116 D3, B547)', () => {
  it('lists generated/<ns>/structure/<path>.nbt of a fixture world, sorted by id', async () => {
    const fs = new MemoryInstallFileSystem()
      .seed(`${WORLD}/level.dat`, 'x')
      .seed(`${WORLD}/generated/ruby/structure/hut.nbt`, 'a')
      .seed(`${WORLD}/generated/ruby/structure/houses/tall_tower.nbt`, 'b')
      .seed(`${WORLD}/generated/minecraft/structure/my_build.nbt`, 'c')
      .seed(`${WORLD}/generated/ruby/structure/notes.txt`, 'd')
      .seed(`${WORLD}/generated/ruby/structure/Bad Name.nbt`, 'e')
      .seed(`${WORLD}/generated/Ruby/structure/x.nbt`, 'f')
      .seed(`${WORLD}/generated/ruby/other/x.nbt`, 'g');
    expect(await listStructureSaves(fs, WORLD)).toEqual([
      { id: 'minecraft:my_build', relative: 'generated/minecraft/structure/my_build.nbt' },
      {
        id: 'ruby:houses/tall_tower',
        relative: 'generated/ruby/structure/houses/tall_tower.nbt',
      },
      { id: 'ruby:hut', relative: 'generated/ruby/structure/hut.nbt' },
    ]);
  });

  it('finds none in a world without generated/', async () => {
    const fs = new MemoryInstallFileSystem().seed(`${WORLD}/level.dat`, 'x');
    expect(await listStructureSaves(fs, WORLD)).toEqual([]);
  });

  it('maps ids, paths and import file names', () => {
    expect(structureSavePath('ruby:houses/hut')).toBe('generated/ruby/structure/houses/hut.nbt');
    expect(structureSaveIdOf('generated/ruby/structure/houses/hut.nbt')).toBe('ruby:houses/hut');
    expect(structureSaveIdOf('generated/ruby/structures/hut.nbt')).toBeNull();
    expect(structureSaveIdOf('generated/ruby/structure/hut.snbt')).toBeNull();
    expect(structureSaveFileName('ruby:houses/hut')).toBe('houses_hut.nbt');
    expect(isStructureSaveId('ruby:../x')).toBe(false);
    expect(isStructureSaveId('ruby:a//b')).toBe(false);
    expect(isStructureSaveId('Ruby:x')).toBe(false);
    expect(isStructureSaveId(':x')).toBe(false);
    expect(() => structureSavePath('nope')).toThrow(/not a structure name/);
  });
});
