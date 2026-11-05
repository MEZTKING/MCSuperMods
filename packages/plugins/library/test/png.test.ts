import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ARMOR_LAYER_SIZE,
  armorLayerPng,
  encodePng,
  PLACEHOLDER_PATTERNS,
  PLACEHOLDER_SIZE,
  PLACEHOLDER_SKIN_SIZE,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
  placeholderSize,
  placeholderSkinPixels,
  placeholderSkinPng,
} from '../src/index';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Splits a PNG into chunks, checking the signature and every CRC. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  const buffer = Buffer.from(png);
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: { type: string; data: Uint8Array }[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    out.push({ type, data });
    offset += 12 + length;
  }
  expect(offset).toBe(buffer.length);
  return out;
}

/** Decodes the RGBA pixels of a filter-0 PNG written by {@link encodePng}. */
function decode(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const parts = chunks(png);
  expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  const ihdr = Buffer.from((parts[0] as { data: Uint8Array }).data);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const raw = inflateSync((parts[1] as { data: Uint8Array }).data);
  const stride = 1 + width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * stride]).toBe(0);
    rgba.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
  }
  return { width, height, rgba };
}

const update = process.env.UPDATE_GOLDENS === '1';
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'patterns');

/**
 * SHA-256 of the first six patterns in the default colour, older than the golden PNGs under
 * `test/fixtures/patterns/` that pin every pattern. Change only with intent.
 */
const PINNED: Partial<Record<PlaceholderPattern, string>> = {
  plain: 'e2563b46f1e0fdeb9573b858679df99709fbc72c7b85af99151d55ea6cf1a9aa',
  ore: '1ac06b1c99f1e7dc187b47b4851ad9700f5fc8711417bf63ff07d47b14a89215',
  gem: '875d1b156d354c2310f5167f3fa6803eea063b38adc7b35d501a1882e5482c28',
  disc: 'a8c7d397e6b78ba544c7657e79cb03363ace66f202c081bf5619edb3acfb0b95',
  egg: '249b1b90e8fba88bfd0018b3e38633b244d57185834bdafba9a6259cd532e724',
  sword: '5612e754418698361acac031cae58f83c4a577130d3bc02d7bf6391a2fa75c8d',
};

/** SHA-256 of the entity skin in the default colour. */
const PINNED_SKIN = '224f2f4715ddc13cad76f34fd7555f720a9149052645c23f4c28c102c2ff4fd5';

