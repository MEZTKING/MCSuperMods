/**
 * Deterministic placeholder textures for starters and examples (ADR 0020, D3): 16x16 block
 * and item patterns, and a 64x64 two-tone checker for entity models.
 *
 * Every pixel comes from integer maths: no randomness, no Minecraft texture is read or
 * copied, and the work is original (CC0). The PNG encoder is self-contained and writes
 * stored (uncompressed) deflate blocks, so the bytes are identical on every machine, which
 * lets tests and the `examples/` mirror pin them. Ported from
 * `fixtures/sample-resourcepack/tools/make-textures.mjs`, without Node APIs so it also runs
 * in the renderer.
 *
 * @packageDocumentation
 */

/** Texture edge length in pixels. */
export const PLACEHOLDER_SIZE = 16;

/** An opaque colour as `[red, green, blue]`, each 0–255. */
export type Rgb = readonly [number, number, number];

/**
 * The placeholder patterns:
 * - `plain`: a flat colour with a one-pixel bevel;
 * - `ore`: coloured specks on grey stone (block texture);
 * - `gem`: a cut gem on a transparent background (item texture);
 * - `disc`: a music disc with a coloured label (item texture);
 * - `egg`: a speckled spawn egg on a transparent background (item texture).
 */
export type PlaceholderPattern = 'plain' | 'ore' | 'gem' | 'disc' | 'egg';

/** Every pattern, in documentation order. */
export const PLACEHOLDER_PATTERNS: readonly PlaceholderPattern[] = Object.freeze([
  'plain',
  'ore',
  'gem',
  'disc',
  'egg',
]);

/** Options for {@link placeholderPng}. */
export interface PlaceholderOptions {
  /** The main colour; defaults to {@link DEFAULT_COLOUR}. */
  colour?: Rgb;
}

/** Ruby red, the default placeholder colour. */
export const DEFAULT_COLOUR: Rgb = Object.freeze([196, 28, 52]) as Rgb;

type Rgba = readonly [number, number, number, number];

const CLEAR: Rgba = [0, 0, 0, 0];

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** `colour` scaled towards black (`factor` < 1) or mixed towards white (`factor` > 1). */
function shade(colour: Rgb, factor: number): Rgba {
  const channel = (value: number): number =>
    factor <= 1 ? clamp(value * factor) : clamp(value + (255 - value) * (factor - 1));
  return [channel(colour[0]), channel(colour[1]), channel(colour[2]), 255];
}

interface Palette {
  dark: Rgba;
  deep: Rgba;
  mid: Rgba;
  light: Rgba;
  shine: Rgba;
}

function paletteOf(colour: Rgb): Palette {
  return {
    dark: shade(colour, 0.47),
    deep: shade(colour, 0.71),
    mid: shade(colour, 1),
    light: shade(colour, 1.3),
    shine: shade(colour, 1.75),
  };
}

/** A small integer hash of a pixel position, stable across platforms. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

type Pixel = (x: number, y: number) => Rgba;

function plain(palette: Palette): Pixel {
  const last = PLACEHOLDER_SIZE - 1;
  return (x, y) => {
    if (x === 0 || y === 0) return palette.light;
    if (x === last || y === last) return palette.deep;
    return palette.mid;
  };
}

const STONE: readonly Rgba[] = [
  [104, 104, 104, 255],
  [120, 120, 120, 255],
  [128, 128, 128, 255],
  [142, 142, 142, 255],
];

/** Speck centres of the ore pattern; each speck is a plus of up to five pixels. */
const SPECKS: readonly (readonly [number, number])[] = [
  [3, 3],
  [11, 2],
  [7, 7],
  [2, 11],
  [12, 10],
  [8, 13],
];

function ore(palette: Palette): Pixel {
  return (x, y) => {
    for (const [cx, cy] of SPECKS) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return palette.light;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        return dx < 0 || dy < 0 ? palette.mid : palette.dark;
      }
    }
    return STONE[hash(x, y, 7) % STONE.length] as Rgba;
  };
}

function gem(palette: Palette): Pixel {
  const cx = 7.5;
  const top = 3;
  const bottom = 13;
  return (x, y) => {
    if (y < top || y > bottom) return CLEAR;
    // Crown: rows 3-6 widen; pavilion: rows 7-13 narrow to a point.
    const half = y <= 6 ? 2 + (y - top) : 5 - Math.floor(((y - 6) * 5) / 7);
    const dx = Math.abs(x - cx);
    if (dx > half) return CLEAR;
    if (dx > half - 1 || y === top) return palette.dark;
    if (y <= 6) {
      if ((x === 5 || x === 6) && y === 4) return palette.shine;
      return y === 6 ? palette.mid : palette.light;
    }
    return x < cx ? palette.mid : palette.deep;
  };
}

const VINYL: Rgba = [28, 28, 32, 255];
const VINYL_GROOVE: Rgba = [48, 48, 56, 255];
const VINYL_EDGE: Rgba = [12, 12, 14, 255];

function disc(palette: Palette): Pixel {
  const c = 7.5;
  return (x, y) => {
    const d2 = (x - c) * (x - c) + (y - c) * (y - c);
    if (d2 > 7.5 * 7.5) return CLEAR;
    if (d2 > 6.6 * 6.6) return VINYL_EDGE;
    if (d2 <= 0.75 * 0.75) return CLEAR;
    if (d2 <= 2.6 * 2.6) return x + y < 15 ? palette.light : palette.mid;
    if (d2 <= 3.4 * 3.4) return palette.dark;
    if (d2 > 4.9 * 4.9 && d2 <= 5.6 * 5.6) return VINYL_GROOVE;
    return VINYL;
  };
}

