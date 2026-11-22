/**
 * Exact AI pictures (ADR 0093 findings, 2026-11-22, after the user's Sun Mod armour came out as
 * onion- and squid-like blobs): the prompt builder per slot, the shape and colour checks against
 * MSM's own drawing (a blob fails the chestplate check, a chestplate passes), the retry and the
 * fall-back to MSM's drawing with a plain line, and a set made with one seed and one palette.
 */
import { artPixels } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import type { ChangeItem } from '../../src/renderer/src/changeset/changeset';
import {
  checkPicture,
  checkWords,
  dominantColour,
  hueDistance,
  MIN_GAPS_KEPT,
  maskOverlap,
} from '../../src/renderer/src/components/ai-pictures/checks';
import {
  aiTextures,
  batchNote,
  fallbackLine,
  paletteRaster,
  rasterOf,
  runCheckedRound,
} from '../../src/renderer/src/components/ai-pictures/generate';
import { dialogPrompt } from '../../src/renderer/src/components/ai-pictures/MakeWithAiDialog';
import {
  AI_SLOTS,
  buildPrompt,
  colourWords,
  materialWords,
  slotOf,
} from '../../src/renderer/src/components/ai-pictures/prompt';
import { drawnReference } from '../../src/renderer/src/components/ai-pictures/reference';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';
import { encoded, fakePictures, testCodec } from './ai-pictures-fake';

const GOLD = [230, 180, 40] as const;
const BROWN_RED = [150, 60, 40] as const;

/** MSM's drawing of `recipe` in `colour`, 16 by 16. */
function drawing(recipe: string, colour: readonly [number, number, number]): RgbaImage {
  const pixels = artPixels({
    recipe: recipe as never,
    colour: [...colour] as [number, number, number],
  });
  return {
    width: pixels.width,
    height: pixels.height,
    data: new Uint8ClampedArray(pixels.data.subarray(0, pixels.width * pixels.height * 4)),
  };
}

/** A filled round blob of `colour`, 16 by 16, like the onion the user got. */
function blob(colour: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((x - 7.5) ** 2 + ((y - 8.5) * 1.3) ** 2 < 30)
        data.set([...colour, 255], (y * 16 + x) * 4);
    }
  }
  return { width: 16, height: 16, data };
}

