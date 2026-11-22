/**
 * Tests for the pattern pictures of the data-only flows (B508, ADR 0106 D4, ADR 0092 D7, D8):
 * the banner and shield masks stay on the flag's and the plate's faces, the trim layers stay in
 * the armour's region and use only the eight shades of their palette key, the glider wings stay
 * on the wing box, the pot face is opaque, the pictures in the colours the flows draw them in
 * follow the pixel rules, and each drawing equals its golden PNG in `fixtures/art/patterns/`
 * (`UPDATE_GOLDENS=1`). The generic rules over the property colours run in `art.test.ts`. Every
 * picture here is MSM's own, made in code; no Minecraft texture is read or stored.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packRgb } from '../src/art/colour';
import {
  BANNER_SHAPES,
  PATTERN_MASK_GREY,
  POT_PICTURES,
  TRIM_KEY_GREY,
  TRIM_STYLES,
  trimKeyColours,
} from '../src/art/recipes/patterns';
import { wornRegion } from '../src/art/recipes/worn';
import {
  ART_RECIPE_INFO,
  type ArtRecipeId,
  artLookPng,
  artPixels,
  artRecipeInfo,
  checkArtRules,
  DEFAULT_COLOUR,
  type Rgb,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'patterns');
const update = process.env.UPDATE_GOLDENS === '1';

/** The recipes B508 adds, in table order. */
const B508: readonly ArtRecipeId[] = [
  'pattern_sheet',
  'pottery_sherd',
  'glider',
  'banner_pattern',
  'shield_pattern',
  'trim_layer_1',
  'trim_layer_2',
  'glider_wings',
  'pot_pattern',
];

const COLOURS: readonly Rgb[] = [
  [196, 28, 52],
  [76, 138, 44],
  [143, 211, 255],
  [240, 192, 32],
  PATTERN_MASK_GREY,
  TRIM_KEY_GREY,
];

/** Whether pixel (x, y) is visible. */
const visible = (data: Uint8Array, width: number, x: number, y: number): boolean =>
  (data[(y * width + x) * 4 + 3] ?? 0) > 0;

/** Every visible pixel lies inside one of the rectangles `[x, y, w, h]`. */
function onlyInside(
  recipe: ArtRecipeId,
  finish: string | undefined,
  rects: readonly (readonly [number, number, number, number])[],
): void {
  const info = artRecipeInfo(recipe);
  const { data } = artPixels({ recipe, colour: [196, 28, 52], finish, seed: 1 });
  let count = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!visible(data, info.width, x, y)) continue;
      count += 1;
      const inside = rects.some(
        ([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh,
      );
      expect(inside, `${recipe} ${finish ?? ''} (${x}, ${y})`).toBe(true);
    }
  }
  expect(count, `${recipe} ${finish ?? ''}`).toBeGreaterThan(20);
}

