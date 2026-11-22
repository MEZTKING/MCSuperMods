import { describe, expect, it } from 'vitest';
import { seedFromText } from '../src';
import { javaStringHash } from '../src/seed';

describe('seedFromText (WS17)', () => {
  it('keeps a whole number in range as itself', () => {
    expect(seedFromText('-42')).toBe(-42n);
    expect(seedFromText('0')).toBe(0n);
    expect(seedFromText('12345')).toBe(12345n);
    expect(seedFromText('-7046235981325167892')).toBe(-7046235981325167892n);
    expect(seedFromText('9223372036854775807')).toBe(9223372036854775807n);
  });

  it("hashes any other text with Java's String.hashCode (the spike's examples)", () => {
    expect(seedFromText('hello world')).toBe(1794106052n);
    expect(seedFromText('B574 spike')).toBe(-94177738n);
    expect(seedFromText('99999999999999999999')).toBe(1260560192n);
    expect(seedFromText('9223372036854775808')).toBe(BigInt(javaStringHash('9223372036854775808')));
  });

  it('hashes over UTF-16 code units and gives 0 for empty text', () => {
    expect(javaStringHash('')).toBe(0);
    expect(javaStringHash('a')).toBe(97);
    expect(javaStringHash('\u{1F600}')).toBe(0xd83d * 31 + 0xde00);
  });
});
