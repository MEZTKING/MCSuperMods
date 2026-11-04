/**
 * `level.dat` reading: the world name a player gave a save (`Data.LevelName`), so the world
 * picker can show it instead of the save folder name. Read-only; never throws.
 */
import { NbtFile } from 'deepslate/nbt';

/**
 * Reads the world name from the bytes of a `level.dat` file. The file is usually gzip
 * compressed; zlib and uncompressed NBT are detected too.
 *
 * @param bytes - The whole `level.dat` file.
 * @returns The trimmed `Data.LevelName`, or `null` when the file is not readable NBT, has no
 *   `Data` compound or its `LevelName` is missing, not a string or blank.
 */
export function readLevelName(bytes: Uint8Array): string | null {
  try {
    const { root } = NbtFile.read(bytes);
    const data = root.get('Data');
    if (data === undefined || !data.isCompound()) return null;
    const name = data.get('LevelName');
    if (name === undefined || !name.isString()) return null;
    const trimmed = name.getAsString().trim();
    return trimmed === '' ? null : trimmed;
  } catch {
    return null;
  }
}
