/**
 * B624: unihex fonts. A zip of MSM's own `.hex` lines (no unifont file) read by the font
 * worker's host in this thread; the client reads the zip only when the worker does not hold it.
 */

import { describe, expect, it } from 'vitest';
import {
  readUnihexZip,
  unihexGlyph,
} from '../../../../../src/renderer/src/liveviews/looks/font/unihex';
import { UnihexClient } from '../../../../../src/renderer/src/liveviews/looks/font/unihex-client';
import { DOT, hexZip, hostWorker, WIDE } from './fixtures';

describe('unihex fonts (B624)', () => {
  it('reads every .hex file of a zip', () => {
    const glyphs = readUnihexZip(hexZip());
    expect([...glyphs.keys()].sort((a, b) => a - b)).toEqual([0x41, 0x4e2d]);
  });

  it('works out each glyph’s columns and advance, and honours size overrides', () => {
    const wide = unihexGlyph(0x4e2d, WIDE);
    expect([wide.columns, wide.left, wide.right, wide.advance]).toEqual([16, 1, 15, 8]);
    const dot = unihexGlyph(0x41, DOT);
    expect([dot.columns, dot.left, dot.right, dot.advance]).toEqual([8, 2, 3, 1.5]);
    const over = unihexGlyph(0x41, DOT, [{ from: 0x40, to: 0x42, left: 0, right: 8 }]);
    expect([over.left, over.right, over.advance]).toEqual([0, 8, 5]);
  });

  it('answers only the asked glyphs, and keeps the last zip so typing does not read it again', async () => {
    let reads = 0;
    const client = new UnihexClient(hostWorker);
    const read = async () => {
      reads += 1;
      return hexZip();
    };
    const first = await client.glyphs('minecraft:font/test.zip', read, [0x4e2d, 0x5a]);
    expect(first?.ok && [...first.glyphs.keys()]).toEqual([0x4e2d]);
    const second = await client.glyphs('minecraft:font/test.zip', read, [0x41]);
    expect(second?.ok && [...second.glyphs.keys()]).toEqual([0x41]);
    expect(reads).toBe(1);
    expect(client.sent).toBe(1);
    expect(await client.glyphs('demo:font/none.zip', async () => null, [0x41])).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(
      await client.glyphs('demo:font/bad.zip', async () => new Uint8Array([1, 2]), [0x41]),
    ).toEqual({ ok: false, reason: 'unreadable' });
    client.dispose();
  });
});
