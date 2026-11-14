/**
 * The parts of a save's `level.dat` that Try it needs (ADR 0087 D3): the world name, its data
 * version and version name, when it was last played and the world spawn.
 *
 * @packageDocumentation
 */

import { type NbtCompound, NbtFile, type NbtTag } from 'deepslate/nbt';

/** What {@link readLevelSummary} finds in `level.dat`. */
export interface LevelSummary {
  /** `Data.LevelName`, trimmed, or `null` when missing or blank. */
  name: string | null;
  /** `Data.DataVersion`, or `null` when missing. */
  dataVersion: number | null;
  /** `Data.Version.Name` (the game version that last saved it), or `null`. */
  versionName: string | null;
  /** `Data.LastPlayed` in milliseconds since 1970, or `null`. */
  lastPlayed: number | null;
  /**
   * The world spawn: `Data.spawn { dimension, pos: [I; x, y, z] }` (1.21.9 and later; field
   * names verify at implementation against a 26.x save), else `Data.SpawnX/SpawnY/SpawnZ`.
   * `null` when neither is present.
   */
  spawn: { x: number; y: number; z: number; dimension: string } | null;
}

function asCompound(tag: NbtTag | undefined): NbtCompound | null {
  return tag?.isCompound() ? tag : null;
}

function numberOf(compound: NbtCompound, key: string): number | null {
  return compound.hasNumber(key) ? compound.getNumber(key) : null;
}

/**
 * Reads a `level.dat` (gzip, zlib or uncompressed NBT).
 *
 * @returns The summary, or `null` when the bytes are not NBT with a `Data` compound.
 */
export function readLevelSummary(bytes: Uint8Array): LevelSummary | null {
  let data: NbtCompound | null;
  try {
    data = asCompound(NbtFile.read(bytes).root.get('Data'));
  } catch {
    return null;
  }
  if (data === null) return null;
  const nameTag = data.get('LevelName');
  const trimmed = nameTag?.isString() ? nameTag.getAsString().trim() : '';
  const version = asCompound(data.get('Version'));
  const versionTag = version?.get('Name');
  let spawn: LevelSummary['spawn'] = null;
  const spawnTag = asCompound(data.get('spawn'));
  const pos = spawnTag?.get('pos');
  if (spawnTag && pos?.isIntArray() && pos.length >= 3) {
    const [x, y, z] = pos.getItems().map((item) => item.getAsNumber());
    const dimension = spawnTag.hasString('dimension')
      ? spawnTag.getString('dimension')
      : 'minecraft:overworld';
    spawn = { x: x ?? 0, y: y ?? 0, z: z ?? 0, dimension };
  } else {
    const x = numberOf(data, 'SpawnX');
    const z = numberOf(data, 'SpawnZ');
    if (x !== null && z !== null) {
      spawn = { x, y: numberOf(data, 'SpawnY') ?? 64, z, dimension: 'minecraft:overworld' };
    }
  }
  return {
    name: trimmed === '' ? null : trimmed,
    dataVersion: numberOf(data, 'DataVersion'),
    versionName: versionTag?.isString() ? versionTag.getAsString() : null,
    lastPlayed: numberOf(data, 'LastPlayed'),
    spawn,
  };
}
