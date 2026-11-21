/**
 * Tests for the item recipes drawn by B493 (ADR 0092 D7, D8, D13): every item recipe is drawn,
 * follows the pixel rules over the property colours and seeds (with and without a second colour),
 * keeps a bow's grip and a crossbow's stock between its frames, and equals its golden PNG
 * (`UPDATE_GOLDENS=1` writes `test/fixtures/art/items/`). Every picture here is MSM's own, made
 * in code; no Minecraft texture is read or stored.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Silhouette } from '../src/art/sprites';
import { BOW, CROSSBOW } from '../src/art/sprites-items';
import {
  ART_RECIPE_INFO,
  type ArtDetail,
  type ArtRecipeId,
  artLookPng,
  artPixels,
  artPng,
  checkArtRules,
  DEFAULT_COLOUR,
  PATTERN_RECIPES,
  PLACEHOLDER_PATTERNS,
  placeholderPng,
  type Rgb,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'items');
const update = process.env.UPDATE_GOLDENS === '1';

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(0, 2), 16),
  Number.parseInt(value.slice(2, 4), 16),
  Number.parseInt(value.slice(4, 6), 16),
];

/** The ten Surprise me theme colours (ADR 0086 D2), grey and near-white. */
const TEST_COLOURS: readonly Rgb[] = [
  'c41c34',
  '8fd3ff',
  'e8641c',
  '4c8a2c',
  '5ab4f0',
  '5a2a8a',
  'f0c020',
  'ff7f6a',
  'de9420',
  '606878',
  '808080',
  'f0f0f0',
].map(hex);
const SEEDS = [0, 1, 2, 3] as const;
const DETAILS: readonly ArtDetail[] = ['smooth', 'normal', 'rough'];

/** The item recipes B493 drew (the other item rows were drawn by B491). */
const DRAWN_HERE: readonly ArtRecipeId[] = [
  'disc',
  'spawn_egg',
  'spear',
  'mace',
  'knife',
  'boomerang',
  'ball',
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
  'bottle',
  'flask',
  'totem',
  'smithing_template',
  'horse_armor',
  'wolf_armor',
  'seeds',
  'produce',
];

const items = ART_RECIPE_INFO.filter((info) => info.kind === 'item');
const infoOf = (id: ArtRecipeId) => {
  const info = ART_RECIPE_INFO.find((row) => row.id === id);
  if (info === undefined) throw new Error(id);
  return info;
};

describe('item recipes (ADR 0092 D7)', () => {
  it('draws every item recipe; none is left on the placeholder', () => {
    expect(items.filter((info) => !info.drawn).map((info) => info.id)).toEqual([]);
    expect(items.map((info) => info.id)).toEqual(expect.arrayContaining([...DRAWN_HERE]));
  });

  it('draws every item pattern with its recipe, not the placeholder', () => {
    const itemPatterns = PLACEHOLDER_PATTERNS.filter(
      (pattern) => infoOf(PATTERN_RECIPES[pattern]).kind === 'item',
    );
    expect(itemPatterns.length).toBeGreaterThanOrEqual(DRAWN_HERE.length);
    for (const pattern of itemPatterns) {
      expect(
        Buffer.from(artPng(pattern)).equals(Buffer.from(placeholderPng(pattern))),
        pattern,
      ).toBe(false);
    }
  });
});

describe.each(DRAWN_HERE.map(infoOf))('the item recipe $id (ADR 0092 D8, D13)', (info) => {
  it('follows every pixel rule over 12 colours, 4 seeds and every detail', () => {
    for (const colour of TEST_COLOURS) {
      for (const detail of DETAILS) {
        for (const seed of SEEDS) {
          const look = { recipe: info.id, colour, detail, seed };
          expect(checkArtRules(artPixels(look), info), JSON.stringify(look)).toEqual([]);
        }
      }
    }
  });

  it.runIf(info.colours === 2)('follows the rules with a second colour of another hue', () => {
    for (const [i, colour] of TEST_COLOURS.entries()) {
      const accent = TEST_COLOURS[(i + 4) % TEST_COLOURS.length] as Rgb;
      for (const seed of SEEDS) {
        const look = { recipe: info.id, colour, accent, seed };
        expect(checkArtRules(artPixels(look), info), JSON.stringify(look)).toEqual([]);
      }
    }
  });

  it.runIf(info.colours === 2)('paints the second colour when one is given', () => {
    const without = artPixels({ recipe: info.id, colour: [40, 150, 150] }).data;
    const withAccent = artPixels({
      recipe: info.id,
      colour: [40, 150, 150],
      accent: [230, 200, 40],
    }).data;
    expect(Buffer.from(withAccent).equals(Buffer.from(without))).toBe(false);
  });

  it('equals its golden PNG', () => {
    const png = artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, seed: 0 });
    const file = join(goldens, `${info.id}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});

/** The pixels of `recipe` on the handle cells (`H`) of `rows`: a bow's grip, a crossbow's stock. */
function handlePixels(
  recipe: ArtRecipeId,
  rows: Silhouette,
  look: { colour: Rgb; seed: number; detail: ArtDetail },
) {
  const { data } = artPixels({ recipe, ...look });
  const kept: number[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== 'H') continue;
      const i = (y * 16 + x) * 4;
      kept.push(x, y, ...data.subarray(i, i + 4));
    }
  });
  return kept;
}

describe('bows and crossbows keep their handle between frames', () => {
  const families: readonly [ArtRecipeId, Silhouette, readonly ArtRecipeId[]][] = [
    ['bow', BOW, ['bow_pulling_0', 'bow_pulling_1', 'bow_pulling_2']],
    [
      'crossbow',
      CROSSBOW,
      [
        'crossbow_pulling_0',
        'crossbow_pulling_1',
        'crossbow_pulling_2',
        'crossbow_arrow',
        'crossbow_firework',
      ],
    ],
  ];
  it.each(families)(
    '%s: the grip or stock pixels are the same in every frame',
    (base, rows, frames) => {
      for (const colour of TEST_COLOURS) {
        for (const detail of DETAILS) {
          for (const seed of SEEDS) {
            const look = { colour, seed, detail };
            const reference = handlePixels(base, rows, look);
            expect(reference.length, base).toBeGreaterThanOrEqual(5 * 6);
            for (const frame of frames) {
              expect(handlePixels(frame, rows, look), `${frame} ${colour} ${seed}`).toEqual(
                reference,
              );
            }
          }
        }
      }
    },
  );

  it('pulls the string further back in each frame and nocks an arrow in the later bow frames', () => {
    const opaque = (recipe: ArtRecipeId) => {
      const { data } = artPixels({ recipe, colour: DEFAULT_COLOUR });
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count += 1;
      return count;
    };
    const frames: readonly ArtRecipeId[] = [
      'bow',
      'bow_pulling_0',
      'bow_pulling_1',
      'bow_pulling_2',
    ];
    const shapes = frames.map((recipe) => artLookPng({ recipe, colour: DEFAULT_COLOUR }));
    expect(new Set(shapes.map((png) => Buffer.from(png).toString('base64'))).size).toBe(4);
    expect(opaque('bow_pulling_1')).toBeGreaterThan(opaque('bow_pulling_0'));
  });
});
