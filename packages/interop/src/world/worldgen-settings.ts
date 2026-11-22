/**
 * The seed of a save (ADR 0119 D9; spike B574 WS17): 26.x keeps it in
 * `<world>/data/minecraft/world_gen_settings.dat` (gzip NBT, compound `data`, long `seed`), not
 * in `level.dat`. The reader is pure and read-only: it asks the caller for the file by path.
 *
 * @packageDocumentation
 */

import { NbtFile } from 'deepslate/nbt';
import type { WorldFileReader } from './area';

/** Where a save keeps its world generation settings, below the world folder. */
export const WORLD_GEN_SETTINGS_PATH = 'data/minecraft/world_gen_settings.dat';

/** The largest `world_gen_settings.dat` read, in bytes (the real file is a few kilobytes). */
export const WORLD_GEN_SETTINGS_MAX_BYTES = 4 * 1024 * 1024;

/** Reads the seed out of the bytes of a `world_gen_settings.dat`, or `null`. */
export function worldSeedOf(bytes: Uint8Array): bigint | null {
  if (bytes.length === 0 || bytes.length > WORLD_GEN_SETTINGS_MAX_BYTES) return null;
  try {
    const data = NbtFile.read(bytes).root.get('data');
    if (!data?.isCompound()) return null;
    const seed = data.get('seed');
    return seed?.isLong() ? seed.toBigInt() : null;
  } catch {
    return null;
  }
}

/**
 * Reads a save's seed.
 *
 * @param readFile - Reads one whole file of the save (`<worldDir>/<relative path>` with `/`);
 *   `null` when it is missing. See {@link WorldFileReader}.
 * @param worldDir - The save folder (`.../saves/<world>`).
 * @returns The seed, or `null` when the file is missing, has an older layout or is unreadable.
 *   Never throws.
 */
export async function readWorldSeed(
  readFile: WorldFileReader,
  worldDir: string,
): Promise<bigint | null> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readFile(`${worldDir.replace(/[/\\]+$/, '')}/${WORLD_GEN_SETTINGS_PATH}`);
  } catch {
    return null;
  }
  return bytes === null ? null : worldSeedOf(bytes);
}