describe('the pattern recipes (B508)', () => {
  it('adds nine drawn rows: three items and six entity pictures', () => {
    const rows = ART_RECIPE_INFO.filter((info) => B508.includes(info.id));
    expect(rows.map((info) => info.id)).toEqual([...B508]);
    expect(rows.every((info) => info.drawn)).toBe(true);
    expect(rows.map((info) => info.kind)).toEqual([
      'item',
      'item',
      'item',
      'entity',
      'entity',
      'entity',
      'entity',
      'entity',
      'entity',
    ]);
    expect(artRecipeInfo('banner_pattern').finishes).toEqual([...BANNER_SHAPES]);
    expect(artRecipeInfo('trim_layer_1').finishes).toEqual([...TRIM_STYLES]);
    expect(artRecipeInfo('pot_pattern').finishes).toEqual([...POT_PICTURES]);
  });

  it('draws banner masks only on the flag front and back, shield masks only on the plate front', () => {
    for (const shape of BANNER_SHAPES) {
      onlyInside('banner_pattern', shape, [
        [1, 1, 20, 40],
        [22, 1, 20, 40],
      ]);
      onlyInside('shield_pattern', shape, [[1, 1, 12, 22]]);
    }
  });

  it('mirrors the banner mask on the back of the flag', () => {
    for (const shape of BANNER_SHAPES) {
      const { data } = artPixels({
        recipe: 'banner_pattern',
        colour: [196, 28, 52],
        finish: shape,
      });
      for (let y = 1; y < 41; y += 1) {
        for (let x = 0; x < 20; x += 1) {
          expect(visible(data, 64, 1 + x, y), `${shape} (${x}, ${y})`).toBe(
            visible(data, 64, 22 + 19 - x, y),
          );
        }
      }
    }
  });

  it('keeps the trim layers inside the armour region, in the eight shades of their key', () => {
    for (const [recipe, pattern] of [
      ['trim_layer_1', 'armor_layer_1'],
      ['trim_layer_2', 'armor_layer_2'],
    ] as const) {
      const region = wornRegion(pattern);
      for (const style of TRIM_STYLES) {
        for (const colour of COLOURS) {
          const key = new Set(trimKeyColours(colour).map(packRgb));
          expect(key.size).toBe(8);
          const { data } = artPixels({ recipe, colour, finish: style, seed: 2, detail: 'rough' });
          for (let i = 0; i < 64 * 32; i += 1) {
            if ((data[i * 4 + 3] ?? 0) === 0) continue;
            expect(region[i], `${recipe} ${style} ${i}`).toBe(1);
            const rgb: Rgb = [data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0];
            expect(key.has(packRgb(rgb)), `${recipe} ${style} ${i}`).toBe(true);
          }
        }
      }
    }
  });

  it('gives a trim key of eight shades, lightest first, that follows the pixel rules', () => {
    for (const colour of COLOURS) {
      const key = trimKeyColours(colour);
      expect(key).toHaveLength(8);
      const data = new Uint8Array(8 * 4);
      for (const [i, rgb] of key.entries()) data.set([...rgb, 255], i * 4);
      const info = {
        id: 'trim_layer_1' as const,
        kind: 'entity' as const,
        width: 8,
        height: 1,
        frames: 1,
        tiles: false,
        outline: false,
      };
      expect(checkArtRules({ width: 8, height: 1, data }, info)).toEqual([]);
      const sum = (rgb: Rgb) => rgb[0] + rgb[1] + rgb[2];
      for (let i = 1; i < 8; i += 1) {
        expect(sum(key[i] as Rgb)).toBeLessThan(sum(key[i - 1] as Rgb));
      }
    }
  });

  it('draws the glider wings only on the wing box of the elytra layout', () => {
    onlyInside('glider_wings', undefined, [
      [24, 0, 20, 2],
      [22, 2, 24, 20],
    ]);
  });

  it('fills the whole pot face', () => {
    for (const picture of POT_PICTURES) {
      const { data } = artPixels({ recipe: 'pot_pattern', colour: [196, 28, 52], finish: picture });
      for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    }
  });

  it('follows the pixel rules in the colours the flows use', () => {
    for (const id of B508) {
      const info = artRecipeInfo(id);
      for (const colour of COLOURS) {
        for (const finish of info.finishes.length > 0 ? info.finishes : [undefined]) {
          for (const seed of [0, 5, 9]) {
            const look = { recipe: id, colour, finish, seed };
            expect(checkArtRules(artPixels(look), info), JSON.stringify(look)).toEqual([]);
          }
        }
      }
    }
  });

  it.each(
    B508.flatMap((id) => {
      const info = artRecipeInfo(id);
      return (info.finishes.length > 0 ? info.finishes : [undefined]).map(
        (finish) => [id, finish] as const,
      );
    }),
  )('%s equals its golden PNG (finish %s)', (id, finish) => {
    const png = artLookPng({ recipe: id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    const file = join(goldens, `${id}${finish === undefined ? '' : `-${finish}`}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});
