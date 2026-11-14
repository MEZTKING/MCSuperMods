/**
 * Reads a 48 x 32 x 48 area of a save's Overworld into a block grid for Try it (ADR 0087). The
 * reader is pure and read-only: it asks the caller for whole files by path and never writes.
 *
 * @packageDocumentation
 */

import {
  AIR_IDS,
  ChunkFormatError,
  FIRST_FLAT_CHUNK_DATA_VERSION,
  isFullChunk,
  type ParsedChunk,
  parseChunk,
  parseEntityChunk,
  sectionIndexAt,
} from './chunk';
import { readLevelSummary } from './level';
import {
  decompressChunk,
  externalChunkFileName,
  fflateInflate,
  type Inflate,
  locateChunk,
  RegionFormatError,
  regionFileName,
} from './region';

/** The Try it area size: 48 wide, 32 high, 48 deep (ADR 0085 D11). */
export const WORLD_AREA_SIZE = { x: 48, y: 32, z: 48 } as const;

/** Layers below the highest block at the centre that the area starts at. */
export const WORLD_AREA_BELOW_TOP = 8;

/** The height range used when no chunk of the area could be read (the Overworld's default). */
export const DEFAULT_WORLD_HEIGHT = { minY: -64, maxY: 319 } as const;

/** An area of a save, as a palette and a dense grid (ADR 0087 D5). */
export interface WorldArea {
  format: 1;
  /** The world's name (`Data.LevelName`), or its folder name. */
  world: string;
  /** `Data.DataVersion` of `level.dat`, else the newest chunk's. */
  dataVersion: number;
  /** The world position of grid cell (0, 0, 0). */
  origin: { x: number; y: number; z: number };
  size: { x: 48; y: 32; z: 48 };
  /** Block state strings; `palette[0]` is `minecraft:air`. */
  palette: string[];
  /** Palette indexes, indexed `(y * size.z + z) * size.x + x`. */
  blocks: Uint16Array;
  /** What was not imported. */
  skipped: { blockEntities: number; entities: number; missingChunks: number };
  /** Plain-language lines for the log. */
  warnings: string[];
}

/** Where the area is centred: the world spawn, or a typed block X and Z. */
export type WorldAreaCentre = 'spawn' | { x: number; z: number };

/**
 * Reads one whole file of the save. `path` is `<worldDir>/<relative path>` with `/`
 * separators. Resolves `null` when the file does not exist; rejects when it exists but cannot
 * be read.
 */
export type WorldFileReader = (path: string) => Promise<Uint8Array | null>;

/** Options for {@link readWorldArea}. */
export interface ReadWorldAreaOptions {
  centre: WorldAreaCentre;
  /** Decompression; defaults to `fflate`. The app's main process passes Node's zlib. */
  inflate?: Inflate;
}

/** Why a world cannot be read at all. */
export type WorldReadErrorCode =
  | 'no-level-dat'
  | 'unreadable-level-dat'
  | 'old-format'
  | 'read-failed'
  | 'too-many-states';

/** A world that cannot be read; `message` is a plain sentence for the user. */
export class WorldReadError extends Error {
  readonly code: WorldReadErrorCode;
  constructor(code: WorldReadErrorCode, message: string) {
    super(message);
    this.name = 'WorldReadError';
    this.code = code;
  }
}

const AIR = 'minecraft:air';

function trimSlashes(dir: string): string {
  return dir.replace(/[/\\]+$/, '');
}

