/**
 * The clean-up of AI pictures (ADR 0093 D4): turns any picture into a Minecraft-style texture.
 * Pure, so it runs in Node tests. Steps:
 *
 * 1. Items and tools: the background goes, by the picture's own alpha when it has some, else by
 *    a flood from the edges over the corners' colour ({@link removeBackground} of Picture to
 *    texture, ADR 0048).
 * 2. Items and tools are cropped to their content and fitted, proportions kept, into the
 *    texture (one pixel short of each edge when an outline is drawn); blocks take the largest
 *    centred square.
 * 3. Downscaling averages each target pixel's area (alpha-weighted), or takes the commonest
 *    colour of the area for pictures that are already pixel art; never a bilinear blur.
 * 4. The colours are quantised per hue cluster to a ramp of N shades (default 6) from the drawn
 *    art's `generateRamp` (ADR 0092 D15), with the drawn art's hue shift: cooler in the
 *    shadows, warmer in the light, as vanilla's ramps are, so AI and drawn pictures share one
 *    palette rule. Each pixel keeps its rank in its cluster, so a darker pixel never becomes
 *    lighter than a lighter one: the picture's light (the prompts ask for the top left) is
 *    never inverted.
 * 5. Items and tools may get a one-pixel dark outline outside the shape.
 *
 * @packageDocumentation
 */

import { minecraftArt } from '@msm/plugin-library';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import { addOutline, fitRect, removeBackground } from '../texture-editor/image-convert';
import type { Rgba, RgbaImage } from '../texture-editor/pixels';

/** The shades per hue cluster unless told otherwise. */
export const DEFAULT_SHADES = 6;

/** The most hue clusters (besides the greys). */
export const MAX_HUE_CLUSTERS = 3;

/** Options of {@link cleanUpPicture}. */
export interface CleanUpOptions {
  /** The texture's edge in pixels (16 or 32). */
  size: number;
  style: AiPictureStyle;
  /** Shades per hue cluster (default {@link DEFAULT_SHADES}). */
  shades?: number;
  /** A one-pixel dark outline (default: on for items and tools). */
  outline?: boolean;
}

/** The whole pipeline. Does not change `image`. */
export function cleanUpPicture(image: RgbaImage, options: CleanUpOptions): RgbaImage {
  const size = Math.max(1, Math.round(options.size));
  const shades = Math.max(2, Math.round(options.shades ?? DEFAULT_SHADES));
  const working: RgbaImage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
  if (options.style === 'block') {
    const square = fitRect(working.width, working.height, 1);
    const cropped = crop(working, square);
    for (let at = 3; at < cropped.data.length; at += 4) cropped.data[at] = 255;
    const scaled = downscale(cropped, size, size);
    quantise(scaled, shades);
    return scaled;
  }
  removeItemBackground(working);
  const box = contentBox(working);
  const outline = options.outline ?? true;
  if (box === null) {
    return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  }
  const content = crop(working, box);
  const inner = Math.max(1, outline && size > 4 ? size - 2 : size);
  const scale = Math.min(inner / content.width, inner / content.height);
  const w = Math.max(1, Math.min(inner, Math.round(content.width * scale)));
  const h = Math.max(1, Math.min(inner, Math.round(content.height * scale)));
  const scaled = downscale(content, w, h);
  const out: RgbaImage = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y += 1) {
    out.data.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * size + ox) * 4);
  }
  hardenAlpha(out);
  const ramps = quantise(out, shades);
  if (outline) addOutline(out, outlineColour(ramps));
  return out;
}

// Background and crop ------------------------------------------------------------------------

/** The share of pixels that must already be clear for the picture's alpha to count. */
const ALPHA_SHARE = 0.02;

/** Removes an item's background: by its own alpha when it has one, else by an edge flood. */
export function removeItemBackground(image: RgbaImage): void {
  let clear = 0;
  for (let at = 3; at < image.data.length; at += 4) if ((image.data[at] ?? 0) < 16) clear += 1;
  if (clear >= ALPHA_SHARE * image.width * image.height) return;
  removeBackground(image, 48);
}

