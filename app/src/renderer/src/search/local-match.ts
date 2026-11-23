/**
 * One matcher for the app's own short lists (ADR 0124; B668): the sidebar's search, the New
 * element dialog's template filter, the Examples gallery and the ThingPicker. Each surface keeps
 * its old exact matcher as the first tier, so everything it matched before still matches and
 * comes first; this module is the second tier, made of `@msm/search`'s text half run on the main
 * thread over the surface's own list:
 *
 * - British and American spellings folded (`armor` is `armour`), the light stemmer (`swords` is
 *   `sword`), and a word that begins a word of the list (`dia` finds `diamond`);
 * - the plugins' word groups (`same`, `slang` and listed misspellings, never the weaker `near`),
 *   once they are loaded: {@link useLocalWords} loads them in the app, tests hand them in with
 *   {@link setLocalVocabulary};
 * - one or two wrong letters by the engine's limits (none for three letters or fewer, one for
 *   four to seven, two for longer; limit SL13), only for a word the list does not know.
 *
 * Only the text half of the engine (`@msm/search/text`) is imported, never the index or the
 * ranking, so the first paint stays small. Pure but for the word groups' module state.
 *
 * @packageDocumentation
 */

import type { SearchVocabulary } from '@msm/plugin-api';
import { editsFor, fold, isStopWord, osa, stem, wordsOf } from '@msm/search/text';
import { useEffect, useSyncExternalStore } from 'react';

/** A word in its matching forms: folded, and folded then stemmed. */
interface Forms {
  readonly folded: string;
  readonly stemmed: string;
}

/** Words of a text, folded and stemmed, remembered by text (cleared when it grows large). */
const wordCache = new Map<string, readonly Forms[]>();
const WORD_CACHE_LIMIT = 50_000;

function formsOf(word: string): Forms {
  const folded = fold(word);
  return { folded, stemmed: stem(folded) };
}

