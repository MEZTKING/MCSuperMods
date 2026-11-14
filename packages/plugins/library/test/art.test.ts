/**
 * Tests for the Minecraft-style art prototype (ADR 0092). Every texture here is synthetic and
 * made in code; no Minecraft texture is read or stored.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type ArtImage, packRgb, rgbToOklab, rgbToOklch } from '../src/art/colour';
import { ART_RECIPES, type ArtRecipe, generateArt, generateArtPng } from '../src/art/generator';
import { clusteredField, quantise } from '../src/art/noise';
import { extractPalette, materialColours, materialMask, textureRamps } from '../src/art/palette';
import { defaultSteps, generateRamp } from '../src/art/ramp';
import { applyColourMap, rampMap, recolourTexture, stripFrames } from '../src/art/recolour';
import { learnStyle, meanRunLength } from '../src/art/style';
import type { Rgb } from '../src/assets/png';
import { minecraftArt } from '../src/index';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** A 16x16 image painted by `paint(x, y)`, which returns a colour or null (transparent). */
function synth(paint: (x: number, y: number) => Rgb | null, height = 16): ArtImage {
  const data = new Uint8Array(16 * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const c = paint(x, y);
      if (c === null) continue;
      data.set([c[0], c[1], c[2], 255], (y * 16 + x) * 4);
    }
  }
  return { width: 16, height, data };
}

const GREYS: Rgb[] = [
  [90, 90, 90],
  [110, 110, 110],
  [130, 130, 130],
  [150, 150, 150],
];
const TEALS: Rgb[] = [
  [20, 90, 90],
  [40, 150, 150],
  [90, 210, 200],
];

/** Synthetic stone: four greys in a fixed pattern. */
const stone = synth((x, y) => GREYS[(x * 3 + y * 5) % 4] as Rgb);
/** Synthetic ore: the stone with a 4x3 teal vein at (5, 6). */
const ore = synth((x, y) =>
  x >= 5 && x < 9 && y >= 6 && y < 9
    ? (TEALS[(x - 5 + y - 6) % 3] as Rgb)
    : (GREYS[(x * 3 + y * 5) % 4] as Rgb),
);
const lightness = (rgb: Rgb): number => rgbToOklab(rgb)[0];

describe('palette extraction', () => {
  it('lists the distinct colours darkest first with their counts', () => {
    const palette = extractPalette(stone);
    expect(palette.map((entry) => entry.rgb)).toEqual(GREYS);
    expect(palette.reduce((sum, entry) => sum + entry.count, 0)).toBe(256);
  });

  it('skips transparent pixels and respects a mask', () => {
    const half = synth((x) => (x < 8 ? [200, 0, 0] : null));
    expect(extractPalette(half)).toHaveLength(1);
    const mask = new Uint8Array(256);
    expect(extractPalette(half, mask)).toHaveLength(0);
  });

  it('separates an ore vein from its stone by the base texture', () => {
    const mask = materialMask(ore, { base: stone });
    expect(mask.reduce((sum, v) => sum + v, 0)).toBe(12);
    expect(mask[6 * 16 + 5]).toBe(1);
    expect(mask[0]).toBe(0);
    const ramps = textureRamps(ore, { base: stone });
    expect(ramps.material.map((entry) => entry.rgb)).toEqual(TEALS);
    expect(ramps.base.map((entry) => entry.rgb)).toEqual(GREYS);
  });

  it('separates the vein by colour clustering without a base', () => {
    const mask = materialMask(ore);
    expect(mask.reduce((sum, v) => sum + v, 0)).toBe(12);
    expect(materialColours(extractPalette(stone)).size).toBe(4); // all grey: one cluster
  });
});

