/**
 * Style numbers learned from the user's own textures (ADR 0092, Proposed). The generator of
 * approach B may tune itself from the client jar at run time, but it keeps only two numbers,
 * never pixels: how large the shade clusters are and how far a ramp's hue turns between its
 * darkest and lightest shade. Without textures it uses {@link DEFAULT_STYLE}.
 *
 * @packageDocumentation
 */

import { type ArtImage, hueDelta, packRgb, rgbToOklch } from './colour';
import { type ArtStyle, DEFAULT_STYLE } from './generator';
import { extractPalette } from './palette';

/**
 * The mean length of horizontal runs of one colour among visible pixels: about 1 for uniform
 * noise, 2 to 3 for vanilla-like clusters.
 */
export function meanRunLength(image: ArtImage): number {
  let runs = 0;
  let pixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      if ((image.data[i + 3] ?? 0) === 0) {
        previous = -1;
        continue;
      }
      const key = packRgb([image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0]);
      pixels += 1;
      if (key !== previous) runs += 1;
      previous = key;
    }
  }
  return runs === 0 ? 0 : pixels / runs;
}

/**
 * Half the hue turn, in degrees, between the darkest and the lightest colourful shade of
 * `image`, or `undefined` when it has fewer than three colourful shades.
 */
export function rampHueTurn(image: ArtImage): number | undefined {
  const shades = extractPalette(image)
    .map((entry) => rgbToOklch(entry.rgb))
    .filter((lch) => lch[1] >= 0.04);
  if (shades.length < 3) return undefined;
  const dark = shades[0] as readonly number[];
  const light = shades[shades.length - 1] as readonly number[];
  return Math.abs(hueDelta(dark[2] ?? 0, light[2] ?? 0)) / 2;
}

/**
 * Style numbers from `images` (16 by 16 block and item textures): the cluster blur from their
 * mean run length and the hue shift from the median of their ramps' hue turns, each clamped
 * to a safe range. Falls back to {@link DEFAULT_STYLE} for whatever cannot be measured.
 */
export function learnStyle(images: readonly ArtImage[]): ArtStyle {
  if (images.length === 0) return DEFAULT_STYLE;
  const run = images.reduce((sum, image) => sum + meanRunLength(image), 0) / images.length;
  const clusterBlur = run < 1.4 ? 0 : run < 2.4 ? 1 : 2;
  const turns = images
    .map(rampHueTurn)
    .filter((turn): turn is number => turn !== undefined)
    .sort((a, b) => a - b);
  const median = turns.length === 0 ? undefined : turns[Math.floor(turns.length / 2)];
  const hueShift =
    median === undefined ? DEFAULT_STYLE.hueShift : Math.max(4, Math.min(28, median));
  return { clusterBlur, hueShift: Math.round(hueShift) };
}
