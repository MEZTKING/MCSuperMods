/**
 * The intent reader (ADR 0124 D4): intent words change what ranks first, never what is found.
 * The first intent cue in the words wins; a bare `namespace:path` is the intent `id`. Reads the
 * normalised words before stop words are dropped. Language only; a plugin cannot add an intent
 * word (D13).
 */

import { isStopWord } from './stop-words';
import { isBareId } from './tokens';

/** What the words ask for: `none` when nothing says (the surface then leans, D4). */
export type SearchIntent = 'make' | 'learn' | 'open' | 'fix' | 'command' | 'id' | 'none';

/** One-word cues. */
const WORDS: Readonly<Record<string, Exclude<SearchIntent, 'id' | 'none'>>> = {
  make: 'make',
  makes: 'make',
  making: 'make',
  create: 'make',
  creating: 'make',
  add: 'make',
  adding: 'make',
  new: 'make',
  build: 'make',
  building: 'make',
  want: 'make',
  wanna: 'make',
  how: 'learn',
  why: 'learn',
  help: 'learn',
  tutorial: 'learn',
  tutorials: 'learn',
  guide: 'learn',
  explain: 'learn',
  whats: 'learn',
  open: 'open',
  find: 'open',
  where: 'open',
  show: 'open',
  edit: 'open',
  rename: 'open',
  delete: 'open',
  remove: 'open',
  fix: 'fix',
  broken: 'fix',
  error: 'fix',
  errors: 'fix',
  crash: 'fix',
  crashes: 'fix',
  play: 'command',
  test: 'command',
  export: 'command',
  install: 'command',
  undo: 'command',
  redo: 'command',
};

/** Cues of two words, read before the one-word cues at the same place. */
const PAIRS: Readonly<Record<string, Exclude<SearchIntent, 'id' | 'none'>>> = {
  'what is': 'learn',
  'what are': 'learn',
  'can i': 'learn',
  'not working': 'fix',
  'doesnt work': 'fix',
  'isnt working': 'fix',
};

/**
 * Cues that carry no content once read. Those that are not stop words stay as weak terms
 * (`whats new` keeps `new`; B650's tuning); the others (`open`, `fix`, `export`...) are words
 * the index also holds and stay as ordinary terms.
 */
const CUE_ONLY: ReadonlySet<string> = new Set([
  'make',
  'makes',
  'making',
  'create',
  'creating',
  'add',
  'adding',
  'new',
  'build',
  'building',
  'want',
  'wanna',
  'how',
  'why',
  'what',
  'whats',
  'help',
  'tutorial',
  'tutorials',
  'explain',
  'find',
  'where',
  'show',
]);

/** The intent read from the words, with the words that said it. */
export interface IntentReading {
  readonly intent: SearchIntent;
  /** Indexes into the words of the cue (one or two), empty for `id` and `none`. */
  readonly cue: readonly number[];
  /**
   * Indexes of words that are part of the question's frame and are not matched as words: the
   * `work` of "how does try it work" (ADR 0124's open item, B666's finding). Absent when none.
   */
  readonly frame?: readonly number[];
}

/** Verbs that end a "how do … work" question. */
const FRAME_END: ReadonlySet<string> = new Set(['work', 'works', 'working']);

/**
 * The frame of a "how … work" question: `how`, then at least one word that is not a stop word,
 * then `work` (or `works`, `working`) as the last word. That last word asks how the thing works;
 * it is not a word of the thing (a Rules trigger that says "starts working" is not what "how do
 * rules work" asks for). Only the last word is in the frame: `how` is the cue and the stop
 * words are dropped anyway.
 */
function questionFrame(words: readonly string[]): number[] {
  const last = words.length - 1;
  if (last < 2 || words[0] !== 'how' || !FRAME_END.has(words[last] as string)) return [];
  const between = words.slice(1, last);
  return between.some((word) => !isStopWord(word)) ? [last] : [];
}

/**
 * Reads the intent of the normalised words of a text. Pass the text too so that a bare
 * `namespace:path` is read as `id`.
 */
export function readIntent(words: readonly string[], text?: string): IntentReading {
  if (text !== undefined && isBareId(text)) return { intent: 'id', cue: [] };
  const frame = questionFrame(words);
  const withFrame = (reading: IntentReading): IntentReading =>
    frame.length > 0 ? { ...reading, frame } : reading;
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    const next = words[i + 1];
    if (next !== undefined) {
      const pair = PAIRS[`${word} ${next}`];
      if (pair !== undefined) return withFrame({ intent: pair, cue: [i, i + 1] });
    }
    const one = WORDS[word];
    if (one !== undefined) return withFrame({ intent: one, cue: [i] });
  }
  return { intent: 'none', cue: [] };
}

/**
 * What matching does with a word once the intent is read: `drop` it (a stop word), keep it as a
 * `weak` term (an intent cue that is not a stop word, such as `make` or `new`), or `keep` it.
 */
export function wordRole(word: string): 'drop' | 'weak' | 'keep' {
  if (isStopWord(word)) return 'drop';
  if (CUE_ONLY.has(word)) return 'weak';
  return 'keep';
}