describe('the prompt builder', () => {
  it('reads the slot of every armour piece, tool and kind of item from its name', () => {
    const cases: [string, 'item' | 'tool' | 'block', string][] = [
      ['textures/item/sun_helmet.png', 'item', 'helmet'],
      ['textures/item/sun_chestplate.png', 'item', 'chestplate'],
      ['textures/item/sun_leggings.png', 'item', 'leggings'],
      ['textures/item/sun_boots.png', 'item', 'boots'],
      ['textures/item/sun_sword.png', 'tool', 'sword'],
      ['textures/item/sun_pickaxe.png', 'tool', 'pickaxe'],
      ['textures/item/sun_axe.png', 'tool', 'axe'],
      ['textures/item/sun_shovel.png', 'tool', 'shovel'],
      ['textures/item/sun_hoe.png', 'tool', 'hoe'],
      ['textures/item/sun_bow.png', 'tool', 'bow'],
      ['textures/item/sun_ingot.png', 'item', 'ingot'],
      ['textures/item/sun_gem.png', 'item', 'gem'],
      ['textures/item/ruby.png', 'item', 'gem'],
      ['textures/item/sun_trinket.png', 'item', 'trinket'],
      ['textures/item/sun_berries.png', 'item', 'food'],
      ['textures/block/sun_ore.png', 'block', 'ore'],
      ['textures/block/sun_planks.png', 'block', 'planks'],
      ['textures/block/sun_log.png', 'block', 'log'],
      ['textures/block/sun_block.png', 'block', 'block'],
    ];
    for (const [name, style, slot] of cases) expect(slotOf(name, style)?.id, name).toBe(slot);
    expect(slotOf('textures/entity/sun_fox.png', 'skin')).toBeUndefined();
    expect(slotOf('textures/item/sun_wand.png', 'item')).toBeUndefined();
  });

  it('never sends a bare description: slot, colour, material, silhouette and what it must only be', () => {
    const prompt = buildPrompt({
      name: 'textures/item/sun_chestplate.png',
      style: 'item',
      colour: GOLD,
    });
    expect(prompt).toBe(
      'golden sun chestplate, a Minecraft-style pixel art chestplate icon, front view, a torso piece with two shoulder pads and a round neck opening, same outline as an iron chestplate, centred, transparent background, only one chestplate: no creature, no plant, no text, no background',
    );
    for (const slot of AI_SLOTS) {
      const style = slot.face === true ? 'block' : 'item';
      const text = buildPrompt({ name: `textures/item/sun_${slot.id}.png`, style, colour: GOLD });
      expect(text, slot.id).toContain(slot.silhouette);
      expect(text, slot.id).toContain(`only `);
      expect(text, slot.id).toContain('golden');
      expect(text.length).toBeLessThanOrEqual(1000);
    }
    const strong = buildPrompt({ name: 'sun_boots', style: 'item', colour: GOLD, strong: true });
    expect(strong).toContain('exactly the outline of the input picture, clearly a pair of boots');
    expect(buildPrompt({ name: 'sun_planks', style: 'block', theme: 'Sun' })).toContain(
      'sun planks, block texture, Minecraft-style pixel art block face, horizontal wooden boards',
    );
  });

  it('names colours and material words plainly', () => {
    expect(colourWords(GOLD)).toBe('golden');
    expect(colourWords([200, 30, 30])).toBe('red');
    expect(colourWords([40, 60, 160])).toBe('blue');
    expect(colourWords([128, 128, 128])).toBe('grey');
    expect(
      materialWords('textures/item/sun_chestplate.png', slotOf('sun_chestplate', 'item')),
    ).toBe('sun');
  });

  it('the dialog adds the slot words after the description and shows the noun once', () => {
    expect(dialogPrompt('a sun helmet', 'sun helmet', 'item', GOLD)).toContain(
      'golden a sun helmet, a Minecraft-style pixel art helmet icon, front view',
    );
    expect(dialogPrompt('shiny sun armour', 'sun_chestplate', 'item', undefined)).toMatch(
      /^shiny sun armour chestplate, a Minecraft-style pixel art chestplate icon/,
    );
    expect(dialogPrompt('a sunset over hills', 'Picture', 'painting', undefined)).toBe(
      'a sunset over hills',
    );
  });
});

describe('the checks', () => {
  const chestplate = drawing('chestplate', GOLD);

  it('a blob fails the chestplate check; a chestplate-shaped picture passes', () => {
    const lumpy = checkPicture(blob(GOLD), { reference: chestplate, colour: GOLD });
    expect(lumpy.ok).toBe(false);
    expect(lumpy.failures).toContain('shape');
    expect(lumpy.gaps).toBeLessThan(MIN_GAPS_KEPT);
    expect(checkWords(lumpy, 'chestplate', 'golden')).toBe('did not look like a chestplate');
    // The same outline in another gold: passes.
    const own = drawing('chestplate', [240, 196, 60]);
    const good = checkPicture(own, { reference: chestplate, colour: GOLD });
    expect(good.ok).toBe(true);
    expect(good.overlap).toBeGreaterThan(0.8);
    expect(maskOverlap(chestplate, chestplate)).toBe(1);
  });

  it('a picture in the wrong colour fails the colour check', () => {
    const wrong = checkPicture(drawing('chestplate', BROWN_RED), {
      reference: chestplate,
      colour: GOLD,
    });
    expect(wrong.failures).toEqual(['colour']);
    expect(checkWords(wrong, 'chestplate', 'golden')).toBe('was not golden');
    expect(hueDistance(350, 10)).toBe(20);
    expect(dominantColour(chestplate)).toBeDefined();
  });

  it('a block face must tile', () => {
    const ore = drawing('ore', GOLD);
    expect(checkPicture(ore, { colour: GOLD, face: true }).ok).toBe(true);
    const seam: RgbaImage = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const v = x * 15;
        seam.data.set([v, v, v, 255], (y * 16 + x) * 4);
      }
    }
    expect(checkPicture(seam, { face: true }).failures).toEqual(['seam']);
  });
});

