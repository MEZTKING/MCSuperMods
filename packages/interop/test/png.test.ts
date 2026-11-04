import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PngFormatError, readPngHeader } from '../src/index';
import { makePng } from './helpers/synthetic-jar';

describe('readPngHeader', () => {
  it('reads the generated PNG', () => {
    expect(readPngHeader(makePng(2, 2))).toEqual({
      width: 2,
      height: 2,
      bitDepth: 8,
      colorType: 6,
    });
    expect(readPngHeader(makePng(16, 32))).toMatchObject({ width: 16, height: 32 });
  });

  it('reads a PNG inside a larger buffer', () => {
    const png = makePng(4, 3);
    const padded = new Uint8Array(png.length + 7);
    padded.set(png, 7);
    expect(readPngHeader(padded.subarray(7))).toMatchObject({ width: 4, height: 3 });
  });

  it('rejects non-PNG bytes', () => {
    expect(() => readPngHeader(strToU8('{"not":"a png at all, but long enough"}'))).toThrow(
      PngFormatError,
    );
    expect(() => readPngHeader(new Uint8Array())).toThrow(PngFormatError);
  });

  it('rejects a corrupt IHDR', () => {
    const png = makePng(2, 2);
    png[17] = 0xff; // width changes, CRC no longer matches
    expect(() => readPngHeader(png)).toThrow(/checksum/);
  });

  it('rejects a first chunk that is not IHDR', () => {
    const png = makePng(2, 2);
    png[12] = 0x58; // 'X'
    expect(() => readPngHeader(png)).toThrow(PngFormatError);
  });
});