/** Spot centres of the egg pattern. */
const EGG_SPOTS: readonly (readonly [number, number])[] = [
  [6, 5],
  [9, 8],
  [5, 10],
  [9, 12],
];

function egg(palette: Palette): Pixel {
  const cx = 7.5;
  const cy = 8;
  const inside = (x: number, y: number): boolean => {
    // A little narrower at the top, like an egg.
    const rx = y < cy ? 4.6 : 5.4;
    return ((x - cx) / rx) ** 2 + ((y - cy) / 6.4) ** 2 <= 1;
  };
  return (x, y) => {
    if (!inside(x, y)) return CLEAR;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
      return palette.dark;
    }
    for (const [sx, sy] of EGG_SPOTS) {
      if (Math.abs(x - sx) + Math.abs(y - sy) <= 1) return palette.deep;
    }
    if (x < cx - 1 && y < cy - 2) return palette.shine;
    return palette.light;
  };
}

const PATTERNS: Readonly<Record<PlaceholderPattern, (palette: Palette) => Pixel>> = {
  plain,
  ore,
  gem,
  disc,
  egg,
};

/**
 * The RGBA pixels (row-major, 4 bytes each) of a placeholder pattern.
 *
 * @param pattern - The pattern to draw.
 * @param options - The main colour.
 */
export function placeholderPixels(
  pattern: PlaceholderPattern,
  options: PlaceholderOptions = {},
): Uint8Array {
  const draw = PATTERNS[pattern];
  if (draw === undefined) throw new Error(`Unknown placeholder pattern ${String(pattern)}.`);
  const pixel = draw(paletteOf(options.colour ?? DEFAULT_COLOUR));
  const rgba = new Uint8Array(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE * 4);
  for (let y = 0; y < PLACEHOLDER_SIZE; y += 1) {
    for (let x = 0; x < PLACEHOLDER_SIZE; x += 1) {
      rgba.set(pixel(x, y), (y * PLACEHOLDER_SIZE + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable 16x16 RGBA PNG of a placeholder pattern.
 *
 * @param pattern - The pattern to draw.
 * @param options - The main colour.
 */
export function placeholderPng(
  pattern: PlaceholderPattern,
  options: PlaceholderOptions = {},
): Uint8Array {
  return encodePng(placeholderPixels(pattern, options), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
}

// Entity skins ----------------------------------------------------------------------------

/** Edge length of the entity skin placeholder, matching the 64x64 model templates. */
export const PLACEHOLDER_SKIN_SIZE = 64;

/** Side of one checker cell of the skin placeholder, in pixels. */
const SKIN_CELL = 4;

/**
 * The RGBA pixels of a 64x64 entity skin placeholder: a two-tone checker of 4-pixel cells
 * (the colour and a darker shade), fully opaque, so a model preview shows how each cube's
 * faces map onto the texture.
 *
 * @param options - The main colour.
 */
export function placeholderSkinPixels(options: PlaceholderOptions = {}): Uint8Array {
  const palette = paletteOf(options.colour ?? DEFAULT_COLOUR);
  const size = PLACEHOLDER_SKIN_SIZE;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const odd = (Math.floor(x / SKIN_CELL) + Math.floor(y / SKIN_CELL)) % 2 === 1;
      rgba.set(odd ? palette.dark : palette.light, (y * size + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable 64x64 RGBA PNG of the entity skin placeholder.
 *
 * @param options - The main colour.
 */
export function placeholderSkinPng(options: PlaceholderOptions = {}): Uint8Array {
  return encodePng(placeholderSkinPixels(options), PLACEHOLDER_SKIN_SIZE, PLACEHOLDER_SKIN_SIZE);
}

// PNG encoding ----------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

function chunk(type: string, data: readonly number[]): number[] {
  const body = Uint8Array.from([...Array.from(type, (char) => char.charCodeAt(0)), ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** A zlib stream of stored deflate blocks (each at most 65535 bytes). */
function zlibStored(raw: Uint8Array): number[] {
  const out: number[] = [0x78, 0x01];
  for (let offset = 0; ; offset += 65535) {
    const block = raw.subarray(offset, offset + 65535);
    const last = offset + 65535 >= raw.length ? 1 : 0;
    out.push(last, block.length & 0xff, block.length >>> 8);
    out.push(~block.length & 0xff, (~block.length >>> 8) & 0xff);
    for (const byte of block) out.push(byte);
    if (last === 1) break;
  }
  out.push(...u32(adler32(raw)));
  return out;
}

/**
 * Encodes RGBA pixels as an 8-bit RGBA PNG with stored deflate blocks (no compression), so
 * the output is byte-stable.
 *
 * @param rgba - Row-major pixels, 4 bytes each; length `width * height * 4`.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @throws Error If `rgba` has the wrong length.
 */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}.`);
  }
  const stride = 1 + width * 4;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const ihdr = [...u32(width), ...u32(height), 8, 6, 0, 0, 0]; // 8-bit RGBA
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', []),
  ]);
}
