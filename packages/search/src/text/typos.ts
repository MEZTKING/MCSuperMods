/**
 * Typo candidates (ADR 0124 D4, B650 SQ3): trigram overlap, verified by the edit distance.
 *
 * - A word the dictionary does not know is corrected; a known word never is.
 * - Edits allowed by length ({@link editsFor}): none for three letters or fewer, one for four to
 *   seven, two for eight or more; a swap of neighbours counts as one (optimal string alignment).
 *   A candidate must also be within its own limit (at least one), so a short word is never
 *   reached by two edits.
 * - Candidates share at least 30 % of the typed word's trigrams (padded with two spaces in front
 *   and one behind), or are the typed word with two neighbouring letters swapped: such a swap is
 *   looked up directly, because in a short word it leaves too few trigrams in common (`tnak`
 *   shares one of five with `tank`; ADR 0124's open item after B666). It is still one edit, so
 *   SL13's limits by length hold: a word of three letters or fewer is never corrected.
 * - Ties of edits break by B650's rules: the same first letter, then one letter swapped for a key
 *   beside it (`caje` is `cake`, not `cave`), then a longer word the typed word begins (`flowe`
 *   is `flower`), then frequency, then the word itself.
 * - {@link TypoIndex.complete} gives prefix matches for the word being typed.
 *
 * Words are normalised and folded by the caller. Words shorter than three letters and numbers
 * are left out of the index. Pure and deterministic; memory is one string list, one frequency
 * array and one posting array per trigram.
 */

/** The edits allowed for a typed word of this many letters. */
export function editsFor(length: number): number {
  if (length <= 3) return 0;
  return length <= 7 ? 1 : 2;
}

/**
 * The optimal string alignment distance between two words (a swap of neighbours counts as one
 * edit), or `max + 1` as soon as it is known to be more than `max`.
 */
