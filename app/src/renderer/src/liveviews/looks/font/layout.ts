/**
 * Font layout (ADR 0121 D5; B620 interface, B624 builds it). The bitmap rule of the B619 spike
 * (3S7): advance = round((rightmost opaque column + 1) x height / cell height) + 1; a missing
 * glyph advances 6.
 */

/** A bitmap provider as its JSON names it, with its picture's opaque extents per cell. */
export interface BitmapProvider {
  height: number;
  ascent: number;
  chars: readonly string[];
  /** For each code point, the rightmost opaque column plus one; absent where the cell is empty. */
  widths: ReadonlyMap<number, number>;
  cellHeight: number;
}

/** The advance of a missing glyph. */
export const MISSING_ADVANCE = 6;

/** The advance of a code point in a bitmap provider; the missing glyph's when it has none. */
export function advance(provider: BitmapProvider, codePoint: number): number {
  const width = provider.widths.get(codePoint);
  if (width === undefined) return MISSING_ADVANCE;
  return Math.round((width * provider.height) / provider.cellHeight) + 1;
}
