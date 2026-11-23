/**
 * Tests for the game recipes (B557, ADR 0092 D7, D8, D13; ADR 0117 D2): the lucky block is a drawn
 * block face with its two marks and a second colour for the mark, the flag and the timer are drawn
 * items, every finish follows the pixel rules at several colours and seeds, and each equals its
 * golden PNG in `fixtures/art/games/` (`UPDATE_GOLDENS=1`). The pixel rules over every colour,
 * seed, finish and detail also run for every drawn recipe in `art.test.ts`. Every picture here is
 * MSM's own, made in code; no Minecraft texture is read or stored.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
const goldens = join(here, 'fixtures', 'art', 'games');
const update = process.env.UPDATE_GOLDENS === '1';

/** The recipes B557 adds, in table order. */
const B557: readonly ArtRecipeId[] = ['lucky_block', 'flag', 'timer'];

const GOLD: Rgb = [232, 176, 40];
const SKY: Rgb = [90, 150, 220];
const RED: Rgb = [196, 40, 40];
const NIGHT: Rgb = [40, 40, 90];

/** The RGBA of one pixel of a look. */
function pixel(
  recipe: ArtRecipeId,
  colour: Rgb,
  x: number,
  y: number,
  options: { accent?: Rgb; finish?: string } = {},
): number[] {
  const { data, width } = artPixels({ recipe, colour, seed: 3, ...options });
  const i = (y * width + x) * 4;
  return [...data.slice(i, i + 4)];
}

describe('the game recipes (B557)', () => {
  it('adds a drawn block and two drawn items at the end of the table', () => {
    const rows = ART_RECIPE_INFO.filter((info) => B557.includes(info.id));
    expect(rows.map((info) => info.id)).toEqual([...B557]);
    expect(ART_RECIPE_INFO.slice(-3).map((info) => info.id)).toEqual([...B557]);
    for (const info of rows) expect(info.drawn, info.id).toBe(true);
    const lucky = artRecipeInfo('lucky_block');
    expect([lucky.kind, lucky.width, lucky.height, lucky.colours, lucky.outline]).toEqual([
      'block',
      16,
      16,
      2,
      false,
    ]);
    expect(lucky.finishes).toEqual(['question', 'star']);
    for (const id of ['flag', 'timer'] as const) {
      const info = artRecipeInfo(id);
      expect([info.kind, info.width, info.height, info.outline], id).toEqual([
        'item',
        16,
        16,
        true,
      ]);
    }
  });

  it('fills the whole lucky block face and draws the mark in the second colour', () => {
    const { data } = artPixels({ recipe: 'lucky_block', colour: GOLD, seed: 1 });
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    // The middle of the question mark's foot changes with the second colour only.
    expect(pixel('lucky_block', GOLD, 7, 11, { accent: SKY })).not.toEqual(
      pixel('lucky_block', GOLD, 7, 11, { accent: RED }),
    );
    expect(pixel('lucky_block', GOLD, 1, 1, { accent: SKY })).toEqual(
      pixel('lucky_block', GOLD, 1, 1, { accent: RED }),
    );
    // The star differs from the question mark.
    expect(
      artPixels({ recipe: 'lucky_block', colour: GOLD, seed: 1, finish: 'star' }).data,
    ).not.toEqual(data);
  });

  it('follows the pixel rules at several colours, seeds and every finish', () => {
    for (const id of B557) {
      const info = artRecipeInfo(id);
      for (const finish of info.finishes.length > 0 ? info.finishes : [undefined]) {
        for (const colour of [DEFAULT_COLOUR, GOLD, SKY, RED, NIGHT]) {
          for (const seed of [0, 1, 7]) {
            const pixels = artPixels({ recipe: id, colour, finish, seed });
            expect(checkArtRules(pixels, info), `${id} ${finish ?? ''} ${colour} ${seed}`).toEqual(
              [],
            );
          }
        }
      }
    }
  });

  const goldenCases = B557.flatMap((id) => {
    const finishes = artRecipeInfo(id).finishes;
    return (finishes.length > 0 ? finishes : [undefined]).map((finish) => [id, finish] as const);
  });
  it.each(goldenCases)('%s %s equals its golden PNG', (id, finish) => {
    const png = artLookPng({ recipe: id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    const file = join(goldens, `${id}${finish === undefined ? '' : `-${finish}`}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});
