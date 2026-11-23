/**
 * Number words and units (ADR 0124 D4, D7): digits (`5`, `1.5`, `1,000`), number words (`five`,
 * `twenty five`, `one hundred and fifty`, `half`, `a` or `an` before a unit), ranges (`3 to 5`,
 * `3-5`, `between 3 and 5`) and the unit after them: hearts, seconds, minutes, ticks, blocks and
 * per cent (`50%`, `50 percent`, `50 per cent`, `5s`). It reads; it never clamps or checks a
 * range: the answer reader drops a number outside a question's range (D7 as amended). Pure.
 */

import { type TokenisedText, tokenise } from './tokens';

export type NumberUnit = 'heart' | 'second' | 'minute' | 'tick' | 'block' | 'percent';

/** A number found in the words. Indexes are into {@link TokenisedText.words}, `last` inclusive. */
export interface NumberMention {
  readonly value: number;
  /** The top of a range: `3 to 5` is 3 up to 5. */
  readonly upTo?: number;
  readonly unit?: NumberUnit;
  /** The first and last word of the mention, the unit included. */
  readonly first: number;
  readonly last: number;
}

const ONES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Readonly<Record<string, number>> = { hundred: 100, thousand: 1000 };

const UNITS: Readonly<Record<string, NumberUnit>> = {
  heart: 'heart',
  hearts: 'heart',
  second: 'second',
  seconds: 'second',
  sec: 'second',
  secs: 'second',
  s: 'second',
  minute: 'minute',
  minutes: 'minute',
  min: 'minute',
  mins: 'minute',
  tick: 'tick',
  ticks: 'tick',
  block: 'block',
  blocks: 'block',
  percent: 'percent',
  pct: 'percent',
};

/** Ticks in one second and health points in one heart: for answers in a question's own unit. */
export const TICKS_PER_SECOND = 20;
export const HEALTH_PER_HEART = 2;

/** A value in ticks: seconds and minutes converted, ticks as they are; undefined for other units. */
export function toTicks(value: number, unit: NumberUnit | undefined): number | undefined {
  if (unit === 'tick') return value;
  if (unit === 'second') return value * TICKS_PER_SECOND;
  if (unit === 'minute') return value * 60 * TICKS_PER_SECOND;
  return undefined;
}

/** A value in health points: hearts converted; undefined for other units. */
export function toHealth(value: number, unit: NumberUnit | undefined): number | undefined {
  return unit === 'heart' ? value * HEALTH_PER_HEART : undefined;
}

const DIGITS = /^[0-9]+(?:\.[0-9]+)?$/;
const DIGITS_UNIT = /^([0-9]+(?:\.[0-9]+)?)([a-z]+)$/;

/** The number a single word stands for (`5`, `1.5`, `five`, `half`), or undefined. */
export function numberOf(word: string): number | undefined {
  if (DIGITS.test(word)) return Number(word);
  if (word === 'half') return 0.5;
  return ONES[word] ?? TENS[word];
}

/** Reads a run of number words from `i`: `twenty five`, `one hundred and fifty`, `two and a half`. */
function readWords(
  words: readonly string[],
  i: number,
): { value: number; next: number } | undefined {
  let total = 0;
  let group = 0;
  let j = i;
  let any = false;
  while (j < words.length) {
    const word = words[j] as string;
    const one = ONES[word];
    const ten = TENS[word];
    const scale = SCALES[word];
    if (ten !== undefined && group % 100 === 0) {
      group += ten;
      const after = words[j + 1];
      if (after !== undefined && ONES[after] !== undefined && (ONES[after] as number) < 10) {
        group += ONES[after] as number;
        j++;
      }
    } else if (one !== undefined && group % 100 === 0) group += one;
    else if (scale !== undefined && any) {
      if (scale === 100) group = (group === 0 ? 1 : group) * 100;
      else {
        total += (group === 0 ? 1 : group) * scale;
        group = 0;
      }
    } else if (word === 'and' && any && words[j + 1] !== undefined) {
      const after = words[j + 1] as string;
      if (after === 'a' && words[j + 2] === 'half') {
        return { value: total + group + 0.5, next: j + 3 };
      }
      if (
        (ONES[after] !== undefined || TENS[after] !== undefined) &&
        group % 100 === 0 &&
        group > 0
      ) {
        j++;
        continue;
      }
      break;
    } else break;
    any = true;
    j++;
  }
  return any ? { value: total + group, next: j } : undefined;
}

