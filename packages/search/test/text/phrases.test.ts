import { describe, expect, it } from 'vitest';
import { createPhraseMatcher, joinsAndSplits, wordsOf } from '../../src/text';

describe('createPhraseMatcher', () => {
  const matcher = createPhraseMatcher([
    { phrase: 'sets on fire', value: 'fire' },
    { phrase: 'catches fire', value: 'fire' },
    { phrase: 'fire', value: 'fire-word' },
    { phrase: 'Gray dye', value: 'dye' },
    { phrase: 'sets on fire', value: 'burn' },
    { phrase: '', value: 'nothing' },
  ]);

  it('finds phrases leftmost and longest first, never overlapping', () => {
    expect(matcher.match(wordsOf('a sword that sets on fire'))).toEqual([
      { start: 3, end: 6, phrase: 'sets on fire', values: ['fire', 'burn'] },
    ]);
    expect(
      matcher.match(wordsOf('fire that catches fire')).map((m) => [m.start, m.values]),
    ).toEqual([
      [0, ['fire-word']],
      [2, ['fire']],
    ]);
  });

  it('folds both sides, so British and American spellings meet', () => {
    expect(matcher.match(wordsOf('grey dye'))[0]?.values).toEqual(['dye']);
    expect(matcher.match(wordsOf('gray dye'))[0]?.values).toEqual(['dye']);
  });

  it('counts distinct phrases and finds nothing in nothing', () => {
    expect(matcher.size).toBe(4);
    expect(matcher.match([])).toEqual([]);
    expect(matcher.match(wordsOf('sets on'))).toEqual([]);
  });

  it('takes a key function, for example a stemmer', () => {
    const stemmed = createPhraseMatcher([{ phrase: 'drop gem', value: 1 }], (w) =>
      w.replace(/s$/, ''),
    );
    expect(stemmed.match(['drops', 'gems'])).toHaveLength(1);
  });
});

describe('joinsAndSplits', () => {
  const known = new Set([
    'skyblock',
    'sky',
    'block',
    'pick',
    'axe',
    'pickaxe',
    'end',
    'stone',
    'gem',
  ]);
  const isKnown = (word: string): boolean => known.has(word);

  it('joins neighbours the dictionary knows as one word', () => {
    expect(joinsAndSplits(['a', 'sky', 'block', 'world'], isKnown)).toEqual([
      { kind: 'joined', start: 1, end: 3, words: ['skyblock'] },
    ]);
    expect(joinsAndSplits(['pick', 'axe'], isKnown)).toEqual([
      { kind: 'joined', start: 0, end: 2, words: ['pickaxe'] },
    ]);
  });

  it('splits an unknown word into two known words of three letters or more', () => {
    expect(joinsAndSplits(['endstone'], isKnown)).toEqual([
      { kind: 'split', start: 0, end: 1, words: ['end', 'stone'] },
    ]);
    expect(joinsAndSplits(['pickaxe'], isKnown)).toEqual([]);
    expect(joinsAndSplits(['gemx'], isKnown)).toEqual([]);
    expect(joinsAndSplits(['12', '34'], () => true)).toEqual([]);
  });
});
