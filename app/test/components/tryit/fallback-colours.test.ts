import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  alwaysFallback,
  encodeRgbaPng,
  fallbackLook,
  fallbackModel,
  fallbackPicture,
  fallbackTextureId,
  parseFallbackTextureId,
} from '../../../src/renderer/src/tryit/render/fallback-colours';

/** The RGBA pixels of a PNG this module wrote (no filtering, one IDAT). */
function pixels(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'IDAT') {
      const raw = unzlibSync(png.subarray(at + 8, at + 8 + length));
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        expect(raw[y * (1 + width * 4)]).toBe(0);
        rgba.set(raw.subarray(y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4)), y * width * 4);
      }
      return { width, height, rgba };
    }
    at += 12 + length;
  }
  throw new Error('No IDAT');
}

describe('fallback colours', () => {
  it('gives grounds’ blocks colours by id and family', () => {
    const grass = fallbackLook('minecraft:grass_block');
    expect(grass.top).not.toEqual(grass.side);
    expect(fallbackLook('minecraft:dirt').shape).toBe('cube');
    expect(fallbackLook('minecraft:oak_leaves').shape).toBe('leaves');
    expect(fallbackLook('minecraft:birch_leaves').top).not.toEqual(
      fallbackLook('minecraft:oak_leaves').top,
    );
    const log = fallbackLook('minecraft:oak_log');
    expect(log.top).not.toEqual(log.side);
    expect(fallbackLook('minecraft:poppy').shape).toBe('plant');
    expect(fallbackLook('minecraft:short_grass').shape).toBe('plant');
    expect(fallbackLook('minecraft:red_wool').top).toEqual(
      fallbackLook('minecraft:red_concrete').top,
    );
    expect(fallbackLook('minecraft:red_sandstone').top).not.toEqual(
      fallbackLook('minecraft:red_wool').top,
    );
    expect(fallbackLook('minecraft:water').top[3]).toBeLessThan(255);
    // An unknown block gets a steady colour of its own.
    expect(fallbackLook('minecraft:mystery_block')).toEqual(
      fallbackLook('minecraft:mystery_block'),
    );
    expect(fallbackLook('minecraft:mystery_block').top).not.toEqual(
      fallbackLook('minecraft:other_mystery').top,
    );
    expect(alwaysFallback('minecraft:water')).toBe(true);
    expect(alwaysFallback('minecraft:stone')).toBe(false);
  });

  it('round-trips texture ids and writes models with those textures', () => {
    const id = fallbackTextureId([1, 2, 3, 128], true);
    expect(parseFallbackTextureId(id)).toEqual({ colour: [1, 2, 3, 128], holes: true });
    expect(parseFallbackTextureId('minecraft:block/stone')).toBeNull();
    const model = fallbackModel('minecraft:poppy') as {
      elements: { from: number[]; to: number[] }[];
      textures: Record<string, string>;
    };
    expect(model.elements[0]?.to[1]).toBeLessThan(16);
    for (const texture of Object.values(model.textures)) {
      expect(parseFallbackTextureId(texture)).not.toBeNull();
    }
  });

  it('writes valid 16 by 16 PNGs, with holes for leaves', () => {
    const png = encodeRgbaPng(2, 1, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect([...pixels(png).rgba]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const solid = pixels(fallbackPicture([100, 150, 50, 255]));
    expect(solid.width).toBe(16);
    const alphas = new Set<number>();
    for (let i = 3; i < solid.rgba.length; i += 4) alphas.add(solid.rgba[i] as number);
    expect(alphas).toEqual(new Set([255]));
    const leaves = pixels(fallbackPicture([100, 150, 50, 255], true));
    const clear = [...leaves.rgba].filter((value, i) => i % 4 === 3 && value === 0).length;
    expect(clear).toBeGreaterThan(10);
    expect(clear).toBeLessThan(128);
  });
});
