/**
 * Tests for the plant and pot recipes of vanilla parity 3 (B518, ADR 0092 D7, D8, D13): the five
 * rows are drawn blocks, the strands and stems run edge to edge so stacked blocks join, the faces
 * a model samples in parts are filled edge to edge, the lichen covers about half a face, berries
 * and glowing specks take the second colour, and each finish equals its golden PNG in
 * `fixtures/art/plants/` (`UPDATE_GOLDENS=1`). The pixel rules over every colour, seed, finish
 * and detail run for every drawn recipe in `art.test.ts`. Every picture here is MSM's own, made
 * in code; no Minecraft texture is read or stored.
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
const goldens = join(here, 'fixtures', 'art', 'plants');
const update = process.env.UPDATE_GOLDENS === '1';

/** The recipes B518 adds, in table order. */
const B518: readonly ArtRecipeId[] = ['strand', 'stalk', 'lichen', 'dripleaf', 'pot'];

const GREEN: Rgb = [76, 138, 44];
const ORANGE: Rgb = [236, 150, 48];

/** The alpha of every pixel of a look, row by row. */
function alpha(recipe: ArtRecipeId, finish: string | undefined, seed = 1): number[][] {
  const { data } = artPixels({ recipe, colour: GREEN, finish, seed });
  const rows: number[][] = [];
  for (let y = 0; y < 16; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < 16; x += 1) row.push(data[(y * 16 + x) * 4 + 3] ?? 0);
    rows.push(row);
  }
  return rows;
}

const visibleIn = (row: readonly number[] | undefined): number =>
  (row ?? []).filter((value) => value > 0).length;

describe('the plant and pot recipes (B518)', () => {
  it('adds five drawn block rows with their finishes', () => {
    const rows = ART_RECIPE_INFO.filter((info) => B518.includes(info.id));
    expect(rows.map((info) => info.id)).toEqual([...B518]);
    for (const info of rows) {
      expect(info.kind, info.id).toBe('block');
      expect(info.drawn, info.id).toBe(true);
      expect(info.outline, info.id).toBe(false);
      expect([info.width, info.height, info.frames], info.id).toEqual([16, 16, 1]);
    }
    expect(artRecipeInfo('strand').finishes).toEqual(['body', 'tip', 'berries', 'berrytip']);
    expect(artRecipeInfo('stalk').finishes).toEqual([
      'cane',
      'cactus',
      'cactustop',
      'bamboo',
      'leaves',
    ]);
    expect(artRecipeInfo('dripleaf').finishes).toEqual(['top', 'side', 'stem']);
    expect(artRecipeInfo('strand').colours).toBe(2);
    expect(artRecipeInfo('lichen').colours).toBe(2);
  });

  it('runs strands, canes and stems from the top edge to the bottom edge; a tip stops short', () => {
    for (const seed of [0, 1, 2, 3]) {
      for (const [recipe, finish] of [
        ['strand', 'body'],
        ['strand', 'berries'],
        ['stalk', 'cane'],
        ['dripleaf', 'stem'],
      ] as const) {
        const rows = alpha(recipe, finish, seed);
        for (const [y, row] of rows.entries()) {
          expect(visibleIn(row), `${recipe} ${finish} ${seed} row ${y}`).toBeGreaterThan(0);
        }
      }
      const tip = alpha('strand', 'tip', seed);
      expect(visibleIn(tip[0]), `tip ${seed}`).toBe(0);
      expect(visibleIn(tip[15]), `tip ${seed}`).toBeGreaterThan(0);
    }
  });

  it('fills the faces a model shows in parts edge to edge', () => {
    for (const [recipe, finish] of [
      ['stalk', 'cactus'],
      ['stalk', 'cactustop'],
      ['stalk', 'bamboo'],
      ['dripleaf', 'side'],
      ['pot', undefined],
    ] as const) {
      const rows = alpha(recipe, finish);
      expect(
        rows.flat().every((value) => value === 255),
        `${recipe} ${finish ?? ''}`,
      ).toBe(true);
    }
  });

  it('cuts the corners of a dripleaf and spreads a lichen over about half a face', () => {
    const leaf = alpha('dripleaf', 'top');
    expect(leaf[0]?.[0]).toBe(0);
    expect(leaf[15]?.[15]).toBe(0);
    expect(leaf[8]?.[8]).toBe(255);
    for (const seed of [0, 1, 2, 3]) {
      const covered = alpha('lichen', undefined, seed)
        .flat()
        .filter((value) => value > 0).length;
      expect(covered, `lichen ${seed}`).toBeGreaterThan(256 * 0.35);
      expect(covered, `lichen ${seed}`).toBeLessThan(256 * 0.6);
    }
  });

  it('draws berries and glowing specks in the second colour, and nothing more without them', () => {
    const colours = (recipe: ArtRecipeId, finish: string | undefined, accent: Rgb): Set<string> => {
      const { data } = artPixels({ recipe, colour: GREEN, accent, finish, seed: 2 });
      const out = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i + 3] ?? 0) > 0) out.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return out;
    };
    const plain = colours('strand', 'body', ORANGE);
    const berried = colours('strand', 'berries', ORANGE);
    expect(berried.size).toBeGreaterThan(plain.size);
    expect(colours('strand', 'body', [40, 60, 200])).toEqual(plain);
    expect(colours('lichen', undefined, ORANGE)).not.toEqual(
      colours('lichen', undefined, [40, 60, 200]),
    );
  });

  it('follows the pixel rules in the colours the flows use', () => {
    const looks: [ArtRecipeId, string | undefined, Rgb, Rgb | undefined][] = [
      ['strand', 'berries', [62, 120, 48], [236, 150, 48]],
      ['strand', 'berrytip', [62, 120, 48], [236, 150, 48]],
      ['stalk', 'cane', [138, 178, 84], undefined],
      ['stalk', 'cactus', [74, 128, 52], undefined],
      ['lichen', undefined, [118, 140, 104], [226, 206, 128]],
      ['pot', undefined, [166, 92, 62], undefined],
    ];
    for (const [recipe, finish, colour, accent] of looks) {
      for (const seed of [0, 1, 2, 3]) {
        const pixels = artPixels({ recipe, colour, accent, finish, seed });
        expect(checkArtRules(pixels, artRecipeInfo(recipe)), `${recipe} ${finish ?? ''}`).toEqual(
          [],
        );
      }
    }
  });

  for (const recipe of B518) {
    const info = artRecipeInfo(recipe);
    const finishes = info.finishes.length > 0 ? info.finishes : [undefined];
    it.each(finishes)(`${recipe} equals its golden PNG (finish %s)`, (finish) => {
      const png = artLookPng({ recipe, colour: DEFAULT_COLOUR, finish, seed: 0 });
      const file = join(goldens, `${recipe}${finish === undefined ? '' : `-${finish}`}.png`);
      if (update) {
        mkdirSync(goldens, { recursive: true });
        writeFileSync(file, png);
      }
      expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
    });
  }
});
