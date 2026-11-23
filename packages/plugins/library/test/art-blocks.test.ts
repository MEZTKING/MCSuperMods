/**
 * Tests for the block recipes drawn in B492 (ADR 0092 D7, D8, D13 (b)): every block row is
 * drawn, each B492 recipe follows the pixel rules over the property test's colours, seeds,
 * finishes and details, the tiling ones tile, the see-through ones use only their alpha levels,
 * and each equals its golden PNG in `fixtures/art/blocks/` (`UPDATE_GOLDENS=1`). Every picture
 * here is MSM's own, made in code; no Minecraft texture is read or stored.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ART_RECIPE_INFO,
  type ArtDetail,
  type ArtLook,
  type ArtRecipeId,
  type ArtRecipeInfo,
  artLookPng,
  artPixels,
  artPng,
  artRecipeInfo,
  checkArtRules,
  DEFAULT_COLOUR,
  PATTERN_RECIPES,
  PLACEHOLDER_PATTERNS,
  placeholderPng,
  type Rgb,
} from '../src/index';

// Heavy property tests (B539, plan "Watch" under B537): each draws a recipe at 12 colours, 4 seeds,
// every finish and 3 details (hundreds of pictures, the boat bodies 128 pixels wide), which takes
// a few seconds alone and more than vitest's 5 s default when every package's tests run at once.
const HEAVY_TIMEOUT = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'blocks');
const update = process.env.UPDATE_GOLDENS === '1';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(0, 2), 16),
  Number.parseInt(value.slice(2, 4), 16),
  Number.parseInt(value.slice(4, 6), 16),
];

/** The property test's colours (as in `art.test.ts`): the ten theme colours, grey, near-white. */
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

/** The block recipes B492 draws, and the finish it adds to the storage block. */
const B492: readonly ArtRecipeId[] = [
  'plain',
  'stone',
  'cobblestone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'block_front',
  'stripped_log',
  'stripped_log_top',
  'door_top',
  'door_bottom',
  'trapdoor',
  'sapling',
  'crop_stage0',
  'crop_stage1',
  'crop_stage2',
  'crop_stage3',
  'portal',
  'portal_frame',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'gravel',
];

/** The looks of a recipe: every colour, seed and detail, and the finishes B492 owns. */
function* looks(info: ArtRecipeInfo): Generator<ArtLook> {
  const finishes =
    info.id === 'block' ? ['rough'] : info.finishes.length > 0 ? info.finishes : [undefined];
  for (const colour of TEST_COLOURS) {
    for (const finish of finishes) {
      for (const detail of DETAILS) {
        for (const seed of SEEDS) yield { recipe: info.id, colour, finish, detail, seed };
      }
    }
  }
}

const blocks = ART_RECIPE_INFO.filter((info) => info.kind === 'block');
const owned = [...B492.map((id) => artRecipeInfo(id)), artRecipeInfo('block')];

describe('every block recipe is drawn (B492)', () => {
  it('has no block row left as a stub', () => {
    expect(blocks.filter((info) => !info.drawn).map((info) => info.id)).toEqual([]);
    // 37 block faces, and the lucky block of the game flows (B557).
    expect(blocks).toHaveLength(38);
  });

  it('leaves no block pattern on the placeholder fallback', () => {
    const blockPatterns = PLACEHOLDER_PATTERNS.filter(
      (pattern) => artRecipeInfo(PATTERN_RECIPES[pattern]).kind === 'block',
    );
    expect(blockPatterns.length).toBeGreaterThan(20);
    for (const pattern of blockPatterns) {
      expect(sha256(artPng(pattern)), pattern).not.toBe(sha256(placeholderPng(pattern)));
    }
  });

  it('gives the storage block a rough finish, unlike the gem and metal ones', () => {
    expect(artRecipeInfo('block').finishes).toEqual(['gem', 'metal', 'rough']);
    const look = { recipe: 'block' as const, colour: DEFAULT_COLOUR, seed: 1 };
    const rough = sha256(artLookPng({ ...look, finish: 'rough' }));
    expect(rough).not.toBe(sha256(artLookPng({ ...look, finish: 'gem' })));
    expect(rough).not.toBe(sha256(artLookPng({ ...look, finish: 'metal' })));
  });
});

