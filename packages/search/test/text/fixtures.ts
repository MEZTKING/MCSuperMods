// Loads the B650 fixtures (test/fixtures/README.md says where they came from).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fold } from '../../src/text';

const DIR = join(__dirname, '../fixtures');

export interface Dictionary {
  /** Folded words and the number of entries each was counted in. */
  readonly counts: ReadonlyMap<string, number>;
  /** The words as a set. */
  readonly words: ReadonlySet<string>;
  /** The protected words among them (vanilla id words and vocabulary headwords). */
  readonly protect: ReadonlySet<string>;
}

export function loadDictionary(): Dictionary {
  const counts = new Map<string, number>();
  const protect = new Set<string>();
  for (const line of readFileSync(join(DIR, 'dictionary.txt'), 'utf8').split('\n')) {
    if (line === '') continue;
    const [raw, count, flag] = line.split(' ') as [string, string, string | undefined];
    const word = fold(raw);
    counts.set(word, (counts.get(word) ?? 0) + Number(count));
    if (flag === 'p') protect.add(word);
  }
  return { counts, words: new Set(counts.keys()), protect };
}

export interface Misspelling {
  readonly from: string;
  readonly to: string;
  readonly set: string;
}

export function loadMisspellings(): Misspelling[] {
  return JSON.parse(readFileSync(join(DIR, 'misspellings.json'), 'utf8')) as Misspelling[];
}
