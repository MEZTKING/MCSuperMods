/**
 * A small painter for the vanilla parity pictures (B459): shade maps drawn on hue-shifted ramps
 * ({@link generateRamp}), light from the top left and clustered noise ({@link clusteredField}),
 * as ADR 0092's art rules say. Everything here is MSM's own: no pixel is copied or traced from a
 * Minecraft texture. Output depends only on the arguments.
 *
 * @packageDocumentation
 */

import { oklchToRgb, rgbToOklch } from '../../art/colour';
import { renderSprite } from '../../art/generator';
import { clusteredField, hashSeed } from '../../art/noise';
import { generateRamp } from '../../art/ramp';
import type { Silhouette } from '../../art/sprites';
import { encodePng, type Rgb } from '../png';

/** A ramp of shades, darkest first. */
export type Ramp = readonly Rgb[];

/** An RGBA picture being painted. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  /** Paints one pixel; outside the picture nothing happens. */
  set(x: number, y: number, rgb: Rgb, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = rgb[0];
    this.data[i + 1] = rgb[1];
    this.data[i + 2] = rgb[2];
    this.data[i + 3] = alpha;
  }

  /** Whether the pixel is painted. */
  painted(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return (this.data[(y * this.width + x) * 4 + 3] ?? 0) > 0;
  }

  /** The picture as a byte-stable PNG. */
  png(): Uint8Array {
    return encodePng(this.data, this.width, this.height);
  }
}

/** A ramp of `count` shades around `colour` (the anchor is `colour` itself). */
export function rampOf(colour: Rgb, count = 5, anchor = Math.floor((count - 1) / 2)): Ramp {
  return generateRamp(colour, { count, anchor });
}

/** The shade at `index` of `ramp`, clamped. */
export function shade(ramp: Ramp, index: number): Rgb {
  return ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(index)))] as Rgb;
}

/** `from` moved towards `to` by `amount` (0 to 1), channel by channel. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) =>
    Math.round((from[index] ?? 0) + ((to[index] ?? 0) - (from[index] ?? 0)) * amount),
  ) as unknown as Rgb;
}

/** `colour` lighter (positive) or darker (negative) by `amount` in OKLCh lightness. */
export function lighten(colour: Rgb, amount: number): Rgb {
  const [l, c, h] = rgbToOklch(colour);
  return oklchToRgb([Math.max(0.05, Math.min(0.98, l + amount)), c, h]);
}

/** A field of ranks in [0, 1] with blobs of about two pixels; `wrap` for tiling blocks. */
export function noise(
  width: number,
  height: number,
  ...seed: readonly (string | number)[]
): Float64Array {
  return clusteredField(width, height, hashSeed(...seed), { blurX: 1 });
}

/**
 * An item picture from a 16 by 16 silhouette, drawn by the art generator's sprite renderer:
 * `M` (and `0` to `5`, `*`) on the ramp of `material`, every other letter on the ramp of its
 * colour in `parts`; outlines and light from the top left are added.
 */
export function spritePng(
  rows: Silhouette,
  material: Rgb,
  parts: Readonly<Record<string, Rgb>>,
  ...seed: readonly (string | number)[]
): Uint8Array {
  const ramp = generateRamp(material, { count: 6, anchor: 3 });
  const [l, c, h] = rgbToOklch(ramp[5] as Rgb);
  const shine = oklchToRgb([Math.min(0.97, l + 0.16), c * 0.35, h]);
  const partRamps: Record<string, Ramp> = {};
  for (const [part, colour] of Object.entries(parts)) {
    partRamps[part] = generateRamp(colour, { count: 4, anchor: 2 });
  }
  const image = renderSprite(rows, { material: ramp, shine, parts: partRamps }, hashSeed(...seed));
  return encodePng(image.data, image.width, image.height);
}
