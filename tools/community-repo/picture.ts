/**
 * The picture of a community example: one of the project's own textures, enlarged without
 * smoothing so its pixels stay sharp, or a drawn placeholder when the project has no texture.
 * The PNG reader handles the 8-bit, non-interlaced pictures MSM writes; anything else is used
 * as it is.
 *
 * @packageDocumentation
 */

import { inflateSync } from 'node:zlib';
import { artPng, encodePng } from '@msm/plugin-library';

/** The longest side the enlarged picture aims for, in pixels. */
export const PICTURE_SIZE = 128;

/** A decoded RGBA picture. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u32 = (bytes: Uint8Array, at: number): number =>
  (((bytes[at] as number) << 24) |
    ((bytes[at + 1] as number) << 16) |
    ((bytes[at + 2] as number) << 8) |
    (bytes[at + 3] as number)) >>>
  0;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodes an 8-bit, non-interlaced PNG (grey, grey with alpha, RGB, RGBA or palette) to RGBA,
 * or returns `null` for anything else.
 */
export function decodePng(bytes: Uint8Array): Rgba | null {
  if (bytes.length < 33 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  let at = 8;
  let width = 0;
  let height = 0;
  let colourType = -1;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = u32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = u32(body, 0);
      height = u32(body, 4);
      const depth = body[8];
      colourType = body[9] ?? -1;
      if (depth !== 8 || body[12] !== 0) return null;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType];
  if (channels === undefined || width === 0 || height === 0) return null;
  if (colourType === 3 && palette === undefined) return null;
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] as number;
      const left = x >= channels ? (pixels[y * stride + x - channels] as number) : 0;
      const up = y > 0 ? (pixels[(y - 1) * stride + x] as number) : 0;
      const corner =
        x >= channels && y > 0 ? (pixels[(y - 1) * stride + x - channels] as number) : 0;
      let out: number;
      if (filter === 0) out = value;
      else if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else if (filter === 4) out = value + paeth(left, up, corner);
      else return null;
      pixels[y * stride + x] = out & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const from = index * channels;
    const to = index * 4;
    if (colourType === 6) data.set(pixels.subarray(from, from + 4), to);
    else if (colourType === 2) {
      data.set(pixels.subarray(from, from + 3), to);
      data[to + 3] = 255;
    } else if (colourType === 0 || colourType === 4) {
      const grey = pixels[from] as number;
      data.set([grey, grey, grey, colourType === 4 ? (pixels[from + 1] as number) : 255], to);
    } else {
      const entry = pixels[from] as number;
      const p = palette as Uint8Array;
      data.set(
        [
          p[entry * 3] ?? 0,
          p[entry * 3 + 1] ?? 0,
          p[entry * 3 + 2] ?? 0,
          transparency?.[entry] ?? 255,
        ],
        to,
      );
    }
  }
  return { width, height, data };
}

/**
 * The picture enlarged by a whole number so its longer side is at most {@link PICTURE_SIZE}
 * (at least once). A tall strip of animation frames (height a multiple of the width) keeps
 * only its first frame.
 */
export function enlarge(picture: Rgba): Rgba {
  const frameHeight =
    picture.height > picture.width && picture.height % picture.width === 0
      ? picture.width
      : picture.height;
  const scale = Math.max(1, Math.floor(PICTURE_SIZE / Math.max(picture.width, frameHeight)));
  const width = picture.width * scale;
  const height = frameHeight * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / scale) * picture.width + Math.floor(x / scale)) * 4;
      data.set(picture.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** Whether a picture has any pixel that is not fully transparent. */
function visible(picture: Rgba): boolean {
  for (let index = 3; index < picture.data.length; index += 4) {
    if ((picture.data[index] as number) > 0) return true;
  }
  return false;
}

/**
 * The order textures are tried in: item pictures, then block pictures, then any other
 * texture, then any other PNG; by path within each group.
 */
export function pictureRank(path: string): number {
  if (/^assets\/[^/]+\/textures\/item\//.test(path)) return 0;
  if (/^assets\/[^/]+\/textures\/block\//.test(path)) return 1;
  if (/^assets\/[^/]+\/textures\//.test(path)) return 2;
  return 3;
}

/**
 * The picture of an example: the first of its PNG assets (in {@link pictureRank} order) that
 * decodes and is not empty, enlarged; else that file as it is; else a drawn placeholder (a
 * green leafy block for a world or worldgen project, a blue gem otherwise).
 *
 * @param pngs - The project's `.png` files by path.
 * @param world - Whether the project is a world or worldgen project.
 */
export function examplePicture(pngs: ReadonlyMap<string, Uint8Array>, world: boolean): Uint8Array {
  const paths = [...pngs.keys()].sort((a, b) => {
    const rank = pictureRank(a) - pictureRank(b);
    return rank !== 0 ? rank : a < b ? -1 : a > b ? 1 : 0;
  });
  let fallback: Uint8Array | undefined;
  for (const path of paths) {
    const bytes = pngs.get(path) as Uint8Array;
    fallback ??= bytes;
    const decoded = decodePng(bytes);
    if (decoded === null || !visible(decoded)) continue;
    const big = enlarge(decoded);
    return encodePng(big.data, big.width, big.height);
  }
  if (fallback !== undefined) return fallback;
  const drawn = decodePng(
    world ? artPng('leaves', { colour: [76, 138, 44] }) : artPng('gem', { colour: [64, 160, 200] }),
  ) as Rgba;
  const big = enlarge(drawn);
  return encodePng(big.data, big.width, big.height);
}
