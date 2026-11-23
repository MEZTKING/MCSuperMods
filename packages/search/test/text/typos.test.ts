import { describe, expect, it } from 'vitest';
import { createTypoIndex, editsFor, osa } from '../../src/text';

const index = createTypoIndex([
  ['cake', 5],
  ['cave', 9],
  ['flower', 3],
  ['flow', 8],
  ['window', 4],
  ['widow', 1],
  ['experience', 6],
  ['experiment', 2],
  ['ox', 1],
  ['123', 1],
  ['diamond', 7],
  ['diamonds', 2],
  ['dial', 1],
]);

describe('editsFor and osa', () => {
  it('allows none for three letters or fewer, one to seven, two from eight', () => {
    expect([1, 3, 4, 7, 8, 12].map(editsFor)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('counts a swap of neighbours as one edit and stops above the limit', () => {
    expect(osa('flwoer', 'flower', 2)).toBe(1);
    expect(osa('kitten', 'sitting', 3)).toBe(3);
    expect(osa('abc', 'abcdefgh', 2)).toBe(3);
  });
});

describe('createTypoIndex', () => {
  it('corrects an unknown word and never a known one', () => {
    expect(index.correct('daimond')[0]).toEqual({ word: 'diamond', edits: 1 });
    expect(index.correct('diamond')).toEqual([]);
    expect(index.has('diamond')).toBe(true);
  });

  it('breaks ties by the first letter, a key beside, a longer word, then frequency', () => {
    // caje: cake (j beside k) before the more frequent cave
    expect(index.correct('caje')[0]?.word).toBe('cake');
    // flowe: the longer flower before the more frequent flow
    expect(index.correct('flowe')[0]?.word).toBe('flower');
    // experiance: two edits allowed, experience at one
    expect(index.correct('experiance')[0]).toEqual({ word: 'experience', edits: 1 });
  });

  it('does not correct three-letter words, nor reach a short word with two edits', () => {
    expect(index.correct('cak')).toEqual([]);
    expect(index.correct('dialxyz').map((c) => c.word)).not.toContain('dial');
  });

  it('leaves out short words and numbers', () => {
    expect(index.has('ox')).toBe(false);
    expect(index.has('123')).toBe(false);
    expect(index.size).toBe(11);
  });

  it('completes the word being typed, most frequent first', () => {
    expect(index.complete('dia')).toEqual(['diamond', 'diamonds', 'dial']);
    expect(index.complete('flow')).toEqual(['flower']);
    expect(index.complete('zzz')).toEqual([]);
    expect(index.complete('')).toEqual([]);
    expect(index.complete('dia', 1)).toEqual(['diamond']);
  });

  it('is deterministic and never throws', () => {
    expect(index.correct('wndow')).toEqual(index.correct('wndow'));
    for (const word of ['', 'x'.repeat(500), '\uD800abcd', 'caje caje']) {
      expect(() => index.correct(word)).not.toThrow();
      expect(() => index.complete(word)).not.toThrow();
    }
  });
});