/** Reads one number at word `i`: digits, number words, `half a`, or `a`/`an` before a unit. */
function readOne(
  words: readonly string[],
  i: number,
): { value: number; next: number; unit?: NumberUnit } | undefined {
  const word = words[i] as string;
  if (DIGITS.test(word)) return { value: Number(word), next: i + 1 };
  const glued = DIGITS_UNIT.exec(word);
  if (glued !== null) {
    const unit = UNITS[glued[2] as string];
    if (unit !== undefined) return { value: Number(glued[1]), next: i + 1, unit };
    return undefined;
  }
  if (word === 'half') {
    const next = words[i + 1] === 'a' || words[i + 1] === 'an' ? i + 2 : i + 1;
    return { value: 0.5, next };
  }
  if ((word === 'a' || word === 'an') && words[i + 1] !== undefined) {
    const after = words[i + 1] as string;
    if (UNITS[after] !== undefined && after !== 's') return { value: 1, next: i + 1 };
    return undefined;
  }
  return readWords(words, i);
}

/** The text between word `at - 1` and word `at` (or the end), trimmed. */
function gapBefore(text: TokenisedText, at: number): string {
  const previous = text.words[at - 1];
  if (previous === undefined) return '';
  const end = text.words[at]?.start ?? text.normalised.length;
  return text.normalised.slice(previous.end, end).trim();
}

/** Reads a unit at word `at` (`hearts`, `per cent`), or a `%` written just before it. */
function readUnit(text: TokenisedText, at: number): { unit: NumberUnit; next: number } | undefined {
  if (gapBefore(text, at).startsWith('%')) return { unit: 'percent', next: at };
  const word = text.words[at]?.text;
  if (word === undefined) return undefined;
  if (word === 'per' && text.words[at + 1]?.text === 'cent')
    return { unit: 'percent', next: at + 2 };
  const unit = UNITS[word];
  if (unit === undefined || word === 's') return undefined;
  return { unit, next: at + 1 };
}

/** Where the second number of a range starts after word `at`, or undefined. */
function rangeAt(text: TokenisedText, at: number, between: boolean): number | undefined {
  if (at >= text.words.length) return undefined;
  if (gapBefore(text, at) === '-') return at;
  const word = text.words[at]?.text;
  if (word === 'to' || (between && word === 'and')) return at + 1;
  return undefined;
}

/** Every number in a text, left to right, with its range and unit. */
export function readNumbers(input: string | TokenisedText): NumberMention[] {
  const text = typeof input === 'string' ? tokenise(input) : input;
  const words = text.words.map((token) => token.text);
  const out: NumberMention[] = [];
  let i = 0;
  while (i < words.length) {
    const between = (words[i] === 'between' || words[i] === 'from') && i + 1 < words.length;
    const start = between ? i + 1 : i;
    const first = readOne(words, start);
    if (first === undefined) {
      i++;
      continue;
    }
    let next = first.next;
    let unit = first.unit;
    if (unit === undefined) {
      const found = readUnit(text, next);
      if (found !== undefined) {
        unit = found.unit;
        next = found.next;
      }
    }
    let upTo: number | undefined;
    const at = rangeAt(text, next, between);
    const second = at !== undefined && at < words.length ? readOne(words, at) : undefined;
    if (second !== undefined) {
      upTo = second.value;
      next = second.next;
      const secondUnit =
        second.unit !== undefined ? { unit: second.unit, next } : readUnit(text, next);
      if (secondUnit !== undefined) {
        unit ??= secondUnit.unit;
        next = secondUnit.next;
      }
    }
    out.push({
      value: first.value,
      ...(upTo !== undefined ? { upTo } : {}),
      ...(unit !== undefined ? { unit } : {}),
      first: between && upTo !== undefined ? i : start,
      last: next - 1,
    });
    i = next;
  }
  return out;
}
