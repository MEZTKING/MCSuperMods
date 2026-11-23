/**
 * The words the answer slots read (ADR 0124 D7; B659): the query's words as the reader was given
 * them (corrected and folded), keyed for matching by the light stemmer, with the clause words
 * left out and stop words kept only for the "after" and "no" checks. Phrases of a question (its
 * label, its hint words, its choices) are keyed the same way, so `diamonds` meets `diamond` and
 * `colour` meets `color`. Language only: every word comes from the query or the plugins' data.
 */

import { fold, isStopWord, normalise, numberOf, stem, wordsOf } from '../text';

/** The key two words are compared by: folded, then stemmed. */
export function keyOf(word: string): string {
  return stem(fold(word));
}

/** A phrase as keys, stop words left out (`No recipe` is `no recipe`, `made of iron` is `made iron`). */
export interface Phrase {
  readonly keys: readonly string[];
  /** The phrase as written, for chips and names. */
  readonly text: string;
}

/** Characters of one phrase read; the rest is ignored. */
const MAX_PHRASE_CHARS = 120;

/** A phrase from a line of data, or undefined when it has no word that is not a stop word. */
export function phraseOf(line: unknown): Phrase | undefined {
  if (typeof line !== 'string') return undefined;
  const text = line.slice(0, MAX_PHRASE_CHARS);
  const keys = wordsOf(text)
    .filter((w) => !isStopWord(w))
    .map(keyOf);
  return keys.length === 0 ? undefined : { keys, text: text.trim() };
}

/** The folded words of a line, stop words kept: for "after" lines such as `made of`. */
export function rawWordsOf(line: unknown): string[] {
  if (typeof line !== 'string') return [];
  return wordsOf(line.slice(0, MAX_PHRASE_CHARS)).map(fold);
}

/** One word that can be part of an answer. */
export interface FlatWord {
  /** Its index in the query's words. */
  readonly at: number;
  readonly key: string;
  /** Words between clause and head never join one phrase. */
  readonly segment: number;
}

/** A run of the query's words: `start` to `end`, exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** The query's words as the slots read them. */
export interface AnswerText {
  /** The normalised words as typed. */
  readonly words: readonly string[];
  /** The folded words, corrections applied (a correction may be several words in one slot). */
  readonly folded: readonly string[];
  /** Words left out: the clause and its cue, and the words of a quoted or "called" name. */
  readonly skip: ReadonlySet<number>;
  /** The words that are not stop words and not left out, in order. */
  readonly flat: readonly FlatWord[];
  /** Vocabulary ideas by word index, as phrase keys joined by one space. */
  readonly ideas: ReadonlyMap<number, readonly string[]>;
}

/** Builds the slots' view of the words. */
export function answerText(
  words: readonly string[],
  folded: readonly string[],
  skip: ReadonlySet<number>,
  ideas: ReadonlyMap<number, readonly string[]>,
): AnswerText {
  const flat: FlatWord[] = [];
  let segment = 0;
  for (let i = 0; i < words.length; i++) {
    if (skip.has(i)) {
      segment++;
      continue;
    }
    const slot = folded[i] ?? words[i] ?? '';
    for (const part of slot.split(' ')) {
      if (part === '' || isStopWord(part)) continue;
      flat.push({ at: i, key: keyOf(part), segment });
    }
  }
  const keyedIdeas = new Map<number, string[]>();
  for (const [i, list] of ideas) {
    if (skip.has(i)) continue;
    const keys: string[] = [];
    for (const idea of list) {
      const phrase = phraseOf(idea);
      if (phrase !== undefined) keys.push(phrase.keys.join(' '));
    }
    if (keys.length > 0) keyedIdeas.set(i, keys);
  }
  return { words, folded, skip, flat, ideas: keyedIdeas };
}

/**
 * Every place the phrase is found in the words, left to right, none of its words in `used`:
 * the keys one after another in one segment, or an idea of one word that is the whole phrase.
 */
