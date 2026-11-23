/**
 * The short lists' matcher (B668): spellings, stems, word groups and typos from `@msm/search`'s
 * text half, with the engine's limits (SL13).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  dictionaryOf,
  exactFirst,
  localQuery,
  matchesLocally,
  setLocalVocabulary,
} from '../../../src/renderer/src/search/local-match';

afterEach(() => setLocalVocabulary(null));

describe('local matching', () => {
  it('folds British and American spellings and stems', () => {
    expect(matchesLocally('armor', ['Ruby armour'])).toBe(true);
    expect(matchesLocally('armour', ['leather_horse_armor'])).toBe(true);
    expect(matchesLocally('colored swords', ['Coloured sword'])).toBe(true);
    expect(matchesLocally('gray', ['Grey wool'])).toBe(true);
  });

  it('corrects one wrong letter in words of four to seven letters, two in longer ones', () => {
    expect(matchesLocally('swrod', ['sword'])).toBe(true);
    expect(matchesLocally('chestpalte', ['iron_chestplate'])).toBe(true);
    expect(matchesLocally('dimaond swrd', ['diamond_sword'])).toBe(true);
    // Two wrong letters in a short word are too many.
    expect(matchesLocally('swxrq', ['sword'])).toBe(false);
    // Three letters or fewer must be exact (or begin a word).
    expect(matchesLocally('bxw', ['bow'])).toBe(false);
    expect(matchesLocally('bow', ['bowl'])).toBe(true);
  });

  it('never corrects a word the list knows', () => {
    const dictionary = dictionaryOf(['stone', 'stove']);
    expect(localQuery('stove', { dictionary }).matches(['stone'])).toBe(false);
    expect(localQuery('stove', {}).matches(['stone'])).toBe(true);
  });

  it('drops stop words and needs every other word', () => {
    expect(localQuery('the').empty).toBe(true);
    expect(matchesLocally('a sword for me', ['diamond sword'])).toBe(true);
    expect(matchesLocally('ruby sword', ['diamond sword'])).toBe(false);
  });

  it("uses the plugins' same, slang and misspelling words, not the near ones", () => {
    expect(matchesLocally('xp', ['experience orb'])).toBe(false);
    setLocalVocabulary([
      {
        words: [
          {
            idea: 'experience',
            same: ['exp', 'hit box'],
            slang: ['xp'],
            near: ['level'],
            misspellings: ['experiance'],
          },
        ],
      },
    ]);
    expect(matchesLocally('xp', ['experience orb'])).toBe(true);
    expect(matchesLocally('experiance', ['experience orb'])).toBe(true);
    expect(matchesLocally('level', ['experience orb'])).toBe(false);
  });

  it('keeps the exact matches first, in their order', () => {
    const items = ['Ruby armour', 'armor stand', 'sword', 'armoured car'];
    const found = exactFirst(
      items,
      'armor',
      (item) => item.includes('armor'),
      (item) => [item],
    );
    expect(found).toEqual(['armor stand', 'Ruby armour', 'armoured car']);
    expect(
      exactFirst(
        items,
        '  ',
        () => false,
        (item) => [item],
      ),
    ).toEqual(items);
  });

  it('stays quick over a few thousand things', () => {
    const items = Array.from({ length: 4000 }, (_, n) => `minecraft:thing_${n}_block`);
    const started = performance.now();
    exactFirst(
      items,
      'thnig blcok',
      () => false,
      (item) => [item],
    );
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
