/**
 * B624: the font view's widths against the game. B619 (3S7) measured MSM's own fonts in the
 * game with `Font.width` on both targets (`docs/reference/spikes/b619/results/client-*.json`,
 * `fonts.widths`); the view's bitmap, space and reference providers must give the same widths
 * for the same files, which is why they claim "As in the game, checked".
 */

import { readFileSync } from 'node:fs';
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { glyphFinder } from '../../../../../src/renderer/src/liveviews/looks/font/FontView';
import {
  advance,
  bitmapAdvance,
  LINE_HEIGHT,
  layoutLine,
  MISSING_ADVANCE,
} from '../../../../../src/renderer/src/liveviews/looks/font/layout';
import { decodePng } from '../../../../../src/renderer/src/liveviews/looks/font/png';
import {
  passesFilter,
  resolveFont,
} from '../../../../../src/renderer/src/liveviews/looks/font/providers';
import { pngOf, readerOf, SPIKE_FONTS, spikeSheet } from './fixtures';

type Widths = Record<string, Record<string, number> | number>;

function measured(file: string): Widths {
  const url = new URL(
    `../../../../../../docs/reference/spikes/b619/results/${file}`,
    import.meta.url,
  );
  return (JSON.parse(readFileSync(url, 'utf8')) as { 'fonts.widths': Widths })['fonts.widths'];
}

const readProject = readerOf({ 'assets/msm_b619/textures/font/glyphs.png': spikeSheet() });

async function widthOf(fontId: string, text: string): Promise<number> {
  const font = await resolveFont(SPIKE_FONTS[fontId] as never, fontId, {
    projectFont: (id) => SPIKE_FONTS[id] ?? null,
    readProject,
    loadTtf: async () => null,
  });
  expect(font.entries.every((entry) => entry.problem === null)).toBe(true);
  return layoutLine(text, glyphFinder(font.entries, new Map())).width;
}

describe('font widths as the game measured them (B619 3S7)', () => {
  for (const file of ['client-26.3.json', 'client-26.4-rerun.json']) {
    it(`bitmap, space and reference fonts on ${file}`, async () => {
      const widths = measured(file);
      expect(widths.lineHeight).toBe(LINE_HEIGHT);
      const fonts = Object.keys(SPIKE_FONTS);
      expect(fonts.every((id) => typeof widths[id] === 'object')).toBe(true);
      for (const id of fonts) {
        for (const [text, width] of Object.entries(widths[id] as Record<string, number>)) {
          expect(await widthOf(id, text), `${id} "${text}"`).toBe(width);
        }
      }
    });
  }

  it('keeps B620’s advance with the rule, halves up and an empty cell 1', () => {
    const provider = {
      height: 4,
      ascent: 3,
      chars: ['AB'],
      widths: new Map([
        [65, 5],
        [66, 0],
      ]),
      cellHeight: 8,
    };
    expect(advance(provider, 65)).toBe(4);
    expect(advance(provider, 66)).toBe(1);
    expect(advance(provider, 67)).toBe(MISSING_ADVANCE);
    expect(bitmapAdvance(8, 16, 8)).toBe(17);
  });

  it('applies filters with the game’s default options', () => {
    expect(passesFilter(undefined)).toBe(true);
    expect(passesFilter({ uniform: false })).toBe(true);
    expect(passesFilter({ uniform: true })).toBe(false);
    expect(passesFilter({ jp: true })).toBe(false);
  });
});

describe('the font sheet reader', () => {
  it('reads the RGBA sheet', () => {
    const sheet = decodePng(spikeSheet());
    expect([sheet.width, sheet.height]).toEqual([32, 16]);
    // A's top-left texel is opaque, D's cell is empty.
    expect(sheet.data[3]).toBe(255);
    expect(sheet.data[(0 * 32 + 24) * 4 + 3]).toBe(0);
  });

  it('reads a palette picture with transparency and 2-bit indexes, filters included', () => {
    // 4 by 2, indexes 0..3 then 3..0, row filters Sub and Up.
    const rows = new Uint8Array([1, 0b00011011, 2, (0b11100100 - 0b00011011) & 0xff]);
    const png = pngOf(4, 2, 2, 3, zlibSync(rows), [
      ['PLTE', new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9])],
      ['tRNS', new Uint8Array([0])],
    ]);
    const sheet = decodePng(png);
    expect(Array.from(sheet.data.subarray(0, 8))).toEqual([255, 0, 0, 0, 0, 255, 0, 255]);
    // Second row: index 3 first (grey, opaque).
    expect(Array.from(sheet.data.subarray(16, 20))).toEqual([9, 9, 9, 255]);
  });

  it('refuses what is not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
  });
});