describe('checked rounds', () => {
  const chestplate = drawing('chestplate', GOLD);
  const round = { prompt: 'p', style: 'item' as const, size: 16, count: 4 };

  it('sends MSM’s drawing as the reference and keeps the pictures that pass', async () => {
    const platform = fakePictures();
    const made = await runCheckedRound(platform, testCodec, round, {
      noun: 'chestplate',
      reference: chestplate,
      referencePng: encoded(chestplate),
      colour: GOLD,
      palette: paletteRaster([chestplate]),
      seed: 7,
    });
    expect(made.candidates).toHaveLength(4);
    expect(made.requests).toBe(1);
    expect(platform.requests[0]?.reference).toEqual(rasterOf(chestplate));
    expect(platform.requests[0]?.strength).toBe(0.5);
    expect(platform.requests[0]?.seed).toBe(7);
    expect(platform.requests[0]?.palette?.height).toBe(1);
  });

  it('tries once more with stronger words, then shows MSM’s drawing with a plain line', async () => {
    const platform = fakePictures();
    platform.next = { ok: true, images: [encoded(blob(BROWN_RED)), encoded(blob(BROWN_RED))] };
    const made = await runCheckedRound(platform, testCodec, round, {
      noun: 'chestplate',
      reference: chestplate,
      referencePng: encoded(chestplate),
      colour: GOLD,
      colourName: 'golden',
      strongPrompt: 'strong words',
      seed: 7,
    });
    expect(made.requests).toBe(2);
    expect(platform.requests[1]?.prompt).toBe('strong words');
    expect(platform.requests[1]?.strength).toBe(0.35);
    expect(made.candidates).toEqual([]);
    expect(made.fallback?.image).toBe(chestplate);
    expect(made.note).toBe(
      "The AI picture did not look like a chestplate and was not golden, so here is MSM's drawing; try again or edit it.",
    );
    expect(fallbackLine('chestplate')).toBe(
      "The AI picture did not look like a chestplate, so here is MSM's drawing; try again or edit it.",
    );
    expect(made.rejected[0]?.words).toBe('did not look like a chestplate and was not golden');
  });
});

function textureItem(path: string, image: RgbaImage): ChangeItem {
  return {
    itemId: path,
    op: 'asset',
    asset: { namespace: 'sun_mod', path, bytes: encoded(image) },
    accepted: true,
    problems: [],
  };
}

describe('a set made together', () => {
  const pieces = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
  const items = pieces.map((piece) =>
    textureItem(`textures/item/sun_${piece}.png`, drawing(piece, GOLD)),
  );

  it('one seed and one palette for every piece, each sent with its own drawing and slot', async () => {
    const platform = fakePictures();
    const result = await aiTextures(items, { platform, codec: testCodec, theme: 'Sun', seed: 42 });
    expect(platform.requests).toHaveLength(4);
    expect(new Set(platform.requests.map((request) => request.seed))).toEqual(new Set([42]));
    const palettes = platform.requests.map((request) => request.palette);
    expect(palettes[0]).toBeDefined();
    for (const palette of palettes) expect(palette).toEqual(palettes[0]);
    pieces.forEach((piece, index) => {
      expect(platform.requests[index]?.prompt).toContain(`golden sun ${piece}`);
      expect(platform.requests[index]?.reference).toBeDefined();
    });
    expect(result.made).toHaveLength(4);
  });

  it('keeps MSM’s drawing for a piece whose pictures are blobs, and says why', async () => {
    const platform = fakePictures();
    platform.next = { ok: true, images: [encoded(blob(BROWN_RED))] };
    const result = await aiTextures(items.slice(1, 2), { platform, codec: testCodec, seed: 1 });
    expect(platform.requests).toHaveLength(2);
    expect(result.items[0]).toBe(items[1]);
    expect(result.made).toEqual([]);
    expect(batchNote(result)).toContain('did not look like a chestplate');
  });

  it('draws the reference of a slot in the asked colour', () => {
    const drawn = drawnReference(slotOf('sun_helmet', 'item'), GOLD);
    expect(drawn?.recipe).toBe('helmet');
    expect(drawn?.image.width).toBe(16);
    expect(drawnReference(undefined, GOLD)).toBeNull();
  });
});
