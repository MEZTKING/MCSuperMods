/**
 * Tests for Blockloom's block pictures (ADR 0135): the vendored `@blockloom/core` draws its own
 * golden cases byte for byte (`golden.json`, pinned SHA-256 per engine version), the style picks
 * the generator for the recipes Blockloom draws and leaves every other recipe alone, the looks'
 * colours, details, seeds and words reach Blockloom, the pictures are whole 16 by 16 faces with
 * hard alpha (leaves with see-through gaps) and carry their note. Every picture here is made in
 * code; no Minecraft texture is read.
 */
import { createHash } from 'node:crypto';
import { generate } from '@blockloom/core';
import golden from '@blockloom/core/golden.json' with { type: 'json' };
import { afterEach, describe, expect, it } from 'vitest';
import {
  ART_RECIPE_INFO,
  type ArtRecipeId,
  artLookPng,
  artPixels,
  artPng,
  BLOCKLOOM_ENGINE_VERSION,
  BLOCKLOOM_RECIPE_IDS,
  blockloomDraws,
  blockloomMaterials,
  blockloomOptions,
  blockPictureCacheKey,
  blockPictureStyle,
  colourTint,
  nearestOre,
  parseBlockDescription,
  type Rgb,
  setBlockPictureStyle,
} from '../src/index';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

afterEach(() => setBlockPictureStyle('blockloom'));

describe('the vendored @blockloom/core (ADR 0135 D1, D2)', () => {
  it('draws every golden case of its engine version byte for byte', () => {
    expect(golden.engineVersion).toBe(BLOCKLOOM_ENGINE_VERSION);
    expect(golden.cases.length).toBeGreaterThanOrEqual(20);
    for (const entry of golden.cases) {
      const drawn = generate({
        prompt: entry.prompt,
        seed: golden.seed,
        size: entry.size,
        face: entry.face as 'side' | 'top' | 'bottom',
      });
      expect(drawn.version).toBe(golden.engineVersion);
      const bytes = new Uint8Array(drawn.rgba.buffer, drawn.rgba.byteOffset, drawn.rgba.byteLength);
      expect(sha256(bytes), entry.prompt).toBe(entry.hash);
    }
  });

  it('has its 89 recipes, the ores among them', () => {
    const materials = blockloomMaterials();
    expect(materials.length).toBe(89);
    expect(materials.filter((entry) => entry.type === 'ore')).toHaveLength(6);
  });

  it('reads descriptions', () => {
    const mossy = parseBlockDescription('mossy cobblestone with tiny cyan crystals');
    expect(mossy.materialId).toBe('cobblestone');
    expect(mossy.modifiers).toEqual(['mossy', 'crystal']);
    expect(mossy.colorAsAccent).toBe(true);
    expect(parseBlockDescription('blue stone').colorAsAccent).toBe(false);
    expect(parseBlockDescription('something nice').materialId).toBeNull();
  });
});

describe('looks to Blockloom (ADR 0135 D3, D4)', () => {
  it('pins the pictures of a few looks', () => {
    const looks: readonly [ArtRecipeId, Rgb][] = [
      ['stone', [128, 128, 128]],
      ['bricks', [160, 90, 70]],
      ['ore', [87, 221, 212]],
      ['deepslate_ore', [216, 74, 62]],
      ['leaves', [88, 133, 65]],
      ['grass_top', [113, 153, 79]],
    ];
    const pinned = Object.fromEntries(
      looks.map(([recipe, colour]) => [
        recipe,
        sha256(artPixels({ recipe, colour, seed: 3 }).data).slice(0, 16),
      ]),
    );
    expect(pinned).toMatchInlineSnapshot(`
      {
        "bricks": "7ce1ff2631ebd5b2",
        "deepslate_ore": "44291c6fbce8e339",
        "grass_top": "e02d48331ed514fb",
        "leaves": "14a079c08ab13762",
        "ore": "e884ad0abbe9faf6",
        "stone": "de8a094b7813bb29",
      }
    `);
  });

  it('turns a look and its words into options', () => {
    expect(blockloomOptions({ recipe: 'stone', colour: [200, 40, 40], seed: 0 })).toMatchObject({
      seed: 1,
      size: 16,
      face: 'side',
      finish: 'balanced',
      recipe: { materialId: 'stone', promptColor: { hue: 0 } },
    });
    // A grey keeps the material's own colours.
    expect(colourTint([128, 128, 128], 'stone')).toBeUndefined();
    expect(
      blockloomOptions({ recipe: 'plain', colour: [200, 40, 40], detail: 'rough' }),
    ).toMatchObject({ finish: 'balanced' });
    expect(
      blockloomOptions({
        recipe: 'stone',
        colour: [200, 40, 40],
        seed: 4,
        description: 'mossy netherrack with cyan crystals',
      }),
    ).toEqual({
      seed: 5,
      size: 16,
      face: 'side',
      finish: 'balanced',
      prompt: 'mossy netherrack with cyan crystals',
    });
    expect(
      blockloomOptions({ recipe: 'planks', colour: [160, 120, 80], description: 'cracked' }),
    ).toMatchObject({ prompt: 'cracked', recipe: { materialId: 'oak_planks' } });
    const tinted = blockloomOptions({
      recipe: 'planks',
      colour: [160, 120, 80],
      description: 'blue',
    });
    expect(tinted?.recipe).toEqual({ materialId: 'oak_planks' });
    expect(blockloomOptions({ recipe: 'deepslate_ore', colour: [80, 220, 210] })).toMatchObject({
      recipe: { materialId: 'deepslate', modifiers: ['crystal', 'flecked'], accent: '#50dcd2' },
    });
    expect(blockloomOptions({ recipe: 'grass_side', colour: [80, 140, 60] })?.recipe).toEqual({
      materialId: 'grass_block',
    });
    expect(blockloomOptions({ recipe: 'leaves', colour: [80, 140, 60] })).toMatchObject({
      recipe: { materialId: 'leaves_cutout' },
    });
    expect(blockloomOptions({ recipe: 'sword', colour: [80, 140, 60] })).toBeUndefined();
  });

  it('chooses the ore by the nearest vein colour', () => {
    expect(nearestOre([216, 74, 62])).toBe('redstone_ore');
    expect(nearestOre([60, 110, 210])).toBe('lapis_ore');
    expect(nearestOre([240, 200, 80])).toBe('gold_ore');
  });
});

