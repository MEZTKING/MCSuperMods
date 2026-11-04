/**
 * Pure helpers for the shaped-recipe grid: reading a `pattern`/`key` pair into a 3x3 grid of
 * ingredients and deriving `pattern` and `key` back from an edited grid.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';

/** Width and height of the crafting grid. */
export const GRID_SIZE = 3;

/** Symbols given to new ingredients, in first-appearance order. */
export const KEY_SYMBOLS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** One grid cell: an ingredient (an id, a `#tag` or a list of ids), or `null` when empty. */
export type GridCell = Json | null;

/** Rows of cells, `GRID_SIZE` by `GRID_SIZE`. */
export type RecipeGrid = GridCell[][];

type JsonObject = { [key: string]: Json };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A comparable identity for an ingredient value. */
export function ingredientKey(value: Json): string {
  return JSON.stringify(value);
}

/** A grid with every cell empty. */
export function emptyGrid(): RecipeGrid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

/**
 * Places a recipe's `pattern` in the top-left corner of the grid, looking each symbol up in
 * `key`. Spaces, symbols missing from `key` and anything beyond the grid are empty cells.
 */
export function gridFromRecipe(pattern: Json | undefined, key: Json | undefined): RecipeGrid {
  const grid = emptyGrid();
  if (!Array.isArray(pattern)) return grid;
  const symbols = isObject(key) ? key : {};
  pattern.slice(0, GRID_SIZE).forEach((row, r) => {
    if (typeof row !== 'string') return;
    const cells = [...row].slice(0, GRID_SIZE);
    cells.forEach((symbol, c) => {
      const line = grid[r];
      if (line === undefined || symbol === ' ' || !Object.hasOwn(symbols, symbol)) return;
      line[c] = symbols[symbol] as Json;
    });
  });
  return grid;
}

/** Whether a cell holds an ingredient (an empty string or list counts as empty). */
export function isFilled(cell: GridCell): cell is Json {
  if (cell === null) return false;
  if (typeof cell === 'string') return cell.trim() !== '';
  if (Array.isArray(cell)) return cell.length > 0;
  return true;
}

/**
 * Derives `pattern` and `key` from a grid. Empty outer rows and columns are trimmed. An
 * ingredient that already had a symbol in `previousKey` keeps it, so unchanged cells keep
 * their symbols; other ingredients take the next unused letter of `A`-`I` in reading order.
 * Equal ingredients share one symbol. An empty grid gives `{ pattern: [], key: {} }`.
 */
export function deriveRecipe(
  grid: RecipeGrid,
  previousKey?: Json,
): { pattern: string[]; key: JsonObject } {
  const rows = grid.map((row) => row.map((cell) => (isFilled(cell) ? cell : null)));
  const filledRows = rows
    .map((row, index) => (row.some((cell) => cell !== null) ? index : -1))
    .filter((index) => index >= 0);
  if (filledRows.length === 0) return { pattern: [], key: {} };
  const width = Math.max(...rows.map((row) => row.length));
  const filledColumns: number[] = [];
  for (let c = 0; c < width; c++) {
    if (rows.some((row) => (row[c] ?? null) !== null)) filledColumns.push(c);
  }
  const top = filledRows[0] as number;
  const bottom = filledRows[filledRows.length - 1] as number;
  const left = filledColumns[0] as number;
  const right = filledColumns[filledColumns.length - 1] as number;

  // Symbols the previous key gave each ingredient (first symbol wins for duplicates).
  const previous = new Map<string, string>();
  if (isObject(previousKey)) {
    for (const [symbol, value] of Object.entries(previousKey)) {
      if (symbol.length !== 1 || symbol === ' ') continue;
      const identity = ingredientKey(value);
      if (!previous.has(identity)) previous.set(identity, symbol);
    }
  }

  const assigned = new Map<string, string>();
  const key: JsonObject = {};
  const used = new Set<string>();
  // Reused symbols are reserved first so a new ingredient never takes one.
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const cell = rows[r]?.[c] ?? null;
      if (cell === null) continue;
      const identity = ingredientKey(cell);
      const symbol = previous.get(identity);
      if (symbol !== undefined && !assigned.has(identity)) {
        assigned.set(identity, symbol);
        used.add(symbol);
      }
    }
  }
  const fresh = KEY_SYMBOLS.filter((symbol) => !used.has(symbol));
  const pattern: string[] = [];
  for (let r = top; r <= bottom; r++) {
    let line = '';
    for (let c = left; c <= right; c++) {
      const cell = rows[r]?.[c] ?? null;
      if (cell === null) {
        line += ' ';
        continue;
      }
      const identity = ingredientKey(cell);
      let symbol = assigned.get(identity);
      if (symbol === undefined) {
        symbol = fresh.shift() ?? '?';
        assigned.set(identity, symbol);
      }
      if (!Object.hasOwn(key, symbol)) key[symbol] = cell;
      line += symbol;
    }
    pattern.push(line);
  }
  return { pattern, key: sortKeys(key) };
}

function sortKeys(object: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const name of Object.keys(object).sort()) out[name] = object[name] as Json;
  return out;
}

/** Returns a copy of `grid` with one cell replaced. */
export function setCell(grid: RecipeGrid, row: number, column: number, cell: GridCell): RecipeGrid {
  return grid.map((line, r) => line.map((entry, c) => (r === row && c === column ? cell : entry)));
}

/** Text shown in an ingredient input: an id, a `#tag`, or a comma-separated list of ids. */
export function ingredientText(cell: GridCell | undefined): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell;
  if (Array.isArray(cell) && cell.every((entry) => typeof entry === 'string')) {
    return cell.join(', ');
  }
  return JSON.stringify(cell);
}

/**
 * Parses ingredient input text: empty is `null`, a comma-separated list is a list of ids, and
 * anything else is one id or `#tag`.
 */
export function parseIngredient(text: string): GridCell {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(',')) {
    const ids = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
    return ids.length === 1 ? (ids[0] as string) : ids;
  }
  return trimmed;
}
