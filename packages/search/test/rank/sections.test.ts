import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../../src';
import {
  arrange,
  inScope,
  isConfident,
  sectionOf,
  UNAVAILABLE_BEYOND_CAP,
} from '../../src/rank/sections';
import { MAX_SECTION_ROWS } from '../../src/rank/weights';
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
  describe('a section over the cap with unavailable matches (ADR 0124 D6, amended)', () => {
    const flows = (prefix: string, count: number, from: number, extra = {}) =>
      Array.from({ length: count }, (_, i) =>
        hit(`${prefix}${String(i).padStart(2, '0')}`, 'flow', from - i, extra),
      );
    const unavailable = { available: false };

    it('lists the unavailable ones after the cap, greyed and last, never a Best match', () => {
      // An unavailable flow scoring above every available one, as a broad word can on a newer target.
      const hits = [...flows('u', 2, 1000, unavailable), ...flows('a', 63, 900)];
      const { best, sections } = arrange(hits, {
        mode: 'easy',
        confident: true,
        rows: MAX_SECTION_ROWS,
      });
      expect(best.map((h) => h.entry.id)).toEqual(['a00', 'a01', 'a02']);
      const make = sections.find((s) => s.id === 'make');
      expect(make?.hits).toHaveLength(MAX_SECTION_ROWS + 2);
      expect(make?.hits.slice(-2).map((h) => h.entry.id)).toEqual(['u00', 'u01']);
      expect(make?.hits.slice(-2).every((h) => h.entry.available === false)).toBe(true);
      expect(make?.hits.slice(0, MAX_SECTION_ROWS).every((h) => h.entry.available !== false)).toBe(
        true,
      );
      // 60 available after the Best matches: 50 shown, 10 counted.
      expect(make?.more).toBe(10);
    });

    it('exceeds the cap by at most UNAVAILABLE_BEYOND_CAP and counts the rest', () => {
      const hits = [...flows('a', 60, 900), ...flows('u', 8, 100, unavailable)];
      const { sections } = arrange(hits, {
        mode: 'easy',
        confident: false,
        rows: MAX_SECTION_ROWS,
      });
      const make = sections[0];
      expect(make?.hits).toHaveLength(MAX_SECTION_ROWS + UNAVAILABLE_BEYOND_CAP);
      expect(make?.hits.slice(MAX_SECTION_ROWS).map((h) => h.entry.id)).toEqual([
        'u00',
        'u01',
        'u02',
        'u03',
        'u04',
      ]);
      expect(make?.more).toBe(60 + 8 - MAX_SECTION_ROWS - UNAVAILABLE_BEYOND_CAP);
    });

    it('keeps the next unavailable ones when some already fit inside the cap', () => {
      const hits = [...flows('a', 48, 900), ...flows('u', 9, 100, unavailable)];
      const { sections } = arrange(hits, {
        mode: 'easy',
        confident: false,
        rows: MAX_SECTION_ROWS,
      });
      const ids = sections[0]?.hits.map((h) => h.entry.id) ?? [];
      expect(ids).toHaveLength(MAX_SECTION_ROWS + UNAVAILABLE_BEYOND_CAP);
      expect(ids.slice(48)).toEqual(['u00', 'u01', 'u02', 'u03', 'u04', 'u05', 'u06']);
      expect(sections[0]?.more).toBe(2);
    });

    it('leaves a cut Show more can lift, and a section inside the cap, as they were', () => {
      const hits = [...flows('a', 10, 900), ...flows('u', 2, 100, unavailable)];
      const closed = arrange(hits, { mode: 'easy', confident: false, rows: 3 }).sections[0];
      expect(closed?.hits.map((h) => h.entry.id)).toEqual(['a00', 'a01', 'a02']);
      expect(closed?.more).toBe(9);
      const opened = arrange(hits, {
        mode: 'easy',
        confident: false,
        rows: MAX_SECTION_ROWS,
      }).sections[0];
      expect(opened?.hits.map((h) => h.entry.id).slice(-2)).toEqual(['u00', 'u01']);
      expect(opened?.hits).toHaveLength(12);
      expect(opened?.more).toBe(0);
    });
  });
});
