import { NbtCompound, NbtFile, NbtInt, NbtLong, NbtString } from 'deepslate/nbt';
import { describe, expect, it } from 'vitest';
import { readWorldSeed, WORLD_GEN_SETTINGS_PATH, worldSeedOf } from '../../src/index';

/**
 * `world_gen_settings.dat` files written here (B574 WS17: compound `data`, long `seed`), so no
 * save of the game is committed.
 */
function settingsDat(seed: bigint | null, compression: 'gzip' | 'none' = 'gzip'): Uint8Array {
  const data = new NbtCompound()
    .set('generate_features', new NbtInt(1))
    .set('bonus_chest', new NbtInt(0));
  if (seed !== null) data.set('seed', new NbtLong(seed));
  const root = new NbtCompound().set('data', data).set('DataVersion', new NbtInt(5023));
  return new NbtFile('', root, compression, false, undefined).write();
}

/** A reader over a map of whole files, as the app's contained reader answers. */
function reader(files: Record<string, Uint8Array>) {
  const asked: string[] = [];
  const read = async (path: string): Promise<Uint8Array | null> => {
    asked.push(path);
    return files[path] ?? null;
  };
  return { read, asked };
}

describe('readWorldSeed', () => {
  it('reads a positive seed from data/minecraft/world_gen_settings.dat', async () => {
    const { read, asked } = reader({
      [`/saves/New World/${WORLD_GEN_SETTINGS_PATH}`]: settingsDat(1794106052n),
    });
    expect(await readWorldSeed(read, '/saves/New World/')).toBe(1794106052n);
    expect(asked).toEqual(['/saves/New World/data/minecraft/world_gen_settings.dat']);
  });

  it('reads negative and full 64-bit seeds', async () => {
    for (const seed of [-7046235981325167892n, -1n, 9223372036854775807n, 0n]) {
      const { read } = reader({ [`/w/${WORLD_GEN_SETTINGS_PATH}`]: settingsDat(seed) });
      expect(await readWorldSeed(read, '/w')).toBe(seed);
    }
    expect(worldSeedOf(settingsDat(-42n, 'none'))).toBe(-42n);
  });

  it('is null when the file is missing, has no seed or cannot be read', async () => {
    expect(await readWorldSeed(reader({}).read, '/w')).toBeNull();
    const noSeed = reader({ [`/w/${WORLD_GEN_SETTINGS_PATH}`]: settingsDat(null) });
    expect(await readWorldSeed(noSeed.read, '/w')).toBeNull();
    const garbage = reader({ [`/w/${WORLD_GEN_SETTINGS_PATH}`]: new Uint8Array([1, 2, 3]) });
    expect(await readWorldSeed(garbage.read, '/w')).toBeNull();
    // An older layout: the seed elsewhere, or not a long.
    const wrongType = new NbtFile(
      '',
      new NbtCompound().set('data', new NbtCompound().set('seed', new NbtString('12'))),
      'gzip',
      false,
      undefined,
    ).write();
    expect(worldSeedOf(wrongType)).toBeNull();
    const failing = async (): Promise<Uint8Array | null> => {
      throw new Error('outside the world folder');
    };
    expect(await readWorldSeed(failing, '/w')).toBeNull();
    expect(worldSeedOf(new Uint8Array())).toBeNull();
  });
});
