/**
 * Tests for the vanilla-style generator (ADR 0092 D7, D8, D11, D13, D14): the recipe table, the
 * pattern map and its placeholder fallback, the drawn recipes' pixel rules over many looks,
 * their goldens, the speed of a drawing, the low-level helpers, and the contact sheet
 * (`UPDATE_ART_SHEET=1` writes `docs/reference/art/sheet.png`). Every picture here is MSM's
 * own, made in code; no Minecraft texture is read or stored.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderSprite } from '../src/art/canvas';
import { type ArtImage, hueDelta, packRgb, rgbToOklab, rgbToOklch } from '../src/art/colour';
import { generateArt, generateArtPng } from '../src/art/generator';
import { ART_HUE_SHIFT, spreadShades } from '../src/art/materials';
import { clusteredField, quantise } from '../src/art/noise';
import { colourCount, extractPalette } from '../src/art/palette';
import { DEFAULT_HUE_SHIFT, defaultSteps, generateRamp } from '../src/art/ramp';
import { ART_TABLE } from '../src/art/table';
import {
  ART_RECIPE_IDS,
  ART_RECIPE_INFO,
  type ArtDetail,
  type ArtLook,
  type ArtRecipeId,
  type ArtRecipeInfo,
  artFramePngs,
  artLookPng,
  artPixels,
  artPng,
  artRecipeInfo,
  checkArtRules,
  DEFAULT_COLOUR,
  encodePng,
  hashSeed,
  minecraftArt,
  PATTERN_RECIPES,
  PLACEHOLDER_PATTERNS,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
  placeholderSize,
  type Rgb,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'existing');
const sheetFile = join(here, '..', '..', '..', '..', 'docs', 'reference', 'art', 'sheet.png');
const update = process.env.UPDATE_GOLDENS === '1';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(0, 2), 16),
  Number.parseInt(value.slice(2, 4), 16),
  Number.parseInt(value.slice(4, 6), 16),
];

/** The ten Surprise me theme colours (ADR 0086 D2, `surprise/themes.ts`), grey and near-white. */
const THEME_COLOURS: readonly Rgb[] = [
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
].map(hex);
const TEST_COLOURS: readonly Rgb[] = [...THEME_COLOURS, hex('808080'), hex('f0f0f0')];
const SEEDS = [0, 1, 2, 3] as const;
const DETAILS: readonly ArtDetail[] = ['smooth', 'normal', 'rough'];

/** The 20 recipes the prototype drew (ADR 0092 D2), drawn since B491. */
const EXISTING: readonly ArtRecipeId[] = [
  'ore',
  'deepslate_ore',
  'gem',
  'ingot',
  'block',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'fruit',
  'pie',
  'planks',
  'bark',
  'log_top',
  'leaves',
];

const finishesOf = (info: ArtRecipeInfo): readonly (string | undefined)[] =>
  info.finishes.length > 0 ? info.finishes : [undefined];

/** Every look of the property tests for a recipe: colours, seeds, finishes and details. */
function* looks(info: ArtRecipeInfo): Generator<ArtLook> {
  for (const colour of TEST_COLOURS) {
    for (const finish of finishesOf(info)) {
      for (const detail of DETAILS) {
        for (const seed of SEEDS) yield { recipe: info.id, colour, finish, detail, seed };
      }
    }
  }
}

/**
 * The dominant hue of the pixels a look's colour paints: those that change when the colour is
 * swapped for another (a handle, a crust or the stone round an ore stay as they are), weighed by
 * chroma, as the peak of a 10-degree histogram refined by the mean of the hues near it.
 */
