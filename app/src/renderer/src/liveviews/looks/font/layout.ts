/**
 * Font layout (ADR 0121 D6; B620 interface, B624 builds it). The bitmap rule of the B619 spike
 * (3S7), measured in the game on MSM's own glyph sheets: advance = round((rightmost opaque column
 * + 1) x height / cell height) + 1, so an empty cell advances 1; a character no provider of the
 * font has draws the missing glyph, which advances 6. A line's width is the sum of its advances
 * rounded up (a space advance of 12.5 makes 13).
 */

import type { UnihexGlyph } from './unihex';

/** A bitmap provider as its JSON names it, with its picture's opaque extents per cell. */
export interface BitmapProvider {
  height: number;
  ascent: number;
  chars: readonly string[];
  /**
   * For each code point the provider has, the rightmost opaque column of its cell plus one (0
   * for an empty cell); absent where the provider does not have it.
   */
  widths: ReadonlyMap<number, number>;
  cellHeight: number;
}

/** The advance of a missing glyph. */
export const MISSING_ADVANCE = 6;

/** A line's height in GUI pixels, and where its baseline is. */
export const LINE_HEIGHT = 9;
export const BASELINE = 7;

/** The advance of a code point in a bitmap provider; the missing glyph's when it has none. */
export function advance(provider: BitmapProvider, codePoint: number): number {
  const width = provider.widths.get(codePoint);
  if (width === undefined) return MISSING_ADVANCE;
  return bitmapAdvance(width, provider.height, provider.cellHeight);
}

/** The bitmap rule: `round(width x height / cell height) + 1` (halves round up, as the game's). */
export function bitmapAdvance(width: number, height: number, cellHeight: number): number {
  return Math.floor(0.5 + (width * height) / cellHeight) + 1;
}

/** How one glyph of a line is drawn. */
export type GlyphDraw =
  | { readonly kind: 'bitmap'; readonly column: number; readonly row: number }
  | { readonly kind: 'space' }
  | { readonly kind: 'ttf'; readonly text: string }
  | { readonly kind: 'unihex'; readonly glyph: UnihexGlyph }
  | { readonly kind: 'missing' };

/** What a provider answers for a code point it has. */
export interface FoundGlyph {
  readonly advance: number;
  readonly draw: GlyphDraw;
  /** The index of the provider (in the font's flattened list) that has it. */
  readonly provider: number;
}

/** One glyph placed on the line. */
export interface PlacedGlyph extends FoundGlyph {
  readonly text: string;
  readonly codePoint: number;
  /** Its left edge in GUI pixels. */
  readonly x: number;
}

/** A laid-out line. */
export interface LineLayout {
  readonly glyphs: readonly PlacedGlyph[];
  /** The line's width in GUI pixels: the advances' sum rounded up. */
  readonly width: number;
  /** The characters no provider has, each once, in the order typed. */
  readonly missing: readonly string[];
}

/** Lays out `text`: each character from the first provider that has it, else the missing glyph. */
export function layoutLine(
  text: string,
  find: (codePoint: number, text: string) => FoundGlyph | null,
): LineLayout {
  const glyphs: PlacedGlyph[] = [];
  const missing: string[] = [];
  let x = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const found = find(codePoint, char);
    const glyph: FoundGlyph = found ?? {
      advance: MISSING_ADVANCE,
      draw: { kind: 'missing' },
      provider: -1,
    };
    if (found === null && !missing.includes(char)) missing.push(char);
    glyphs.push({ ...glyph, text: char, codePoint, x });
    x += glyph.advance;
  }
  return { glyphs, width: Math.ceil(x - 1e-9), missing };
}

/** `U+4E2D` for a character. */
export function codePointName(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}
