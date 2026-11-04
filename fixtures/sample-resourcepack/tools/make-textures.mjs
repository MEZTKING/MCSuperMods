#!/usr/bin/env node
/**
 * Draws the sample project's two 16x16 textures from pixel maths and writes them as PNGs.
 * Everything here is original work, dedicated to the public domain (CC0); no Minecraft
 * texture is read or copied.
 *
 * The PNG encoder is self-contained and uses stored (uncompressed) deflate blocks, so the
 * output bytes are identical on every machine and Node version.
 *
 * Usage: node fixtures/sample-resourcepack/tools/make-textures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 16;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const texturesDir = join(root, 'assets', 'msm_sample', 'textures');

// Palette (RGBA) ------------------------------------------------------------------------

const DARK = [92, 8, 24, 255];
const DEEP = [140, 16, 36, 255];
const MID = [196, 28, 52, 255];
const LIGHT = [232, 72, 92, 255];
const SHINE = [255, 196, 204, 255];
const CLEAR = [0, 0, 0, 0];

// Drawing -------------------------------------------------------------------------------

/** Block of ruby: bevelled frame around a faceted diamond, lit from the top left. */
function rubyBlock(x, y) {
  const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
  if (edge === 0) return x === 0 || y === 0 ? LIGHT : DARK;
  if (edge === 1) return x === 1 || y === 1 ? MID : DEEP;
  // Distance from the centre (7.5, 7.5) in the diamond (L1) metric.
  const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
  if (d > 7) return DEEP;
  if (d > 6) return DARK;
  if ((x === 5 && y === 5) || (x === 6 && y === 5) || (x === 5 && y === 6)) return SHINE;
  // Facets: upper-left halves catch the light.
  return x + y < 15 ? LIGHT : MID;
}

/** Ruby: a cut gem on a transparent background, with a highlight and a dark outline. */
function ruby(x, y) {
  const cx = 7.5;
  const top = 3;
  const bottom = 13;
  if (y < top || y > bottom) return CLEAR;
  // Crown: rows 3-6 widen from 4 to 10 pixels; pavilion: rows 7-13 narrow to a point.
  const half = y <= 6 ? 2 + (y - top) : 5 - Math.floor(((y - 6) * 5) / 7);
  const dx = Math.abs(x - cx);
  if (dx > half) return CLEAR;
  if (dx > half - 1 || y === top) return DARK;
  if (y <= 6) return (x === 5 || x === 6) && y === 4 ? SHINE : y === 6 ? MID : LIGHT;
  return x < cx ? MID : DEEP;
}

function draw(pixel) {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      rgba.set(pixel(x, y), (y * SIZE + x) * 4);
    }
  }
  return rgba;
}

// PNG encoding --------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (value) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

function chunk(type, data) {
  const body = Uint8Array.from([...Buffer.from(type, 'latin1'), ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** A zlib stream of stored deflate blocks (each at most 65535 bytes). */
function zlibStored(raw) {
  const out = [0x78, 0x01];
  for (let offset = 0; offset < raw.length || offset === 0; offset += 65535) {
    const block = raw.subarray(offset, offset + 65535);
    const last = offset + 65535 >= raw.length ? 1 : 0;
    out.push(last, block.length & 0xff, block.length >>> 8);
    out.push(~block.length & 0xff, (~block.length >>> 8) & 0xff);
    out.push(...block);
    if (last) break;
  }
  out.push(...u32(adler32(raw)));
  return out;
}

function encodePng(rgba) {
  const raw = new Uint8Array(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (1 + SIZE * 4)] = 0; // filter: none
    raw.set(rgba.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (1 + SIZE * 4) + 1);
  }
  const ihdr = [...u32(SIZE), ...u32(SIZE), 8, 6, 0, 0, 0]; // 8-bit RGBA
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', []),
  ]);
}

// Output --------------------------------------------------------------------------------

const outputs = [
  ['block/ruby_block.png', rubyBlock],
  ['item/ruby.png', ruby],
];
for (const [path, pixel] of outputs) {
  const file = join(texturesDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(draw(pixel)));
  console.log(`wrote ${file}`);
}
