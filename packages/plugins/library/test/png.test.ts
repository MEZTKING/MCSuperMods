import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PARTICLE_FRAMES, PARTICLE_PATTERNS, PARTICLE_SIZE } from '../src/assets/png';
import {
  ARMOR_LAYER_SIZE,
  armorLayerPng,
  bodyArmorLayerPng,
  EFFECT_ICON_SIZE,
  encodePng,
  HORSE_ARMOR_LAYER_SIZE,
  PAINTING_PIXELS_PER_BLOCK,
  PLACEHOLDER_PATTERNS,
  PLACEHOLDER_SIZE,
  PLACEHOLDER_SKIN_SIZE,
  type PlaceholderPattern,
  paintingPixels,
  paintingPng,
  placeholderPixels,
  placeholderPng,
  placeholderSize,
  placeholderSkinPixels,
  placeholderSkinPng,
  WOLF_ARMOR_LAYER_SIZE,
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

/** The opaque block patterns; every other pattern has a transparent background. */
const OPAQUE_PATTERNS: ReadonlySet<PlaceholderPattern> = new Set<PlaceholderPattern>([
  'plain',
  'ore',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'planks',
  'door_top',
  'door_bottom',
  'trapdoor',
  'leaves',
  'stone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'block_front',
  'portal_frame',
]);

/** The see-through patterns: partly transparent everywhere, opaque only in a few sparks. */
const TRANSLUCENT_PATTERNS: ReadonlySet<PlaceholderPattern> = new Set<PlaceholderPattern>([
  'portal',
]);
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'patterns');

/**
 * SHA-256 of the first six patterns in the default colour, older than the golden PNGs under
 * `test/fixtures/patterns/` that pin every pattern. Change only with intent.
 */
const PINNED: Partial<Record<PlaceholderPattern, string>> = {
  plain: '6bc22d8ccec3102a5be69397828579cd2753c1f4e7f3a4335df442d0ea417c8f',
  ore: 'bc6ac337263a32a1244c49fa923e042201ef9464ddbe8e6fdf1e07480eabec67',
  gem: '083efdde077af97bc70bba30eedb5c413d29c28477a19e02df63c971097e2b1e',
  disc: 'a15bdd73ec8dbd893a493b1c01245a64b5170bf07cfc0f83488f43aeb3cbd498',
  egg: '79db1fb4c8e7f4f32fe19bd7eb42e71c45a35deaa7f1ea5e0f4af18367c07910',
  sword: 'c9c59a1b4dfd6b12180122068aa505440265dd297026f37cc26051b5ac65f1d4',
};

/** SHA-256 of the entity skin in the default colour. */
const PINNED_SKIN = '35baa277bd5fc7c730e17dba8b72897f084bbc529df8fc28b982721544525249';