describe('placeholder textures', () => {
  it('has seventeen patterns', () => {
    expect(PLACEHOLDER_PATTERNS).toEqual([
      'plain',
      'ore',
      'gem',
      'disc',
      'egg',
      'sword',
      'pickaxe',
      'axe',
      'shovel',
      'hoe',
      'helmet',
      'chestplate',
      'leggings',
      'boots',
      'ingot',
      'armor_layer_1',
      'armor_layer_2',
    ]);
  });

  it.each(PLACEHOLDER_PATTERNS)('equals the golden PNG of %s', (pattern) => {
    const png = placeholderPng(pattern);
    const file = join(fixtures, `${pattern}.png`);
    if (update) {
      mkdirSync(fixtures, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });

  it('draws the armour layers at 64x32 and every other pattern at 16x16', () => {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const { width, height } = decode(placeholderPng(pattern));
      expect({ width, height }, pattern).toEqual(placeholderSize(pattern));
      const layer = pattern.startsWith('armor_layer_');
      expect(width, pattern).toBe(layer ? ARMOR_LAYER_SIZE.width : PLACEHOLDER_SIZE);
      expect(height, pattern).toBe(layer ? ARMOR_LAYER_SIZE.height : PLACEHOLDER_SIZE);
    }
  });

  it('tints the armour layers and draws layer 2 apart from layer 1', () => {
    const colour: [number, number, number] = [36, 84, 196];
    expect(armorLayerPng(1, colour)).toEqual(placeholderPng('armor_layer_1', { colour }));
    expect(armorLayerPng(2, colour)).toEqual(placeholderPng('armor_layer_2', { colour }));
    expect(armorLayerPng(1)).toEqual(placeholderPng('armor_layer_1'));
    expect(sha256(armorLayerPng(1, colour))).not.toBe(sha256(armorLayerPng(1)));
    expect(sha256(armorLayerPng(2))).not.toBe(sha256(armorLayerPng(1)));
    // The helmet's face opening and the unused corner stay transparent; the helmet top is opaque.
    const pixels = placeholderPixels('armor_layer_1');
    const alphaAt = (x: number, y: number) => pixels[(y * ARMOR_LAYER_SIZE.width + x) * 4 + 3];
    expect(alphaAt(10, 12)).toBe(0);
    expect(alphaAt(63, 0)).toBe(0);
    expect(alphaAt(10, 3)).toBe(255);
  });

  it('draws the egg spots in the accent colour, by default a darker shade of the colour', () => {
    const colour: [number, number, number] = [196, 28, 52];
    expect(placeholderPng('egg', { colour, accent: [139, 20, 37] })).toEqual(
      placeholderPng('egg', { colour }),
    );
    const spotted = placeholderPixels('egg', { colour, accent: [0, 0, 255] });
    const pixels = [...Array(spotted.length / 4).keys()].map((index) =>
      [...spotted.subarray(index * 4, index * 4 + 4)].join(','),
    );
    expect(pixels).toContain('0,0,255,255');
    // Other patterns ignore the accent.
    expect(placeholderPng('gem', { colour, accent: [0, 0, 255] })).toEqual(
      placeholderPng('gem', { colour }),
    );
  });

  it.each(PLACEHOLDER_PATTERNS)('encodes %s as a valid RGBA PNG', (pattern) => {
    const png = placeholderPng(pattern);
    const decoded = decode(png);
    expect({ width: decoded.width, height: decoded.height }).toEqual(placeholderSize(pattern));
    expect(decoded.rgba).toEqual(placeholderPixels(pattern));
  });

  it.each(Object.entries(PINNED))('pins the bytes of %s', (pattern, pinned) => {
    expect(sha256(placeholderPng(pattern as PlaceholderPattern))).toBe(pinned);
  });

  it.each(PLACEHOLDER_PATTERNS)(
    'is byte-stable and has transparent and opaque pixels: %s',
    (pattern) => {
      expect(sha256(placeholderPng(pattern))).toBe(sha256(placeholderPng(pattern)));
      const alpha = [...placeholderPixels(pattern)].filter((_, index) => index % 4 === 3);
      expect(alpha).toContain(255);
      if (pattern !== 'plain' && pattern !== 'ore') expect(alpha).toContain(0);
    },
  );

  it('draws opaque block patterns and transparent item backgrounds', () => {
    const alpha = (pattern: PlaceholderPattern) =>
      [...placeholderPixels(pattern)].filter((_, index) => index % 4 === 3);
    expect(alpha('plain').every((value) => value === 255)).toBe(true);
    expect(alpha('ore').every((value) => value === 255)).toBe(true);
    expect(alpha('gem')).toContain(0);
    expect(alpha('disc')).toContain(0);
    expect(alpha('disc')).toContain(255);
    expect(alpha('egg')).toContain(0);
    expect(alpha('egg')).toContain(255);
    expect(alpha('sword')).toContain(0);
    expect(alpha('sword')).toContain(255);
  });

  it('encodes the entity skin as an opaque two-tone 64x64 PNG and pins its bytes', () => {
    const png = placeholderSkinPng();
    const decoded = decode(png);
    expect(decoded.width).toBe(PLACEHOLDER_SKIN_SIZE);
    expect(decoded.height).toBe(PLACEHOLDER_SKIN_SIZE);
    expect(decoded.rgba).toEqual(placeholderSkinPixels());
    const pixel = (x: number, y: number) => {
      const at = (y * PLACEHOLDER_SKIN_SIZE + x) * 4;
      return [...decoded.rgba.subarray(at, at + 4)];
    };
    const alpha = [...decoded.rgba].filter((_, index) => index % 4 === 3);
    expect(alpha.every((value) => value === 255)).toBe(true);
    const tones = new Set(
      Array.from({ length: PLACEHOLDER_SKIN_SIZE }, (_, x) => pixel(x, 0).join(',')),
    );
    expect(tones.size).toBe(2);
    expect(pixel(0, 0)).not.toEqual(pixel(4, 0));
    expect(pixel(0, 0)).toEqual(pixel(4, 4));
    expect(sha256(png)).toBe(PINNED_SKIN);
    expect(sha256(placeholderSkinPng({ colour: [32, 180, 72] }))).not.toBe(PINNED_SKIN);
  });

  it('tints by colour', () => {
    const red = placeholderPng('gem');
    const green = placeholderPng('gem', { colour: [32, 180, 72] });
    expect(sha256(green)).not.toBe(sha256(red));
    const pixels = placeholderPixels('plain', { colour: [10, 200, 30] });
    // An inner pixel is the colour itself.
    const inner = (5 * PLACEHOLDER_SIZE + 5) * 4;
    expect([...pixels.subarray(inner, inner + 4)]).toEqual([10, 200, 30, 255]);
  });

  it('rejects pixel buffers of the wrong size', () => {
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow(/Expected 4 RGBA bytes/);
  });
});
