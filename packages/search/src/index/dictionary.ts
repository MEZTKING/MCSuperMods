/**
 * The dictionary (ADR 0124 D4): every plain word the layers and the vocabulary hold, with the
 * number of entries holding it; the dictionary-aware stemmer (B653) over it, with the protected
 * words; the stem classes the query reads (a query word reaches every word of the index with the
 * same stem: `block` reaches `blocks`); and the typo index (trigram overlap, B653).
 *
 * Stemming happens at query time over the index's words as they are (`entry.ts`), so the
 * dictionary can change (a project word added) without rebuilding a layer.
 *
 * **Protected words** (B653's note): B650 protected every game id word of four letters or more,
 * which also protected plurals (`blocks`, `boots`, `stairs`) so that `block` and `blocks` never
 * met. Here a protected word stays protected unless it is the plain plural of a dictionary word
 * (`-s`, `-es`, `-ies`); a word the stemmer would change in any other way stays whole as handed
 * in: `-ves` (`leaves` is not `leave`, one of B650's bad merges), `-ing`, `-ed`.
 */

import { createTypoIndex, stem, type TypoIndex } from '../text';

/** The memo tables are cleared beyond this size, so a long session of odd words stays small. */
const MAX_MEMO = 20000;

export interface Dictionary {
  /** Words held, with the number of entries holding each (vocabulary words count one). */
  readonly counts: ReadonlyMap<string, number>;
  /** Whether a folded word is held. */
  has(word: string): boolean;
  /** The stem of a folded word, with the effective protected words. */
  stem(word: string): string;
  /** The held words with the same stem as this one (itself included when held), sorted. */
  siblings(word: string): readonly string[];
  /** The typo index over the held words. */
  readonly typo: TypoIndex;
  /** The protected words in force (after the plural rule above). */
  readonly protect: ReadonlySet<string>;
}

/**
 * The protected words in force: each handed-in word that is held or not, less the plain plurals
 * of dictionary words (B653's note).
 */
export function effectiveProtect(
  protect: Iterable<string>,
  dictionary: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const word of protect) {
    if (typeof word !== 'string' || word === '') continue;
    if (word.endsWith('s') && !word.endsWith('ves')) {
      const plain = stem(word, { dictionary });
      if (
        plain !== word &&
        (word === `${plain}s` || word === `${plain}es` || word === `${plain.slice(0, -1)}ies`)
      ) {
        continue;
      }
    }
    out.add(word);
  }
  return out;
}

/** Forms a stem can take in the index: the ones the stemmer reverses. */
export function inflections(base: string): string[] {
  const out = [base, `${base}s`, `${base}es`, `${base}ing`, `${base}ed`];
  const last = base.at(-1) ?? '';
  if (last === 'y') out.push(`${base.slice(0, -1)}ies`, `${base.slice(0, -1)}ied`);
  if (last === 'f') out.push(`${base.slice(0, -1)}ves`);
  if (base.endsWith('fe')) out.push(`${base.slice(0, -2)}ves`);
  if (last === 'e') out.push(`${base.slice(0, -1)}ing`, `${base}d`);
  if (/[b-df-hj-np-tv-z]$/.test(base)) out.push(`${base}${last}ing`, `${base}${last}ed`);
  return out;
}

/**
 * Builds the dictionary from word counts (the layers' and the vocabulary's) and the protected
 * words handed in. Counts of the same word are summed.
 */
export function createDictionary(
  sources: Iterable<ReadonlyMap<string, number>>,
  protect: Iterable<string> = [],
): Dictionary {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const [word, n] of source) counts.set(word, (counts.get(word) ?? 0) + n);
  }
  const words = new Set(counts.keys());
  const protectInForce = effectiveProtect(protect, words);
  const options = { protect: protectInForce, dictionary: words };
  const stems = new Map<string, string>();
  const stemOf = (word: string): string => {
    let out = stems.get(word);
    if (out === undefined) {
      if (stems.size >= MAX_MEMO) stems.clear();
      out = stem(word, options);
      stems.set(word, out);
    }
    return out;
  };
  const siblingCache = new Map<string, readonly string[]>();
  const typo = createTypoIndex(counts);
  return {
    counts,
    has: (word) => counts.has(word),
    stem: stemOf,
    siblings(word) {
      const base = stemOf(word);
      let forms = siblingCache.get(base);
      if (forms === undefined) {
        const found = new Set<string>();
        for (const form of inflections(base)) {
          if (counts.has(form) && stemOf(form) === base) found.add(form);
        }
        forms = [...found].sort();
        if (siblingCache.size >= MAX_MEMO) siblingCache.clear();
        siblingCache.set(base, forms);
      }
      if (!counts.has(word) || forms.includes(word)) return forms;
      return [...forms, word].sort();
    },
    typo,
    protect: protectInForce,
  };
}
