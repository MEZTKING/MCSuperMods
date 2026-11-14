/**
 * The fake image service of the e2e runs (`MSM_E2E_AI_PICTURES_FAKE=1`, ADR 0093 D8): no key,
 * no network. It draws `count` 64 by 64 PNGs: a shaded ball on a white background for items
 * and tools, a speckled square for blocks, each picture in another hue.
 *
 * @packageDocumentation
 */

import { deflateSync } from 'node:zlib';
import type { PictureProvider } from './provider';

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

/** Encodes 8-bit RGBA pixels as a PNG (no filtering). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
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

/** An RGB colour of `hue` (0 to 360) at `light` (0 to 1). */
function colourOf(hue: number, light: number): [number, number, number] {
  const k = (n: number) => (n + hue / 30) % 12;
  const a = 0.7 * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** One fake picture. */
export function fakePicture(index: number, block: boolean): Uint8Array {
  const size = 64;
  const hue = (index * 90 + 10) % 360;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = (y * size + x) * 4;
      if (block) {
        const speckle = ((x * 7 + y * 13) % 5) / 10;
        data.set([...colourOf(hue, 0.3 + speckle * 0.6), 255], at);
        continue;
      }
      const dx = x - 32;
      const dy = y - 32;
      const inside = dx * dx + dy * dy < 22 * 22;
      // Lighter towards the top left, as vanilla items are lit.
      const light = 0.25 + 0.5 * (1 - (x + y) / (2 * size));
      data.set(inside ? [...colourOf(hue, light), 255] : [255, 255, 255, 255], at);
    }
  }
  return encodePng(size, size, data);
}

export const fakeProvider: PictureProvider = {
  id: 'retro-diffusion',
  async generate(input) {
    return Array.from({ length: input.count }, (_, index) =>
      fakePicture(index, input.style === 'block'),
    );
  },
  async testKey() {
    return { ok: true };
  },
};