function paintedHue(look: ArtLook): number | undefined {
  const a = artPixels(look).data;
  const b = artPixels({ ...look, colour: [look.colour[2], look.colour[0], look.colour[1]] }).data;
  const bins = new Float64Array(36);
  const hues: [number, number][] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
    const [, c, h] = rgbToOklch([a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0]);
    if (c < 0.03) continue;
    bins[Math.floor(h / 10) % 36] = (bins[Math.floor(h / 10) % 36] ?? 0) + c;
    hues.push([h, c]);
  }
  let best = -1;
  let bestWeight = 0;
  for (let bin = 0; bin < 36; bin += 1) {
    const weight = (bins[(bin + 35) % 36] ?? 0) + (bins[bin] ?? 0) + (bins[(bin + 1) % 36] ?? 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = bin;
    }
  }
  if (best < 0) return undefined;
  let x = 0;
  let y = 0;
  for (const [h, c] of hues) {
    if (Math.abs(hueDelta(best * 10 + 5, h)) > 20) continue;
    x += c * Math.cos((h * Math.PI) / 180);
    y += c * Math.sin((h * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const drawn = ART_RECIPE_INFO.filter((info) => info.drawn);

/**
 * The finishes with a golden in `existing/`: the 20 prototype recipes in their B491 finishes.
 * Recipes and finishes drawn later keep their goldens in their family's test
 * (`art-blocks.test.ts`, `fixtures/art/blocks/`).
 */
const existingGoldens = (info: ArtRecipeInfo): readonly (string | undefined)[] =>
  EXISTING.includes(info.id)
    ? finishesOf(info).filter((finish) => !(info.id === 'block' && finish === 'rough'))
    : [];

describe('the recipe table (ADR 0092 D7)', () => {
  it('has every recipe id once, in the order of ART_RECIPE_IDS', () => {
    expect(ART_RECIPE_INFO.map((info) => info.id)).toEqual([...ART_RECIPE_IDS]);
    expect(new Set(ART_RECIPE_IDS).size).toBe(ART_RECIPE_IDS.length);
    expect(ART_RECIPE_IDS.length).toBe(80);
  });

  it('gives each row a label, a kind, a size and its rules', () => {
    for (const info of ART_RECIPE_INFO) {
      expect(info.label.length, info.id).toBeGreaterThan(2);
      expect(info.label, info.id).not.toMatch(/_/);
      expect(['block', 'item', 'entity', 'icon', 'particle']).toContain(info.kind);
      expect(info.outline, info.id).toBe(info.kind === 'item');
      if (info.kind === 'item') expect(info.tiles, info.id).toBe(false);
      expect(info.frames, info.id).toBe(info.kind === 'particle' ? 4 : 1);
      expect(info.width * info.height, info.id).toBeGreaterThan(0);
      expect(Object.isFrozen(info)).toBe(true);
    }
    for (const info of ART_RECIPE_INFO) {
      expect(new Set(info.finishes).size, info.id).toBe(info.finishes.length);
      for (const finish of info.finishes) expect(finish, info.id).toMatch(/^[a-z]+$/);
    }
    expect(artRecipeInfo('block').finishes.slice(0, 2)).toEqual(['gem', 'metal']);
    expect(artRecipeInfo('fruit').colours).toBe(2);
  });

  it('draws the 20 recipes of the prototype; a row is drawn exactly when it has a drawing', () => {
    for (const id of EXISTING) expect(artRecipeInfo(id).drawn, id).toBe(true);
    for (const entry of ART_TABLE) expect(entry.info.drawn).toBe(entry.draw !== undefined);
  });

  it('throws for an id that is not in the table', () => {
    expect(() => artRecipeInfo('nothing' as ArtRecipeId)).toThrow(/Unknown art recipe/);
  });
});

describe('placeholder patterns map to recipes (ADR 0092 D13 (e), D14)', () => {
  it.each(PLACEHOLDER_PATTERNS)('%s has a recipe of its size and frames', (pattern) => {
    const recipe = PATTERN_RECIPES[pattern];
    const info = artRecipeInfo(recipe);
    const size = placeholderSize(pattern);
    expect([info.width, info.height]).toEqual([size.width, size.height]);
    expect(info.frames).toBe(pattern.startsWith('particle_') ? 4 : 1);
  });

  it('covers all 70 patterns', () => {
    expect(PLACEHOLDER_PATTERNS).toHaveLength(70);
    expect(Object.keys(PATTERN_RECIPES).sort()).toEqual([...PLACEHOLDER_PATTERNS].sort());
    // Recipes with no pattern of their own: terrain, the storage block and three more items.
    const mapped = new Set(Object.values(PATTERN_RECIPES));
    expect(ART_RECIPE_IDS.filter((id) => !mapped.has(id))).toEqual([
      'cobblestone',
      'deepslate_ore',
      'block',
      'dirt',
      'grass_top',
      'grass_side',
      'sand',
      'gravel',
      'fruit',
      'pie',
    ]);
  });

  const stubs = PLACEHOLDER_PATTERNS.filter(
    (pattern) => !artRecipeInfo(PATTERN_RECIPES[pattern]).drawn,
  );
  it.each(stubs)('artPng of the stub %s is placeholderPng byte for byte', (pattern) => {
    const options = [
      {},
      { colour: [40, 150, 150] as Rgb },
      { colour: [200, 180, 40] as Rgb, accent: [30, 60, 200] as Rgb },
      { seed: 5, finish: 'metal', detail: 'rough' as const },
      ...[0, 1, 2, 3].map((frame) => ({ colour: [90, 42, 138] as Rgb, frame })),
    ];
    for (const option of options) {
      expect(sha256(artPng(pattern, option))).toBe(sha256(placeholderPng(pattern, option)));
    }
  });

  // A stub left in the table (none once every family is drawn) draws its placeholder, every frame.
  const stub = ART_RECIPE_INFO.find((info) => !info.drawn);
  it.skipIf(stub === undefined)('draws a stub recipe from its placeholder, every frame', () => {
    const info = stub as ArtRecipeInfo;
    const { fallback } = ART_TABLE.find((entry) => entry.info.id === info.id) as {
      fallback: PlaceholderPattern;
    };
    const look: ArtLook = { recipe: info.id, colour: [40, 150, 150] };
    const pixels = artPixels(look);
    const size = info.width * info.height * 4;
    for (let frame = 0; frame < info.frames; frame += 1) {
      const one = placeholderPixels(fallback, { colour: [40, 150, 150], frame });
      expect([...pixels.data.subarray(frame * size, (frame + 1) * size)]).toEqual([...one]);
    }
    expect(artFramePngs(look).map(sha256)).toEqual(
      Array.from({ length: info.frames }, (_, frame) =>
        sha256(placeholderPng(fallback, { colour: [40, 150, 150], frame })),
      ),
    );
    expect(sha256(artLookPng(look))).toBe(
      sha256(encodePng(pixels.data, info.width, info.height * info.frames)),
    );
  });

  // One-frame recipes; artPng of a particle gives one frame (`art-worn.test.ts`).
  it.each(
    drawn.filter((info) => info.frames === 1 && Object.values(PATTERN_RECIPES).includes(info.id)),
  )('artPng of a drawn pattern draws the recipe ($id)', (info) => {
    const pattern = (Object.keys(PATTERN_RECIPES) as PlaceholderPattern[]).find(
      (key) => PATTERN_RECIPES[key] === info.id,
    ) as PlaceholderPattern;
    const png = artPng(pattern, { colour: [40, 150, 150], seed: 2 });
    expect(sha256(png)).toBe(
      sha256(artLookPng({ recipe: info.id, colour: [40, 150, 150], seed: 2 })),
    );
    expect(sha256(png)).not.toBe(sha256(placeholderPng(pattern, { colour: [40, 150, 150] })));
    expect(sha256(artPng(pattern))).toBe(
      sha256(artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, seed: 0 })),
    );
  });
});

describe.each(drawn)('the drawn recipe $id (ADR 0092 D8, D13 (b))', (info) => {
  it('follows every pixel rule over 12 colours, 4 seeds, every finish and detail', () => {
    for (const look of looks(info)) {
      const problems = checkArtRules(artPixels(look), info);
      expect(problems, JSON.stringify(look)).toEqual([]);
    }
  });

  it('gives the same bytes for the same look and other bytes for other seeds', () => {
    for (const colour of TEST_COLOURS) {
      for (const finish of finishesOf(info)) {
        for (const detail of DETAILS) {
          const look = { recipe: info.id, colour, finish, detail };
          const bySeed = SEEDS.map((seed) => sha256(artLookPng({ ...look, seed })));
          expect(sha256(artLookPng({ ...look, seed: 0 }))).toBe(bySeed[0]);
          expect(new Set(bySeed).size, JSON.stringify(look)).toBe(SEEDS.length);
        }
      }
    }
  });

  it('paints in the asked hue (within 25 degrees; greys excepted)', () => {
    for (const look of looks(info)) {
      const [, chroma, hue] = rgbToOklch(look.colour);
      if (chroma < 0.04) continue;
      const painted = paintedHue(look);
      expect(painted, JSON.stringify(look)).toBeDefined();
      expect(Math.abs(hueDelta(hue, painted ?? 0)), JSON.stringify(look)).toBeLessThanOrEqual(25);
    }
  });

  it('keeps its shape when only the colour changes', () => {
    const shape = (colour: Rgb): number[] => {
      const { data } = artPixels({ recipe: info.id, colour, seed: 3 });
      const alpha: number[] = [];
      for (let i = 3; i < data.length; i += 4) alpha.push(data[i] ?? 0);
      return alpha;
    };
    expect(shape([40, 150, 150])).toEqual(shape([200, 60, 30]));
  });

  it.each(existingGoldens(info))('equals its golden PNG (finish %s)', (finish) => {
    const png = artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    const file = join(goldens, `${info.id}${finish === undefined ? '' : `-${finish}`}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});

describe('looks', () => {
  it('detail changes the noise and an unknown finish falls back to the first', () => {
    const base = { recipe: 'ore' as const, colour: DEFAULT_COLOUR, seed: 1 };
    const smooth = sha256(artLookPng({ ...base, detail: 'smooth' }));
    const normal = sha256(artLookPng({ ...base, detail: 'normal' }));
    const rough = sha256(artLookPng({ ...base, detail: 'rough' }));
    expect(new Set([smooth, normal, rough]).size).toBe(3);
    expect(sha256(artLookPng(base))).toBe(normal);
    const block = { recipe: 'block' as const, colour: DEFAULT_COLOUR };
    expect(sha256(artLookPng({ ...block, finish: 'shiny' }))).toBe(
      sha256(artLookPng({ ...block, finish: 'gem' })),
    );
    expect(sha256(artLookPng({ ...block, finish: 'metal' }))).not.toBe(
      sha256(artLookPng({ ...block, finish: 'gem' })),
    );
  });

  it('spreads shade proportions by the detail and keeps them as tuned at normal', () => {
    const tuned = [0.08, 0.22, 0.38, 0.22, 0.1];
    expect(spreadShades(tuned, 2, 1)).toBe(tuned);
    const smooth = spreadShades(tuned, 2, 0.5);
    const rough = spreadShades(tuned, 2, 1.5);
    expect(smooth[2]).toBeGreaterThan(0.38);
    expect(rough[2]).toBeLessThan(0.38);
    for (const shares of [smooth, rough]) {
      expect(shares.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
      expect(Math.min(...shares)).toBeGreaterThan(0);
    }
  });
});

describe('speed (ADR 0092 D17)', () => {
  const median = (values: number[]): number =>
    values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  it.each(drawn)(
    '$id draws in under 2 ms (median of 100) and six variations in under 20 ms',
    (info) => {
      for (let i = 0; i < 20; i += 1) {
        artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, seed: i });
      }
      const one: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        const start = performance.now();
        artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, seed: i });
        one.push(performance.now() - start);
      }
      const six: number[] = [];
      for (let i = 0; i < 15; i += 1) {
        const start = performance.now();
        for (let seed = 0; seed < 6; seed += 1) {
          artLookPng({ recipe: info.id, colour: [40, 150, 150], seed: i * 6 + seed });
        }
        six.push(performance.now() - start);
      }
      if (process.env.ART_TIMINGS === '1') {
        console.log(`${info.id}\t${median(one).toFixed(3)} ms\t${median(six).toFixed(3)} ms`);
      }
      // D17 sets 2 ms for a 16 by 16 recipe; the worn layers have 8 to 16 times its pixels
      // and encoding a 64 by 64 PNG alone takes about 1.2 ms, so they get twice the time.
      const factor = info.width * info.height > 18 * 18 ? 2 : 1;
      expect(median(one)).toBeLessThan(2 * factor);
      expect(median(six)).toBeLessThan(20 * factor);
    },
    20_000,
  );
});

describe('the ramp maths does not depend on the last bit of the engine (ADR 0092 D11)', () => {
  // `Math.cbrt`, `Math.pow`, `Math.atan2`, `Math.sin`, `Math.cos` and `Math.hypot` come from the
  // engine; V8 (Node and Electron) uses its own implementations on every platform, but another
  // engine could differ in the last bit. Each is nudged here by one unit in the last place, up
  // and down, and every drawn look of the property colours must keep its bytes.
  const names = ['cbrt', 'pow', 'atan2', 'sin', 'cos', 'hypot'] as const;
  const draw = (): string[] =>
    drawn.flatMap((info) =>
      TEST_COLOURS.flatMap((colour) =>
        finishesOf(info).map((finish) => sha256(artLookPng({ recipe: info.id, colour, finish }))),
      ),
    );
  it.each([1, -1])('keeps every byte when the functions are one ulp off (%i)', (direction) => {
    const before = draw();
    const maths = Math as unknown as Record<string, (...args: number[]) => number>;
    const saved = names.map((name) => maths[name] as (...args: number[]) => number);
    try {
      names.forEach((name, i) => {
        const original = saved[i] as (...args: number[]) => number;
        maths[name] = (...args: number[]) => {
          const value = original(...args);
          return value === 0 || !Number.isFinite(value)
            ? value
            : value * (1 + direction * Number.EPSILON);
        };
      });
      expect(draw()).toEqual(before);
    } finally {
      names.forEach((name, i) => {
        maths[name] = saved[i] as (...args: number[]) => number;
      });
    }
  });
});

describe('the prototype entry points kept for the vanilla parity pictures', () => {
  // SHA-256 of the prototype's own output at 48b60e5, before B491 split the generator.
  it('draw the storage block and the ingot as the prototype did', () => {
    expect(
      sha256(generateArtPng('block', { colour: DEFAULT_COLOUR, finish: 'gem', seed: 7 })),
    ).toBe('c261388b4fe1692f100b263fa23d6ffb363975ed7309d56d0d126612c8dcd499');
    expect(
      sha256(generateArtPng('block', { colour: DEFAULT_COLOUR, finish: 'metal', seed: 2 })),
    ).toBe('6d58e9963e808e45d199f5fd94fddf133738c7d9662ee16b708704d4aa16351b');
    expect(sha256(generateArtPng('ingot', { colour: DEFAULT_COLOUR, seed: 3 }))).toBe(
      '8647e553d1b5703dbad25cd8c926e8ad89c3fcb8b616e2adeb0b451b8d6d9baf',
    );
    expect(sha256(generateArtPng('ingot', { colour: [40, 150, 150], seed: 3 }))).toBe(
      '23f3200e39ff9fcf0d4c6728d70d0e0705f72a1194f525020a0f35f4ceafa759',
    );
    expect(generateArt('block', { colour: DEFAULT_COLOUR }).width).toBe(16);
    expect(DEFAULT_HUE_SHIFT).toBe(16);
    expect(ART_HUE_SHIFT).toBe(12);
  });
});

describe('low-level helpers (minecraftArt)', () => {
  const lightness = (rgb: Rgb): number => rgbToOklab(rgb)[0];

  it('ramps keep the number of shades, order them dark to light and land on the target', () => {
    const target: Rgb = [196, 28, 52];
    const ramp = generateRamp(target, { count: 6, anchor: 3 });
    expect(ramp).toHaveLength(6);
    for (let i = 1; i < ramp.length; i += 1) {
      expect(lightness(ramp[i] as Rgb)).toBeGreaterThan(lightness(ramp[i - 1] as Rgb));
    }
    expect(Math.abs((ramp[3] as Rgb)[0] - target[0])).toBeLessThanOrEqual(2);
    expect(new Set(ramp.map(packRgb)).size).toBe(6);
  });

  it('ramps shift highlights warmer and shadows cooler', () => {
    const hue = (rgb: Rgb): number => rgbToOklch(rgb)[2];
    const ramp = generateRamp([60, 90, 200], { count: 5, anchor: 2, hueShift: 20 });
    const mid = hue(ramp[2] as Rgb);
    expect(hue(ramp[4] as Rgb)).toBeLessThan(mid - 5);
    expect(hue(ramp[0] as Rgb)).toBeGreaterThan(mid);
    const red = generateRamp([196, 28, 52], { count: 5, anchor: 2, hueShift: 20 });
    const redMid = hue(red[2] as Rgb);
    expect(hue(red[4] as Rgb)).toBeGreaterThan(redMid + 5);
    expect((hue(red[0] as Rgb) - redMid + 360) % 360).toBeGreaterThan(180);
  });

  it('squeezes very light targets so the steps stay apart, with steps growing darker', () => {
    expect(new Set(generateRamp([250, 250, 245], { count: 5 }).map(packRgb)).size).toBe(5);
    const steps = defaultSteps(6, 3);
    expect(steps[3]?.lightness).toBe(0);
    const down1 = (steps[2]?.lightness ?? 0) - (steps[3]?.lightness ?? 0);
    const down3 = (steps[0]?.lightness ?? 0) - (steps[1]?.lightness ?? 0);
    expect(Math.abs(down3)).toBeGreaterThan(Math.abs(down1));
  });

  it('ranks noise and quantises in the given proportions', () => {
    const counts = [0, 0, 0];
    for (const s of quantise(clusteredField(16, 16, 7), [1, 2, 1]))
      counts[s] = (counts[s] ?? 0) + 1;
    expect(counts).toEqual([64, 128, 64]);
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
  });

  it('lists a palette darkest first and counts its colours', () => {
    const image: ArtImage = {
      width: 2,
      height: 1,
      data: Uint8Array.from([200, 0, 0, 255, 20, 0, 0, 255]),
    };
    expect(extractPalette(image).map((entry) => entry.rgb)).toEqual([
      [20, 0, 0],
      [200, 0, 0],
    ]);
    expect(colourCount(image)).toBe(2);
    expect(colourCount(image, Uint8Array.from([1, 0]))).toBe(1);
  });

  it('exports the helpers and the prototype renderer', () => {
    expect(minecraftArt.generateRamp).toBe(generateRamp);
    expect(minecraftArt.renderSprite).toBe(renderSprite);
    expect(minecraftArt.ART_HUE_SHIFT).toBe(ART_HUE_SHIFT);
  });
});

/**
 * The contact sheet (ADR 0092 D13 (d)): every recipe in table order, each at four theme colours
 * (Ruby, Frost, Moss, Amber) side by side, every frame of a particle, at 4x on a grey ground,
 * packed into rows. Written only with `UPDATE_ART_SHEET=1`.
 */
function contactSheet(): { png: Uint8Array; width: number; height: number } {
  const colours = [THEME_COLOURS[0], THEME_COLOURS[1], THEME_COLOURS[3], THEME_COLOURS[8]] as Rgb[];
  const scale = 4;
  const gap = 4;
  const margin = 12;
  const maxWidth = 2048;
  const tiles = ART_RECIPE_INFO.map((info) => {
    const pictures = colours.map((colour) => artPixels({ recipe: info.id, colour, seed: 0 }));
    const frameWidth = info.width * scale;
    const width = pictures.length * info.frames * (frameWidth + gap) - gap;
    return { info, pictures, width, height: info.height * scale };
  });
  // Shelf packing.
  const placed: { tile: (typeof tiles)[number]; x: number; y: number }[] = [];
  let x = margin;
  let y = margin;
  let rowHeight = 0;
  for (const tile of tiles) {
    if (x + tile.width + margin > maxWidth && x > margin) {
      x = margin;
      y += rowHeight + margin;
      rowHeight = 0;
    }
    placed.push({ tile, x, y });
    x += tile.width + margin * 2;
    rowHeight = Math.max(rowHeight, tile.height);
  }
  const width = maxWidth;
  const height = y + rowHeight + margin;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([196, 196, 200, 255], i * 4);
  for (const { tile, x: x0, y: y0 } of placed) {
    const { info } = tile;
    let left = x0;
    for (const picture of tile.pictures) {
      for (let frame = 0; frame < info.frames; frame += 1) {
        for (let py = 0; py < info.height * scale; py += 1) {
          for (let px = 0; px < info.width * scale; px += 1) {
            const sx = Math.floor(px / scale);
            const sy = Math.floor(py / scale);
            const i = ((frame * info.height + sy) * info.width + sx) * 4;
            const alpha = (picture.data[i + 3] ?? 0) / 255;
            const o = ((y0 + py) * width + left + px) * 4;
            for (let k = 0; k < 3; k += 1) {
              const under = data[o + k] ?? 0;
              data[o + k] = Math.round((picture.data[i + k] ?? 0) * alpha + under * (1 - alpha));
            }
          }
        }
        left += info.width * scale + gap;
      }
    }
  }
  return { png: encodePng(data, width, height), width, height };
}

describe('the contact sheet', () => {
  it('lays every recipe out at four colours', () => {
    const sheet = contactSheet();
    expect(sheet.width).toBe(2048);
    expect(sheet.height).toBeGreaterThan(500);
    if (process.env.UPDATE_ART_SHEET === '1') {
      mkdirSync(dirname(sheetFile), { recursive: true });
      writeFileSync(sheetFile, sheet.png);
    }
  });
});
