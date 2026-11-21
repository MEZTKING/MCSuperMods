import { artLookPng, artRecipeInfo, hashSeed } from '@msm/plugin-library';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  alwaysFallback,
  DRAWN_RECIPES,
  drawnTextureId,
  encodeRgbaPng,
  fallbackLook,
  fallbackModel,
  fallbackPicture,
  fallbackTextureId,
  fallbackTexturePng,
  parseDrawnTextureId,
  parseFallbackTextureId,
} from '../../../src/renderer/src/tryit/render/fallback-colours';

/** The texture ids of a block's fallback model, by face slot. */
function modelTextures(id: string): Record<string, string> {
  return (fallbackModel(id) as { textures: Record<string, string> }).textures;
}

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
    expect(grass.top).not.toEqual(grass.bottom);
    expect(grass.drawn).toEqual({ top: 'grass_top', side: 'grass_side', bottom: 'dirt' });
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
    const drawn = drawnTextureId('planks', [176, 143, 85, 255], 'oak_planks');
    expect(drawn).toBe('msm:tryit_drawn/planks/b08f55/oak_planks');
    expect(parseDrawnTextureId(drawn)).toEqual({
      recipe: 'planks',
      colour: [176, 143, 85],
      path: 'oak_planks',
    });
    expect(parseDrawnTextureId('msm:tryit_drawn/sword/b08f55/oak_planks')).toBeNull();
    expect(parseDrawnTextureId(id)).toBeNull();
    expect(parseFallbackTextureId(drawn)).toBeNull();
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

  it('draws the terrain and wood families from the art recipes (B499, ADR 0092 D16)', () => {
    const cases: [string, Record<string, string>][] = [
      ['minecraft:stone', { top: 'stone', side: 'stone', bottom: 'stone' }],
      ['minecraft:deepslate', { top: 'stone', side: 'stone', bottom: 'stone' }],
      ['minecraft:cobblestone', { top: 'cobblestone', side: 'cobblestone', bottom: 'cobblestone' }],
      ['minecraft:dirt', { top: 'dirt', side: 'dirt', bottom: 'dirt' }],
      ['minecraft:grass_block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }],
      ['minecraft:sand', { top: 'sand', side: 'sand', bottom: 'sand' }],
      ['minecraft:red_sand', { top: 'sand', side: 'sand', bottom: 'sand' }],
      ['minecraft:gravel', { top: 'gravel', side: 'gravel', bottom: 'gravel' }],
      ['minecraft:oak_planks', { top: 'planks', side: 'planks', bottom: 'planks' }],
      ['minecraft:spruce_log', { top: 'log_top', side: 'bark', bottom: 'log_top' }],
      ['minecraft:crimson_stem', { top: 'log_top', side: 'bark', bottom: 'log_top' }],
      [
        'minecraft:stripped_birch_log',
        { top: 'stripped_log_top', side: 'stripped_log', bottom: 'stripped_log_top' },
      ],
      ['minecraft:oak_wood', { top: 'bark', side: 'bark', bottom: 'bark' }],
      ['minecraft:oak_leaves', { top: 'leaves', side: 'leaves', bottom: 'leaves' }],
      ['minecraft:cherry_leaves', { top: 'leaves', side: 'leaves', bottom: 'leaves' }],
    ];
    for (const [id, faces] of cases) {
      const textures = modelTextures(id);
      for (const [face, recipe] of Object.entries(faces)) {
        const parsed = parseDrawnTextureId(textures[face] as string);
        expect(parsed?.recipe, `${id} ${face}`).toBe(recipe);
        // The face's colour is the table's colour for that face.
        expect(parsed?.colour).toEqual([...fallbackLook(id)[face as 'top'].slice(0, 3)]);
      }
      expect(textures.particle).toBe(textures.side);
    }
    // The grass side is drawn in the grass colour; the top too; the bottom is dirt's.
    const grass = modelTextures('minecraft:grass_block');
    expect(parseDrawnTextureId(grass.side as string)?.colour).toEqual(
      parseDrawnTextureId(grass.top as string)?.colour,
    );
    expect(grass.bottom).not.toBe(modelTextures('minecraft:dirt').bottom);
    // Woods keep their own colours.
    expect(modelTextures('minecraft:birch_leaves').top).not.toBe(
      modelTextures('minecraft:oak_leaves').top,
    );
    // Seeds are per block id: the same id always gives the same texture, others another.
    expect(parseDrawnTextureId(modelTextures('minecraft:stone').top as string)?.path).toBe('stone');
    expect(modelTextures('stone').top).toBe(modelTextures('minecraft:stone').top);
    expect(modelTextures('minecraft:oak_log').top).not.toBe(
      modelTextures('minecraft:oak_log').side,
    );
    // Every recipe used is drawn by the library (no stub) and is a block face.
    for (const recipe of DRAWN_RECIPES) {
      const info = artRecipeInfo(recipe);
      expect(info.drawn, recipe).toBe(true);
      expect(info.kind).toBe('block');
    }
  });

  it('keeps other blocks and the liquids as one-colour cubes', () => {
    for (const id of [
      'minecraft:water',
      'minecraft:lava',
      'minecraft:bubble_column',
      'minecraft:smooth_stone',
      'minecraft:red_wool',
      'minecraft:glass',
      'minecraft:poppy',
      'minecraft:oak_sapling',
      'minecraft:sandstone',
      'minecraft:mystery_block',
    ]) {
      expect(fallbackLook(id).drawn, id).toBeUndefined();
      for (const texture of Object.values(modelTextures(id))) {
        expect(parseFallbackTextureId(texture), `${id} ${texture}`).not.toBeNull();
      }
    }
  });

  it('writes the drawn faces as the library draws them, 16 by 16', async () => {
    const stone = modelTextures('minecraft:stone').top as string;
    const parsed = parseDrawnTextureId(stone);
    if (parsed === null) throw new Error('not drawn');
    const png = await fallbackTexturePng(stone);
    expect(png).toEqual(
      artLookPng({ recipe: 'stone', colour: parsed.colour, seed: hashSeed('tryit', 'stone') }),
    );
    // The same id gives the same bytes; another block id of the family another variation.
    expect(await fallbackTexturePng(stone)).toEqual(png);
    const andesite = modelTextures('minecraft:andesite').top as string;
    expect(await fallbackTexturePng(andesite)).not.toEqual(png);
    const plain = fallbackTextureId([10, 20, 30, 255]);
    expect(await fallbackTexturePng(plain)).toEqual(fallbackPicture([10, 20, 30, 255]));
    expect(await fallbackTexturePng('minecraft:block/stone')).toBeNull();

    const view = (bytes: Uint8Array | null) =>
      new DataView((bytes as Uint8Array).buffer, (bytes as Uint8Array).byteOffset);
    for (const id of ['minecraft:grass_block', 'minecraft:oak_log', 'minecraft:oak_leaves']) {
      for (const texture of Object.values(modelTextures(id))) {
        const bytes = await fallbackTexturePng(texture);
        expect(bytes, texture).not.toBeNull();
        expect(view(bytes).getUint32(16)).toBe(16);
        expect(view(bytes).getUint32(20)).toBe(16);
      }
    }
    // Leaves keep holes: some pixels of the drawn picture are clear.
    const leaves = await fallbackTexturePng(modelTextures('minecraft:oak_leaves').top as string);
    const leafPixels = pixels(leaves as Uint8Array).rgba;
    const clear = leafPixels.filter((_, i) => i % 4 === 3 && leafPixels[i] === 0).length;
    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(256);
  });
});