/** The matching forms of every word of a text (ids are split at `:`, `/` and `_`). */
export function localWords(text: string): readonly Forms[] {
  const held = wordCache.get(text);
  if (held !== undefined) return held;
  const out = wordsOf(text).map(formsOf);
  if (wordCache.size >= WORD_CACHE_LIMIT) wordCache.clear();
  wordCache.set(text, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The plugins' word groups.

/** Ideas by word form (folded and stemmed), or `null` before the groups are loaded. */
let ideas: Map<string, Set<string>> | null = null;
let revision = 0;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function addIdea(map: Map<string, Set<string>>, line: string, idea: string): void {
  const words = wordsOf(line);
  // Lines of several words are phrases: the short lists match word by word, so they are left out.
  if (words.length !== 1) return;
  const forms = formsOf(words[0] as string);
  for (const key of new Set([forms.folded, forms.stemmed])) {
    const set = map.get(key) ?? new Set<string>();
    set.add(idea);
    map.set(key, set);
  }
}

/**
 * Hands in the plugins' vocabularies (in plugin order); replaces any held before. Tests call it
 * directly; {@link loadLocalWords} calls it with the built-in plugins' data.
 */
export function setLocalVocabulary(vocabularies: readonly SearchVocabulary[] | null): void {
  if (vocabularies === null) {
    ideas = null;
  } else {
    const map = new Map<string, Set<string>>();
    for (const vocabulary of vocabularies) {
      for (const group of vocabulary.words ?? []) {
        const idea = fold(String(group.idea ?? '').toLowerCase());
        if (idea === '') continue;
        for (const line of [
          group.idea,
          ...(group.same ?? []),
          ...(group.slang ?? []),
          ...(group.misspellings ?? []),
        ]) {
          if (typeof line === 'string') addIdea(map, line, idea);
        }
      }
    }
    ideas = map;
  }
  revision += 1;
  for (const listener of listeners) listener();
}

/**
 * Loads the built-in plugins' word groups once (their lazy `searchData`, shared with the search's
 * own gathering in `plugin-data.ts`). A failure leaves the groups out; the rest still matches.
 */
export function loadLocalWords(): Promise<void> {
  if (ideas !== null) return Promise.resolve();
  loading ??= (async () => {
    try {
      const [{ builtInPlugins }, { gatherSearchData }] = await Promise.all([
        import('../plugins/built-in'),
        import('./plugin-data'),
      ]);
      const gathered = await gatherSearchData(builtInPlugins);
      if (ideas !== null) return;
      setLocalVocabulary(
        gathered.flatMap((entry) =>
          entry.data.vocabulary === undefined ? [] : [entry.data.vocabulary],
        ),
      );
    } catch {
      // The groups stay out; spellings, stems and typos still work.
    }
  })();
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the app's preload bridge is there (the real app, not a test). */
function inApp(): boolean {
  return (globalThis as { msm?: unknown }).msm !== undefined;
}

/**
 * The word groups' revision, for a surface's memo: it changes once the groups are loaded. In the
 * app the first call starts loading them, after the first paint.
 */
export function useLocalWords(): number {
  useEffect(() => {
    if (ideas !== null || !inApp()) return;
    const timer = setTimeout(() => void loadLocalWords(), 0);
    return () => clearTimeout(timer);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision,
  );
}

function ideasOf(forms: Forms): ReadonlySet<string> | undefined {
  if (ideas === null) return undefined;
  const a = ideas.get(forms.folded);
  const b = forms.stemmed === forms.folded ? undefined : ideas.get(forms.stemmed);
  if (a === undefined) return b;
  if (b === undefined) return a;
  return new Set([...a, ...b]);
}

function shareIdea(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined) {
  if (a === undefined || b === undefined) return false;
  for (const idea of a) if (b.has(idea)) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// The query.

/** A query read once, matched against many texts. */
export interface LocalQuery {
  /** Whether the query has no word to match (blank, or stop words only). */
  readonly empty: boolean;
  /** Whether every word of the query finds a word in one of the texts. */
  matches(texts: readonly string[]): boolean;
}

/** What a query is read with. */
export interface LocalQueryOptions {
  /**
   * The words of the whole list ({@link dictionaryOf}): a query word the list knows is never
   * corrected (limit SL13: a misspelling that is itself a word is not corrected).
   */
  readonly dictionary?: ReadonlySet<string>;
}

/** The folded and stemmed words of many texts: the list's dictionary. */
export function dictionaryOf(texts: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const forms of localWords(text)) {
      out.add(forms.folded);
      out.add(forms.stemmed);
    }
  }
  return out;
}

/** Shortest start of a word that is matched as the beginning of a longer one. */
const MIN_PREFIX = 3;

interface QueryWord extends Forms {
  readonly ideas: ReadonlySet<string> | undefined;
  /** Edits allowed, 0 when the word is not corrected. */
  readonly edits: number;
}

function wordMatches(query: QueryWord, word: Forms): boolean {
  if (query.folded === word.folded || query.stemmed === word.stemmed) return true;
  if (query.folded.length >= MIN_PREFIX && word.folded.startsWith(query.folded)) return true;
  if (query.stemmed.length >= MIN_PREFIX && word.folded.startsWith(query.stemmed)) return true;
  if (shareIdea(query.ideas, ideasOf(word))) return true;
  if (query.edits > 0) {
    // A word of the list is reached only within its own limit too (at least one).
    const own = Math.max(1, editsFor(word.folded.length));
    const limit = Math.min(query.edits, own);
    if (osa(query.folded, word.folded, limit) <= limit) return true;
    if (osa(query.stemmed, word.stemmed, limit) <= limit) return true;
  }
  return false;
}

const EMPTY: LocalQuery = { empty: true, matches: () => false };

/** Reads a query for the short lists. */
export function localQuery(text: string, options: LocalQueryOptions = {}): LocalQuery {
  const all = localWords(typeof text === 'string' ? text : '');
  const kept = all.filter((forms) => !isStopWord(forms.folded));
  if (kept.length === 0) return EMPTY;
  const { dictionary } = options;
  const words: QueryWord[] = kept.map((forms) => {
    const known =
      dictionary !== undefined && (dictionary.has(forms.folded) || dictionary.has(forms.stemmed));
    const isNumber = /\d/.test(forms.folded);
    return {
      ...forms,
      ideas: ideasOf(forms),
      edits: known || isNumber || ideasOf(forms) !== undefined ? 0 : editsFor(forms.folded.length),
    };
  });
  return {
    empty: false,
    matches(texts) {
      const have = texts.flatMap((entry) => localWords(entry));
      return words.every((query) => have.some((word) => wordMatches(query, word)));
    },
  };
}

/**
 * The items an exact matcher keeps, in their order, then the ones only the {@link localQuery}
 * finds, in their order: what an exact match shows today stays first. A blank query keeps all.
 */
export function exactFirst<T>(
  items: readonly T[],
  query: string,
  exact: (item: T) => boolean,
  texts: (item: T) => readonly string[],
): T[] {
  if (query.trim() === '') return [...items];
  const first: T[] = [];
  const rest: T[] = [];
  let read: LocalQuery | null = null;
  for (const item of items) {
    if (exact(item)) {
      first.push(item);
      continue;
    }
    read ??= localQuery(query, { dictionary: dictionaryOf(items.flatMap(texts)) });
    if (!read.empty && read.matches(texts(item))) rest.push(item);
  }
  return [...first, ...rest];
}

let lastQuery: { text: string; revision: number; read: LocalQuery } | null = null;

/**
 * Whether one item's texts match a query, with no list around it (no dictionary: every unknown
 * word may be corrected). The last query read is kept, so a list filtered item by item reads it
 * once.
 */
export function matchesLocally(query: string, texts: readonly string[]): boolean {
  if (lastQuery === null || lastQuery.text !== query || lastQuery.revision !== revision) {
    lastQuery = { text: query, revision, read: localQuery(query) };
  }
  return !lastQuery.read.empty && lastQuery.read.matches(texts);
}
