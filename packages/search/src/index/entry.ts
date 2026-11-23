/**
 * One entry made ready for the index (ADR 0124 D3): its fields split into folded words, stop
 * words left out, ids kept whole beside their words. The words are stored as they are, never
 * stemmed: stemming and the vocabulary are applied at query time (`dictionary.ts`), so a layer
 * never depends on another layer's words or on the vocabulary, and patching one layer leaves
 * the others as they were. Pure.
 */

import { FIELD_COUNT, FIELDS, type Field } from '../rank/weights';
import { fold, isStopWord, type TokenisedText, tokenise } from '../text';
import type { SearchEntry } from '../types';

/** Characters read of one field; the guide's bodies are cut, everything else is short. */
export const MAX_FIELD_CHARS: Readonly<Record<Field, number>> = {
  title: 400,
  words: 2000,
  answers: 4000,
  sentence: 1000,
  ids: 2000,
  body: 4000,
};

/** The index's words of one entry. */
export interface PreparedEntry {
  readonly entry: SearchEntry;
  /** Per field (in {@link FIELDS} order), the folded words; the id field also has whole ids. */
  readonly fields: readonly (readonly string[])[];
  /** The title's folded words, stop words left out (for the title bonuses). */
  readonly title: readonly string[];
  /** The name before a colon in the title (`Play: test the mod` is `play`), if there is one. */
  readonly name?: readonly string[];
}

/** A whole id holds `:`, `_` or `/`; a word never does (`tokenise`'s words are letters, digits and a decimal point). */
const ID_MARK = /[:_/]/;

/** Whether an index word is a plain word (not a whole id): plain words go to the dictionary. */
export function isPlainWord(word: string): boolean {
  return !ID_MARK.test(word);
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

function list(values: readonly unknown[] | undefined, max: number): string {
  if (!Array.isArray(values)) return '';
  let out = '';
  for (const value of values) {
    if (typeof value !== 'string') continue;
    if (out.length + value.length + 1 > max) break;
    out = out === '' ? value : `${out} ${value}`;
  }
  return out;
}

/** Folded words, remembered (fold is pure); cleared beyond this many. */
const MAX_FOLD_MEMO = 50000;
const folds = new Map<string, string>();

function folded(word: string): string {
  let out = folds.get(word);
  if (out === undefined) {
    if (folds.size >= MAX_FOLD_MEMO) folds.clear();
    out = fold(word);
    folds.set(word, out);
  }
  return out;
}

/**
 * Text that {@link tokenise} splits as plain runs of ASCII letters: no other character than
 * ASCII, no digit (thousands and decimals) and no apostrophe (joined inside a word). For it the
 * words are the lower-case letter runs, which is what `tokenise` gives, only faster.
 */
const SIMPLE = /^[^\u0080-\uffff0-9']*$/;
const LETTER_RUN = /[a-z]+/g;

function pushWords(out: string[], words: Iterable<string>): void {
  for (const word of words) {
    if (!isStopWord(word)) out.push(folded(word));
  }
}

/** The folded words of a text, stop words left out. */
export function indexWords(input: string): string[] {
  const out: string[] = [];
  if (input === '') return out;
  if (SIMPLE.test(input)) pushWords(out, input.toLowerCase().match(LETTER_RUN) ?? []);
  else
    pushWords(
      out,
      tokenise(input).words.map((token) => token.text),
    );
  return out;
}

/** The whole-id tokens of tokenised ids: `ns:a_b` gives `ns:a_b` and `a_b`; `a_b` gives `a_b`. */
function wholeIds(ids: TokenisedText['ids']): string[] {
  const out: string[] = [];
  for (const token of ids) {
    if (!out.includes(token.text)) out.push(token.text);
    const colon = token.text.indexOf(':');
    if (colon >= 0) {
      const path = token.text.slice(colon + 1);
      if (path !== '' && !out.includes(path)) out.push(path);
    }
  }
  return out;
}

/** The whole-id tokens of an id: `ns:a_b` gives `ns:a_b` and `a_b`; `a_b` gives `a_b`. */
export function idTokens(input: string): string[] {
  return wholeIds(tokenise(input).ids);
}

/** The id field: the ids' words and their whole tokens, from one split. */
function idWords(input: string): string[] {
  if (input === '') return [];
  const tokens = tokenise(input);
  const out: string[] = [];
  pushWords(
    out,
    tokens.words.map((token) => token.text),
  );
  out.push(...wholeIds(tokens.ids));
  return out;
}

function questionText(entry: SearchEntry): string {
  const questions = Array.isArray(entry.questions) ? entry.questions : [];
  const parts: string[] = [];
  for (const question of questions) {
    if (typeof question?.label === 'string') parts.push(question.label);
    if (!Array.isArray(question?.choices)) continue;
    for (const choice of question.choices) {
      if (typeof choice?.label === 'string') parts.push(choice.label);
    }
  }
  return parts.join(' ');
}

/** Makes an entry ready for a segment. Never throws on a malformed entry; odd fields are empty. */
export function prepareEntry(entry: SearchEntry): PreparedEntry {
  const fields: string[][] = [];
  for (const field of FIELDS) {
    const max = MAX_FIELD_CHARS[field];
    switch (field) {
      case 'title':
        fields.push(indexWords(text(entry.title, max)));
        break;
      case 'words':
        fields.push(indexWords(list(entry.words, max)));
        break;
      case 'answers':
        fields.push(indexWords(text(questionText(entry), max)));
        break;
      case 'sentence':
        fields.push(indexWords(text(entry.sentence, max)));
        break;
      case 'ids':
        fields.push(idWords(list(entry.ids, max)));
        break;
      case 'body':
        fields.push(indexWords(text(entry.body, max)));
        break;
    }
  }
  const title = fields[0] as string[];
  const rawTitle = text(entry.title, MAX_FIELD_CHARS.title);
  const colon = rawTitle.indexOf(':');
  const name = colon > 0 ? indexWords(rawTitle.slice(0, colon)) : [];
  return name.length > 0 && name.length < title.length
    ? { entry, fields, title, name }
    : { entry, fields, title };
}

/** The distinct plain words of a prepared entry (what it adds to the dictionary). */
export function distinctWords(prepared: PreparedEntry): Set<string> {
  const out = new Set<string>();
  for (let f = 0; f < FIELD_COUNT; f++) {
    for (const word of prepared.fields[f] as readonly string[]) {
      if (isPlainWord(word)) out.add(word);
    }
  }
  return out;
}

/** A stable key of an action descriptor: entries with the same action are one result (D6). */
export function actionKey(action: unknown): string {
  return stableJson(action, 0);
}

/** Descriptors are small JSON; anything nested deeper than this is cut (never a loop). */
const MAX_DEPTH = 16;

function stableJson(value: unknown, depth: number): string {
  if (value === null || typeof value !== 'object') {
    const out = typeof value === 'bigint' ? undefined : JSON.stringify(value);
    return out === undefined ? 'null' : out;
  }
  if (depth >= MAX_DEPTH) return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v, depth + 1)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key], depth + 1)}`).join(',')}}`;
}
