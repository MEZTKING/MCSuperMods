/**
 * Pure text helpers for the function editors: splitting source into `lines`, locating line
 * problems, the completion token before the caret, and TextMate snippet text.
 */
import type { FunctionProblem } from './types';

/** Splits source text into the element's `lines` (CRLF and LF both end a line). */
export function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

/** Joins `lines` back into source text. */
export function joinLines(lines: readonly string[]): string {
  return lines.join('\n');
}

const LINE_POINTER = /^\/lines\/(\d+)$/;

/** The 0-based line a problem addresses, or `undefined` when it is not line-addressed. */
export function problemLine(problem: Pick<FunctionProblem, 'path'>): number | undefined {
  const match = LINE_POINTER.exec(problem.path);
  return match === null ? undefined : Number(match[1]);
}

/** Characters that end the token a completion replaces, as the mcfunction service reads it. */
const TOKEN_BOUNDARY = /[\s[=,]/;

/** Offset in `text` where the completion token ending at `offset` starts. */
export function tokenStart(text: string, offset: number): number {
  let index = Math.min(Math.max(0, offset), text.length);
  while (index > 0 && !TOKEN_BOUNDARY.test(text.charAt(index - 1))) index--;
  return index;
}

/**
 * Plain text of a TextMate snippet: `${1:text}` becomes `text`, `$1`, `$0` and `${1}` are
 * dropped, `${1|a,b|}` becomes `a`, and `\$`, `\}` and `\\` are unescaped.
 */
export function snippetToText(snippet: string): string {
  let index = 0;
  const read = (stopAtBrace: boolean): string => {
    let text = '';
    while (index < snippet.length) {
      const char = snippet.charAt(index);
      if (char === '\\' && index + 1 < snippet.length) {
        const next = snippet.charAt(index + 1);
        if (next === '$' || next === '}' || next === '\\') {
          text += next;
          index += 2;
          continue;
        }
      }
      if (stopAtBrace && char === '}') return text;
      if (char === '$') {
        text += placeholder();
        continue;
      }
      text += char;
      index++;
    }
    return text;
  };
  const placeholder = (): string => {
    // At a `$`.
    const rest = snippet.slice(index + 1);
    const tabstop = /^\d+/.exec(rest);
    if (tabstop !== null) {
      index += 1 + tabstop[0].length;
      return '';
    }
    const braced = /^\{(\d+)(:|\||\})/.exec(rest);
    if (braced === null) {
      index++;
      return '$';
    }
    index += 1 + braced[0].length;
    if (braced[2] === '}') return '';
    if (braced[2] === '|') {
      const end = snippet.indexOf('|}', index);
      const choices = snippet.slice(index, end === -1 ? snippet.length : end);
      index = end === -1 ? snippet.length : end + 2;
      return choices.split(',')[0] ?? '';
    }
    const text = read(true);
    index++; // the closing brace
    return text;
  };
  return read(false);
}
