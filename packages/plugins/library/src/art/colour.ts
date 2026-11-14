/**
 * Colour maths for the Minecraft-style art prototype (ADR 0092, Proposed): sRGB to OKLab and
 * OKLCh and back, with gamut mapping by chroma reduction, and a 16x16-friendly RGBA image type.
 * Pure, no Node APIs, so it also runs in the renderer.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';

/** An RGBA image, row-major, 4 bytes per pixel. */
export interface ArtImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** OKLab lightness (0–1) and the two opponent axes. */
export type Oklab = readonly [number, number, number];

/** OKLCh: lightness (0–1), chroma (0 to about 0.37) and hue in degrees (0–360). */
export type Oklch = readonly [number, number, number];

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
  const c = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** `rgb` in OKLab. */
export function rgbToOklab(rgb: Rgb): Oklab {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB (unclamped) of an OKLab colour. */
function oklabToLinear(lab: Oklab): [number, number, number] {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3;
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3;
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (linear: readonly number[]): boolean =>
  linear.every((value) => value >= -0.0005 && value <= 1.0005);

const toByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(fromLinear(Math.max(0, Math.min(1, value))))));

/** `lab` in sRGB, clipped. */
export function oklabToRgb(lab: Oklab): Rgb {
  const linear = oklabToLinear(lab);
  return [toByte(linear[0]), toByte(linear[1]), toByte(linear[2])];
}

/** `rgb` in OKLCh. */
export function rgbToOklch(rgb: Rgb): Oklch {
  const [l, a, b] = rgbToOklab(rgb);
  const c = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [l, c, h];
}

/**
 * `lch` in sRGB. Out-of-gamut colours keep their lightness and hue and lose chroma until they
 * fit (binary search), which keeps a ramp's steps even.
 */
export function oklchToRgb(lch: Oklch): Rgb {
  const l = Math.max(0, Math.min(1, lch[0]));
  const rad = (lch[2] * Math.PI) / 180;
  const lab = (c: number): Oklab => [l, c * Math.cos(rad), c * Math.sin(rad)];
  if (inGamut(oklabToLinear(lab(lch[1])))) return oklabToRgb(lab(lch[1]));
  let lo = 0;
  let hi = Math.max(0, lch[1]);
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinear(lab(mid)))) lo = mid;
    else hi = mid;
  }
  return oklabToRgb(lab(lo));
}

/** The OKLab distance between two colours (about 0.02 is a just-visible step). */
export function colourDistance(a: Rgb, b: Rgb): number {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The signed shortest turn from hue `from` to hue `to`, in degrees (-180 to 180). */
export function hueDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** `rgb` packed as one 24-bit number, for maps keyed by colour. */
export const packRgb = (rgb: Rgb): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

/** The colour of a {@link packRgb} number. */
export const unpackRgb = (value: number): Rgb => [
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
];

/** A blank (transparent) image. */
export function blankImage(width: number, height: number): ArtImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}
