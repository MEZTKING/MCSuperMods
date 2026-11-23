import { describe, expect, it } from 'vitest';
import { normalise } from '../../src/text';

describe('normalise', () => {
  it('lower-cases and strips accents and marks', () => {
    expect(normalise('Crème Brûlée')).toBe('creme brulee');
    expect(normalise('NAÏVE Café')).toBe('naive cafe');
    expect(normalise('İstanbul')).toBe('istanbul');
  });

  it('unfolds letters Unicode does not decompose, and compatibility forms', () => {
    expect(normalise('Æther Straße Œuvre Øre Łódź')).toBe('aether strasse oeuvre ore lodz');
    expect(normalise('ＡＢＣ１２')).toBe('abc12');
    expect(normalise('ﬁre')).toBe('fire');
  });

  it('never throws, on any string', () => {
    expect(normalise('')).toBe('');
    expect(normalise('\uD800 lone surrogate')).toContain('lone surrogate');
    expect(normalise(undefined as unknown as string)).toBe('');
    expect(normalise('x'.repeat(100_000))).toHaveLength(100_000);
  });
});