function folderName(dir: string): string {
  const parts = trimSlashes(dir).split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Reads the 48 x 32 x 48 area of the Overworld around `options.centre` (ADR 0087 D3, D4).
 *
 * The area spans X and Z from the centre minus 24 to the centre plus 23. Vertically it runs
 * from 8 below the highest non-air block of the centre column to 23 above it, clamped to the
 * world's height range (the sections the chunks hold). Chunks that are not generated, not
 * fully generated, saved before 1.18 or damaged read as air with a warning. Block entities and
 * entities in the area are counted, not imported. `cave_air` and `void_air` read as air.
 *
 * @param readFile - Reads one whole file of the save; see {@link WorldFileReader}.
 * @param worldDir - The save folder (`.../saves/<world>`); paths are built under it with `/`.
 * @throws WorldReadError when `level.dat` is missing or unreadable, the world was saved before
 *   the 1.18 chunk layout, or a region file exists but cannot be read.
 */
export async function readWorldArea(
  readFile: WorldFileReader,
  worldDir: string,
  options: ReadWorldAreaOptions,
): Promise<WorldArea> {
  const dir = trimSlashes(worldDir);
  const inflate = options.inflate ?? fflateInflate;
  const warnings: string[] = [];

  const read = async (relative: string): Promise<Uint8Array | null> => {
    try {
      return await readFile(`${dir}/${relative}`);
    } catch (error) {
      throw new WorldReadError(
        'read-failed',
        `Could not read ${relative}: ${messageOf(error)}. A world that is open in Minecraft can still be read, so the file may be damaged or held by another program.`,
      );
    }
  };

  // level.dat: name, data version and spawn.
  const levelBytes = await read('level.dat');
  if (levelBytes === null) {
    throw new WorldReadError('no-level-dat', 'This folder has no level.dat, so it is not a world.');
  }
  const level = readLevelSummary(levelBytes);
  if (level === null) {
    throw new WorldReadError('unreadable-level-dat', 'The world’s level.dat cannot be read.');
  }
  if (level.dataVersion !== null && level.dataVersion < FIRST_FLAT_CHUNK_DATA_VERSION) {
    throw new WorldReadError(
      'old-format',
      `This world was last saved by Minecraft ${level.versionName ?? 'before 1.18'}. Open it once in Minecraft 1.18 or later, then try again.`,
    );
  }

  let centreX = 0;
  let centreZ = 0;
  if (options.centre === 'spawn') {
    if (level.spawn === null) {
      warnings.push('The world has no spawn point; the area is centred on X 0, Z 0.');
    } else if (level.spawn.dimension !== 'minecraft:overworld') {
      warnings.push(
        `The world spawn is in ${level.spawn.dimension}; only the Overworld can be read, so the area is centred on X 0, Z 0.`,
      );
    } else {
      centreX = Math.floor(level.spawn.x);
      centreZ = Math.floor(level.spawn.z);
    }
  } else {
    centreX = Math.floor(options.centre.x);
    centreZ = Math.floor(options.centre.z);
  }
  const size: WorldArea['size'] = {
    x: WORLD_AREA_SIZE.x,
    y: WORLD_AREA_SIZE.y,
    z: WORLD_AREA_SIZE.z,
  };
  const originX = centreX - Math.floor(size.x / 2);
  const originZ = centreZ - Math.floor(size.z / 2);

  // Chunks of the area, region files read once each.
  const chunkX0 = Math.floor(originX / 16);
  const chunkX1 = Math.floor((originX + size.x - 1) / 16);
  const chunkZ0 = Math.floor(originZ / 16);
  const chunkZ1 = Math.floor((originZ + size.z - 1) / 16);
  const regions = new Map<string, Uint8Array | null>();
  const regionOf = async (folder: string, cx: number, cz: number) => {
    const path = `${folder}/${regionFileName(cx, cz)}`;
    if (!regions.has(path)) regions.set(path, await read(path));
    return regions.get(path) ?? null;
  };
  /** The uncompressed NBT of a chunk, `null` when not generated; throws format errors. */
  const chunkBytes = async (folder: string, cx: number, cz: number) => {
    const region = await regionOf(folder, cx, cz);
    if (region === null) return null;
    const stored = locateChunk(region, cx, cz);
    if (stored === null) return null;
    let payload = stored.payload;
    if (stored.external) {
      const external = await read(`${folder}/${externalChunkFileName(cx, cz)}`);
      if (external === null) {
        throw new RegionFormatError(
          `The external chunk file ${externalChunkFileName(cx, cz)} is missing.`,
        );
      }
      payload = external;
    }
    return decompressChunk(stored.compression, payload, inflate);
  };

  const chunks = new Map<string, ParsedChunk>();
  let missing = 0;
  let partial = 0;
  let old = 0;
  let damagedChunks = 0;
  const damaged: string[] = [];
  for (let cz = chunkZ0; cz <= chunkZ1; cz += 1) {
    for (let cx = chunkX0; cx <= chunkX1; cx += 1) {
      try {
        const bytes = await chunkBytes('region', cx, cz);
        if (bytes === null) {
          missing += 1;
          continue;
        }
        const chunk = parseChunk(bytes);
        if (!isFullChunk(chunk.status)) {
          partial += 1;
          continue;
        }
        for (const problem of chunk.problems) damaged.push(`Chunk ${cx}, ${cz}: ${problem}`);
        chunks.set(`${cx},${cz}`, chunk);
      } catch (error) {
        if (error instanceof WorldReadError) throw error;
        if (error instanceof ChunkFormatError && error.reason === 'old-format') old += 1;
        else {
          damagedChunks += 1;
          damaged.push(`Chunk ${cx}, ${cz} reads as air: ${messageOf(error)}`);
        }
      }
    }
  }
  const unread = missing + partial + old + damagedChunks;
  if (missing + partial > 0) {
    warnings.push(
      `${plural(missing + partial, 'chunk', 'chunks')} of the area ${missing + partial === 1 ? 'is' : 'are'} not generated yet and read as air. Visit the place in Minecraft first to fill ${missing + partial === 1 ? 'it' : 'them'} in.`,
    );
  }
  if (old > 0) {
    warnings.push(
      `${plural(old, 'chunk', 'chunks')} of the area ${old === 1 ? 'was' : 'were'} saved before Minecraft 1.18 and read as air. Visit the place in a newer Minecraft to update ${old === 1 ? 'it' : 'them'}.`,
    );
  }
  warnings.push(...damaged);

  // Height range from the sections the chunks hold.
  let minSection = Number.POSITIVE_INFINITY;
  let maxSection = Number.NEGATIVE_INFINITY;
  let dataVersion = level.dataVersion ?? 0;
  for (const chunk of chunks.values()) {
    if (level.dataVersion === null) dataVersion = Math.max(dataVersion, chunk.dataVersion);
    for (const y of chunk.sections.keys()) {
      minSection = Math.min(minSection, y);
      maxSection = Math.max(maxSection, y);
    }
  }
  const minY = Number.isFinite(minSection) ? minSection * 16 : DEFAULT_WORLD_HEIGHT.minY;
  const maxY = Number.isFinite(maxSection) ? maxSection * 16 + 15 : DEFAULT_WORLD_HEIGHT.maxY;

  const sectionAt = (x: number, y: number, z: number) =>
    chunks.get(`${x >> 4},${z >> 4}`)?.sections.get(y >> 4);

  // The highest non-air block of the centre column.
  let top: number | null = null;
  const centreChunk = chunks.get(`${centreX >> 4},${centreZ >> 4}`);
  if (centreChunk !== undefined) {
    for (let y = maxY; y >= minY && top === null; y -= 1) {
      const section = centreChunk.sections.get(y >> 4);
      if (section === undefined) continue;
      const state = section.palette[sectionIndexAt(section, centreX & 15, y & 15, centreZ & 15)];
      if (state !== undefined && !AIR_IDS.has(blockIdOf(state))) top = y;
    }
  }
  if (top === null) {
    top = 63;
    if (centreChunk !== undefined)
      warnings.push('The centre column is all air; the area starts near sea level.');
  }
  const originY = Math.max(minY, Math.min(top - WORLD_AREA_BELOW_TOP, maxY - size.y + 1));

  // Fill the grid.
  const palette: string[] = [AIR];
  const paletteIndex = new Map<string, number>([[AIR, 0]]);
  const indexOf = (state: string): number => {
    const key = AIR_IDS.has(blockIdOf(state)) ? AIR : state;
    let index = paletteIndex.get(key);
    if (index === undefined) {
      index = palette.length;
      if (index > 0xffff) {
        throw new WorldReadError(
          'too-many-states',
          'The area holds more block states than MSM can show.',
        );
      }
      palette.push(key);
      paletteIndex.set(key, index);
    }
    return index;
  };
  const blocks = new Uint16Array(size.x * size.y * size.z);
  const localCache = new Map<object, Uint16Array>();
  for (let gy = 0; gy < size.y; gy += 1) {
    const wy = originY + gy;
    if (wy < minY || wy > maxY) continue;
    for (let gz = 0; gz < size.z; gz += 1) {
      const wz = originZ + gz;
      for (let gx = 0; gx < size.x; gx += 1) {
        const wx = originX + gx;
        const section = sectionAt(wx, wy, wz);
        if (section === undefined) continue;
        let local = localCache.get(section);
        if (local === undefined) {
          local = Uint16Array.from(section.palette, indexOf);
          localCache.set(section, local);
        }
        blocks[(gy * size.z + gz) * size.x + gx] =
          local[sectionIndexAt(section, wx & 15, wy & 15, wz & 15)] ?? 0;
      }
    }
  }

  // Counted, not imported.
  const inBox = (x: number, y: number, z: number) =>
    x >= originX &&
    x < originX + size.x &&
    y >= originY &&
    y < originY + size.y &&
    z >= originZ &&
    z < originZ + size.z;
  let blockEntities = 0;
  for (const chunk of chunks.values()) {
    for (const entity of chunk.blockEntities) {
      if (inBox(entity.x, entity.y, entity.z)) blockEntities += 1;
    }
  }
  let entities = 0;
  for (let cz = chunkZ0; cz <= chunkZ1; cz += 1) {
    for (let cx = chunkX0; cx <= chunkX1; cx += 1) {
      try {
        const bytes = await chunkBytes('entities', cx, cz);
        if (bytes === null) continue;
        for (const entity of parseEntityChunk(bytes)) {
          if (inBox(Math.floor(entity.x), Math.floor(entity.y), Math.floor(entity.z)))
            entities += 1;
        }
      } catch (error) {
        if (error instanceof WorldReadError) throw error;
        // Entities are only counted; an unreadable entity chunk is left out of the count.
      }
    }
  }
  if (blockEntities + entities > 0) {
    warnings.push(
      `Not brought in: ${plural(blockEntities, 'block entity', 'block entities')} (chest contents, signs and the like) and ${plural(entities, 'entity', 'entities')} (mobs, items, frames).`,
    );
  }

  return {
    format: 1,
    world: level.name ?? folderName(dir),
    dataVersion,
    origin: { x: originX, y: originY, z: originZ },
    size,
    palette,
    blocks,
    skipped: { blockEntities, entities, missingChunks: unread },
    warnings,
  };
}

/** The block id of a state string (`minecraft:oak_stairs[...]` to `minecraft:oak_stairs`). */
export function blockIdOf(state: string): string {
  const bracket = state.indexOf('[');
  return bracket === -1 ? state : state.slice(0, bracket);
}
