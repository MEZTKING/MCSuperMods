import { describe, expect, it } from 'vitest';
import { createLayer, setLayerEntries } from '../../src/index/layer';
import { accumulate, createCollection, idf, locate, saturate } from '../../src/rank/bm25f';
import { entry } from '../engine-fixtures';

function collect(...layers: [string, ReturnType<typeof entry>[]][]) {
  return createCollection(
    layers.map(([name, entries]) => {
      const layer = createLayer(name);
      setLayerEntries(layer, entries);
      return layer;
    }),
  );
}

describe('bm25f', () => {
  it('numbers segments across layers and finds an entry by its number', () => {
    const c = collect(
      ['a', [entry('1', 'flow', 'One'), entry('2', 'flow', 'Two')]],
      ['b', [entry('3', 'flow', 'Three')]],
    );
    expect(c.slots).toBe(3);
    expect(c.docs).toBe(3);
    expect(locate(c, 2)?.segment.entries[locate(c, 2)?.doc ?? 0]?.id).toBe('3');
    expect(locate(c, 3)).toBeUndefined();
  });

  it('weighs the title above the sentence and the body below both', () => {
    const c = collect([
      'a',
      [
        entry('t', 'flow', 'Kettle'),
        entry('s', 'flow', 'Other', { sentence: 'kettle' }),
        entry('b', 'flow', 'Other', { body: 'kettle' }),
      ],
    ]);
    const tt = new Float64Array(c.slots);
    const touched: number[] = [];
    accumulate(c, ['kettle'], tt, touched);
    expect(touched).toEqual([0, 1, 2]);
    expect(tt[0]).toBeGreaterThan(tt[1] as number);
    expect(tt[1]).toBeGreaterThan(tt[2] as number);
  });

  it('sums the words of one set before saturating', () => {
    const c = collect(['a', [entry('t', 'flow', 'Kettle kettles')]]);
    const one = new Float64Array(1);
    accumulate(c, ['kettle'], one, []);
    const both = new Float64Array(1);
    accumulate(c, ['kettle', 'kettles'], both, []);
    expect(both[0]).toBeCloseTo(2 * (one[0] as number));
    expect(saturate(both[0] as number)).toBeLessThan(2 * saturate(one[0] as number));
  });

  it('gives rarer words more weight', () => {
    expect(idf(1, 1000)).toBeGreaterThan(idf(100, 1000));
    expect(idf(1000, 1000)).toBeGreaterThan(0);
  });
});
