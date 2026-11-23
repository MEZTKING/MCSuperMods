/**
 * Phrases, and joined and split words (ADR 0124 D4, D5).
 *
 * The phrase matcher finds the vocabulary's phrases (handed in: `sets on fire`, `pick axe`, a
 * single word too) in a list of words, leftmost and longest first, never overlapping. Phrase
 * and query words are compared by one key function (the folding by default, so `gray dye` and
 * `grey dye` meet). Joined and split words offer `starfish` for `star fish` and `pick axe` for
 * `pickaxe` when the dictionary knows the other form. Pure and deterministic.
 */

import { fold } from './spelling';
import { wordsOf } from './tokens';

/** One line of the vocabulary: a phrase and what it stands for. */
export interface PhraseLine<T> {
  readonly phrase: string;
  readonly value: T;
}

/** A phrase found in the words: words `start` to `end` (exclusive), with every value it has. */
export interface PhraseMatch<T> {
  readonly start: number;
  readonly end: number;
  /** The phrase as the matcher keys it (words joined by one space). */
  readonly phrase: string;
  /** The values of every line with this phrase, in the order the lines were handed in. */
  readonly values: readonly T[];
}

export interface PhraseMatcher<T> {
  /** How many distinct phrases the matcher holds. */
  readonly size: number;
  /** The phrases found in the words, left to right. */
  match(words: readonly string[]): PhraseMatch<T>[];
}

interface Node<T> {
  readonly next: Map<string, Node<T>>;
  values?: T[];
  phrase?: string;
}

/** Builds a phrase matcher. `key` maps a normalised word to the form both sides are compared in. */
export function createPhraseMatcher<T>(
  lines: Iterable<PhraseLine<T>>,
  key: (word: string) => string = fold,
): PhraseMatcher<T> {
  const root: Node<T> = { next: new Map() };
  let size = 0;
  for (const line of lines) {
    const words = wordsOf(line.phrase).map(key);
    if (words.length === 0) continue;
    let node = root;
    for (const word of words) {
      let child = node.next.get(word);
      if (child === undefined) {
        child = { next: new Map() };
        node.next.set(word, child);
      }
      node = child;
    }
    if (node.values === undefined) {
      node.values = [];
      node.phrase = words.join(' ');
      size++;
    }
    node.values.push(line.value);
  }
  return {
    size,
    match(input) {
      const words = input.map(key);
      const out: PhraseMatch<T>[] = [];
      let i = 0;
      while (i < words.length) {
        let node: Node<T> | undefined = root;
        let best: { end: number; node: Node<T> } | undefined;
        for (let j = i; j < words.length; j++) {
          node = node.next.get(words[j] as string);
          if (node === undefined) break;
          if (node.values !== undefined) best = { end: j + 1, node };
        }
        if (best === undefined) {
          i++;
          continue;
        }
        out.push({
          start: i,
          end: best.end,
          phrase: best.node.phrase as string,
          values: [...(best.node.values as T[])],
        });
        i = best.end;
      }
      return out;
    },
  };
}

/** Another reading of some words: two joined into one, or one split into two. */
export interface JoinOrSplit {
  readonly kind: 'joined' | 'split';
  /** The words replaced: `start` to `end` (exclusive). */
  readonly start: number;
  readonly end: number;
  /** What stands in their place. */
  readonly words: readonly string[];
}

/** A part of a split word has at least this many letters (`pick axe`, `sky block`). */
const MIN_PART = 3;

/**
 * Joined and split readings the dictionary knows: two neighbouring words whose join it knows,
 * and an unknown word that splits into two known words (the split with the longer first part
 * wins). Only readings of words of letters; numbers are left alone.
 */
export function joinsAndSplits(
  words: readonly string[],
  isKnown: (word: string) => boolean,
): JoinOrSplit[] {
  const out: JoinOrSplit[] = [];
  const letters = (word: string): boolean => /^\p{L}+$/u.test(word);
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    const next = words[i + 1];
    if (next !== undefined && letters(word) && letters(next) && isKnown(word + next)) {
      out.push({ kind: 'joined', start: i, end: i + 2, words: [word + next] });
    }
    if (letters(word) && word.length >= MIN_PART * 2 && !isKnown(word)) {
      for (let at = word.length - MIN_PART; at >= MIN_PART; at--) {
        const head = word.slice(0, at);
        const tail = word.slice(at);
        if (isKnown(head) && isKnown(tail)) {
          out.push({ kind: 'split', start: i, end: i + 1, words: [head, tail] });
          break;
        }
      }
    }
  }
  return out;
}
