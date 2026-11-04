/**
 * Minimal PNG header reading, enough to size textures for import checks and previews
 * without decoding pixels.
 */

/** Thrown by {@link readPngHeader} when the bytes are not a PNG with a valid `IHDR`. */
export class PngFormatError extends Error {
  override readonly name = 'PngFormatError';
}

/** The fields of a PNG `IHDR` chunk that MSM uses. */
export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Allowed bit depths per colour type (PNG specification, table 11.1). */
const BIT_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/**
 * Reads the PNG signature and the leading `IHDR` chunk, checking its CRC.
 *
 * @throws PngFormatError When the signature, chunk layout, CRC or header values are invalid.
 */
export function readPngHeader(bytes: Uint8Array): PngHeader {
  if (bytes.length < 33) throw new PngFormatError('Not a PNG: the data is too short.');
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new PngFormatError('Not a PNG: bad signature.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8);
  const type = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (type !== 'IHDR' || length !== 13) {
    throw new PngFormatError('Invalid PNG: the first chunk is not a 13-byte IHDR.');
  }
  if (crc32(bytes.subarray(12, 29)) !== view.getUint32(29)) {
    throw new PngFormatError('Invalid PNG: the IHDR checksum does not match.');
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = view.getUint8(24);
  const colorType = view.getUint8(25);
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) {
    throw new PngFormatError(`Invalid PNG: dimensions ${width}x${height} are out of range.`);
  }
  if (!(BIT_DEPTHS[colorType] ?? []).includes(bitDepth)) {
    throw new PngFormatError(
      `Invalid PNG: bit depth ${bitDepth} is not allowed for colour type ${colorType}.`,
    );
  }
  return { width, height, bitDepth, colorType };
}

let crcTable: Uint32Array | undefined;

function crc32(data: Uint8Array): number {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
