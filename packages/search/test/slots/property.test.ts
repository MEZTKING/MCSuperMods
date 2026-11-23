// D7: no answer without a typed word behind it. Seeded random queries over the fixtures' words;
// every answer of every flow read names the words it came from, those words are in the query and
// are not only stop words, and an answer whose words are all taken out comes back only from other
// words still there. Queries of filler words give no answer and no behaviour.
import { beforeAll, describe, expect, it } from 'vitest';
import { isStopWord } from '../../src/text';
import { random } from '../engine-fixtures';
import { type Harness, harness, type Reading } from './harness';

const POOL = [
  'blue',
  'light blue',
  'sky blue',
  'gold',
  'emerald',
  'red',
  'green',
  '#12ab9f',
  'sword',
  'bow',
  'netherite',
  'netherrite',
  'pick',
  'diamond',
  'diamonds',
  'iron',
  'cherry',
  'leaves',
  'tree',
  'bed',
  'teal',
  'mount',
  'saddle',
  'backpack',
  'rows',
  'recipe',
  'craftable',
  'speed',
  'poison',
  'seconds',
  'hearts',
  'damage',
  'durability',
  'compost',
  'drops',
  'bones',
  'zombies',
  'sells',
  'buys',
  'emeralds',
  'ruby',
  'base:bone',
  'pig',
  'fly',
  'flies',
  'glows',
  'explodes',
  'drops xp',
  'you can ride',
  'sets mobs on fire',
  'that',
  'which',
  'when',
  'with',
  'from',
  'like',
  'made of',
  'no',
  'without',
  'not',
  'called',
  '"Zed Bot"',
  '3',
  '5',
  '20',
  '30',
  '9000',
  'five',
  '3 to 5',
  'a',
  'the',
  'and',
  'for',
  'zib',
  'qwop',
];
const FILLER = ['a', 'the', 'and', 'for', 'with', 'of', 'zib', 'qwop', 'very', 'please'];

function query(next: () => number, pool: readonly string[], max: number): string {
  const n = 1 + Math.floor(next() * max);
  return Array.from({ length: n }, () => pool[Math.floor(next() * pool.length)] as string).join(
    ' ',
  );
}

let checked = 0;

/** Checks every answer of every entry read. */
function check(reading: Reading, text: string): void {
  const words = reading.query?.words ?? [];
  for (const [id, entry] of reading.byEntry) {
    for (const [question, value] of Object.entries(entry.answers ?? {})) {
      const sources = entry.sources[question] ?? [];
      const where = `"${text}" ${id}.${question}=${JSON.stringify(value)}`;
      checked++;
      expect(sources.length, where).toBeGreaterThan(0);
      for (const i of sources) {
        expect(i, where).toBeGreaterThanOrEqual(0);
        expect(i, where).toBeLessThan(words.length);
      }
      // At least one of the words is not a stop word.
      const typed = sources.map((i) => words[i] as string);
      expect(
        typed.some((w) => !isStopWord(w)),
        where,
      ).toBe(true);
    }
    if (entry.behaviour !== undefined) {
      expect(reading.answer.understood.chips.some((c) => c.kind === 'behaviour')).toBe(true);
    }
  }
}

/** The text with the words at these indexes cut out (by their place in the normalised text). */
function without(reading: Reading, indexes: ReadonlySet<number>): string {
  const { normalised, words } = reading.query.tokens;
  if (words.length === 0) return normalised;
  let out = '';
  let from = 0;
  words.forEach((token, i) => {
    if (!indexes.has(i)) return;
    out += `${normalised.slice(from, token.start)} `;
    from = token.end;
  });
  return out + normalised.slice(from);
}

describe('no answer without a typed word behind it (D7)', () => {
  let h: Harness;
  beforeAll(() => {
    h = harness();
  });

  // Heavy: 400 seeded queries, each read again with its words cut out (2026-11-23). An explicit
  // timeout, never a retry.
  it('names the words behind every answer, over 400 seeded queries', { timeout: 60_000 }, () => {
    const next = random(659);
    for (let n = 0; n < 400; n++) {
      const text = query(next, POOL, 8);
      const reading = h.ask(text, n % 3 === 0 ? 'advanced' : 'very-easy');
      check(reading, text);
      // Every answer's words taken out: what comes back comes from other words.
      for (const [id, entry] of reading.byEntry) {
        const sources = new Set(Object.values(entry.sources).flat());
        if (sources.size === 0) continue;
        const cut = without(reading, sources);
        const again = h.ask(cut);
        check(again, cut);
        const before = again.byEntry.get(id);
        for (const question of Object.keys(before?.answers ?? {})) {
          const back = before?.sources[question] ?? [];
          expect(back.length, `"${cut}" ${id}.${question}`).toBeGreaterThan(0);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(h.engine.stats().failures).toBe(0);
  });

  it('answers nothing and makes no behaviour from filler words alone', () => {
    const next = random(1659);
    for (let n = 0; n < 200; n++) {
      const text = query(next, FILLER, 6);
      const reading = h.ask(text);
      for (const [id, entry] of reading.byEntry) {
        expect(entry.answers, `"${text}" ${id}`).toBeUndefined();
        expect(entry.behaviour, `"${text}" ${id}`).toBeUndefined();
      }
    }
  });

  it('never throws on odd strings with the reader in', () => {
    const next = random(2659);
    const chars = 'abc xyz "#:_-01239 thatwhich called “”́é';
    for (let n = 0; n < 300; n++) {
      const length = Math.floor(next() * 40);
      let text = '';
      for (let i = 0; i < length; i++) text += chars[Math.floor(next() * chars.length)];
      h.ask(text);
    }
    expect(h.engine.stats().failures).toBe(0);
  });
});