export function osa(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = b.length;
  let before = new Array<number>(m + 1).fill(0);
  let previous = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(m + 1);
    row[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (previous[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (before[j - 2] as number) + 1);
      }
      row[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    before = previous;
    previous = row;
  }
  return previous[m] as number;
}

/** One candidate correction. */
export interface TypoCandidate {
  readonly word: string;
  readonly edits: number;
}

export interface TypoIndex {
  /** How many words the index holds. */
  readonly size: number;
  /** Whether the index holds this word. */
  has(word: string): boolean;
  /** How many entries the word was counted in (0 if unknown). */
  frequency(word: string): number;
  /** Candidates within the edit limits, best first; empty for a known word or a short one. */
  correct(word: string, limit?: number): TypoCandidate[];
  /** Words that begin with the prefix and are longer than it, most frequent first. */
  complete(prefix: string, limit?: number): string[];
}

export interface TypoOptions {
  /** The share of the typed word's trigrams a candidate must have. B650: 0.3. */
  readonly minShared?: number;
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_POSITION = new Map<string, readonly [number, number]>();
ROWS.forEach((row, r) => {
  for (let i = 0; i < row.length; i++) KEY_POSITION.set(row[i] as string, [r, i]);
});

/** Whether two keys sit side by side in one row. */
function besideKey(a: string, b: string): boolean {
  const pa = KEY_POSITION.get(a);
  const pb = KEY_POSITION.get(b);
  return pa !== undefined && pb !== undefined && pa[0] === pb[0] && Math.abs(pa[1] - pb[1]) === 1;
}

/** Whether `candidate` is `word` with one letter swapped for a key beside it. */
function keySwap(word: string, candidate: string): boolean {
  if (word.length !== candidate.length) return false;
  let at = -1;
  for (let i = 0; i < word.length; i++) {
    if (word[i] === candidate[i]) continue;
    if (at >= 0) return false;
    at = i;
  }
  return at >= 0 && besideKey(word[at] as string, candidate[at] as string);
}

function trigrams(word: string): string[] {
  const padded = `  ${word} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

const NUMBER = /^[0-9.]+$/;
/** Longer typed words are not corrected (a word of the vocabulary has at most 64 characters). */
const MAX_WORD = 64;

/** Builds the typo index over words and the number of entries each was counted in. */
export function createTypoIndex(
  input: Iterable<readonly [string, number]>,
  options: TypoOptions = {},
): TypoIndex {
  const minShared = options.minShared ?? 0.3;
  const counts = new Map<string, number>();
  for (const [word, count] of input) {
    if (word.length < 3 || NUMBER.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + Math.max(0, count));
  }
  // Words sorted, so a word's number is stable and prefix search is a binary search.
  const words = [...counts.keys()].sort();
  const freq = Float64Array.from(words, (word) => counts.get(word) as number);
  const numberOfWord = new Map<string, number>();
  for (let n = 0; n < words.length; n++) numberOfWord.set(words[n] as string, n);

  const lists = new Map<string, number[]>();
  words.forEach((word, n) => {
    for (const gram of new Set(trigrams(word))) {
      const list = lists.get(gram);
      if (list === undefined) lists.set(gram, [n]);
      else list.push(n);
    }
  });
  const postings = new Map<string, Uint32Array>();
  for (const [gram, list] of lists) postings.set(gram, Uint32Array.from(list));
  const shared = new Uint16Array(words.length);

  const rank = (word: string, a: TypoCandidate, b: TypoCandidate): number => {
    if (a.edits !== b.edits) return a.edits - b.edits;
    const first = Number(b.word[0] === word[0]) - Number(a.word[0] === word[0]);
    if (first !== 0) return first;
    const key = Number(keySwap(word, b.word)) - Number(keySwap(word, a.word));
    if (key !== 0) return key;
    const stemOfTyped = word.slice(0, -1);
    const longer = (c: string): number =>
      Number(c.startsWith(stemOfTyped) && c.length > word.length);
    const begins = longer(b.word) - longer(a.word);
    if (begins !== 0) return begins;
    const byFrequency =
      (freq[numberOfWord.get(b.word) as number] as number) -
      (freq[numberOfWord.get(a.word) as number] as number);
    if (byFrequency !== 0) return byFrequency;
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
  };

  const lowerBound = (prefix: string): number => {
    let lo = 0;
    let hi = words.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((words[mid] as string) < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    size: words.length,
    has: (word) => numberOfWord.has(word),
    frequency: (word) => {
      const n = numberOfWord.get(word);
      return n === undefined ? 0 : (freq[n] as number);
    },
    correct(word, limit = 8) {
      if (typeof word !== 'string' || word.length > MAX_WORD || numberOfWord.has(word)) return [];
      const max = editsFor(word.length);
      if (max === 0) return [];
      const grams = new Set(trigrams(word));
      const touched: number[] = [];
      for (const gram of grams) {
        const list = postings.get(gram);
        if (list === undefined) continue;
        for (const n of list) {
          if (shared[n] === 0) touched.push(n);
          shared[n] = (shared[n] as number) + 1;
        }
      }
      const found: TypoCandidate[] = [];
      const swaps = new Set<number>();
      for (let i = 0; i + 1 < word.length; i++) {
        if (word[i] === word[i + 1]) continue;
        const swapped = `${word.slice(0, i)}${word[i + 1]}${word[i]}${word.slice(i + 2)}`;
        const n = numberOfWord.get(swapped);
        if (n !== undefined) swaps.add(n);
      }
      for (const n of touched) {
        const count = shared[n] as number;
        shared[n] = 0;
        if (count / grams.size < minShared && !swaps.has(n)) continue;
        swaps.delete(n);
        const candidate = words[n] as string;
        const edits = osa(word, candidate, max);
        if (edits <= max && edits <= Math.max(1, editsFor(candidate.length))) {
          found.push({ word: candidate, edits });
        }
      }
      // Swaps that shared no trigram at all were not touched.
      for (const n of swaps) found.push({ word: words[n] as string, edits: 1 });
      found.sort((a, b) => rank(word, a, b));
      return found.slice(0, Math.max(0, limit));
    },
    complete(prefix, limit = 8) {
      if (typeof prefix !== 'string' || prefix === '') return [];
      const out: number[] = [];
      for (let n = lowerBound(prefix); n < words.length; n++) {
        const word = words[n] as string;
        if (!word.startsWith(prefix)) break;
        if (word.length > prefix.length) out.push(n);
      }
      out.sort((a, b) => (freq[b] as number) - (freq[a] as number) || a - b);
      return out.slice(0, Math.max(0, limit)).map((n) => words[n] as string);
    },
  };
}
