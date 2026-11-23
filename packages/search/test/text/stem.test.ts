import { beforeAll, describe, expect, it } from 'vitest';
import { createStemmer, STEM_EXCEPTIONS, stem } from '../../src/text';
import { type Dictionary, loadDictionary } from './fixtures';

/** B650's hand-checked list of merges that must not happen (SQ4, `knownBad`). */
const COLLISIONS: readonly (readonly [string, string])[] = [
  ['coming', 'com'],
  ['mined', 'min'],
  ['noted', 'not'],
  ['named', 'nam'],
  ['shaped', 'shap'],
  ['scraping', 'scrap'],
  ['gives', 'gif'],
  ['saves', 'safe'],
  ['news', 'new'],
  ['lives', 'life'],
  ['leaves', 'leave'],
  ['boots', 'boot'],
  ['ranged', 'range'],
  ['closed', 'clos'],
  ['moved', 'mov'],
  ['creeper', 'creep'],
  ['glass', 'glas'],
  ['lapis', 'lapi'],
  ['bus', 'bu'],
  ['moss', 'mos'],
];

let dictionary: Dictionary;

beforeAll(() => {
  dictionary = loadDictionary();
});

describe('stem', () => {
  it('strips plurals, -ing and -ed by rule without a dictionary', () => {
    expect(stem('blocks')).toBe('block');
    expect(stem('berries')).toBe('berry');
    expect(stem('boxes')).toBe('box');
    expect(stem('glasses')).toBe('glass');
    expect(stem('stopped')).toBe('stop');
    expect(stem('carried')).toBe('carry');
    expect(stem('moss')).toBe('moss');
    expect(stem('cactus')).toBe('cactus');
    expect(stem('dangerous')).toBe('dangerous');
  });

  it('never strips -er, never touches short words, numbers or protected words', () => {
    expect(stem('creeper')).toBe('creeper');
    expect(stem('runner')).toBe('runner');
    expect(stem('ice')).toBe('ice');
    expect(stem('16x16s')).toBe('16x16s');
    expect(stem('leaves', { protect: new Set(['leaves']) })).toBe('leaves');
  });

  it('keeps the exception list whole', () => {
    for (const word of STEM_EXCEPTIONS) expect(stem(word)).toBe(word);
  });

  it('follows the B650 order with a dictionary', () => {
    const dict = new Set(['note', 'come', 'cookie', 'potato', 'wolf', 'knife', 'cache', 'drop']);
    const options = { dictionary: dict };
    expect(stem('noted', options)).toBe('note');
    expect(stem('coming', options)).toBe('come');
    expect(stem('cookies', options)).toBe('cookie');
    expect(stem('potatoes', options)).toBe('potato');
    expect(stem('wolves', options)).toBe('wolf');
    expect(stem('knives', options)).toBe('knife');
    expect(stem('caches', options)).toBe('cache');
    expect(stem('dropped', options)).toBe('drop');
    // an -ing or -ed word with no dictionary form stays whole
    expect(stem('glimmering', options)).toBe('glimmering');
  });

  it('leaves the collision list empty against the dictionary fixture', () => {
    const options = { protect: dictionary.protect, dictionary: dictionary.words };
    const merged = COLLISIONS.filter(
      ([word, bad]) => dictionary.words.has(word) && stem(word, options) === bad,
    ).map(([word, bad]) => `${word}->${bad}`);
    expect(merged).toEqual([]);
    // and the true inflections still meet (`blocks` is a protected vanilla id word, so whole)
    expect(stem('arrows', options)).toBe('arrow');
    expect(stem('swords', options)).toBe('sword');
    expect(stem('wolves', options)).toBe('wolf');
    expect(stem('exploded', options)).toBe('explode');
    expect(stem('making', options)).toBe('make');
    expect(stem('torches', options)).toBe('torch');
    expect(stem('blocks', options)).toBe('blocks');
  });

  it('merges about as many groups as B650 measured (748 groups of 4,119 words)', () => {
    const stemmer = createStemmer({ protect: dictionary.protect, dictionary: dictionary.words });
    const groups = new Map<string, number>();
    for (const word of dictionary.words) {
      const s = stemmer(word);
      groups.set(s, (groups.get(s) ?? 0) + 1);
    }
    const merged = [...groups.values()].filter((n) => n > 1).length;
    console.info(`stemmer: ${merged} merged groups over ${dictionary.words.size} words`);
    expect(merged).toBeGreaterThan(650);
    expect(merged).toBeLessThan(850);
  });

  it('remembers its answers and is deterministic', () => {
    const stemmer = createStemmer({ dictionary: new Set(['make']) });
    expect(stemmer('making')).toBe('make');
    expect(stemmer('making')).toBe('make');
  });
});
