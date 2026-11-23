/**
 * The plugins' vocabulary, merged and read at query time (ADR 0124 D5): word groups that share an
 * idea are one group across plugins (B655: the library and the content plugins may both name
 * `experience`); a word of a group reaches the group's idea and its other words, a `near` word
 * reaches the idea more weakly, a listed misspelling is read as the idea (shown as corrected),
 * and the group's vanilla ids reach the entries that carry them. Lines of several words
 * (`pick axe`, `random tick`, a two-word idea) are phrases, matched before stop words are
 * dropped. Colour names are known words (they are answers, B659), never corrected.
 *
 * Data only from the plugins; nothing here is a game word. Pure and deterministic: the merged
 * groups keep the order the vocabularies were handed in.
 */

import type { SearchVocabulary } from '@msm/plugin-api';
import {
  createPhraseMatcher,
  fold,
  isStopWord,
  normalise,
  type PhraseMatcher,
  wordsOf,
} from '../text';

/** How a word belongs to a group. */
export type SenseKind = 'idea' | 'same' | 'slang' | 'near' | 'misspelling';

/** One meaning of a word or phrase: the group it belongs to and how. */
export interface WordSense {
  readonly idea: string;
  readonly kind: SenseKind;
}

/** A group of one idea, merged across plugins, its words folded. */
export interface MergedGroup {
  /** The idea as a key: folded words joined by one space. */
  readonly idea: string;
  /** Every form that means the idea (the idea first, then same and slang), as word lists. */
  readonly forms: readonly (readonly string[])[];
  /** Whole ids the idea stands for (`ns:path`), lower case. */
  readonly vanillaIds: readonly string[];
}

export interface Vocabulary {
  /** Groups by idea key. */
  readonly groups: ReadonlyMap<string, MergedGroup>;
  /** The senses of one folded word (single-word lines). */
  senses(word: string): readonly WordSense[];
  /** Lines of several words, keyed by their folded words. */
  readonly phrases: PhraseMatcher<WordSense>;
  /** Colour names: folded words joined by one space, to `#rrggbb`. */
  readonly colours: ReadonlyMap<string, string>;
  /** Colour names of several words. */
  readonly colourPhrases: PhraseMatcher<string>;
  /** Plain words the vocabulary knows (no misspellings), for the dictionary. */
  readonly words: ReadonlySet<string>;
}

/** Strings read from one list of a group: odd values are skipped, long lists cut. */
const MAX_LIST = 256;

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value.slice(0, MAX_LIST)) if (typeof item === 'string') out.push(item);
  return out;
}

/** The folded words of a vocabulary line, stop words kept (phrases are matched with them). */
function lineWords(line: string): string[] {
  return wordsOf(line.slice(0, 200)).map(fold);
}

interface Building {
  idea: string;
  forms: string[][];
  formKeys: Set<string>;
  vanillaIds: string[];
  lines: { words: string[]; kind: SenseKind }[];
}

/** Merges the vocabularies of the plugins, in the order they are handed in. */
export function createVocabulary(vocabularies: readonly SearchVocabulary[] = []): Vocabulary {
  const building = new Map<string, Building>();
  const colours = new Map<string, string>();
  const list = Array.isArray(vocabularies) ? vocabularies : [];
  for (const vocabulary of list) {
    if (typeof vocabulary !== 'object' || vocabulary === null) continue;
    for (const group of Array.isArray(vocabulary.words) ? vocabulary.words : []) {
      if (typeof group?.idea !== 'string') continue;
      const ideaWords = lineWords(group.idea);
      if (ideaWords.length === 0) continue;
      const idea = ideaWords.join(' ');
      let b = building.get(idea);
      if (b === undefined) {
        b = { idea, forms: [], formKeys: new Set(), vanillaIds: [], lines: [] };
        building.set(idea, b);
      }
      const addForm = (words: string[], kind: SenseKind): void => {
        if (words.length === 0) return;
        b.lines.push({ words, kind });
        if (kind === 'near' || kind === 'misspelling') return;
        const key = words.join(' ');
        if (b.formKeys.has(key)) return;
        b.formKeys.add(key);
        b.forms.push(words);
      };
      addForm(ideaWords, 'idea');
      for (const word of strings(group.same)) addForm(lineWords(word), 'same');
      for (const word of strings(group.slang)) addForm(lineWords(word), 'slang');
      for (const word of strings(group.phrases)) addForm(lineWords(word), 'same');
      for (const word of strings(group.near)) addForm(lineWords(word), 'near');
      for (const word of strings(group.misspellings)) addForm(lineWords(word), 'misspelling');
      for (const id of strings(group.vanillaIds)) {
        const key = normalise(id).trim();
        if (key !== '' && !b.vanillaIds.includes(key)) b.vanillaIds.push(key);
      }
    }
    for (const colour of Array.isArray(vocabulary.colours) ? vocabulary.colours : []) {
      if (typeof colour?.colour !== 'string') continue;
      for (const name of strings(colour.names)) {
        const key = lineWords(name).join(' ');
        if (key !== '' && !colours.has(key)) colours.set(key, colour.colour.toLowerCase());
      }
    }
  }

  const groups = new Map<string, MergedGroup>();
  const senses = new Map<string, WordSense[]>();
  const phraseLines: { phrase: string; value: WordSense }[] = [];
  const words = new Set<string>();
  const addSense = (key: string, sense: WordSense): void => {
    const list = senses.get(key);
    if (list === undefined) senses.set(key, [sense]);
    else if (!list.some((s) => s.idea === sense.idea && s.kind === sense.kind)) list.push(sense);
  };
  for (const b of building.values()) {
    groups.set(b.idea, { idea: b.idea, forms: b.forms, vanillaIds: b.vanillaIds });
    for (const line of b.lines) {
      const sense: WordSense = { idea: b.idea, kind: line.kind };
      if (line.words.length === 1) addSense(line.words[0] as string, sense);
      else phraseLines.push({ phrase: line.words.join(' '), value: sense });
      if (line.kind !== 'misspelling') {
        for (const word of line.words) if (!isStopWord(word)) words.add(word);
      }
    }
  }
  const colourLines: { phrase: string; value: string }[] = [];
  for (const [name, hex] of colours) {
    if (name.includes(' ')) colourLines.push({ phrase: name, value: hex });
    for (const word of name.split(' ')) if (!isStopWord(word)) words.add(word);
  }
  const none: readonly WordSense[] = [];
  return {
    groups,
    senses: (word) => senses.get(word) ?? none,
    phrases: createPhraseMatcher(phraseLines),
    colours,
    colourPhrases: createPhraseMatcher(colourLines),
    words,
  };
}