describe('placeholder textures', () => {
  it('has seventy patterns', () => {
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
      'bow',
      'bow_pulling_0',
      'bow_pulling_1',
      'bow_pulling_2',
      'crossbow',
      'crossbow_pulling_0',
      'crossbow_pulling_1',
      'crossbow_pulling_2',
      'crossbow_arrow',
      'crossbow_firework',
      'shield',
      'spear',
      'mace',
      'bottle',
      'totem',
      'smithing_template',
      'horse_armor',
      'wolf_armor',
      'horse_armor_layer',
      'wolf_armor_layer',
      'ball',
      'knife',
      'boomerang',
      'flask',
      'effect_icon',
      'bark',
      'log_top',
      'stripped_log',
      'stripped_log_top',
      'planks',
      'door_top',
      'door_bottom',
      'trapdoor',
      'leaves',
      'sapling',
      'stone',
      'polished_stone',
      'bricks',
      'pillar_side',
      'pillar_top',
      'crop_stage0',
      'crop_stage1',
      'crop_stage2',
      'crop_stage3',
      'seeds',
      'produce',
      'block_front',
      'portal',
      'portal_frame',
      'particle_spark',
      'particle_orb',
      'particle_puff',
      'particle_leaf',
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

  it('draws the armour layers, the effect icon and the particles at their vanilla sizes and every other pattern at 16x16', () => {
    const particle = { width: PARTICLE_SIZE, height: PARTICLE_SIZE };
    const sizes: Partial<Record<PlaceholderPattern, { width: number; height: number }>> = {
      effect_icon: { width: EFFECT_ICON_SIZE, height: EFFECT_ICON_SIZE },
      particle_spark: particle,
      particle_orb: particle,
      particle_puff: particle,
      particle_leaf: particle,
      armor_layer_1: ARMOR_LAYER_SIZE,
      armor_layer_2: ARMOR_LAYER_SIZE,
      horse_armor_layer: HORSE_ARMOR_LAYER_SIZE,
      wolf_armor_layer: WOLF_ARMOR_LAYER_SIZE,
    };
    expect(EFFECT_ICON_SIZE).toBe(18);
    expect(PARTICLE_SIZE).toBe(8);
    expect(HORSE_ARMOR_LAYER_SIZE).toEqual({ width: 64, height: 64 });
    expect(WOLF_ARMOR_LAYER_SIZE).toEqual({ width: 64, height: 32 });
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const { width, height } = decode(placeholderPng(pattern));
      expect({ width, height }, pattern).toEqual(placeholderSize(pattern));
      const expected = sizes[pattern] ?? { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE };
      expect({ width, height }, pattern).toEqual({ ...expected });
    }
  });

  it('draws horse and wolf armour layers in the vanilla box layout', () => {
    const colour: [number, number, number] = [36, 84, 196];
    expect(bodyArmorLayerPng('horse', colour)).toEqual(
      placeholderPng('horse_armor_layer', { colour }),
    );
    expect(bodyArmorLayerPng('wolf')).toEqual(placeholderPng('wolf_armor_layer'));
    const horse = placeholderPixels('horse_armor_layer');
    const horseAlpha = (x: number, y: number) => horse[(y * 64 + x) * 4 + 3];
    // The body box's top face (22..31, 32..53) and its sides (row 54 on) are drawn.
    expect(horseAlpha(26, 40)).toBe(255);
    expect(horseAlpha(2, 60)).toBe(255);
    // The tail's texture area (42.., 36..) is not armoured.
    expect(horseAlpha(50, 45)).toBe(0);
    const wolf = placeholderPixels('wolf_armor_layer');
    const wolfAlpha = (x: number, y: number) => wolf[(y * 64 + x) * 4 + 3];
    expect(wolfAlpha(30, 2)).toBe(255);
    expect(wolfAlpha(63, 31)).toBe(0);
  });

  it('draws a painting placeholder of any vanilla size at 16 pixels per block', () => {
    expect(PAINTING_PIXELS_PER_BLOCK).toBe(16);
    for (const [width, height] of [
      [1, 1],
      [2, 1],
      [4, 3],
      [4, 4],
    ] as const) {
      const decoded = decode(paintingPng(width, height));
      expect(decoded.width).toBe(width * 16);
      expect(decoded.height).toBe(height * 16);
      expect(decoded.rgba).toEqual(paintingPixels(width, height));
      expect([...decoded.rgba].filter((_, index) => index % 4 === 3).every((a) => a === 255)).toBe(
        true,
      );
    }
    expect(sha256(paintingPng(2, 1, [36, 84, 196]))).not.toBe(sha256(paintingPng(2, 1)));
    expect(() => paintingPng(0, 1)).toThrow(/whole numbers of blocks/);
    expect(() => paintingPng(1.5, 1)).toThrow(/whole numbers of blocks/);
    const file = join(fixtures, 'painting_2x1.png');
    if (update) writeFileSync(file, paintingPng(2, 1));
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(paintingPng(2, 1)))).toBe(true);
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
      if (TRANSLUCENT_PATTERNS.has(pattern)) {
        // Partly transparent, never fully: the game draws such a texture translucent.
        expect(alpha).not.toContain(0);
        expect(alpha.some((value) => value > 0 && value < 255)).toBe(true);
      } else if (!OPAQUE_PATTERNS.has(pattern)) {
        expect(alpha).toContain(0);
      }
    },
  );

  it('draws opaque block patterns and transparent item backgrounds', () => {
    const alpha = (pattern: PlaceholderPattern) =>
      [...placeholderPixels(pattern)].filter((_, index) => index % 4 === 3);
    expect(alpha('plain').every((value) => value === 255)).toBe(true);
    expect(alpha('ore').every((value) => value === 255)).toBe(true);
    for (const pattern of OPAQUE_PATTERNS) {
      expect(
        alpha(pattern).every((value) => value === 255),
        pattern,
      ).toBe(true);
    }
    expect(alpha('sapling')).toContain(0);
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

  it('draws the effect icon as a round badge with a sparkle, clear in the corners', () => {
    const pixels = placeholderPixels('effect_icon');
    const at = (x: number, y: number) => {
      const index = (y * EFFECT_ICON_SIZE + x) * 4;
      return [...pixels.subarray(index, index + 4)];
    };
    expect(at(0, 0)[3]).toBe(0);
    expect(at(17, 17)[3]).toBe(0);
    expect(at(0, 8)[3]).toBe(255);
    expect(at(8, 8)).not.toEqual(at(8, 3));
    const tinted = placeholderPixels('effect_icon', { colour: [36, 84, 196] });
    expect([...tinted]).not.toEqual([...pixels]);
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

  it.each(PARTICLE_PATTERNS)(
    'draws %s in four distinct frames, each with clear and opaque pixels, wrapping round (ADR 0081 D3)',
    (pattern) => {
      expect(PARTICLE_FRAMES).toBe(4);
      const frames = [0, 1, 2, 3].map((frame) => placeholderPng(pattern, { frame }));
      expect(new Set(frames.map(sha256)).size).toBe(4);
      expect(frames[0]).toEqual(placeholderPng(pattern));
      expect(placeholderPng(pattern, { frame: 5 })).toEqual(frames[1]);
      expect(placeholderPng(pattern, { frame: -1 })).toEqual(frames[3]);
      for (const [frame, png] of frames.entries()) {
        const { width, height, rgba } = decode(png);
        expect({ width, height }).toEqual({ width: 8, height: 8 });
        const alpha = [...rgba].filter((_, index) => index % 4 === 3);
        expect(alpha, `frame ${frame}`).toContain(0);
        expect(alpha, `frame ${frame}`).toContain(255);
        // Frame 0 is the pattern's own golden; the others have theirs.
        if (frame === 0) continue;
        const file = join(fixtures, `${pattern}_${frame}.png`);
        if (update) writeFileSync(file, png);
        expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
      }
      // Other patterns ignore the frame.
      expect(placeholderPng('gem', { frame: 2 })).toEqual(placeholderPng('gem'));
    },
  );

  it('rejects pixel buffers of the wrong size', () => {
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow(/Expected 4 RGBA bytes/);
  });
});

describe('encodePng compression (B468a)', () => {
  /** A deterministic picture: a few colours in runs, with noise that defeats long matches. */
  function noisy(width: number, height: number, seed: number): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    let state = seed;
    for (let index = 0; index < rgba.length; index += 1) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      rgba[index] = index % 4 === 3 ? 255 : (state >>> 16) % 6;
    }
    return rgba;
  }

  const flat = (width: number, height: number): Uint8Array => {
    const rgba = new Uint8Array(width * height * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([36, 84, 196, 255], index);
    return rgba;
  };

  it.each([
    ['flat 16x16', 16, 16, flat(16, 16)],
    ['flat 1x1', 1, 1, flat(1, 1)],
    ['noisy 16x16', 16, 16, noisy(16, 16, 7)],
    // Over 32 KiB of raw rows, so matches reach across the whole deflate window.
    ['noisy 128x96', 128, 96, noisy(128, 96, 11)],
    ['flat 300x200', 300, 200, flat(300, 200)],
  ])('round-trips %s to the same pixels', (_name, width, height, rgba) => {
    const decoded = decode(encodePng(rgba, width, height));
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width, height });
    expect(decoded.rgba).toEqual(rgba);
  });

  it('round-trips every placeholder skin and pattern size through zlib', () => {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const { width, height } = placeholderSize(pattern);
      const pixels = placeholderPixels(pattern);
      expect(decode(encodePng(pixels, width, height)).rgba).toEqual(pixels);
    }
  });

  it('makes a flat-colour 16x16 picture far smaller than stored blocks did', () => {
    // Stored blocks: 8 signature + 25 IHDR + 12 + (2 + 5 + 16 * 65 + 4) IDAT + 12 IEND = 1108.
    const stored = 1108;
    const size = encodePng(flat(16, 16), 16, 16).length;
    expect(size).toBeLessThan(stored / 4);
  });
});
