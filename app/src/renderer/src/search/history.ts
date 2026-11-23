/**
 * The local search history (ADR 0124 D11; B660): the last 50 chosen results and the last 20
 * searches, kept in this computer's local storage behind **Remember my searches** (the
 * preferences store, `store/preferences.ts`) with **Clear my searches**. It is never in the
 * project, never exported, never sent to the AI helper, and nothing leaves the computer. The
 * engine reads it as counts by entry id (`SearchContext.history`), so results chosen before rank
 * a little higher. Pure functions plus a storage read and write that ignore failures.
 *
 * @packageDocumentation
 */

/** The most chosen results kept. */
export const HISTORY_CHOSEN_LIMIT = 50;
/** The most searches kept. */
export const HISTORY_SEARCH_LIMIT = 20;
/** The longest search kept, in characters. */
export const HISTORY_TEXT_LIMIT = 200;
/** The local storage key. */
export const HISTORY_STORAGE_KEY = 'msm.search-history.v1';

/** One chosen result: its entry id and how many times it was chosen. */
export interface ChosenResult {
  readonly id: string;
  readonly count: number;
}

/** The history: newest first. */
export interface SearchHistory {
  readonly chosen: readonly ChosenResult[];
  readonly searches: readonly string[];
}

/** No history. */
export const EMPTY_HISTORY: SearchHistory = Object.freeze({ chosen: [], searches: [] });

/** The history with `id` chosen once more, moved to the front. */
export function withChoice(history: SearchHistory, id: string): SearchHistory {
  if (typeof id !== 'string' || id === '') return history;
  const held = history.chosen.find((entry) => entry.id === id);
  const chosen = [
    { id, count: (held?.count ?? 0) + 1 },
    ...history.chosen.filter((entry) => entry.id !== id),
  ].slice(0, HISTORY_CHOSEN_LIMIT);
  return { chosen, searches: history.searches };
}

/** The history with a search added at the front (blank searches and repeats are not kept twice). */
export function withSearch(history: SearchHistory, text: string): SearchHistory {
  const value = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (value === '' || value.length > HISTORY_TEXT_LIMIT) return history;
  const key = value.toLowerCase();
  const searches = [
    value,
    ...history.searches.filter((entry) => entry.toLowerCase() !== key),
  ].slice(0, HISTORY_SEARCH_LIMIT);
  return { chosen: history.chosen, searches };
}

/** The counts the engine reads (`SearchContext.history`). */
export function historyCounts(history: SearchHistory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of history.chosen) out[entry.id] = entry.count;
  return out;
}

/** A stored value read back as a history; anything malformed is dropped. */
export function parseHistory(value: unknown): SearchHistory {
  if (typeof value !== 'object' || value === null) return EMPTY_HISTORY;
  const record = value as { chosen?: unknown; searches?: unknown };
  const chosen: ChosenResult[] = [];
  for (const entry of Array.isArray(record.chosen) ? record.chosen : []) {
    const id = (entry as { id?: unknown } | null)?.id;
    const count = (entry as { count?: unknown } | null)?.count;
    if (typeof id !== 'string' || id === '' || chosen.some((held) => held.id === id)) continue;
    chosen.push({
      id,
      count:
        typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    });
  }
  let history: SearchHistory = { chosen: chosen.slice(0, HISTORY_CHOSEN_LIMIT), searches: [] };
  const searches = Array.isArray(record.searches) ? record.searches : [];
  for (const text of [...searches].reverse()) {
    if (typeof text === 'string') history = withSearch(history, text);
  }
  return history;
}

/** The storage the history uses (the window's local storage, if any). */
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const localStorageOf = (): HistoryStorage | undefined =>
  (globalThis as { localStorage?: HistoryStorage }).localStorage;

/** Reads the stored history; empty when there is none or storage fails. */
export function readHistory(storage: HistoryStorage | undefined = localStorageOf()): SearchHistory {
  try {
    const text = storage?.getItem(HISTORY_STORAGE_KEY);
    return text === null || text === undefined ? EMPTY_HISTORY : parseHistory(JSON.parse(text));
  } catch {
    return EMPTY_HISTORY;
  }
}

/** Writes the history (an empty one removes the key); failures are ignored. */
export function writeHistory(
  history: SearchHistory,
  storage: HistoryStorage | undefined = localStorageOf(),
): void {
  try {
    if (history.chosen.length === 0 && history.searches.length === 0) {
      storage?.removeItem(HISTORY_STORAGE_KEY);
    } else {
      storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
  } catch {
    // Storage is unavailable: the history lasts for this run only.
  }
}
