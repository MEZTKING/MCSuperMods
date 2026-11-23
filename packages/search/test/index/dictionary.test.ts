import { describe, expect, it } from 'vitest';
import { createDictionary, effectiveProtect, inflections } from '../../src/index/dictionary';

const counts = (...words: string[]) => new Map(words.map((w) => [w, 1]));

describe('dictionary', () => {
  it('keeps a protected plural of a dictionary word unprotected, so block and blocks meet', () => {
    const words = new Set([
      'gadget',
      'gadgets',
      'leaf',
      'leave',
      'leaves',
      'boxes',
      'box',
      'striped',
    ]);
    const protect = effectiveProtect(['gadgets', 'leaves', 'boxes', 'striped', 'glass'], words);
    expect([...protect].sort()).toEqual(['glass', 'leaves', 'striped']);
  });

  it('reaches every held word of a stem class', () => {
    const d = createDictionary([
      counts('gadget', 'gadgets', 'berry', 'berries', 'note', 'noted', 'notes'),
    ]);
    expect(d.siblings('gadget')).toEqual(['gadget', 'gadgets']);
    expect(d.siblings('gadgets')).toEqual(['gadget', 'gadgets']);
    expect(d.siblings('berries')).toEqual(['berries', 'berry']);
    expect(d.siblings('noting')).toEqual(['note', 'noted', 'notes']);
    expect(d.siblings('unknown')).toEqual([]);
  });

  it('never merges a protected word', () => {
    const d = createDictionary([counts('strip', 'striped', 'stripes')], ['striped']);
    expect(d.siblings('strip')).not.toContain('striped');
    expect(d.siblings('striped')).toEqual(['striped']);
  });

  it('sums counts across layers and feeds the typo index', () => {
    const d = createDictionary([counts('kettle'), new Map([['kettle', 2]])]);
    expect(d.counts.get('kettle')).toBe(3);
    expect(d.typo.correct('ketle')[0]?.word).toBe('kettle');
    expect(d.has('kettle')).toBe(true);
  });

  it('lists the forms the stemmer reverses', () => {
    expect(inflections('berry')).toContain('berries');
    expect(inflections('knife')).toContain('knives');
    expect(inflections('mine')).toContain('mining');
    expect(inflections('stop')).toContain('stopped');
  });
});