/** The bounding box of pixels at least half opaque, or `null` when there are none. */
export function contentBox(
  image: RgbaImage,
): { x: number; y: number; width: number; height: number } | null {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) < 128) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(
  image: RgbaImage,
  rect: { x: number; y: number; width: number; height: number },
): RgbaImage {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

function hardenAlpha(image: RgbaImage): void {
  for (let at = 3; at < image.data.length; at += 4) {
    image.data[at] = (image.data[at] ?? 0) < 128 ? 0 : 255;
  }
}

// Downscaling --------------------------------------------------------------------------------

/** The most distinct colours a picture may have to count as pixel art (scaled by mode). */
export const PIXEL_ART_COLOURS = 96;

/** Whether `image` has few enough colours to be pixel art already. */
export function looksLikePixelArt(image: RgbaImage): boolean {
  const seen = new Set<number>();
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) < 128) continue;
    seen.add(
      ((image.data[at] ?? 0) << 16) | ((image.data[at + 1] ?? 0) << 8) | (image.data[at + 2] ?? 0),
    );
    if (seen.size > PIXEL_ART_COLOURS) return false;
  }
  return true;
}

/**
 * `image` scaled down to `width` by `height`: the commonest colour of each area for pixel art
 * (`mode`), else the alpha-weighted mean of the area (`area`). Never blurs across areas.
 */
export function downscale(
  image: RgbaImage,
  width: number,
  height: number,
  mode: 'auto' | 'area' | 'mode' = 'auto',
): RgbaImage {
  const useMode = mode === 'mode' || (mode === 'auto' && looksLikePixelArt(image));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * sx);
      const y0 = Math.floor(y * sy);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil((x + 1) * sx)));
      const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil((y + 1) * sy)));
      const at = (y * width + x) * 4;
      if (useMode) {
        const counts = new Map<number, number>();
        let clear = 0;
        let best = -1;
        let bestCount = 0;
        for (let py = y0; py < y1; py += 1) {
          for (let px = x0; px < x1; px += 1) {
            const from = (py * image.width + px) * 4;
            if ((image.data[from + 3] ?? 0) < 128) {
              clear += 1;
              continue;
            }
            const key =
              ((image.data[from] ?? 0) << 16) |
              ((image.data[from + 1] ?? 0) << 8) |
              (image.data[from + 2] ?? 0);
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            if (count > bestCount) {
              best = key;
              bestCount = count;
            }
          }
        }
        if (best >= 0 && bestCount >= clear) {
          data.set([(best >> 16) & 255, (best >> 8) & 255, best & 255, 255], at);
        }
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const from = (py * image.width + px) * 4;
          const alpha = image.data[from + 3] ?? 0;
          r += (image.data[from] ?? 0) * alpha;
          g += (image.data[from + 1] ?? 0) * alpha;
          b += (image.data[from + 2] ?? 0) * alpha;
          a += alpha;
          count += 1;
        }
      }
      if (a > 0) data.set([r / a, g / a, b / a, a / count], at);
    }
  }
  return { width, height, data };
}

// Colour ------------------------------------------------------------------------------------

/** Hue (0 to 360), saturation and lightness (0 to 1) of an RGB colour. */
export function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

