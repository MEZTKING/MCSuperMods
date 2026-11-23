// B650 SQ3's 302 misspellings against the trigram typo index (ADR 0124 D4). The bars are B650's
// measured result for the trigram method with its tie rules: 277 right first (91.7 %) and 4
// wrong first (1.3 %); the rest have no candidate (beyond the edit limits, or words themselves).
import { beforeAll, describe, expect, it } from 'vitest';
import { createTypoIndex, fold, type TypoIndex } from '../../src/text';
import { type Dictionary, loadDictionary, loadMisspellings, type Misspelling } from './fixtures';

const RIGHT_AT_LEAST = 277;
const WRONG_AT_MOST = 4;

let dictionary: Dictionary;
let cases: Misspelling[];
let index: TypoIndex;

beforeAll(() => {
  dictionary = loadDictionary();
  cases = loadMisspellings();
  index = createTypoIndex(dictionary.counts);
});

describe('the 302 misspellings of B650', () => {
  it('holds the fixtures as B650 made them', () => {
    expect(cases).toHaveLength(302);
    expect(dictionary.counts.size).toBeGreaterThan(4000);
    expect(index.size).toBe(dictionary.counts.size);
  });

  it('meets the recall and false-match bars', () => {
    let right = 0;
    let none = 0;
    const wrong: string[] = [];
    const bySet = new Map<string, { right: number; n: number }>();
    for (const c of cases) {
      const to = fold(c.to);
      const set = bySet.get(c.set) ?? { right: 0, n: 0 };
      bySet.set(c.set, set);
      set.n++;
      // as the query does: fold the typed word, then correct it if the index does not know it
      const typed = fold(c.from);
      const got = typed === to ? { word: to } : index.correct(typed)[0];
      if (got === undefined) none++;
      else if (got.word === to) {
        right++;
        set.right++;
      } else wrong.push(`${c.from}->${got.word} (wanted ${to})`);
    }
    const line = [...bySet].map(([name, s]) => `${name} ${s.right}/${s.n}`).join(', ');
    console.info(
      `misspellings: right ${right}/${cases.length} (${((right / cases.length) * 100).toFixed(1)} %), wrong ${wrong.length} (${wrong.join('; ')}), none ${none}; ${line}`,
    );
    expect(right).toBeGreaterThanOrEqual(RIGHT_AT_LEAST);
    expect(wrong.length).toBeLessThanOrEqual(WRONG_AT_MOST);
  });

  it('never corrects a word of three letters or fewer, nor a known word', () => {
    expect(index.correct('tak')).toEqual([]);
    for (const c of cases) if (index.has(c.from)) expect(index.correct(c.from)).toEqual([]);
  });
});
