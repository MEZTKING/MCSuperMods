/**
 * Builds a synthetic client jar in memory (ADR 0011). Every entry is made up here; no
 * Mojang bytes exist in the repository.
 */

import { strToU8, zipSync, zlibSync } from 'fflate';

let crcTable: Uint32Array | undefined;

/** CRC-32 as used by PNG chunks, implemented independently of the code under test. */
export function crc32(data: Uint8Array): number {
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

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(strToU8(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGBA (colour type 6, bit depth 8) PNG of the given size with a checkerboard. */
export function makePng(width = 2, height = 2): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const rowBytes = 1 + width * 4;
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const on = (x + y) % 2 === 0;
      raw.set(on ? [0xf8, 0x00, 0xf8, 0xff] : [0x00, 0x00, 0x00, 0xff], y * rowBytes + 1 + x * 4);
    }
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function json(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

/** Deterministic pseudo-random bytes standing in for compiled classes. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

/** The entries extraction must keep, by path. */
export const KEPT_ENTRIES: Readonly<Record<string, Uint8Array>> = {
  'assets/minecraft/blockstates/msm_test.json': json({
    variants: { '': { model: 'minecraft:block/msm_test_cube' } },
  }),
  'assets/minecraft/items/msm_test.json': json({
    model: { type: 'minecraft:model', model: 'minecraft:block/msm_test_cube' },
  }),
  'assets/minecraft/lang/en_us.json': json({ 'block.minecraft.msm_test': 'MSM Test Block' }),
  'assets/minecraft/models/block/msm_test_cube.json': json({
    parent: 'minecraft:block/cube_all',
    textures: { all: 'minecraft:block/msm_test' },
  }),
  'assets/minecraft/textures/block/msm_test.png': makePng(2, 2),
  'assets/minecraft/textures/block/msm_test_anim.png': makePng(2, 4),
  'assets/minecraft/textures/block/msm_test_anim.png.mcmeta': json({
    animation: { frametime: 3, frames: [1, { index: 0, time: 5 }] },
  }),
};

/** Entries extraction must skip. */
export const SKIPPED_ENTRIES: Readonly<Record<string, Uint8Array>> = {
  'assets/minecraft/lang/de_de.json': json({ 'block.minecraft.msm_test': 'MSM-Testblock' }),
  'assets/minecraft/textures/entity/ignored.png': makePng(1, 1),
  'assets/minecraft/textures/entity/ignored.png.mcmeta': json({ animation: {} }),
  'assets/minecraft/textures/block/msm_test.mcmeta': json({ animation: {} }),
  'data/minecraft/recipe/msm_test.json': json({ type: 'minecraft:crafting_shaped' }),
  'net/minecraft/Foo.class': noise(512, 1),
  'net/minecraft/client/Bar.class': noise(2048, 2),
  'pack.mcmeta': json({ pack: { description: 'synthetic' } }),
};

/** Builds the synthetic jar, including directory entries as real jars have. */
export function buildSyntheticJar(): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'META-INF/MANIFEST.MF': strToU8('Manifest-Version: 1.0\r\n'),
    'assets/minecraft/models/block/': new Uint8Array(),
    'assets/minecraft/textures/block/': new Uint8Array(),
    ...SKIPPED_ENTRIES,
    ...KEPT_ENTRIES,
  };
  return zipSync(entries, { level: 6, mtime: new Date(2000, 0, 1) });
}
