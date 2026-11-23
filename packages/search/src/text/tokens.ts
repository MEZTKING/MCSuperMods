/**
 * Splitting (ADR 0124 D4): words are runs of letters and digits; ids are split at `:`, `/`
 * and `_` into words and also kept whole as exact tokens. Offsets are into the normalised text,
 * so a later step can read what stood between two words (`50%`, `3-5`). Pure; never throws.
 */

import { normalise } from './normalise';

/** One token: its text and where it stands in the normalised text (`end` exclusive). */
export interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** A text split into words, with its whole ids beside them. */
export interface TokenisedText {
  /** The text as {@link normalise} made it. */
  readonly normalised: string;
  /** The words in order: letters and digits; a decimal number (`1.5`) is one word. */
  readonly words: readonly Token[];
  /** Whole ids, kept as exact tokens: `namespace:path` and words joined by `_`. */
  readonly ids: readonly Token[];
}

/**
 * A word: a thousands number (`1,000`, read as `1000`), a decimal (`1.5`, `1.21.0`), or a run of
 * letters and digits with apostrophes inside it dropped (`what's` is `whats`).
 */
const WORD =
  /[0-9]{1,3}(?:,[0-9]{3})+(?![0-9])|[0-9]+(?:\.[0-9]+)+|[\p{L}\p{N}]+(?:['’ʼ][\p{L}\p{N}]+)*/gu;
const APOSTROPHE = /['’ʼ]/g;
const ID_CHUNK = /[\p{L}\p{N}_.\-/:]+/gu;
const NAMESPACED = /^[a-z0-9_.-]+:[a-z0-9_.\-/]+$/;
const JOINED = /^[\p{L}\p{N}]+(?:[_/][\p{L}\p{N}]+)*$/u;
const EDGE = /^[.\-/:]+|[.\-/:]+$/g;

/** Splits a text into words and whole ids. */
export function tokenise(text: string): TokenisedText {
  const normalised = normalise(text);
  const words: Token[] = [];
  for (const match of normalised.matchAll(WORD)) {
    const raw = match[0];
    const start = match.index;
    const word = raw.includes(',') ? raw.replace(/,/g, '') : raw.replace(APOSTROPHE, '');
    words.push({ text: word, start, end: start + raw.length });
  }
  const ids: Token[] = [];
  for (const match of normalised.matchAll(ID_CHUNK)) {
    const chunk = match[0];
    const trimmed = chunk.replace(EDGE, '');
    if (trimmed === '') continue;
    const start = match.index + chunk.indexOf(trimmed);
    const isId =
      NAMESPACED.test(trimmed) ||
      (trimmed.includes('_') && JOINED.test(trimmed) && /\p{L}/u.test(trimmed));
    if (isId) ids.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return { normalised, words, ids };
}

/** The words of a text as strings, in order. */
export function wordsOf(text: string): string[] {
  return tokenise(text).words.map((token) => token.text);
}

/** Whether the whole text is one bare `namespace:path` id (the intent `id`, ADR 0124 D4). */
export function isBareId(text: string): boolean {
  return NAMESPACED.test(normalise(text).trim().replace(/^#/, ''));
}