/** The RGB colour of hue, saturation and lightness. */
export function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** The signed shortest turn from hue `a` to hue `b` (-180 to 180). */
function hueTurn(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** Moves `hue` towards `target` by at most `amount` degrees. */
function hueToward(hue: number, target: number, amount: number): number {
  const turn = hueTurn(hue, target);
  return hue + Math.sign(turn) * Math.min(Math.abs(turn), amount);
}

/** Below this saturation a pixel counts as grey. */
const GREY_SATURATION = 0.12;

/** How far (degrees) the outline turns towards blue. */
const HUE_SHIFT = 14;

/** The most shades `generateRamp` draws in one ramp. */
const MAX_RAMP_SHADES = 8;

/** One quantised ramp, darkest first. */
export interface Ramp {
  hue: number;
  colours: Rgba[];
  /** How many pixels use it. */
  weight: number;
}

/** The hue clusters' centres: the strongest twelfths of the colour wheel, merged when near. */
function clusterHues(hues: readonly number[]): number[] {
  if (hues.length === 0) return [];
  const bins = new Array<number>(12).fill(0);
  for (const hue of hues)
    bins[Math.floor(hue / 30) % 12] = (bins[Math.floor(hue / 30) % 12] ?? 0) + 1;
  const order = bins
    .map((count, index) => ({ count, index }))
    .filter((entry) => entry.count >= Math.max(1, hues.length * 0.08))
    .sort((a, b) => b.count - a.count);
  const centres: number[] = [];
  for (const { index } of order) {
    if (centres.length >= MAX_HUE_CLUSTERS) break;
    // The mean hue of the pixels in this twelfth.
    let x = 0;
    let y = 0;
    for (const hue of hues) {
      if (Math.floor(hue / 30) % 12 !== index) continue;
      x += Math.cos((hue * Math.PI) / 180);
      y += Math.sin((hue * Math.PI) / 180);
    }
    const mean = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    if (centres.every((centre) => Math.abs(hueTurn(centre, mean)) > 40)) centres.push(mean);
  }
  return centres.length === 0 ? [hues[0] as number] : centres;
}

/**
 * Quantises the visible pixels in place: each pixel joins the nearest hue cluster (or the
 * greys), each cluster is split by lightness rank into at most `shades` equal groups (8 at
 * most), and each group takes the shade of its rank in a `generateRamp` ramp of the cluster's
 * colour, anchored on the middle group's lightness: darkest group, darkest shade. Returns the
 * ramps.
 */
export function quantise(image: RgbaImage, shades: number = DEFAULT_SHADES): Ramp[] {
  const pixels: { at: number; h: number; s: number; l: number }[] = [];
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) === 0) continue;
    const [h, s, l] = toHsl(image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0);
    pixels.push({ at, h, s, l });
  }
  if (pixels.length === 0) return [];
  const centres = clusterHues(pixels.filter((p) => p.s >= GREY_SATURATION).map((p) => p.h));
  const groups = new Map<number, typeof pixels>();
  for (const pixel of pixels) {
    let cluster = -1;
    if (pixel.s >= GREY_SATURATION) {
      let best = Number.POSITIVE_INFINITY;
      centres.forEach((centre, index) => {
        const distance = Math.abs(hueTurn(centre, pixel.h));
        if (distance < best) {
          best = distance;
          cluster = index;
        }
      });
    }
    const list = groups.get(cluster) ?? [];
    list.push(pixel);
    groups.set(cluster, list);
  }
  const ramps: Ramp[] = [];
  for (const [cluster, members] of groups) {
    members.sort((a, b) => a.l - b.l);
    const grey = cluster < 0;
    let x = 0;
    let y = 0;
    let saturation = 0;
    for (const member of members) {
      x += Math.cos((member.h * Math.PI) / 180) * member.s;
      y += Math.sin((member.h * Math.PI) / 180) * member.s;
      saturation += member.s;
    }
    const hue = grey
      ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
      : (centres[cluster] as number);
    const meanSaturation = saturation / members.length;
    const count = Math.min(shades, MAX_RAMP_SHADES, members.length);
    const bounds = (level: number) => ({
      from: Math.floor((level * members.length) / count),
      to: Math.floor(((level + 1) * members.length) / count),
    });
    // The ramp's anchor: the cluster's hue and saturation at the middle group's lightness.
    const anchor = Math.floor((count - 1) / 2);
    const middle = bounds(anchor);
    let anchorLight = 0;
    for (let index = middle.from; index < middle.to; index += 1) {
      anchorLight += members[index]?.l ?? 0;
    }
    anchorLight /= Math.max(1, middle.to - middle.from);
    const anchorColour = fromHsl(hue, meanSaturation, anchorLight);
    const shadesOf =
      count === 1
        ? [anchorColour]
        : minecraftArt.generateRamp(anchorColour, {
            count,
            anchor,
            hueShift: minecraftArt.ART_HUE_SHIFT,
          });
    const colours: Rgba[] = [];
    for (let level = 0; level < count; level += 1) {
      const [r, g, b] = shadesOf[level] ?? anchorColour;
      colours.push([r, g, b, 255]);
      const { from, to } = bounds(level);
      for (let index = from; index < to; index += 1) {
        const member = members[index];
        if (member !== undefined) image.data.set([r, g, b], member.at);
      }
    }
    ramps.push({ hue, colours, weight: members.length });
  }
  ramps.sort((a, b) => b.weight - a.weight);
  return ramps;
}

/** The outline: the main ramp's darkest colour, darker still. */
export function outlineColour(ramps: readonly Ramp[]): Rgba {
  const darkest = ramps[0]?.colours[0];
  if (darkest === undefined) return [24, 20, 28, 255];
  const [h, s, l] = toHsl(darkest[0], darkest[1], darkest[2]);
  const [r, g, b] = fromHsl(hueToward(h, 240, HUE_SHIFT), Math.min(1, s), Math.min(l * 0.45, 0.12));
  return [r, g, b, 255];
}

/** The number of distinct visible colours (tests and the dialog's note). */
export function countColours(image: RgbaImage): number {
  const seen = new Set<number>();
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) === 0) continue;
    seen.add(
      ((image.data[at] ?? 0) << 16) | ((image.data[at + 1] ?? 0) << 8) | (image.data[at + 2] ?? 0),
    );
  }
  return seen.size;
}
