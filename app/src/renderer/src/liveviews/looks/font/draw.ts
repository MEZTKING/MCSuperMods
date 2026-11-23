/**
 * Draws a laid-out line on a 2D canvas at a GUI scale (B624): bitmap glyphs from their sheet's
 * cell, scaled to the provider's height with no smoothing; unihex glyphs dot by dot at half size;
 * TrueType glyphs with the browser's own text drawing; the missing glyph as a marked box (the
 * game's is a plain 5 by 8 box; the view draws it in the warning colour so it stands out).
 *
 * @packageDocumentation
 */

import { BASELINE, LINE_HEIGHT, type LineLayout } from './layout';
import type { BitmapReady, ProviderEntry } from './providers';
import { UNIHEX_ROWS, unihexBit } from './unihex';

/** Room around the line, in GUI pixels. */
export const LINE_PAD = 2;

/** The colour of text, and of the marked missing glyph. */
export const TEXT_COLOUR = '#ffffff';
export const MISSING_COLOUR = '#ff5555';

/** The part of a 2D context the drawing uses (a fake records it in tests). */
export interface LineContext {
  imageSmoothingEnabled: boolean;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/** The canvas size of a line at a scale, in device pixels. */
export function lineCanvasSize(width: number, scale: number): { width: number; height: number } {
  return {
    width: (Math.max(0, width) + LINE_PAD * 2) * scale,
    height: (LINE_HEIGHT + LINE_PAD * 2) * scale,
  };
}

/** Draws `layout` at `scale`; `sheetOf` gives a bitmap provider's picture as an image source. */
export function drawLine(
  context: LineContext,
  layout: LineLayout,
  entries: readonly ProviderEntry[],
  scale: number,
  sheetOf: (ready: BitmapReady) => CanvasImageSource | null,
): void {
  const size = lineCanvasSize(layout.width, scale);
  context.clearRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = false;
  const left = LINE_PAD * scale;
  const top = LINE_PAD * scale;
  for (const glyph of layout.glyphs) {
    const x = left + glyph.x * scale;
    const ready = entries[glyph.provider]?.ready ?? null;
    switch (glyph.draw.kind) {
      case 'space':
        break;
      case 'missing':
        context.fillStyle = 'rgba(255, 85, 85, 0.35)';
        context.fillRect(x, top, 5 * scale, 8 * scale);
        context.strokeStyle = MISSING_COLOUR;
        context.lineWidth = scale;
        context.strokeRect(x + scale / 2, top + scale / 2, 4 * scale, 7 * scale);
        break;
      case 'bitmap': {
        if (ready?.type !== 'bitmap') break;
        const sheet = sheetOf(ready);
        if (sheet === null) break;
        const factor = ready.height / ready.cellHeight;
        context.drawImage(
          sheet,
          glyph.draw.column * ready.cellWidth,
          glyph.draw.row * ready.cellHeight,
          ready.cellWidth,
          ready.cellHeight,
          x,
          top + (BASELINE - ready.ascent) * scale,
          ready.cellWidth * factor * scale,
          ready.height * scale,
        );
        break;
      }
      case 'unihex': {
        const { glyph: hex } = glyph.draw;
        context.fillStyle = TEXT_COLOUR;
        const dot = scale / 2;
        for (let row = 0; row < UNIHEX_ROWS; row += 1) {
          for (let column = hex.left; column < hex.right; column += 1) {
            if (!unihexBit(hex.hex, hex.columns, column, row)) continue;
            context.fillRect(x + (column - hex.left) * dot, top + row * dot, dot, dot);
          }
        }
        break;
      }
      case 'ttf': {
        if (ready?.type !== 'ttf') break;
        context.fillStyle = TEXT_COLOUR;
        context.textBaseline = 'alphabetic';
        context.font = `${ready.size * scale}px "${ready.family}"`;
        context.fillText(
          glyph.draw.text,
          x + ready.shift[0] * scale,
          top + (BASELINE + ready.shift[1]) * scale,
        );
        break;
      }
    }
  }
}
