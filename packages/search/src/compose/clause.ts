/**
 * The head and the clause (ADR 0124 D7, limit SL3): "a blue sword that sets mobs on fire" is the
 * head "a blue sword" and the clause "sets mobs on fire", split at the first "that", "which",
 * "who" or "when" that is not the first word. One clause only: what follows a second cue stays
 * in the clause. The head is what the flow's answers and the text score read; the clause is
 * matched against the behaviour phrases. Also the name typed as such: quoted text, or the words
 * after "called" or "named". Language only.
 */

import { isStopWord } from '../text';

/** The words that start a clause. */
export const CLAUSE_WORDS: ReadonlySet<string> = new Set(['that', 'which', 'who', 'when']);

/** Words a name after "called" may have. */
export const MAX_CALLED_WORDS = 4;

export interface ClauseSplit {
  /** The cue word's index, or -1 when there is no clause. */
  readonly cue: number;
  /** The clause's words, `cue + 1` to the end. Empty when there is no clause. */
  readonly clause: readonly number[];
}

/** Splits the words at the first clause cue that is not the first word. */
export function splitClause(words: readonly string[]): ClauseSplit {
  for (let i = 1; i < words.length - 1; i++) {
    if (!CLAUSE_WORDS.has(words[i] as string)) continue;
    const clause: number[] = [];
    for (let j = i + 1; j < words.length; j++) clause.push(j);
    return { cue: i, clause };
  }
  return { cue: -1, clause: [] };
}

/** A name typed as such. */
export interface TypedName {
  readonly start: number;
  readonly end: number;
  /** The name as typed (quoted text keeps its own capitals). */
  readonly name: string;
}

interface WordToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const QUOTED = /["“”«»]([^"“”«»]{1,64})["“”«»]/;

/**
 * The name typed in the words: the first quoted text (by its words' places in the normalised
 * text), else the words after "called" or "named" up to a clause cue, at most four.
 */
export function typedName(
  raw: string,
  normalised: string,
  tokens: readonly WordToken[],
  count: number,
): TypedName | undefined {
  const inNormalised = QUOTED.exec(normalised);
  if (inNormalised !== null) {
    const from = inNormalised.index + 1;
    const to = from + (inNormalised[1] as string).length;
    const inside: number[] = [];
    tokens.slice(0, count).forEach((t, i) => {
      if (t.start >= from && t.end <= to) inside.push(i);
    });
    if (inside.length > 0) {
      const inRaw = QUOTED.exec(raw);
      const name = (inRaw?.[1] ?? inNormalised[1] ?? '').trim();
      if (name !== '') {
        return {
          start: inside[0] as number,
          end: (inside[inside.length - 1] as number) + 1,
          name,
        };
      }
    }
  }
  for (let i = 0; i < Math.min(count, tokens.length) - 1; i++) {
    const word = tokens[i]?.text;
    if (word !== 'called' && word !== 'named') continue;
    const end = Math.min(count, i + 1 + MAX_CALLED_WORDS);
    const parts: string[] = [];
    let j = i + 1;
    for (; j < end; j++) {
      const w = tokens[j]?.text as string;
      if (CLAUSE_WORDS.has(w) || (parts.length === 0 && isStopWord(w))) break;
      parts.push(w);
    }
    if (parts.length > 0) return { start: i, end: j, name: parts.join(' ') };
  }
  return undefined;
}
