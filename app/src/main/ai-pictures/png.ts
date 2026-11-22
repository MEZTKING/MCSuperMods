/**
 * A small PNG encoder for main (no filtering, one IDAT): the fake service's pictures and the
 * RGB reference and palette pictures sent to Retro Diffusion (ADR 0093, 2026-11-22).
 *
 * @packageDocumentation
 */

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'ascii'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Encodes 8-bit pixels as a PNG (no filtering): RGBA by default, or RGB with `channels` 3 (the
 * form Retro Diffusion takes for `input_image` and `input_palette`: no transparency).
 */
export function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array,
  channels: 3 | 4 = 4,
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  const row = width * channels;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** `rgb` (`width` by `height`) scaled up by whole pixels to `toWidth` by `toHeight` (nearest). */
export function scaleRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  toWidth: number,
  toHeight: number,
): Uint8Array {
  const out = new Uint8Array(toWidth * toHeight * 3);
  for (let y = 0; y < toHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / toHeight));
    for (let x = 0; x < toWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / toWidth));
      const from = (sy * width + sx) * 3;
      out.set(rgb.subarray(from, from + 3), (y * toWidth + x) * 3);
    }
  }
  return out;
}
