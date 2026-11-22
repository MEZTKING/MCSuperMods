/**
 * What Try it does with each line of a function (B613, ADR 0120 D8): a mark per source line for
 * the Function editor's gutter and the function's live view. A line runs in Try it, or only in
 * the game, and then the mark says why in plain words: a command or form Try it does not run,
 * or a line the game would not read. Blank lines and comments have no mark; a line continued with
 * `\` is read as one command, marked on its first line, and its other lines point back to it.
 *
 * Pure: the reader of a line (`@msm/sim`'s `lineSupport`) is passed in, so this module stays out
 * of the simulation's chunk (`line-support.ts` loads it).
 *
 * @packageDocumentation
 */

import type { LineSupport } from '@msm/sim';

/** The words of the marks (the plan's "Very easy wording"). */
export const RUNS_WORDS = 'Runs in Try it';
export const ONLY_WORDS = 'Only in the game';
export const RUN_IN_TRY_IT_WORDS = 'Run in Try it';

/** One line's mark. */
export interface LineMark {
  /** 0-based source line. */
  readonly line: number;
  readonly runs: boolean;
  /** The mark's words: {@link RUNS_WORDS}, or {@link ONLY_WORDS} with the reason. */
  readonly words: string;
  /** A macro line (`$`), read with sample values. */
  readonly macro?: boolean;
  /** For the 2nd and later lines of a continued line: the 0-based line it continues. */
  readonly continues?: number;
}

/** Reads one command line: whether it runs and why not (`lineSupport`), and the kind of reason. */
export interface LineReader {
  support(line: string): LineSupport;
  /** `game`: a command or form only the game runs; `error`: the game would not read it. */
  kind(line: string): 'game' | 'error' | null;
}

/** The reason in plain words, after {@link ONLY_WORDS}. */
export function onlyWords(why: string | undefined, kind: 'game' | 'error' | null): string {
  if (why === undefined || why === '') return ONLY_WORDS;
  if (kind === 'error') return `${ONLY_WORDS}: the game would not read this line (${why}).`;
  return `${ONLY_WORDS}: Try it does not run ${why}.`;
}

/** The marks of a function's source lines (one per command line, continued lines pointing back). */
export function lineMarks(lines: readonly string[], reader: LineReader): LineMark[] {
  const marks: LineMark[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const first = i;
    let text = (lines[i] ?? '').trim();
    const rest: number[] = [];
    while (text.endsWith('\\') && i + 1 < lines.length) {
      i += 1;
      rest.push(i);
      text = `${text.slice(0, -1).trimEnd()} ${(lines[i] ?? '').trim()}`;
    }
    if (text === '' || text.startsWith('#')) continue;
    const support = reader.support(text);
    if (support.blank === true) continue;
    const macro = support.macro === true;
    const words = support.runs
      ? macro
        ? `${RUNS_WORDS} (a macro line: with the values it is given)`
        : RUNS_WORDS
      : onlyWords(support.why, macro ? null : reader.kind(text));
    marks.push({ line: first, runs: support.runs, words, ...(macro ? { macro } : {}) });
    for (const line of rest) {
      marks.push({
        line,
        runs: support.runs,
        words: `Part of line ${first + 1}: ${support.runs ? RUNS_WORDS : ONLY_WORDS}`,
        continues: first,
      });
    }
  }
  return marks;
}

/** How many command lines run in Try it, of how many. */
export function marksSummary(marks: readonly LineMark[]): {
  readonly runs: number;
  readonly lines: number;
} {
  const own = marks.filter((mark) => mark.continues === undefined);
  return { runs: own.filter((mark) => mark.runs).length, lines: own.length };
}
