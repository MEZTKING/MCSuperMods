/**
 * Anvil region files (`region/r.<x>.<z>.mca`): the 8 KiB header of 1,024 chunk locations and
 * timestamps, then 4 KiB sectors. Each stored chunk starts with a 4-byte big-endian length and
 * a 1-byte compression type; the rest is the compressed NBT. A type with bit 128 set means the
 * chunk was too large for the region and lives in `c.<x>.<z>.mcc` beside it (ADR 0087 D4).
 *
 * Pure: bytes in, bytes out. Decompression goes through an injected {@link Inflate} so the main
 * process can use Node's zlib; the default uses `fflate`.
 *
 * @packageDocumentation
 */

import { gunzipSync, unzlibSync } from 'fflate';

/** The size of one region sector in bytes. */
export const REGION_SECTOR_BYTES = 4096;

/** The region header: 1,024 locations plus 1,024 timestamps. */
export const REGION_HEADER_BYTES = 2 * REGION_SECTOR_BYTES;

/** Chunk compression types (the low 7 bits of the type byte). */
export const ChunkCompression = {
  gzip: 1,
  zlib: 2,
  none: 3,
  lz4: 4,
  custom: 127,
} as const;

/** The bit of the compression type byte that marks an external `.mcc` chunk. */
export const EXTERNAL_CHUNK_FLAG = 128;

/** Decompresses gzip or zlib data. */
export type Inflate = (data: Uint8Array, format: 'gzip' | 'zlib') => Uint8Array;

/** The default {@link Inflate}, over `fflate`. */
export const fflateInflate: Inflate = (data, format) =>
  format === 'gzip' ? gunzipSync(data) : unzlibSync(data);

/** A chunk's stored bytes as found in a region file. */
export interface StoredChunk {
  /** The compression type, without the external flag. */
  compression: number;
  /** `true` when the data lives in `c.<x>.<z>.mcc`; `payload` is then empty. */
  external: boolean;
  /** The compressed bytes (empty for an external chunk). */
  payload: Uint8Array;
}

/** A region file or chunk that cannot be read. */
export class RegionFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegionFormatError';
  }
}

/** The region file name that holds chunk `(chunkX, chunkZ)`. */
export function regionFileName(chunkX: number, chunkZ: number): string {
  return `r.${chunkX >> 5}.${chunkZ >> 5}.mca`;
}

/** The external chunk file name of chunk `(chunkX, chunkZ)`. */
export function externalChunkFileName(chunkX: number, chunkZ: number): string {
  return `c.${chunkX}.${chunkZ}.mcc`;
}

/**
 * Finds chunk `(chunkX, chunkZ)` (world chunk coordinates; only the low 5 bits are used) in a
 * whole region file.
 *
 * @returns The stored chunk, or `null` when the region has no chunk there (not generated).
 * @throws RegionFormatError when the header or the chunk's sectors are damaged or cut short.
 */
export function locateChunk(
  region: Uint8Array,
  chunkX: number,
  chunkZ: number,
): StoredChunk | null {
  if (region.length === 0) return null;
  if (region.length < REGION_HEADER_BYTES) {
    throw new RegionFormatError('The region file is shorter than its header.');
  }
  const view = new DataView(region.buffer, region.byteOffset, region.byteLength);
  const location = view.getUint32((((chunkZ & 31) << 5) | (chunkX & 31)) * 4);
  const offset = location >>> 8;
  const sectors = location & 0xff;
  if (offset === 0 && sectors === 0) return null;
  if (offset < 2) throw new RegionFormatError('A chunk points into the region header.');
  const start = offset * REGION_SECTOR_BYTES;
  if (start + 5 > region.length) {
    throw new RegionFormatError('A chunk lies past the end of the region file.');
  }
  const length = view.getUint32(start);
  if (length === 0) return null;
  const type = view.getUint8(start + 4);
  const external = (type & EXTERNAL_CHUNK_FLAG) !== 0;
  const compression = type & ~EXTERNAL_CHUNK_FLAG & 0xff;
  if (external) return { compression, external: true, payload: new Uint8Array(0) };
  const end = start + 4 + length;
  if (end > region.length) {
    throw new RegionFormatError('A chunk is cut short (the file may still be being written).');
  }
  return { compression, external: false, payload: region.subarray(start + 5, end) };
}

/**
 * Decompresses a chunk payload into raw NBT bytes.
 *
 * @throws RegionFormatError for LZ4 (type 4), custom (127) or unknown compression, and for
 *   data that does not inflate.
 */
export function decompressChunk(
  compression: number,
  payload: Uint8Array,
  inflate: Inflate = fflateInflate,
): Uint8Array {
  switch (compression) {
    case ChunkCompression.gzip:
    case ChunkCompression.zlib:
      try {
        return inflate(payload, compression === ChunkCompression.gzip ? 'gzip' : 'zlib');
      } catch (error) {
        throw new RegionFormatError(
          `A chunk does not decompress: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    case ChunkCompression.none:
      return payload;
    case ChunkCompression.lz4:
      throw new RegionFormatError(
        'A chunk is LZ4 compressed (region-file-compression=lz4 on a server), which MSM cannot read yet.',
      );
    case ChunkCompression.custom:
      throw new RegionFormatError('A chunk uses a custom compression MSM cannot read.');
    default:
      throw new RegionFormatError(`A chunk has an unknown compression type ${compression}.`);
  }
}
