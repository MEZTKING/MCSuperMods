import { describe, expect, it } from 'vitest';
import { createSearchIndex } from '../src';

describe('@msm/search', () => {
  it('makes an index that answers with nothing before any layer is set', () => {
    const index = createSearchIndex();
    expect(index.query({ text: 'anything', mode: 'easy' })).toEqual({
      understood: { chips: [{ text: 'anything', kind: 'not-understood', struck: true }] },
      best: [],
      sections: [],
      confident: false,
    });
  });
});
