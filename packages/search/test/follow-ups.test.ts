// The engine's open items at ADR 0124's close, fixed after it (2026-11-23), over made-up entries
// with no game word: an exact id on whole ids only, the whole title with its stop words, "how
// … work" read as the question, and a tie of typo candidates decided by the results.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSearchIndex,
  type SearchAnswer,
  type SearchEngine,
  type SearchRequest,
} from '../src';
import { entry, filler } from './engine-fixtures';

let index: SearchEngine;

const ask = (text: string, extra: Partial<SearchRequest> = {}): SearchAnswer =>
  index.query({ text, mode: 'easy', ...extra });
const hits = (answer: SearchAnswer) => [
  ...answer.best,
  ...answer.sections.flatMap((section) => section.hits),
];
const first = (answer: SearchAnswer): string | undefined => hits(answer)[0]?.entry.id;
const hitOf = (answer: SearchAnswer, id: string) => hits(answer).find((h) => h.entry.id === id);

beforeAll(() => {
  index = createSearchIndex();
  index.setLayer('static', [
    // Ids: a names file can give a title that is not the id's word.
    entry('vanilla:pebble', 'vanilla', 'Smooth rock', { ids: ['base:pebble'] }),
    entry('vanilla:end_pebble', 'vanilla', 'End pebble', { ids: ['base:end_pebble'] }),
    entry('vanilla:pebble_wall', 'vanilla', 'Pebble wall', { ids: ['base:pebble_wall'] }),
    entry('vanilla:snowy_pebble', 'vanilla', 'Snowy pebble', { ids: ['base:snowy_pebble'] }),
    // Whole titles with stop words.
    entry('command:very-calm', 'command', 'Very calm mode', { sentence: 'Fewer buttons.' }),
    entry('command:calm', 'command', 'Calm mode', { sentence: 'Some buttons.' }),
    entry('command:whats-new', 'command', "What's new", { sentence: 'The changes.' }),
    entry('guide:new-house', 'guide', 'Start a new house', { sentence: 'A new one.' }),
    entry('guide:new-kettle', 'guide', 'A new kettle', { sentence: 'New kettles.' }),
    // "how … work".
    entry('guide:rota', 'guide', 'The rota', { sentence: 'Who does what.' }),
    entry('guide:rota-chores', 'guide', 'Chores on the rota', {
      sentence: 'Chores that work, and how the rota works for them.',
    }),
    entry('guide:rota-shifts', 'guide', 'Rota shifts', { sentence: 'Shifts work in turns.' }),
    // A typo tie: `soin` is one letter from three words.
    entry('flow:mop-skin', 'flow', 'Mop skin', { sentence: 'A new skin for a mop.' }),
    entry('vanilla:spin-1', 'vanilla', 'Top spin', { sentence: 'A spin of the top.' }),
    entry('vanilla:spin-2', 'vanilla', 'Wheel spin', { sentence: 'A spin of the wheel.' }),
    entry('vanilla:spin-3', 'vanilla', 'Fast spin', { sentence: 'A fast spin.' }),
    entry('vanilla:soil-1', 'vanilla', 'Dry soil', { sentence: 'Soil.' }),
    entry('vanilla:soil-2', 'vanilla', 'Wet soil', { sentence: 'Soil.' }),
    entry('flow:tank', 'flow', 'Tank', { sentence: 'A slow, strong cart.' }),
    ...filler(300),
  ]);
});

describe('an exact id counts on whole ids only', () => {
  it('finds the id itself first, whatever its title, and no other id with its word as exact', () => {
    const answer = ask('base:pebble', { mode: 'advanced' });
    expect(first(answer)).toBe('vanilla:pebble');
    for (const other of ['vanilla:end_pebble', 'vanilla:pebble_wall', 'vanilla:snowy_pebble']) {
      expect(hitOf(answer, other)?.why ?? []).not.toContain('exact id');
    }
  });

  it('keeps a path that is itself a whole id exact', () => {
    expect(hitOf(ask('base:end_pebble'), 'vanilla:end_pebble')?.why[0]).toBe('exact id');
    expect(hitOf(ask('other:end_pebble'), 'vanilla:end_pebble')?.why[0]).toBe('exact id');
    expect(first(ask('end_pebble'))).toBe('vanilla:end_pebble');
  });
});

describe('the whole title, stop words included', () => {
  it('puts the title the words are, word for word, above a shorter one', () => {
    const answer = ask('very calm mode');
    expect(first(answer)).toBe('command:very-calm');
    expect(hitOf(answer, 'command:very-calm')?.why).toContain('whole title');
    expect(hitOf(answer, 'command:calm')?.why ?? []).not.toContain('whole title');
    expect(first(ask('calm mode'))).toBe('command:calm');
  });

  it('reads a title whose stop word is also an intent cue as the title, a Best match', () => {
    const answer = ask('whats new');
    expect(answer.best[0]?.entry.id).toBe('command:whats-new');
    expect(answer.confident).toBe(true);
  });
});

describe('"how … work" is the question', () => {
  it('does not match `work` as a word, so the page about the thing comes first', () => {
    const answer = ask('how does the rota work');
    expect(first(answer)).toBe('guide:rota');
    for (const hit of hits(answer)) expect(hit.why).not.toContain('word work');
  });
});

describe('typo candidates', () => {
  it('corrects a swap of neighbours in a four-letter word', () => {
    const answer = ask('tnak');
    expect(first(answer)).toBe('flow:tank');
    expect(answer.understood.corrected).toBe('tank');
  });

  it('offers every word tied with the best and shows the one the first result was found by', () => {
    // `soin` is one letter from `spin` (a key beside), `soil` (more frequent) and `skin`.
    const answer = ask('mop soin');
    expect(first(answer)).toBe('flow:mop-skin');
    expect(answer.understood.corrected).toBe('mop skin');
    expect(answer.understood.chips).toContainEqual({ text: 'skin', kind: 'corrected' });
    // Whatever wins, the chip names the word the first result was found by.
    const alone = ask('soin');
    expect(hits(alone)[0]?.why).toContain(`typo soin->${alone.understood.corrected}`);
  });
});