export function findPhrase(
  text: AnswerText,
  phrase: Phrase,
  used: ReadonlySet<number> = new Set(),
): Span[] {
  const out: Span[] = [];
  const joined = phrase.keys.join(' ');
  const n = phrase.keys.length;
  let lastEnd = -1;
  for (let s = 0; s < text.flat.length; s++) {
    const first = text.flat[s] as FlatWord;
    if (first.at < lastEnd) continue;
    let ok = s + n <= text.flat.length;
    for (let k = 0; ok && k < n; k++) {
      const w = text.flat[s + k] as FlatWord;
      if (w.key !== phrase.keys[k] || w.segment !== first.segment || used.has(w.at)) ok = false;
    }
    if (ok) {
      const end = (text.flat[s + n - 1] as FlatWord).at + 1;
      out.push({ start: first.at, end });
      lastEnd = end;
      continue;
    }
    if (!used.has(first.at) && text.ideas.get(first.at)?.includes(joined) === true) {
      out.push({ start: first.at, end: first.at + 1 });
      lastEnd = first.at + 1;
    }
  }
  return out;
}

/** The word indexes of a span. */
export function indexesOf(span: Span): number[] {
  const out: number[] = [];
  for (let i = span.start; i < span.end; i++) out.push(i);
  return out;
}

/** Words that may stand between an "after" word and the answer: `sells 3 diamonds`, `made of the`. */
function isFiller(word: string): boolean {
  return isStopWord(word) || /^[0-9]/.test(word) || numberOf(word) !== undefined;
}

/** Filler words read between an "after" line and its answer. */
const MAX_FILLER = 2;

/**
 * The span of the first of `lines` (folded words, stop words kept) that ends just before
 * `start`, with at most two filler words between; undefined when none does.
 */
export function precededBy(
  text: AnswerText,
  start: number,
  lines: readonly (readonly string[])[],
): Span | undefined {
  for (let gap = 0; gap <= MAX_FILLER; gap++) {
    const end = start - gap;
    if (end < 0) break;
    if (gap > 0) {
      const filler = text.folded[end] ?? '';
      if (text.skip.has(end) || !isFiller(filler)) break;
    }
    for (const line of lines) {
      if (line.length === 0 || line.length > end) continue;
      let ok = true;
      for (let k = 0; ok && k < line.length; k++) {
        const at = end - line.length + k;
        if (text.skip.has(at) || (text.folded[at] ?? '') !== line[k]) ok = false;
      }
      if (ok) return { start: end - line.length, end };
    }
  }
  return undefined;
}

/** Words that turn a yes or no answer into no. */
const NEGATIONS: ReadonlySet<string> = new Set([
  'no',
  'not',
  'without',
  'never',
  'non',
  'dont',
  'doesnt',
  'cant',
  'cannot',
  'isnt',
  'wont',
]);

/** The index of a word of negation just before `start` (stop words between), or undefined. */
export function negatedAt(text: AnswerText, start: number): number | undefined {
  for (let at = start - 1; at >= 0 && at >= start - 1 - MAX_FILLER; at--) {
    if (text.skip.has(at)) return undefined;
    const word = text.folded[at] ?? '';
    if (NEGATIONS.has(word)) return at;
    if (!isStopWord(word)) return undefined;
  }
  return undefined;
}

/** A name in title case: `blue sword` is `Blue Sword`. */
export function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => (w === '' ? w : `${w.charAt(0).toUpperCase()}${w.slice(1)}`))
    .join(' ');
}

/** The words of a span as typed, joined by one space. */
export function spanText(text: AnswerText, span: Span): string {
  return text.words.slice(span.start, span.end).join(' ');
}

/** Lower case, accents stripped, spaces folded: how two names are compared. */
export function plain(text: string): string {
  return normalise(text).replace(/\s+/g, ' ').trim();
}
