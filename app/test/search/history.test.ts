/**
 * The local search history (ADR 0124 D11; B660): the last 50 chosen results and 20 searches,
 * newest first, counts for the engine, and a storage round trip that ignores failures.
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  HISTORY_CHOSEN_LIMIT,
  HISTORY_SEARCH_LIMIT,
  HISTORY_STORAGE_KEY,
  type HistoryStorage,
  historyCounts,
  parseHistory,
  readHistory,
  withChoice,
  withSearch,
  writeHistory,
} from '../../src/renderer/src/search/history';

const memory = (): HistoryStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

describe('the search history', () => {
  it('keeps chosen results newest first with their counts, at most 50', () => {
    let history = EMPTY_HISTORY;
    history = withChoice(history, 'flow:weapon');
    history = withChoice(history, 'flow:pet');
    history = withChoice(history, 'flow:weapon');
    expect(history.chosen).toEqual([
      { id: 'flow:weapon', count: 2 },
      { id: 'flow:pet', count: 1 },
    ]);
    expect(historyCounts(history)).toEqual({ 'flow:weapon': 2, 'flow:pet': 1 });
    for (let i = 0; i < 80; i++) history = withChoice(history, `flow:f${i}`);
    expect(history.chosen).toHaveLength(HISTORY_CHOSEN_LIMIT);
    expect(history.chosen[0]?.id).toBe('flow:f79');
  });

  it('keeps searches newest first without repeats or blanks, at most 20', () => {
    let history = EMPTY_HISTORY;
    for (const text of ['blue sword', '  ', 'Blue  Sword', 'skyblock'])
      history = withSearch(history, text);
    expect(history.searches).toEqual(['skyblock', 'Blue Sword']);
    for (let i = 0; i < 30; i++) history = withSearch(history, `query ${i}`);
    expect(history.searches).toHaveLength(HISTORY_SEARCH_LIMIT);
    expect(withSearch(history, 'x'.repeat(500))).toBe(history);
  });

  it('reads back what it wrote and drops anything malformed', () => {
    const storage = memory();
    const history = withSearch(withChoice(EMPTY_HISTORY, 'flow:pet'), 'pet fox');
    writeHistory(history, storage);
    expect(readHistory(storage)).toEqual(history);
    storage.setItem(HISTORY_STORAGE_KEY, '{not json');
    expect(readHistory(storage)).toEqual(EMPTY_HISTORY);
    expect(
      parseHistory({
        chosen: [{ id: 'a', count: -2 }, { id: 'a' }, { id: 3 }, null],
        searches: ['b', 4, 'b'],
      }),
    ).toEqual({ chosen: [{ id: 'a', count: 1 }], searches: ['b'] });
    writeHistory(EMPTY_HISTORY, storage);
    expect(storage.data.has(HISTORY_STORAGE_KEY)).toBe(false);
  });

  it('ignores storage that fails', () => {
    const broken: HistoryStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readHistory(broken)).toEqual(EMPTY_HISTORY);
    expect(() => writeHistory(withChoice(EMPTY_HISTORY, 'x'), broken)).not.toThrow();
  });
});
