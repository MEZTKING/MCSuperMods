import { describe, expect, it } from 'vitest';
import { createSearchIndex, type SearchAnswer } from '../../src';
import {
  compact,
  createLayer,
  MAX_SEGMENTS,
  patchLayerEntries,
  setLayerEntries,
  slotOf,
} from '../../src/index/layer';
import { entry, filler } from '../engine-fixtures';

const things = (n: number, word = 'gadget') =>
  Array.from({ length: n }, (_, i) => entry(`p:${i}`, 'project', `${word} ${i}`));

function summary(answer: SearchAnswer): unknown {
  return {
    best: answer.best.map((h) => [h.entry.id, h.score, h.why]),
    sections: answer.sections.map((s) => [s.id, s.hits.map((h) => [h.entry.id, h.score]), s.more]),
  };
}

describe('layer', () => {
  it('is built and replaced', () => {
    const layer = createLayer('project');
    setLayerEntries(layer, things(3));
    expect(layer.live).toBe(3);
    expect(layer.words.get('gadget')).toBe(3);
    setLayerEntries(layer, things(1, 'widget'));
    expect(layer.live).toBe(1);
    expect(layer.words.has('gadget')).toBe(false);
    expect(layer.version).toBe(2);
  });

  it('keeps the last entry of an id and skips entries without one', () => {
    const layer = createLayer('x');
    setLayerEntries(layer, [
      entry('a', 'project', 'One'),
      entry('a', 'project', 'Two'),
      { id: '' } as never,
    ]);
    expect(layer.live).toBe(1);
    const slot = slotOf(layer, 'a');
    expect(slot?.segment.entries[slot.doc]?.title).toBe('Two');
  });

  it('is patched by deltas, counting words exactly', () => {
    const layer = createLayer('project');
    setLayerEntries(layer, things(10));
    patchLayerEntries(
      layer,
      [entry('p:3', 'project', 'widget 3'), entry('p:99', 'project', 'gadget 99')],
      ['p:4'],
    );
    expect(layer.live).toBe(10);
    expect(layer.words.get('gadget')).toBe(9);
    expect(layer.words.get('widget')).toBe(1);
    expect(layer.byId.has('p:4')).toBe(false);
    expect(layer.dead).toBe(2);
    expect(layer.segments.length).toBe(2);
  });

  it('rebuilds itself when too many segments or dead entries pile up', () => {
    const layer = createLayer('project');
    setLayerEntries(layer, things(100));
    for (let i = 0; i <= MAX_SEGMENTS; i++)
      patchLayerEntries(layer, [entry(`n:${i}`, 'project', 'new')], []);
    expect(layer.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    patchLayerEntries(
      layer,
      [],
      things(60).map((e) => e.id),
    );
    expect(layer.dead).toBe(0);
    expect(layer.live).toBe(100 + MAX_SEGMENTS + 1 - 60);
    compact(layer);
    expect(layer.segments.length).toBe(1);
  });

  it('answers the same after patches as after a fresh build of the same entries', () => {
    const base = [...filler(200), ...things(50)];
    const patched = createSearchIndex();
    patched.setLayer('static', base);
    patched.patchLayer('static', [entry('p:7', 'project', 'gizmo gadget 7')], ['p:8', 'p:9']);
    patched.patchLayer('static', [entry('p:100', 'project', 'gadget gizmo')], []);
    const fresh = createSearchIndex();
    fresh.setLayer('static', [
      ...base.filter((e) => !['p:7', 'p:8', 'p:9'].includes(e.id)),
      entry('p:7', 'project', 'gizmo gadget 7'),
      entry('p:100', 'project', 'gadget gizmo'),
    ]);
    for (const text of ['gadget', 'gizmo gadget', 'gadgets 7', 'gadjet']) {
      const request = { text, mode: 'easy' as const, limit: 50 };
      expect(summary(patched.query(request))).toEqual(summary(fresh.query(request)));
    }
  });
});
