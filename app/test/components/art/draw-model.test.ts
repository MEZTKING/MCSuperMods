/**
 * The Draw dialog's model (B495, ADR 0092 D9, D10, D11): the recipes that fit a field by kind
 * and size (never a stub), the guess from the field's name, six seeds a page and New looks,
 * the look's changes, the drawing itself (the library's bytes), the skin option, and the
 * field a texture path asks for.
 */
import {
  ART_RECIPE_INFO,
  type ArtRecipeInfo,
  artFramePngs,
  artLookPng,
  boxSkinArtPng,
} from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { drawFieldForTexture } from '../../../src/renderer/src/components/art/DrawButton';
import {
  drawOptions,
  drawPicture,
  drawReducer,
  finishLabel,
  guessRecipe,
  HUMANOID_SKIN_BOXES,
  hexToRgb,
  initialDrawState,
  pageSeeds,
  rgbToHex,
  SKIN_OPTION,
  selectedSeed,
  THEME_SWATCHES,
} from '../../../src/renderer/src/components/art/draw-model';

const RUBY = [196, 28, 52] as const;

describe('which pictures fit a field', () => {
  it('offers the drawn recipes of the field kind and size, never a stub', () => {
    const blocks = drawOptions({ kinds: ['block'], width: 16, height: 16 });
    expect(blocks.length).toBeGreaterThan(0);
    for (const option of blocks) {
      const info = ART_RECIPE_INFO.find((entry) => entry.id === option.id) as ArtRecipeInfo;
      expect(info.kind).toBe('block');
      expect(info.drawn).toBe(true);
      expect([info.width, info.height]).toEqual([16, 16]);
    }
    const stubs = ART_RECIPE_INFO.filter((info) => !info.drawn).map((info) => info.id);
    const every = drawOptions({
      kinds: ['block', 'item', 'entity', 'icon', 'particle'],
      width: 16,
      height: 16,
    });
    for (const option of every) expect(stubs).not.toContain(option.id);
  });

  it('never offers a stub, even when it is the only recipe of the size', () => {
    const fake: ArtRecipeInfo[] = [
      { ...(ART_RECIPE_INFO[0] as ArtRecipeInfo), id: 'plain', drawn: false },
      { ...(ART_RECIPE_INFO[0] as ArtRecipeInfo), id: 'stone', drawn: true },
    ];
    expect(drawOptions({ kinds: ['block'], width: 16, height: 16 }, fake).map((o) => o.id)).toEqual(
      ['stone'],
    );
    expect(drawOptions({ kinds: ['block'], width: 32, height: 32 }, fake)).toEqual([]);
  });

  it('orders by the field kinds, then falls back to any kind of that size', () => {
    const itemFirst = drawOptions({ kinds: ['item', 'block'], width: 16, height: 16 });
    const firstBlock = itemFirst.findIndex((option) => option.id === 'plain');
    const lastItem = itemFirst.map((option) => option.id).lastIndexOf('sword');
    expect(lastItem).toBeLessThan(firstBlock);
    // No icon at 16 by 16: every drawn recipe of that size instead.
    const fallback = drawOptions({ kinds: ['icon'], width: 16, height: 16 });
    expect(fallback.map((option) => option.id)).toContain('plain');
    expect(drawOptions({ kinds: ['block'], width: 5, height: 7 })).toEqual([]);
  });

  it('offers only the humanoid skin on a skin field', () => {
    const options = drawOptions({ kinds: ['entity'], width: 64, height: 64, skin: true });
    expect(options.map((option) => option.id)).toEqual([SKIN_OPTION]);
    expect(options[0]?.finishes).toEqual(['fur', 'scales', 'smooth', 'stone', 'slime']);
  });
});

describe('the guess from the field name', () => {
  const blocks = drawOptions({ kinds: ['block'], width: 16, height: 16 });
  const items = drawOptions({ kinds: ['item'], width: 16, height: 16 });

  it('reads recipe ids and aliases as whole words, the longest first', () => {
    expect(guessRecipe('ruby_ore', blocks)).toBe('ore');
    expect(guessRecipe('deepslate_ruby_ore', blocks)).toBe('deepslate_ore');
    expect(guessRecipe('oak_planks', blocks)).toBe('planks');
    expect(guessRecipe('planks', blocks)).toBe('planks');
    expect(guessRecipe('oak_log', blocks)).toBe('bark');
    expect(guessRecipe('oak_log_top', blocks)).toBe('log_top');
    expect(guessRecipe('Ruby Pickaxe', items)).toBe('pickaxe');
    expect(guessRecipe('rubySword', items)).toBe('sword');
    expect(guessRecipe('ruby', items)).toBe('gem');
    expect(guessRecipe('demo:textures/block/ruby_ore.png', blocks)).toBe('ore');
    expect(guessRecipe('demo:block/thing_all', blocks)).toBeUndefined();
    expect(guessRecipe('', blocks)).toBeUndefined();
  });

  it('puts the guess first in the field options', () => {
    expect(drawOptions({ kinds: ['block'], width: 16, height: 16, name: 'ruby_ore' })[0]?.id).toBe(
      'ore',
    );
    expect(
      drawOptions({ kinds: ['item', 'block'], width: 16, height: 16, name: 'ruby_sword' })[0]?.id,
    ).toBe('sword');
    // A guess the field cannot draw is ignored.
    expect(
      drawOptions({ kinds: ['block'], width: 16, height: 16, name: 'ruby_sword' })[0]?.id,
    ).toBe(blocks[0]?.id);
  });
});

