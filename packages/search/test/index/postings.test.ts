import { describe, expect, it } from 'vitest';
import { prepareEntry } from '../../src/index/entry';
import { buildSegment, titleOf } from '../../src/index/postings';
import { FIELD_COUNT } from '../../src/rank/weights';
import { entry } from '../engine-fixtures';

describe('postings', () => {
  it('keeps each term with its entries in order and its count per field', () => {
    const segment = buildSegment(
      [
        entry('a', 'flow', 'Teapot teapot', { sentence: 'A teapot.' }),
        entry('b', 'flow', 'Kettle', { sentence: 'Not a teapot.' }),
      ].map(prepareEntry),
    );
    const t = segment.terms.get('teapot') as number;
    const from = segment.starts[t] as number;
    const to = segment.starts[t + 1] as number;
    expect([...segment.docs.slice(from, to)]).toEqual([0, 1]);
    // Entry a: twice in the title (field 0), once in the sentence (field 3).
    expect(segment.tfs[from * FIELD_COUNT]).toBe(2);
    expect(segment.tfs[from * FIELD_COUNT + 3]).toBe(1);
    expect(segment.tfs[(from + 1) * FIELD_COUNT]).toBe(0);
    expect(segment.lengths[0]).toBe(2);
    expect([...segment.live]).toEqual([1, 1]);
    expect(titleOf(segment, 0)).toEqual(['teapot', 'teapot']);
    expect(titleOf(segment, 1)).toEqual(['kettle']);
  });

  it('builds an empty segment', () => {
    const segment = buildSegment([]);
    expect(segment.entries).toEqual([]);
    expect(segment.docs.length).toBe(0);
  });
});