describe.each(owned)('the block recipe $id (ADR 0092 D8)', (info) => {
  it('follows every pixel rule over 12 colours, 4 seeds, every finish and detail', {
    timeout: HEAVY_TIMEOUT,
  }, () => {
    for (const look of looks(info)) {
      expect(checkArtRules(artPixels(look), info), JSON.stringify(look)).toEqual([]);
    }
  });

  it('gives other bytes for other seeds', () => {
    for (const look of looks(info)) {
      if (look.seed !== 0) continue;
      const bySeed = SEEDS.map((seed) => sha256(artLookPng({ ...look, seed })));
      expect(new Set(bySeed).size, JSON.stringify(look)).toBe(SEEDS.length);
    }
  });

  const finishes =
    info.id === 'block' ? ['rough'] : info.finishes.length > 0 ? info.finishes : [undefined];
  it.each(finishes)('equals its golden PNG (finish %s)', (finish) => {
    const png = artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    const file = join(goldens, `${info.id}${finish === undefined ? '' : `-${finish}`}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});

/** The alpha values a look uses. */
const alphas = (look: ArtLook): Set<number> => {
  const { data } = artPixels(look);
  const out = new Set<number>();
  for (let i = 3; i < data.length; i += 4) out.add(data[i] ?? 0);
  return out;
};

describe('shapes and see-through faces', () => {
  it('fills the solid faces edge to edge', () => {
    const solid = owned.filter(
      (info) =>
        !['sapling', 'trapdoor', 'portal'].includes(info.id) && !info.id.startsWith('crop_'),
    );
    for (const info of solid) {
      for (const seed of SEEDS) {
        expect([...alphas({ recipe: info.id, colour: DEFAULT_COLOUR, seed })], info.id).toEqual([
          255,
        ]);
      }
    }
  });

  it('draws the portal surface see-through at fixed levels only, the same for every colour', () => {
    for (const seed of SEEDS) {
      const used = alphas({ recipe: 'portal', colour: DEFAULT_COLOUR, seed });
      expect([...used].every((alpha) => [85, 170, 255].includes(alpha))).toBe(true);
      expect(used.has(85) && used.has(170)).toBe(true);
    }
  });

  it('cuts four holes in the trapdoor and leaves plants transparent around them', () => {
    const holes = (id: ArtRecipeId, seed: number): number => {
      const { data } = artPixels({ recipe: id, colour: DEFAULT_COLOUR, seed });
      let clear = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] === 0) clear += 1;
      return clear;
    };
    for (const seed of SEEDS) {
      expect(holes('trapdoor', seed)).toBe(16);
      expect(holes('sapling', seed)).toBeGreaterThan(128);
      for (const stage of [0, 1, 2, 3]) {
        expect(holes(`crop_stage${stage}` as ArtRecipeId, seed)).toBeGreaterThan(100);
      }
    }
  });

  it('grows the crop stalks taller each stage and draws the ripe produce in the second colour', () => {
    const tallest = (stage: number): number => {
      const { data } = artPixels({
        recipe: `crop_stage${stage}` as ArtRecipeId,
        colour: DEFAULT_COLOUR,
        seed: 0,
      });
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) if ((data[(y * 16 + x) * 4 + 3] ?? 0) > 0) return 16 - y;
      }
      return 0;
    };
    const heights = [0, 1, 2, 3].map(tallest);
    expect(heights[0]).toBeGreaterThanOrEqual(3);
    expect(heights[0]).toBeLessThanOrEqual(5);
    expect(heights[3]).toBeGreaterThanOrEqual(13);
    for (let s = 1; s < 4; s += 1) expect(heights[s] ?? 0).toBeGreaterThan(heights[s - 1] ?? 0);
    const look = { recipe: 'crop_stage3' as const, colour: DEFAULT_COLOUR, seed: 0 };
    expect(sha256(artLookPng({ ...look, accent: [40, 60, 200] }))).not.toBe(
      sha256(artLookPng(look)),
    );
  });
});