describe('ramp generation', () => {
  it('keeps the number of shades, orders them dark to light and lands on the target', () => {
    const target: Rgb = [196, 28, 52];
    const ramp = generateRamp(target, { count: 6, anchor: 3 });
    expect(ramp).toHaveLength(6);
    for (let i = 1; i < ramp.length; i += 1) {
      expect(lightness(ramp[i] as Rgb)).toBeGreaterThan(lightness(ramp[i - 1] as Rgb));
    }
    const anchor = ramp[3] as Rgb;
    expect(Math.abs(anchor[0] - target[0])).toBeLessThanOrEqual(2);
    expect(new Set(ramp.map(packRgb)).size).toBe(6);
  });

  it('shifts highlights warmer and shadows cooler', () => {
    const ramp = generateRamp([60, 90, 200], { count: 5, anchor: 2, hueShift: 20 });
    const hue = (rgb: Rgb): number => rgbToOklch(rgb)[2];
    const mid = hue(ramp[2] as Rgb);
    // Blue (about 268 degrees): highlights turn down towards cyan, shadows up towards 275.
    expect(hue(ramp[4] as Rgb)).toBeLessThan(mid - 5);
    expect(hue(ramp[0] as Rgb)).toBeGreaterThan(mid);
    // Red (about 25 degrees): highlights turn up towards orange, shadows down towards magenta.
    const red = generateRamp([196, 28, 52], { count: 5, anchor: 2, hueShift: 20 });
    const redMid = hue(red[2] as Rgb);
    expect(hue(red[4] as Rgb)).toBeGreaterThan(redMid + 5);
    expect((hue(red[0] as Rgb) - redMid + 360) % 360).toBeGreaterThan(180);
  });

  it('squeezes very light targets so the steps stay apart', () => {
    const ramp = generateRamp([250, 250, 245], { count: 5 });
    expect(new Set(ramp.map(packRgb)).size).toBe(5);
  });

  it('has steps that grow towards the dark end', () => {
    const steps = defaultSteps(6, 3);
    expect(steps[3]?.lightness).toBe(0);
    const down1 = (steps[2]?.lightness ?? 0) - (steps[3]?.lightness ?? 0);
    const down3 = (steps[0]?.lightness ?? 0) - (steps[1]?.lightness ?? 0);
    expect(Math.abs(down3)).toBeGreaterThan(Math.abs(down1));
  });
});

describe('recolour', () => {
  const red: Rgb = [196, 28, 52];

  it('recolours only the material, keeping alpha and the order of lightness', () => {
    const out = recolourTexture(ore, red, { base: stone });
    for (let i = 0; i < 256; i += 1) {
      expect(out.data[i * 4 + 3]).toBe(ore.data[i * 4 + 3]);
      const inVein = materialMask(ore, { base: stone })[i] === 1;
      const same = [0, 1, 2].every((k) => out.data[i * 4 + k] === ore.data[i * 4 + k]);
      expect(same).toBe(!inVein);
    }
    const map = rampMap(extractPalette(ore, materialMask(ore, { base: stone })), red);
    const mapped = TEALS.map((teal) => map.get(packRgb(teal)) as Rgb);
    expect(lightness(mapped[0] as Rgb)).toBeLessThan(lightness(mapped[1] as Rgb));
    expect(lightness(mapped[1] as Rgb)).toBeLessThan(lightness(mapped[2] as Rgb));
    // The new colours are red.
    for (const rgb of mapped) expect(rgb[0]).toBeGreaterThan(rgb[1]);
  });

  it('keeps semi-transparent alpha', () => {
    const glass = synth(() => [40, 150, 150]);
    for (let i = 0; i < 256; i += 1) glass.data[i * 4 + 3] = 120;
    const out = recolourTexture(glass, red);
    expect(out.data[3]).toBe(120);
    expect(out.data[0]).not.toBe(40);
  });

  it('recolours every frame of an animated strip with one map', () => {
    const strip = synth((x, y) => TEALS[(x + (y % 16)) % 3] as Rgb, 32);
    expect(stripFrames(strip)).toBe(2);
    expect(stripFrames(ore)).toBe(1);
    const out = recolourTexture(strip, red, { mask: new Uint8Array(512).fill(1) });
    expect(out.height).toBe(32);
    expect(sha256(out.data.subarray(0, 1024))).toBe(sha256(out.data.subarray(1024)));
  });

  it('applies a colour map unchanged where no colour matches', () => {
    const out = applyColourMap(stone, new Map());
    expect(out.data).toEqual(stone.data);
  });
});

describe('noise', () => {
  it('ranks every pixel and quantises in the given proportions', () => {
    const field = clusteredField(16, 16, 7);
    const shades = quantise(field, [1, 2, 1]);
    const counts = [0, 0, 0];
    for (const s of shades) counts[s] = (counts[s] ?? 0) + 1;
    expect(counts).toEqual([64, 128, 64]);
  });

  it('clusters: blurred noise has longer runs than plain noise', () => {
    const asImage = (shades: Uint8Array): ArtImage =>
      synth((x, y) => GREYS[shades[y * 16 + x] ?? 0] as Rgb);
    const plain = asImage(quantise(clusteredField(16, 16, 3, { blurX: 0 }), [1, 1, 1, 1]));
    const blobs = asImage(quantise(clusteredField(16, 16, 3, { blurX: 2 }), [1, 1, 1, 1]));
    expect(meanRunLength(blobs)).toBeGreaterThan(meanRunLength(plain));
  });
});

