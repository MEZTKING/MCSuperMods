/**
 * A small PNG reader for font sheets (B624): enough to find each glyph's opaque columns without a
 * canvas, so the widths are worked out the same way everywhere (the app, a worker, a test).
 * Non-interlaced pictures of every colour type and bit depth; an interlaced picture is refused
 * (the view then names the provider). Font sheets are small; a picture over
 * {@link MAX_FONT_SHEET_EDGE} on a side is refused too.
 *
 * @packageDocumentation
 */

import { unzlibSync } from 'fflate';

/** RGBA pixels, row by row. */
export interface RgbaPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The longest side of a font sheet read here. */
export const MAX_FONT_SHEET_EDGE = 4096;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function u32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) * 0x1000000 +
      (((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0))) >>>
    0
  );
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodes PNG bytes into RGBA pixels.
 *
 * @throws Error When the bytes are not a PNG this reader takes (the message says why).
 */
export function decodePng(bytes: Uint8Array): RgbaPixels {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG picture');
  }
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = -1;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const data: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = u32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (body.length !== length) throw new Error('a cut-off PNG picture');
    if (type === 'IHDR') {
      width = u32(body, 0);
      height = u32(body, 4);
      depth = body[8] ?? 0;
      colourType = body[9] ?? -1;
      interlace = body[12] ?? 0;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = CHANNELS[colourType];
  if (channels === undefined || width === 0 || height === 0) throw new Error('a broken PNG header');
  if (![1, 2, 4, 8, 16].includes(depth)) throw new Error('a PNG bit depth MSM cannot read');
  if (interlace !== 0) throw new Error('an interlaced PNG (save it without interlacing)');
  if (width > MAX_FONT_SHEET_EDGE || height > MAX_FONT_SHEET_EDGE) {
    throw new Error(`a picture over ${MAX_FONT_SHEET_EDGE} pixels on a side`);
  }
  if (colourType === 3 && palette === null) throw new Error('a palette PNG without its palette');

  let total = 0;
  for (const part of data) total += part.length;
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of data) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = unzlibSync(joined);
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const step = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < height * (stride + 1)) throw new Error('a cut-off PNG picture');

  // Undo the row filters in place.
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src + x] ?? 0;
      const left = x >= step ? (rows[dst + x - step] ?? 0) : 0;
      const up = y > 0 ? (rows[dst - stride + x] ?? 0) : 0;
      const corner = y > 0 && x >= step ? (rows[dst - stride + x - step] ?? 0) : 0;
      let out = value;
      if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else if (filter === 4) out = value + paeth(left, up, corner);
      else if (filter !== 0) throw new Error('a PNG row filter MSM cannot read');
      rows[dst + x] = out & 0xff;
    }
  }

  const sample = (y: number, index: number): number => {
    const row = y * stride;
    if (depth === 8) return rows[row + index] ?? 0;
    if (depth === 16) return rows[row + index * 2] ?? 0;
    const bit = index * depth;
    const byte = rows[row + (bit >> 3)] ?? 0;
    const shift = 8 - depth - (bit & 7);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const toByte = (value: number): number =>
    depth >= 8 ? value : Math.round((value * 255) / ((1 << depth) - 1));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      if (colourType === 3) {
        const index = sample(y, x);
        out[p] = palette?.[index * 3] ?? 0;
        out[p + 1] = palette?.[index * 3 + 1] ?? 0;
        out[p + 2] = palette?.[index * 3 + 2] ?? 0;
        out[p + 3] =
          transparency !== null && index < transparency.length ? (transparency[index] ?? 255) : 255;
        continue;
      }
      const base = x * channels;
      if (colourType === 0 || colourType === 4) {
        const grey = toByte(sample(y, base));
        out[p] = grey;
        out[p + 1] = grey;
        out[p + 2] = grey;
        out[p + 3] = colourType === 4 ? toByte(sample(y, base + 1)) : 255;
        if (colourType === 0 && transparency !== null && transparency.length >= 2) {
          const key = ((transparency[0] ?? 0) << 8) | (transparency[1] ?? 0);
          const rawGrey =
            depth === 16
              ? (rows[y * stride + base * 2] ?? 0) * 256 + (rows[y * stride + base * 2 + 1] ?? 0)
              : sample(y, base);
          if (rawGrey === key) out[p + 3] = 0;
        }
      } else {
        out[p] = toByte(sample(y, base));
        out[p + 1] = toByte(sample(y, base + 1));
        out[p + 2] = toByte(sample(y, base + 2));
        out[p + 3] = colourType === 6 ? toByte(sample(y, base + 3)) : 255;
      }
    }
  }
  return { width, height, data: out };
}
