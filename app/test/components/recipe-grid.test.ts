import type { Json } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  deriveRecipe,
  emptyGrid,
  type GridCell,
  gridFromRecipe,
  ingredientText,
  parseIngredient,
  type RecipeGrid,
  setCell,
} from '../../src/renderer/src/studios/recipe-grid';

/** Builds a grid from rows of cells (`.` is empty, other strings are ids). */
function grid(...rows: (string | GridCell)[][]): RecipeGrid {
  const out = emptyGrid();
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const line = out[r];
      if (line !== undefined) line[c] = cell === '.' ? null : cell;
    });
  });
  return out;
}

describe('deriveRecipe', () => {
  const cases: {
    name: string;
    grid: RecipeGrid;
    previous?: Json;
    pattern: string[];
    key: Record<string, Json>;
  }[] = [
    { name: 'empty grid', grid: emptyGrid(), pattern: [], key: {} },
    {
      name: 'single cell in a corner is trimmed',
      grid: grid(['.', '.', '.'], ['.', '.', '.'], ['.', '.', 'minecraft:stone']),
      pattern: ['A'],
      key: { A: 'minecraft:stone' },
    },
    {
      name: 'sword column keeps its inner gaps',
      grid: grid(
        ['.', 'minecraft:diamond', '.'],
        ['.', 'minecraft:diamond', '.'],
        ['.', 'minecraft:stick', '.'],
      ),
      pattern: ['A', 'A', 'B'],
      key: { A: 'minecraft:diamond', B: 'minecraft:stick' },
    },
    {
      name: 'interior empty cells stay spaces',
      grid: grid(
        ['minecraft:iron_ingot', '.', 'minecraft:iron_ingot'],
        ['.', 'minecraft:iron_ingot', '.'],
      ),
      pattern: ['A A', ' A '],
      key: { A: 'minecraft:iron_ingot' },
    },
    {
      name: 'symbols follow first appearance in reading order',
      grid: grid(
        ['#minecraft:planks', 'minecraft:stick'],
        ['minecraft:stick', '#minecraft:planks'],
      ),
      pattern: ['AB', 'BA'],
      key: { A: '#minecraft:planks', B: 'minecraft:stick' },
    },
    {
      name: 'unchanged ingredients keep their previous symbols',
      grid: grid(['minecraft:diamond'], ['minecraft:diamond'], ['minecraft:stick']),
      previous: { '#': 'minecraft:stick', X: 'minecraft:diamond' },
      pattern: ['X', 'X', '#'],
      key: { '#': 'minecraft:stick', X: 'minecraft:diamond' },
    },
    {
      name: 'a new ingredient never takes a kept symbol',
      grid: grid(['minecraft:gold_ingot', 'minecraft:stick']),
      previous: { A: 'minecraft:stick' },
      pattern: ['BA'],
      key: { A: 'minecraft:stick', B: 'minecraft:gold_ingot' },
    },
    {
      name: 'list ingredients compare by value',
      grid: grid([
        ['minecraft:coal', 'minecraft:charcoal'],
        ['minecraft:coal', 'minecraft:charcoal'],
      ]),
      pattern: ['AA'],
      key: { A: ['minecraft:coal', 'minecraft:charcoal'] },
    },
    {
      name: 'blank strings count as empty',
      grid: grid(['  ', 'minecraft:stone']),
      pattern: ['A'],
      key: { A: 'minecraft:stone' },
    },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(deriveRecipe(entry.grid, entry.previous)).toEqual({
        pattern: entry.pattern,
        key: entry.key,
      });
    });
  }

  it('round-trips through gridFromRecipe unchanged', () => {
    const pattern = ['X X', ' # ', ' # '];
    const key = { '#': 'minecraft:stick', X: '#minecraft:planks' };
    expect(deriveRecipe(gridFromRecipe(pattern, key), key)).toEqual({ pattern, key });
  });

  it('keeps other symbols stable when one cell changes', () => {
    const key = { A: 'minecraft:diamond', B: 'minecraft:stick' };
    const before = gridFromRecipe(['A', 'A', 'B'], key);
    const after = setCell(before, 0, 0, 'minecraft:emerald');
    expect(deriveRecipe(after, key)).toEqual({
      pattern: ['C', 'A', 'B'],
      key: { A: 'minecraft:diamond', B: 'minecraft:stick', C: 'minecraft:emerald' },
    });
  });
});

describe('gridFromRecipe', () => {
  it('places the pattern top-left and ignores unknown symbols and overflow', () => {
    const result = gridFromRecipe(['AZ', 'A', 'AAAA', 'A'], { A: 'minecraft:stone' });
    expect(result).toEqual([
      ['minecraft:stone', null, null],
      ['minecraft:stone', null, null],
      ['minecraft:stone', 'minecraft:stone', 'minecraft:stone'],
    ]);
  });

  it('gives an empty grid for malformed data', () => {
    expect(gridFromRecipe('nope', undefined)).toEqual(emptyGrid());
  });
});

describe('ingredient text', () => {
  it('parses ids, tags and lists', () => {
    expect(parseIngredient('  ')).toBeNull();
    expect(parseIngredient(' minecraft:stone ')).toBe('minecraft:stone');
    expect(parseIngredient('#minecraft:logs')).toBe('#minecraft:logs');
    expect(parseIngredient('minecraft:coal, minecraft:charcoal')).toEqual([
      'minecraft:coal',
      'minecraft:charcoal',
    ]);
    expect(parseIngredient('minecraft:coal,')).toBe('minecraft:coal');
  });

  it('formats cells for display', () => {
    expect(ingredientText(null)).toBe('');
    expect(ingredientText(['a:b', 'c:d'])).toBe('a:b, c:d');
    expect(ingredientText('#a:b')).toBe('#a:b');
  });
});
