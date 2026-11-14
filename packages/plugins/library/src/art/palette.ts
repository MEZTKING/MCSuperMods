/**
 * Palette extraction for approach A of ADR 0092 (Proposed): the colours of a texture ordered
 * by lightness into ramps, and the split between a texture's material (an ore's gem, a tool's
 * head) and its base (the stone around it, the wooden grip). Works on any RGBA image; at run
 * time the images are the user's own textures from their client jar, never bundled ones.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { type ArtImage, colourDistance, type Oklab, packRgb, rgbToOklab } from './colour';

/** One colour of a texture: how many pixels use it and where it sits in OKLab. */
export interface PaletteEntry {
  readonly rgb: Rgb;
  readonly count: number;
  readonly lab: Oklab;
}

/** The OKLab distance within which a colour counts as one of the base texture's colours. */
export const BASE_DIFFERENCE = 0.02;

/**
 * The distinct visible colours (alpha above 0) of `image`, darkest first (by OKLab lightness,
 * then by packed value for a stable order). With `mask`, only pixels whose mask byte is not 0.
 */
export function extractPalette(image: ArtImage, mask?: Uint8Array): PaletteEntry[] {
  const counts = new Map<number, number>();
  const pixels = image.width * image.height;
  for (let i = 0; i < pixels; i += 1) {
    if ((image.data[i * 4 + 3] ?? 0) === 0) continue;
    if (mask !== undefined && (mask[i] ?? 0) === 0) continue;
    const key = packRgb([
      image.data[i * 4] ?? 0,
      image.data[i * 4 + 1] ?? 0,
      image.data[i * 4 + 2] ?? 0,
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts].map(([key, count]): PaletteEntry => {
    const rgb: Rgb = [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff];
    return { rgb, count, lab: rgbToOklab(rgb) };
  });
  return entries.sort((a, b) => a.lab[0] - b.lab[0] || packRgb(a.rgb) - packRgb(b.rgb));
}

const chromaOf = (lab: Oklab): number => Math.hypot(lab[1], lab[2]);

/** Options for {@link materialMask}. */
export interface MaterialMaskOptions {
  /**
   * The base texture the material sits on (stone for an ore, the same tool in another material
   * for a tool's head): pixels whose colour is not within {@link BASE_DIFFERENCE} of one of the
   * base's colours are the material. Colours, not positions, are compared, because vanilla's
   * ores do not reuse the stone texture pixel for pixel. Without a base the colours are split
   * into two clusters and the more colourful one is the material.
   */
  readonly base?: ArtImage;
  /** The difference threshold for `base`; defaults to {@link BASE_DIFFERENCE}. */
  readonly threshold?: number;
}

/**
 * A byte per pixel, 1 where `image` shows the material and 0 elsewhere (and on transparent
 * pixels). With no base and colours too alike to split (the two clusters' chroma within 0.03),
 * every visible pixel is material.
 */
export function materialMask(image: ArtImage, options: MaterialMaskOptions = {}): Uint8Array {
  const pixels = image.width * image.height;
  const mask = new Uint8Array(pixels);
  const rgbAt = (img: ArtImage, i: number): Rgb => [
    img.data[i * 4] ?? 0,
    img.data[i * 4 + 1] ?? 0,
    img.data[i * 4 + 2] ?? 0,
  ];
  const base = options.base;
  if (base !== undefined) {
    const threshold = options.threshold ?? BASE_DIFFERENCE;
    const baseColours = extractPalette(base).map((entry) => entry.rgb);
    const known = new Map<number, boolean>();
    for (let i = 0; i < pixels; i += 1) {
      if ((image.data[i * 4 + 3] ?? 0) === 0) continue;
      const rgb = rgbAt(image, i);
      const key = packRgb(rgb);
      let isBase = known.get(key);
      if (isBase === undefined) {
        isBase = baseColours.some((colour) => colourDistance(colour, rgb) <= threshold);
        known.set(key, isBase);
      }
      mask[i] = isBase ? 0 : 1;
    }
    return mask;
  }
  const palette = extractPalette(image);
  const material = materialColours(palette);
  for (let i = 0; i < pixels; i += 1) {
    if ((image.data[i * 4 + 3] ?? 0) === 0) continue;
    mask[i] = material.has(packRgb(rgbAt(image, i))) ? 1 : 0;
  }
  return mask;
}

/**
 * The packed colours of the more colourful of two clusters (k-means on the OKLab colour axes,
 * weighted by pixel count, ten rounds from the greyest and the most colourful entry). A
 * near-grey highlight inside a coloured cluster stays with it when it is closer in hue.
 */
export function materialColours(palette: readonly PaletteEntry[]): Set<number> {
  const all = new Set(palette.map((entry) => packRgb(entry.rgb)));
  if (palette.length < 2) return all;
  const byChroma = [...palette].sort((a, b) => chromaOf(a.lab) - chromaOf(b.lab));
  const first = byChroma[0] as PaletteEntry;
  const last = byChroma[byChroma.length - 1] as PaletteEntry;
  let centres: [[number, number], [number, number]] = [
    [first.lab[1], first.lab[2]],
    [last.lab[1], last.lab[2]],
  ];
  let assign: number[] = [];
  for (let round = 0; round < 10; round += 1) {
    assign = palette.map((entry) => {
      const d0 = Math.hypot(entry.lab[1] - centres[0][0], entry.lab[2] - centres[0][1]);
      const d1 = Math.hypot(entry.lab[1] - centres[1][0], entry.lab[2] - centres[1][1]);
      return d1 < d0 ? 1 : 0;
    });
    const sums = [
      [0, 0, 0],
      [0, 0, 0],
    ] as [number, number, number][];
    palette.forEach((entry, i) => {
      const s = sums[assign[i] ?? 0] as [number, number, number];
      s[0] += entry.lab[1] * entry.count;
      s[1] += entry.lab[2] * entry.count;
      s[2] += entry.count;
    });
    centres = sums.map((s, k) =>
      s[2] > 0 ? [s[0] / s[2], s[1] / s[2]] : (centres[k] as [number, number]),
    ) as [[number, number], [number, number]];
  }
  const chroma0 = Math.hypot(centres[0][0], centres[0][1]);
  const chroma1 = Math.hypot(centres[1][0], centres[1][1]);
  if (Math.abs(chroma0 - chroma1) < 0.03) return all;
  const pick = chroma1 > chroma0 ? 1 : 0;
  return new Set(palette.filter((_, i) => assign[i] === pick).map((entry) => packRgb(entry.rgb)));
}

/** A texture's colours split into its material ramp and its base ramp, both darkest first. */
export interface TextureRamps {
  readonly material: PaletteEntry[];
  readonly base: PaletteEntry[];
}

/** The material and base ramps of `image` (see {@link materialMask}). */
export function textureRamps(image: ArtImage, options: MaterialMaskOptions = {}): TextureRamps {
  const mask = materialMask(image, options);
  const inverse = mask.map((value, i) => (value === 0 && (image.data[i * 4 + 3] ?? 0) > 0 ? 1 : 0));
  return { material: extractPalette(image, mask), base: extractPalette(image, inverse) };
}
