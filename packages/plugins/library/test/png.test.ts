import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  encodePng,
  PLACEHOLDER_PATTERNS,
  PLACEHOLDER_SIZE,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
} from '../src/index';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Splits a PNG into chunks, checking the signature and every CRC. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  const buffer = Buffer.from(png);
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: { type: string; data: Uint8Array }[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    out.push({ type, data });
    offset += 12 + length;
  }
  expect(offset).toBe(buffer.length);
  return out;
}

/** Decodes the RGBA pixels of a filter-0 PNG written by {@link encodePng}. */
function decode(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const parts = chunks(png);
  expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  const ihdr = Buffer.from((parts[0] as { data: Uint8Array }).data);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const raw = inflateSync((parts[1] as { data: Uint8Array }).data);
  const stride = 1 + width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * stride]).toBe(0);
    rgba.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
  }
  return { width, height, rgba };
}

/** SHA-256 of each pattern in the default colour. Change only with intent: goldens pin them. */
const PINNED: Record<PlaceholderPattern, string> = {
  plain: 'e2563b46f1e0fdeb9573b858679df99709fbc72c7b85af99151d55ea6cf1a9aa',
  ore: '1ac06b1c99f1e7dc187b47b4851ad9700f5fc8711417bf63ff07d47b14a89215',
  gem: '875d1b156d354c2310f5167f3fa6803eea063b38adc7b35d501a1882e5482c28',
  disc: 'a8c7d397e6b78ba544c7657e79cb03363ace66f202c081bf5619edb3acfb0b95',
};

describe('placeholder textures', () => {
  it('has four patterns', () => {
    expect(PLACEHOLDER_PATTERNS).toEqual(['plain', 'ore', 'gem', 'disc']);
  });

  it.each(PLACEHOLDER_PATTERNS)('encodes %s as a valid 16x16 RGBA PNG', (pattern) => {
    const png = placeholderPng(pattern);
    const decoded = decode(png);
    expect(decoded.width).toBe(PLACEHOLDER_SIZE);
    expect(decoded.height).toBe(PLACEHOLDER_SIZE);
    expect(decoded.rgba).toEqual(placeholderPixels(pattern));
  });

  it.each(PLACEHOLDER_PATTERNS)('pins the bytes of %s', (pattern) => {
    expect(sha256(placeholderPng(pattern))).toBe(PINNED[pattern]);
    expect(sha256(placeholderPng(pattern))).toBe(sha256(placeholderPng(pattern)));
  });

  it('draws opaque block patterns and transparent item backgrounds', () => {
    const alpha = (pattern: PlaceholderPattern) =>
      [...placeholderPixels(pattern)].filter((_, index) => index % 4 === 3);
    expect(alpha('plain').every((value) => value === 255)).toBe(true);
    expect(alpha('ore').every((value) => value === 255)).toBe(true);
    expect(alpha('gem')).toContain(0);
    expect(alpha('disc')).toContain(0);
    expect(alpha('disc')).toContain(255);
  });

  it('tints by colour', () => {
    const red = placeholderPng('gem');
    const green = placeholderPng('gem', { colour: [32, 180, 72] });
    expect(sha256(green)).not.toBe(sha256(red));
    const pixels = placeholderPixels('plain', { colour: [10, 200, 30] });
    // An inner pixel is the colour itself.
    const inner = (5 * PLACEHOLDER_SIZE + 5) * 4;
    expect([...pixels.subarray(inner, inner + 4)]).toEqual([10, 200, 30, 255]);
  });

  it('rejects pixel buffers of the wrong size', () => {
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow(/Expected 4 RGBA bytes/);
  });
});
