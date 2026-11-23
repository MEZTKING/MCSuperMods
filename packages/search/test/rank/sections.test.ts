import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../../src';
import { arrange, inScope, isConfident, sectionOf } from '../../src/rank/sections';
import { entry } from '../engine-fixtures';

const hit = (
  id: string,
  source: Parameters<typeof entry>[1],
  score: number,
  extra = {},
): SearchHit => ({
  entry: entry(id, source, id, extra),
  score,
  why: [],
});

describe('sections', () => {
  it('puts each source in its section, technical entries under More in Very easy', () => {
    expect(sectionOf(entry('a', 'flow', 'A'), 'easy')).toBe('make');
    expect(sectionOf(entry('a', 'vanilla', 'A'), 'easy')).toBe('minecraft');
    expect(sectionOf(entry('a', 'problem', 'A'), 'easy')).toBe('fix');
    expect(sectionOf(entry('a', 'kind', 'A', { technical: true }), 'very-easy')).toBe('more');
    expect(sectionOf(entry('a', 'kind', 'A', { technical: true }), 'advanced')).toBe('make');
  });

  it('keeps a scope to its sections', () => {
    expect(inScope(entry('a', 'command', 'A'), 'easy', 'commands')).toBe(true);
    expect(inScope(entry('a', 'flow', 'A'), 'easy', 'commands')).toBe(false);
    expect(inScope(entry('a', 'problem', 'A'), 'easy', 'mine')).toBe(true);
    expect(inScope(entry('a', 'kind', 'A', { technical: true }), 'very-easy', 'make')).toBe(true);
    expect(inScope(entry('a', 'flow', 'A'), 'easy', undefined)).toBe(true);
  });

  it('takes three Best matches, never an unavailable or a technical one', () => {
    const hits = [
      hit('u', 'flow', 10, { available: false }),
      hit('t', 'kind', 9, { technical: true }),
      hit('a', 'flow', 8),
      hit('b', 'guide', 7),
      hit('c', 'vanilla', 6),
      hit('d', 'flow', 5),
    ];
    const { best, sections } = arrange(hits, { mode: 'very-easy', confident: true, rows: 3 });
    expect(best.map((h) => h.entry.id)).toEqual(['a', 'b', 'c']);
    expect(sections.map((s) => [s.id, s.hits.map((h) => h.entry.id), s.more])).toEqual([
      ['make', ['d', 'u'], 0],
      ['more', ['t'], 0],
    ]);
  });

  it('orders sections by their best score and counts the rest', () => {
    const hits = [
      hit('g1', 'guide', 9),
      ...['a', 'b', 'c', 'd', 'e'].map((id, i) => hit(id, 'flow', 8 - i)),
    ];
    const { sections } = arrange(hits, { mode: 'easy', confident: false, rows: 3 });
    expect(sections.map((s) => [s.id, s.hits.length, s.more])).toEqual([
      ['help', 1, 0],
      ['make', 3, 2],
    ]);
  });

  it('has no Best match below the confidence floor', () => {
    expect(
      arrange([hit('a', 'flow', 1)], { mode: 'easy', confident: false, rows: 3 }).best,
    ).toEqual([]);
    expect(isConfident({ top: 2, plain: 1, words: 1, corrected: 0, exactId: false })).toBe(false);
    expect(isConfident({ top: 5, plain: 1, words: 1, corrected: 0, exactId: false })).toBe(true);
    expect(isConfident({ top: 5, plain: 0, words: 2, corrected: 2, exactId: false })).toBe(false);
    expect(isConfident({ top: 5, plain: 0, words: 1, corrected: 1, exactId: false })).toBe(true);
    expect(isConfident({ top: 1, plain: 0, words: 1, corrected: 0, exactId: true })).toBe(true);
  });
});
