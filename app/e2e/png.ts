/**
 * A tiny PNG encoder for e2e fixtures: writes an 8-bit RGBA image with no filtering, so tests
 * can import a texture without committing a binary.
 *
 * @packageDocumentation
 */

import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes a `size`×`size` checkerboard of two RGBA colours as a PNG. */
export function checkerPng(
  size: number,
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // leading filter byte 0
    for (let x = 0; x < size; x++) {
      const colour = ((x >> 2) + (y >> 2)) % 2 === 0 ? a : b;
      row.set(colour, 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