describe('looks, variations and New looks', () => {
  const options = drawOptions({ kinds: ['block'], width: 16, height: 16, name: 'bricks' });

  it('starts on the guess in the thing colour or the first theme colour', () => {
    const state = initialDrawState(options);
    expect(state.option).toBe('bricks');
    expect(rgbToHex(state.colour)).toBe(THEME_SWATCHES[0]?.hex);
    expect(initialDrawState(options, [1, 2, 3]).colour).toEqual([1, 2, 3]);
    expect(THEME_SWATCHES).toHaveLength(10);
    expect(THEME_SWATCHES.map((swatch) => swatch.word)).toContain('Frost');
  });

  it('shows six seeds a page; New looks moves on by six and picks the first', () => {
    expect(pageSeeds(0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pageSeeds(1)).toEqual([6, 7, 8, 9, 10, 11]);
    let state = initialDrawState(options);
    state = drawReducer(state, { type: 'select', index: 3 });
    expect(selectedSeed(state)).toBe(3);
    state = drawReducer(state, { type: 'new-looks' });
    expect(selectedSeed(state)).toBe(6);
    state = drawReducer(state, { type: 'select', index: 9 });
    expect(state.selected).toBe(5);
  });

  it('forgets the finish and second colour when the recipe changes', () => {
    let state = initialDrawState(options);
    state = drawReducer(state, { type: 'finish', finish: 'metal' });
    state = drawReducer(state, { type: 'accent', accent: [1, 2, 3] });
    state = drawReducer(state, { type: 'option', option: 'block' });
    expect(state.finish).toBeUndefined();
    expect(state.accent).toBeUndefined();
  });

  it('draws the library bytes for the look and seed, the same each time', () => {
    const bricks = options.find((option) => option.id === 'bricks');
    if (bricks === undefined) throw new Error('No bricks.');
    const state = { ...initialDrawState(options, RUBY), detail: 'rough' as const };
    const picture = drawPicture(bricks, state, 4);
    expect(picture.pngs).toHaveLength(1);
    expect(picture.pngs[0]).toEqual(
      artLookPng({ recipe: 'bricks', colour: RUBY, detail: 'rough', seed: 4 }),
    );
    expect(picture.rgba[0]).toHaveLength(16 * 16 * 4);
    expect(drawPicture(bricks, state, 4).pngs[0]).toEqual(picture.pngs[0]);
    expect(drawPicture(bricks, state, 5).pngs[0]).not.toEqual(picture.pngs[0]);
  });

  it('draws every frame of a recipe with frames', () => {
    const spark = ART_RECIPE_INFO.find((info) => info.id === 'particle_spark') as ArtRecipeInfo;
    const option = { ...spark, finishes: spark.finishes };
    const picture = drawPicture(option, initialDrawState([option], RUBY), 2);
    expect(picture.pngs).toEqual(
      artFramePngs({ recipe: 'particle_spark', colour: RUBY, detail: 'normal', seed: 2 }),
    );
    expect(picture.pngs).toHaveLength(4);
    expect(picture.rgba).toHaveLength(4);
  });

  it('draws the humanoid skin with the chosen coat', () => {
    const [skin] = drawOptions({ kinds: ['entity'], width: 64, height: 64, skin: true });
    if (skin === undefined) throw new Error('No skin.');
    const state = drawReducer(initialDrawState([skin], RUBY), { type: 'finish', finish: 'scales' });
    const picture = drawPicture(skin, state, 1);
    expect([picture.width, picture.height]).toEqual([64, 64]);
    expect(picture.pngs[0]).toEqual(
      boxSkinArtPng(HUMANOID_SKIN_BOXES, 64, 64, {
        colour: RUBY,
        detail: 'normal',
        seed: 1,
        coat: 'scales',
      }),
    );
  });

  it('names finishes and colours in words', () => {
    expect(finishLabel('metal')).toBe('Metal');
    expect(finishLabel('deep_slate')).toBe('Deep slate');
    expect(hexToRgb('#c41c34')).toEqual([196, 28, 52]);
    expect(hexToRgb('nope')).toBeNull();
  });
});

describe('the field of a texture path', () => {
  it('reads the picture kind from the folder', () => {
    expect(drawFieldForTexture('demo:textures/block/ruby_ore.png', 16, 16).kinds[0]).toBe('block');
    expect(drawFieldForTexture('demo:textures/item/ruby.png', 16, 16).kinds[0]).toBe('item');
    expect(drawFieldForTexture('textures/particle/spark_0.png', 8, 8).kinds).toEqual(['particle']);
    expect(drawFieldForTexture('textures/mob_effect/rush.png', 18, 18).kinds).toEqual(['icon']);
    expect(drawFieldForTexture('textures/entity/golem.png', 64, 64).skin).toBe(true);
    expect(
      drawFieldForTexture('textures/entity/equipment/humanoid/ruby.png', 64, 32).skin,
    ).toBeUndefined();
  });
});