describe('the block picture style (ADR 0135 D3, D5, D8)', () => {
  const colour: Rgb = [120, 150, 90];

  it('is Blockloom by default and can be set; the cache key names it', () => {
    expect(blockPictureStyle()).toBe('blockloom');
    expect(blockPictureCacheKey()).toBe(`blockloom@${BLOCKLOOM_ENGINE_VERSION}`);
    setBlockPictureStyle('classic');
    expect(blockPictureStyle()).toBe('classic');
    expect(blockPictureCacheKey()).toBe('classic');
    setBlockPictureStyle('anything else');
    expect(blockPictureStyle()).toBe('blockloom');
  });

  it('draws only whole block faces with Blockloom', () => {
    for (const id of BLOCKLOOM_RECIPE_IDS) {
      const info = ART_RECIPE_INFO.find((entry) => entry.id === id);
      expect(info?.kind, id).toBe('block');
      expect([info?.width, info?.height, info?.frames], id).toEqual([16, 16, 1]);
    }
  });

  it('changes the Blockloom recipes and nothing else', () => {
    for (const info of ART_RECIPE_INFO) {
      const look = { recipe: info.id, colour, seed: 3 };
      const blockloom = sha256(artLookPng({ ...look, style: 'blockloom' }));
      const classic = sha256(artLookPng({ ...look, style: 'classic' }));
      if (blockloomDraws(info.id)) expect(blockloom, info.id).not.toBe(classic);
      else expect(blockloom, info.id).toBe(classic);
    }
  });

  it('follows the library style when a look names none', () => {
    const look = { recipe: 'cobblestone' as ArtRecipeId, colour, seed: 2 };
    const blockloom = sha256(artLookPng({ ...look, style: 'blockloom' }));
    const classic = sha256(artLookPng({ ...look, style: 'classic' }));
    expect(sha256(artLookPng(look))).toBe(blockloom);
    setBlockPictureStyle('classic');
    expect(sha256(artLookPng(look))).toBe(classic);
    expect(sha256(artPng('planks', { colour, seed: 2 }))).toBe(
      sha256(artPng('planks', { colour, seed: 2, style: 'classic' })),
    );
  });

  it('follows the description, gives leaves see-through gaps and opaque faces otherwise', () => {
    const look = { recipe: 'stone' as ArtRecipeId, colour, seed: 1 };
    const plain = sha256(artLookPng(look));
    expect(sha256(artLookPng({ ...look, description: 'mossy and cracked' }))).not.toBe(plain);
    expect(
      sha256(artLookPng({ ...look, description: 'mossy and cracked', style: 'classic' })),
    ).toBe(sha256(artLookPng({ ...look, style: 'classic' })));
    for (const id of BLOCKLOOM_RECIPE_IDS) {
      const data = artPixels({ recipe: id, colour, seed: 1 }).data;
      let gaps = 0;
      for (let i = 3; i < data.length; i += 4) {
        expect([0, 255], id).toContain(data[i]);
        if (data[i] === 0) gaps += 1;
      }
      if (id === 'leaves') expect(gaps).toBeGreaterThan(4);
      else expect(gaps, id).toBe(0);
    }
  });

  it('stores the engine version, words, material and seed in the PNG', () => {
    const png = Buffer.from(
      artLookPng({ recipe: 'stone', colour, seed: 6, description: 'mossy stone' }),
    );
    const text = png.toString('latin1');
    const at = text.indexOf('tEXtblockloom\u0000');
    expect(at).toBeGreaterThan(0);
    const length = png.readUInt32BE(at - 4);
    const note = JSON.parse(text.slice(at + 14, at + 4 + length)) as Record<string, unknown>;
    expect(note).toMatchObject({
      engineVersion: BLOCKLOOM_ENGINE_VERSION,
      prompt: 'mossy stone',
      materialId: 'stone',
      modifiers: ['mossy'],
      seed: 7,
      face: 'side',
    });
    const classic = Buffer.from(artLookPng({ recipe: 'stone', colour, style: 'classic' }));
    expect(classic.includes('tEXt')).toBe(false);
  });
});
