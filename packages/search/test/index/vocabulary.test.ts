import { describe, expect, it } from 'vitest';
import { createVocabulary } from '../../src/index/vocabulary';

describe('vocabulary', () => {
  it('merges groups of one idea across plugins', () => {
    const v = createVocabulary([
      { words: [{ idea: 'teapot', same: ['kettle'], vanillaIds: ['base:pot'] }] },
      {
        words: [
          {
            idea: 'Teapot',
            same: ['kettle', 'brewer'],
            slang: ['pot'],
            vanillaIds: ['base:pot', 'base:urn'],
          },
        ],
      },
    ]);
    const group = v.groups.get('teapot');
    expect(group?.forms).toEqual([['teapot'], ['kettle'], ['brewer'], ['pot']]);
    expect(group?.vanillaIds).toEqual(['base:pot', 'base:urn']);
    expect(v.senses('brewer')).toEqual([{ idea: 'teapot', kind: 'same' }]);
    expect(v.groups.size).toBe(1);
  });

  it('matches lines of several words as phrases, the idea too', () => {
    const v = createVocabulary([{ words: [{ idea: 'quiet time', same: ['nap time'] }] }]);
    const found = v.phrases.match(['a', 'nap', 'time', 'now']);
    expect(found).toEqual([
      { start: 1, end: 3, phrase: 'nap time', values: [{ idea: 'quiet time', kind: 'same' }] },
    ]);
    expect(v.phrases.match(['quiet', 'time'])[0]?.values[0]?.kind).toBe('idea');
  });

  it('keeps near words and misspellings out of the forms and misspellings out of the words', () => {
    const v = createVocabulary([
      { words: [{ idea: 'teapot', same: [], near: ['jug'], misspellings: ['teepott'] }] },
    ]);
    expect(v.groups.get('teapot')?.forms).toEqual([['teapot']]);
    expect(v.senses('jug')).toEqual([{ idea: 'teapot', kind: 'near' }]);
    expect(v.senses('teepott')).toEqual([{ idea: 'teapot', kind: 'misspelling' }]);
    expect(v.words.has('teepott')).toBe(false);
    expect(v.words.has('jug')).toBe(true);
  });

  it('knows colour names, the American folded', () => {
    const v = createVocabulary([{ colours: [{ names: ['Teal', 'sky blue'], colour: '#ABCDEF' }] }]);
    expect(v.colours.get('teal')).toBe('#abcdef');
    expect(v.colourPhrases.match(['sky', 'blue'])).toHaveLength(1);
  });

  it('skips malformed lines', () => {
    const v = createVocabulary([
      null,
      { words: [{ idea: 3 }, { idea: 'ok', same: 'no' }] },
    ] as never);
    expect([...v.groups.keys()]).toEqual(['ok']);
  });
});
