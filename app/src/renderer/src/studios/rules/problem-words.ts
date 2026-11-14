/**
 * The words a rule card shows for a problem (ADR 0082 D6, ADR 0083 D5). The plain-language
 * table is B378's (`session/plain-problems.ts`); until it exists, and for codes it lacks, the
 * card shows the problem's own message. B378 provides its table through
 * {@link PlainProblemWordsContext} (or wraps it into {@link problemText}'s caller).
 *
 * @packageDocumentation
 */

import type { Problem } from '@msm/core';
import { createContext, useContext } from 'react';

/** Plain words for a problem, or `undefined` when the table has none for its code. */
export type PlainProblemWords = (problem: Problem) => string | undefined;

/** Provided by the host once the plain-language table exists; `null` until then. */
export const PlainProblemWordsContext = createContext<PlainProblemWords | null>(null);

/** The words for `problem`: the plain-language table's, else the message. */
export function problemText(problem: Problem, words: PlainProblemWords | null): string {
  return words?.(problem) ?? problem.message;
}

/** The provided plain-language table, or `null`. */
export function usePlainProblemWords(): PlainProblemWords | null {
  return useContext(PlainProblemWordsContext);
}
