/**
 * RGBA pixel work for B628's looks (paintings, banners and shields, trims, pots): read a picture
 * (B624's PNG reader), lay one picture over another with a tint, cut a part out and write the
 * result as a PNG for the geo renderer and the flat pictures. Pure: no canvas, so the same code
 * runs in the app and in the tests, and every colour the views claim is worked out here.
 *
 * Pictures come from the project or the user's own jar at runtime; nothing here writes them
 * anywhere but into `data:` URLs and the renderer's texture.
 *
 * @packageDocumentation
 */

import { zlibSync } from 'fflate';
import { decodePng } from '../font/png';

/** RGBA pixels, row by row. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** A colour without alpha. */
export type Rgb = readonly [number, number, number];

/** A texel rectangle: u, v, width, height. */
export type Rect = readonly [number, number, number, number];

/** A clear picture. */
export function blankPixels(width: number, height: number): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** The pixels of PNG bytes, or `null` when they are not a picture MSM can read. */
export function readPixels(bytes: Uint8Array | null | undefined): Pixels | null {
  if (bytes === null || bytes === undefined || bytes.length === 0) return null;
  try {
    return decodePng(bytes);
  } catch {
    return null;
  }
}

/** `#rrggbb` (or `rrggbb`) as a colour, or `null`. */
export function hexToRgb(hex: string | undefined): Rgb | null {
  if (hex === undefined) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** A colour as `#rrggbb`. */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** The RGBA of one pixel (clear outside the picture). */
export function pixelAt(picture: Pixels, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) return [0, 0, 0, 0];
  const at = (y * picture.width + x) * 4;
  const d = picture.data;
  return [d[at] ?? 0, d[at + 1] ?? 0, d[at + 2] ?? 0, d[at + 3] ?? 0];
}

/** Sets one pixel. */
export function setPixel(
  picture: Pixels,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) return;
  picture.data.set(rgba, (y * picture.width + x) * 4);
}

/** Fills a rectangle with one colour (replacing what was there). */
export function fillRect(
  picture: Pixels,
  [u, v, w, h]: Rect,
  rgba: readonly [number, number, number, number],
): void {
  for (let y = v; y < v + h; y += 1)
    for (let x = u; x < u + w; x += 1) setPixel(picture, x, y, rgba);
}

/**
 * Lays `source` over `target` with its top left at (`dx`, `dy`): each pixel's colour multiplied
 * by `tint` (the game's tint: colour times tint, alpha kept), then blended by its alpha over
 * what is below (3S6: each banner layer is pattern times dye, alpha-blended in order). A source
 * larger than the target is cut at the edge.
 */
export function drawOver(
  target: Pixels,
  source: Pixels,
  options: { dx?: number; dy?: number; tint?: Rgb | null } = {},
): void {
  const { dx = 0, dy = 0, tint = null } = options;
  const t = target.data;
  const s = source.data;
  for (let y = 0; y < source.height; y += 1) {
    const ty = y + dy;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x += 1) {
      const tx = x + dx;
      if (tx < 0 || tx >= target.width) continue;
      const from = (y * source.width + x) * 4;
      const alpha = (s[from + 3] ?? 0) / 255;
      if (alpha === 0) continue;
      const to = (ty * target.width + tx) * 4;
      const below = (t[to + 3] ?? 0) / 255;
      const outAlpha = alpha + below * (1 - alpha);
      for (let c = 0; c < 3; c += 1) {
        const top = ((s[from + c] ?? 0) * (tint === null ? 255 : (tint[c] ?? 255))) / 255;
        const under = t[to + c] ?? 0;
        t[to + c] = Math.round((top * alpha + under * below * (1 - alpha)) / outAlpha);
      }
      t[to + 3] = Math.round(outAlpha * 255);
    }
  }
}

/** A copy of a rectangle of a picture. */
export function cropPixels(picture: Pixels, [u, v, w, h]: Rect): Pixels {
  const out = blankPixels(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) setPixel(out, x, y, pixelAt(picture, u + x, v + y));
  }
  return out;
}

/** A copy of a picture scaled to `width` by `height` (nearest pixel, as the game samples). */
export function scalePixels(picture: Pixels, width: number, height: number): Pixels {
  const out = blankPixels(width, height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(picture.height - 1, Math.floor((y * picture.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(picture.width - 1, Math.floor((x * picture.width) / width));
      setPixel(out, x, y, pixelAt(picture, sx, sy));
    }
  }
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** The picture as PNG bytes (8-bit RGBA, no filters). */
export function encodePng(picture: Pixels): Uint8Array {
  const { width, height, data } = picture;
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A short hash of a picture's pixels, so the renderer reloads a texture only when it changed. */
export function pixelsKey(picture: Pixels): string {
  let hash = 0x811c9dc5;
  for (const byte of picture.data) hash = Math.imul(hash ^ byte, 0x01000193);
  return `${picture.width}x${picture.height}_${(hash >>> 0).toString(36)}`;
}
