import { describe, expect, it } from 'vitest';
import { isBareId, tokenise, wordsOf } from '../../src/text';

describe('tokenise', () => {
  it('splits on anything that is not a letter or digit', () => {
    expect(wordsOf('A blue-ish sword, please!')).toEqual(['a', 'blue', 'ish', 'sword', 'please']);
    expect(wordsOf("What's new? Don't")).toEqual(['whats', 'new', 'dont']);
    expect(wordsOf('Épée  \t\n  rouge')).toEqual(['epee', 'rouge']);
  });

  it('splits ids at `:`, `/` and `_` and keeps the whole id', () => {
    const text = tokenise('find mymod:shiny_gem and worldgen/biome, also blue_wool.');
    expect(text.words.map((t) => t.text)).toEqual([
      'find',
      'mymod',
      'shiny',
      'gem',
      'and',
      'worldgen',
      'biome',
      'also',
      'blue',
      'wool',
    ]);
    expect(text.ids.map((t) => t.text)).toEqual(['mymod:shiny_gem', 'blue_wool']);
  });

  it('keeps a namespaced path with slashes and a tag sign whole', () => {
    expect(tokenise('#mymod:tags/rare_things').ids.map((t) => t.text)).toEqual([
      'mymod:tags/rare_things',
    ]);
  });

  it('keeps decimals and thousands as one word, with offsets into the normalised text', () => {
    const text = tokenise('Speed 1.5 for 1,000 ticks; 50%');
    expect(text.words.map((t) => t.text)).toEqual(['speed', '1.5', 'for', '1000', 'ticks', '50']);
    const last = text.words[5];
    expect(text.normalised.slice(last?.end)).toBe('%');
    expect(wordsOf('1,2 and 3,4')).toEqual(['1', '2', 'and', '3', '4']);
  });

  it('reads a bare namespace:path as an id', () => {
    expect(isBareId('  mymod:ruby_sword ')).toBe(true);
    expect(isBareId('mymod:ruby_sword please')).toBe(false);
    expect(isBareId('ruby sword')).toBe(false);
  });

  it('never throws, on any string', () => {
    for (const text of ['', ':', '::/_', '___', '\uD800', '%%%', '-'.repeat(5000)]) {
      expect(() => tokenise(text)).not.toThrow();
    }
    expect(tokenise('').words).toEqual([]);
  });
});
