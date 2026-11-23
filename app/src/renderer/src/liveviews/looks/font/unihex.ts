/**
 * `unihex` fonts (B624; B619 3S7): a zip of `.hex` files, one glyph a line
 * (`<code point>:<hex rows>`), 16 rows of 8, 16, 24 or 32 columns. Reading the whole of
 * Minecraft's `unifont.zip` takes about 250 ms, so it runs in the font worker
 * (`unihex.worker.ts`) and only when a font names a `unihex` provider; this module is the pure
 * part the worker calls (and the tests).
 *
 * Widths are about right: B619 measured one wide glyph only (中, 9).
 *
 * @packageDocumentation
 */

import { unzipSync } from 'fflate';

/** The glyph rows of a hex file: code point to its hex digits (16 rows). */
export type HexGlyphs = Map<number, string>;

/** Rows in a unihex glyph. */
export const UNIHEX_ROWS = 16;

/** Reads every `.hex` file in a zip. */
export function readUnihexZip(zip: Uint8Array): HexGlyphs {
  const files = unzipSync(zip, { filter: (file) => file.name.endsWith('.hex') });
  const glyphs: HexGlyphs = new Map();
  const decoder = new TextDecoder();
  for (const name of Object.keys(files).sort()) {
    const bytes = files[name];
    if (bytes !== undefined) parseHexInto(decoder.decode(bytes), glyphs);
  }
  return glyphs;
}

/** Adds the glyphs of one `.hex` file's text to `glyphs` (later lines win). */
export function parseHexInto(text: string, glyphs: HexGlyphs): void {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const colon = text.indexOf(':', start);
    if (colon !== -1 && colon < end) {
      const codePoint = Number.parseInt(text.slice(start, colon), 16);
      const hex = text.slice(colon + 1, end).trim();
      if (Number.isFinite(codePoint) && [32, 64, 96, 128].includes(hex.length)) {
        glyphs.set(codePoint, hex);
      }
    }
    start = end + 1;
  }
}

/** A unihex glyph ready to draw. */
export interface UnihexGlyph {
  /** Columns in the glyph's rows (8, 16, 24 or 32). */
  readonly columns: number;
  /** The hex digits of its 16 rows. */
  readonly hex: string;
  /** The first column drawn. */
  readonly left: number;
  /** One past the last column drawn. */
  readonly right: number;
  /** Its advance in GUI pixels (drawn at half size: 16 rows are 8 pixels). */
  readonly advance: number;
}

/** A `size_overrides` entry: the columns used for a range of code points. */
export interface SizeOverride {
  readonly from: number;
  readonly to: number;
  readonly left: number;
  readonly right: number;
}

/** Whether column `x` of row `y` is set. */
export function unihexBit(hex: string, columns: number, x: number, y: number): boolean {
  const digitsPerRow = columns / 4;
  const digit = Number.parseInt(hex.charAt(y * digitsPerRow + (x >> 2)), 16);
  return Number.isFinite(digit) && ((digit >> (3 - (x & 3))) & 1) === 1;
}

/**
 * A glyph from its hex digits: the drawn columns run from the first set column to one past the
 * last (a size override replaces both), and the advance is half their count plus one.
 */
export function unihexGlyph(
  codePoint: number,
  hex: string,
  overrides: readonly SizeOverride[] = [],
): UnihexGlyph {
  const columns = (hex.length * 4) / UNIHEX_ROWS;
  let left = columns;
  let right = 0;
  for (let y = 0; y < UNIHEX_ROWS; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!unihexBit(hex, columns, x, y)) continue;
      if (x < left) left = x;
      if (x + 1 > right) right = x + 1;
    }
  }
  if (right === 0) left = 0;
  for (const override of overrides) {
    if (codePoint >= override.from && codePoint <= override.to) {
      left = override.left;
      right = override.right;
      break;
    }
  }
  return { columns, hex, left, right, advance: Math.max(0, right - left) / 2 + 1 };
}

/** The hex rows of `codePoints` that a glyph table holds (what the worker answers). */
export function pickGlyphs(
  glyphs: HexGlyphs,
  codePoints: readonly number[],
): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  for (const codePoint of new Set(codePoints)) {
    const hex = glyphs.get(codePoint);
    if (hex !== undefined) out.push([codePoint, hex]);
  }
  return out;
}

/** A message to the font worker: the glyphs of `codePoints` in the zip known as `file`. */
export interface UnihexRequest {
  readonly token: number;
  /** Which zip (its source and key); the worker keeps the last one read. */
  readonly file: string;
  /** The zip's bytes, or `null` when the worker said it holds `file`. */
  readonly bytes: Uint8Array | null;
  readonly codePoints: readonly number[];
}

/** The worker's answer. */
export type UnihexAnswer =
  | {
      readonly token: number;
      readonly ok: true;
      readonly file: string;
      readonly glyphs: ReadonlyArray<readonly [number, string]>;
    }
  | { readonly token: number; readonly ok: false; readonly file: string; readonly error: string };

/**
 * The worker's state and answer: keeps the glyph table of the last zip read, in memory only
 * (never written anywhere), so typing does not read the zip again.
 */
export function createUnihexHost(): (request: UnihexRequest) => UnihexAnswer {
  let held: { file: string; glyphs: HexGlyphs } | null = null;
  return (request) => {
    try {
      if (held === null || held.file !== request.file) {
        if (request.bytes === null) {
          return { token: request.token, ok: false, file: request.file, error: 'not_held' };
        }
        held = { file: request.file, glyphs: readUnihexZip(request.bytes) };
      }
      return {
        token: request.token,
        ok: true,
        file: request.file,
        glyphs: pickGlyphs(held.glyphs, request.codePoints),
      };
    } catch {
      return { token: request.token, ok: false, file: request.file, error: 'unreadable' };
    }
  };
}
