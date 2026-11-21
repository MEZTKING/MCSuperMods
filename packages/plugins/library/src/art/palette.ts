/**
 * Palette helpers for the pixel rules' tests (ADR 0092 D6, D13): the distinct colours of a
 * picture, darkest first, and how many there are. They work on any RGBA image, MSM's own.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { type ArtImage, type Oklab, packRgb, rgbToOklab } from './colour';

/** One colour of a picture: how many pixels use it and where it sits in OKLab. */
export interface PaletteEntry {
  readonly rgb: Rgb;
  readonly count: number;
  readonly lab: Oklab;
}

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

/** The number of distinct visible colours of `image` (with `mask`, of the masked pixels). */
export function colourCount(image: ArtImage, mask?: Uint8Array): number {
  return extractPalette(image, mask).length;
}