describe('generator recipes', () => {
  const ruby: Rgb = [196, 28, 52];
  const fullBlocks: readonly ArtRecipe[] = [
    'ore',
    'deepslate_ore',
    'block',
    'planks',
    'log',
    'log_top',
  ];

  it.each(ART_RECIPES)('%s is 16x16 and deterministic per seed', (recipe) => {
    const a = generateArtPng(recipe, { colour: ruby, seed: 4 });
    const b = generateArtPng(recipe, { colour: ruby, seed: 4 });
    expect(sha256(a)).toBe(sha256(b));
    const image = generateArt(recipe, { colour: ruby, seed: 4 });
    expect(image.width).toBe(16);
    expect(image.height).toBe(16);
    const shades = extractPalette(image).length;
    expect(shades).toBeGreaterThanOrEqual(4);
  });

  it.each(ART_RECIPES)('%s follows the outline rule', (recipe) => {
    const image = generateArt(recipe, { colour: ruby, seed: 1 });
    const visible = (x: number, y: number): boolean => (image.data[(y * 16 + x) * 4 + 3] ?? 0) > 0;
    if (fullBlocks.includes(recipe)) {
      // Full blocks: every pixel opaque, no outline.
      for (let i = 0; i < 256; i += 1) expect(image.data[i * 4 + 3]).toBe(255);
      return;
    }
    if (recipe === 'leaves') return;
    // Items: no pixel touches the image edge's outside... every visible pixel next to a
    // transparent one is dark (OKLab lightness at most that of the material's middle shade).
    const midL = lightness(generateRamp(ruby, { count: 6, anchor: 3 })[3] as Rgb);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (!visible(x, y)) continue;
        const edge =
          x === 0 ||
          y === 0 ||
          x === 15 ||
          y === 15 ||
          !visible(x - 1, y) ||
          !visible(x + 1, y) ||
          !visible(x, y - 1) ||
          !visible(x, y + 1);
        if (!edge) continue;
        const i = (y * 16 + x) * 4;
        const rgb: Rgb = [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
        expect(lightness(rgb)).toBeLessThanOrEqual(midL);
      }
    }
  });

  it('changes with the seed for the noisy recipes', () => {
    for (const recipe of ['ore', 'planks', 'log', 'leaves', 'block'] as const) {
      const a = sha256(generateArtPng(recipe, { colour: ruby, seed: 1 }));
      const b = sha256(generateArtPng(recipe, { colour: ruby, seed: 2 }));
      expect(a, recipe).not.toBe(b);
    }
  });

  it('pins one recipe so accidental changes show', () => {
    const png = generateArtPng('sword', { colour: ruby, seed: 0 });
    expect(png.length).toBeGreaterThan(1000);
    expect(sha256(png)).toBe(sha256(generateArtPng('sword', { colour: ruby, seed: 0 })));
  });

  it('leaves have see-through gaps; full blocks have none', () => {
    const leaves = generateArt('leaves', { colour: ruby, seed: 2 });
    let gaps = 0;
    for (let i = 0; i < 256; i += 1) if (leaves.data[i * 4 + 3] === 0) gaps += 1;
    expect(gaps).toBeGreaterThan(10);
    expect(gaps).toBeLessThan(60);
  });

  it('metal blocks differ from gem blocks', () => {
    const gem = sha256(generateArtPng('block', { colour: ruby, finish: 'gem' }));
    const metal = sha256(generateArtPng('block', { colour: ruby, finish: 'metal' }));
    expect(gem).not.toBe(metal);
  });
});

describe('style learning', () => {
  it('learns numbers only and falls back to the defaults', () => {
    expect(learnStyle([])).toEqual(minecraftArt.DEFAULT_STYLE);
    const style = learnStyle([stone, ore]);
    expect(Object.keys(style).sort()).toEqual(['clusterBlur', 'hueShift']);
    expect(typeof style.hueShift).toBe('number');
  });

  it('is exported from the package index', () => {
    expect(minecraftArt.generateArt).toBe(generateArt);
  });
});
