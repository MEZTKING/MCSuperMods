// Generates `build/icon.png` (512x512 RGBA): a plain "MSM" monogram on a rounded square.
// Pure pixel maths and a minimal PNG encoder, so the output is deterministic and contains no
// third-party artwork. Run with `node scripts/make-icon.mjs`; the result is committed.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const RADIUS = 96;
const BACKGROUND = [0x2e, 0x7d, 0x32];
const BORDER = [0x1b, 0x5e, 0x20];
const INK = [0xf5, 0xf5, 0xf5];

/** 5x7 bitmap glyphs; `#` marks a filled cell. */
const GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
};
const TEXT = 'MSM';
const CELL = 24;
const GAP = 1;

const pixels = Buffer.alloc(SIZE * SIZE * 4);

function set(x, y, [r, g, b], a = 255) {
  const i = (y * SIZE + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

/** Distance outside the rounded square (negative inside). */
function outside(x, y) {
  const cx = Math.min(Math.max(x, RADIUS), SIZE - 1 - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), SIZE - 1 - RADIUS);
  return Math.hypot(x - cx, y - cy) - RADIUS;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = outside(x + 0.5, y + 0.5);
    if (d >= 0.5) continue;
    const alpha = d <= -0.5 ? 255 : Math.round((0.5 - d) * 255);
    set(x, y, d > -16 ? BORDER : BACKGROUND, alpha);
  }
}

const columns = TEXT.length * 5 + (TEXT.length - 1) * GAP;
const left = Math.floor((SIZE - columns * CELL) / 2);
const top = Math.floor((SIZE - 7 * CELL) / 2);
[...TEXT].forEach((letter, index) => {
  const glyph = GLYPHS[letter];
  glyph.forEach((row, gy) => {
    [...row].forEach((cell, gx) => {
      if (cell !== '#') return;
      const x0 = left + (index * (5 + GAP) + gx) * CELL;
      const y0 = top + gy * CELL;
      for (let y = y0; y < y0 + CELL; y++) for (let x = x0; x < x0 + CELL; x++) set(x, y, INK);
    });
  });
});

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
writeFileSync(target, png);
console.log(`Wrote ${target} (${png.length} bytes).`);
