import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSearchIndex,
  type SearchAnswer,
  type SearchAnswerReader,
  type SearchEngine,
  type SearchEntry,
  type SearchRequest,
  toSlim,
} from '../src';
import { entry, filler, HOUSE_VOCABULARY } from './engine-fixtures';

const HOUSE: SearchEntry[] = [
  entry('flow:teapot', 'flow', 'Teapot', {
    sentence: 'Make a teapot that pours.',
    action: { type: 'make', flow: 'teapot' },
    questions: [
      { id: 'name', label: 'Name', type: 'string' },
      { id: 'colour', label: 'Colour', type: 'colour' },
    ],
  }),
  entry('tile:teapot', 'tile', 'Make a teapot', { action: { type: 'make', flow: 'teapot' } }),
  entry('starter:kettle', 'starter', 'Copper kettle', { sentence: 'A kettle for the stove.' }),
  entry('flow:umbrella', 'flow', 'Umbrella', { sentence: 'An umbrella that opens.' }),
  entry('vanilla:rain_cover', 'vanilla', 'Rain cover', { ids: ['base:rain_cover'] }),
  entry('vanilla:red_kettle', 'vanilla', 'Red kettle', { ids: ['base:red_kettle'] }),
  entry('guide:pouring', 'guide', 'Pouring from teapots', {
    body: 'How to pour from teapots and kettles.',
  }),
  entry('guide:quiet', 'guide', 'Quiet time in the house', { sentence: 'When the house rests.' }),
  entry('command:play', 'command', 'Play: test the house', { sentence: 'Starts the house.' }),
  entry('command:export', 'command', 'Export the house', {
    sentence: 'Saves the house as a file.',
  }),
  entry('setting:clips', 'setting', 'Play house clips', { sentence: 'Turns the clips on or off.' }),
  entry('problem:cold', 'problem', 'The kettle is cold', { sentence: 'A kettle needs heat.' }),
  entry('kind:gadget', 'kind', 'Gadget', { technical: true, sentence: 'A raw gadget.' }),
  entry('flow:gizmo', 'flow', 'Gizmo maker', { sentence: 'Makes a gizmo.' }),
  entry('flow:gizmo-old', 'flow', 'Gizmo maker', { sentence: 'Makes a gizmo.', available: false }),
];

let index: SearchEngine;

const ask = (text: string, extra: Partial<SearchRequest> = {}): SearchAnswer =>
  index.query({ text, mode: 'easy', ...extra });
const first = (answer: SearchAnswer): string | undefined =>
  (answer.best[0] ?? answer.sections[0]?.hits[0])?.entry.id;
const ids = (answer: SearchAnswer): string[] => [
  ...answer.best.map((h) => h.entry.id),
  ...answer.sections.flatMap((s) => s.hits.map((h) => h.entry.id)),
];
const hitOf = (answer: SearchAnswer, id: string) =>
  [...answer.best, ...answer.sections.flatMap((s) => s.hits)].find((h) => h.entry.id === id);

beforeAll(() => {
  index = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY] });
  index.setLayer('static', [...HOUSE, ...filler(400)]);
});

describe('query: words', () => {
  it('finds a title, confident, with a Best match', () => {
    const answer = ask('teapot');
    expect(answer.confident).toBe(true);
    expect(answer.best[0]?.entry.id).toBe('flow:teapot');
    expect(answer.best[0]?.why).toContain('exact title');
  });

  it('meets plurals and their singulars', () => {
    expect(first(ask('teapots'))).toBe('flow:teapot');
    expect(ids(ask('pour teapot'))).toContain('guide:pouring');
  });

  it('reaches the vocabulary: same words, slang, near words more weakly', () => {
    expect(ids(ask('brolly'))).toContain('flow:umbrella');
    expect(hitOf(ask('kettle'), 'flow:teapot')?.why).toContain('idea teapot');
    const near = hitOf(ask('jug'), 'flow:teapot');
    const same = hitOf(ask('kettle'), 'flow:teapot');
    expect(near?.score ?? 0).toBeLessThan(same?.score ?? 0);
  });

  it('reaches the vanilla ids of an idea', () => {
    expect(ids(ask('brolly'))).toContain('vanilla:rain_cover');
  });

  it('reads a phrase of the vocabulary before stop words are dropped', () => {
    expect(first(ask('nap time'))).toBe('guide:quiet');
    expect(hitOf(ask('nap time'), 'guide:quiet')?.why).toContain('idea quiet time');
  });

  it('matches an idea of several words as a phrase, and reaches it from its other words', () => {
    expect(first(ask('quiet time'))).toBe('guide:quiet');
    expect(hitOf(ask('rest'), 'guide:quiet')?.why).toContain('idea quiet time');
  });

  it('completes the word being typed before it corrects it', () => {
    const typing = ask('kettl');
    expect(typing.understood.corrected).toBeUndefined();
    expect(hitOf(typing, 'starter:kettle')?.why).toContain('prefix kettl');
    expect(ask('kettl ').understood.corrected).toBe('kettle');
  });

  it('corrects a word the index does not know, with a penalty and a chip', () => {
    const answer = ask('teapto');
    expect(first(answer)).toBe('flow:teapot');
    expect(answer.understood.corrected).toBe('teapot');
    expect(answer.understood.chips).toContainEqual({ text: 'teapot', kind: 'corrected' });
    expect(hitOf(answer, 'flow:teapot')?.score ?? 0).toBeLessThan(
      hitOf(ask('teapot'), 'flow:teapot')?.score ?? 0,
    );
  });

  it('reads a listed misspelling as its idea', () => {
    const answer = ask('teepott');
    expect(first(answer)).toBe('flow:teapot');
    expect(answer.understood.chips).toContainEqual({ text: 'teapot', kind: 'misspelling' });
  });

  it('reads the word being typed as the start of a longer word', () => {
    expect(hitOf(ask('umbr'), 'flow:umbrella')?.why).toContain('prefix umbr');
    expect(ids(ask('umbr '))).not.toContain('flow:umbrella');
  });

  it('reads two words as one, and one unknown word as two', () => {
    expect(first(ask('tea pot'))).toBe('flow:teapot');
    expect(ids(ask('redkettle'))).toContain('vanilla:red_kettle');
  });

  it('matches a whole id exactly', () => {
    const answer = ask('base:rain_cover');
    expect(answer.best[0]?.entry.id).toBe('vanilla:rain_cover');
    expect(answer.best[0]?.why[0]).toBe('exact id');
    expect(first(ask('rain_cover'))).toBe('vanilla:rain_cover');
  });

  it('strikes through words it cannot place, but not colour names', () => {
    const answer = ask('teal teapot blorptastic');
    expect(answer.understood.chips).toEqual([
      { text: 'blorptastic', kind: 'not-understood', struck: true },
    ]);
    expect(ids(answer)).toContain('flow:teapot');
  });

  it('finds nothing for nonsense and only stop words', () => {
    for (const text of ['asdfgh', 'zzzz', 'the of a', '', '   ']) {
      const answer = ask(text);
      expect(answer.best).toEqual([]);
      expect(answer.confident).toBe(false);
    }
  });
});

describe('query: ranking', () => {
  it('follows the intent words', () => {
    expect(first(ask('how do i pour from a teapot'))).toBe('guide:pouring');
    expect(first(ask('make a teapot'))).toBe('flow:teapot');
    expect(first(ask('fix cold kettle'))).toBe('problem:cold');
  });

  it('leans to make in Very easy and to commands in the commands scope', () => {
    const easy = hitOf(ask('house', { mode: 'easy' }), 'command:play')?.score ?? 0;
    const veryEasy = hitOf(ask('house', { mode: 'very-easy' }), 'command:play')?.score ?? 0;
    expect(veryEasy).toBeLessThan(easy);
    expect(first(ask('play', { scope: 'commands' }))).toBe('command:play');
  });

  it('keeps a scope and reads prefixes in Advanced only', () => {
    expect(
      ids(ask('house', { scope: 'commands' })).every((id) => /^(command|setting):/.test(id)),
    ).toBe(true);
    expect(
      ids(ask('> house', { mode: 'advanced' })).every((id) => /^(command|setting):/.test(id)),
    ).toBe(true);
    expect(ids(ask('? house', { mode: 'advanced' })).every((id) => id.startsWith('guide:'))).toBe(
      true,
    );
    expect(ids(ask('> house', { mode: 'easy' })).some((id) => id.startsWith('guide:'))).toBe(true);
  });

  it('keeps technical entries under More in Very easy', () => {
    const answer = ask('gadget', { mode: 'very-easy' });
    expect(answer.best).toEqual([]);
    expect(answer.sections.at(-1)?.id).toBe('more');
    expect(first(ask('gadget', { mode: 'advanced' }))).toBe('kind:gadget');
  });

  it('shows an unavailable entry after the available one it equals', () => {
    const answer = ask('gizmo maker');
    expect(answer.best[0]?.entry.id).toBe('flow:gizmo');
    expect(ids(answer)).toContain('flow:gizmo-old');
    expect(hitOf(answer, 'flow:gizmo-old')?.why).toContain('not available');
  });

  it('folds a tile into its flow', () => {
    const answer = ask('make a teapot');
    expect(ids(answer)).not.toContain('tile:teapot');
    expect(hitOf(answer, 'flow:teapot')?.why).toContain('folded tile:teapot');
  });

  it('lifts what the open mod uses and what was chosen before', () => {
    const local = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY] });
    local.setLayer('static', [...HOUSE, ...filler(400)]);
    const before = ids(local.query({ text: 'house', mode: 'easy', limit: 10 }));
    const [upper, lower] = ['command:play', 'command:export'].sort(
      (a, b) => before.indexOf(a) - before.indexOf(b),
    );
    local.setContext({ history: { [lower as string]: 3 }, inMod: [lower as string] });
    const after = local.query({ text: 'house', mode: 'easy', limit: 10 });
    expect(ids(after).indexOf(lower as string)).toBeLessThan(ids(after).indexOf(upper as string));
    expect(hitOf(after, lower as string)?.why).toEqual(
      expect.arrayContaining(['in your mod', 'chosen before']),
    );
  });

  it('lists its signals in why', () => {
    const why = hitOf(ask('copper kettle'), 'starter:kettle')?.why ?? [];
    expect(why).toEqual(
      expect.arrayContaining([
        'word copper',
        'word kettle',
        'every word',
        'exact title',
        'in order and close',
      ]),
    );
  });

  it('gives sections three rows and the count of the rest, more when asked', () => {
    const answer = ask('house');
    for (const section of answer.sections) expect(section.hits.length).toBeLessThanOrEqual(3);
    const total = (a: SearchAnswer) =>
      a.best.length + a.sections.reduce((n, s) => n + s.hits.length + s.more, 0);
    expect(total(ask('house', { limit: 50 }))).toBe(total(answer));
  });
});

describe('query: the answer reader', () => {
  const reader: SearchAnswerReader = {
    read(query) {
      const that = query.words.indexOf('that');
      return {
        skip: that >= 0 ? query.words.map((_, i) => i).filter((i) => i >= that) : [],
        extra: query.words.includes('opens') ? ['flow:umbrella'] : [],
        chips: [{ text: 'teal', kind: 'colour' }],
        answer(e) {
          if (e.id !== 'flow:teapot') return undefined;
          const teal = query.folded.indexOf('teal');
          const red = query.folded.indexOf('red');
          return {
            answers: { colour: '#008080' },
            absorbed: [teal, red].filter((i) => i >= 0),
            makesThing: red >= 0,
            ...(that >= 0
              ? { behaviour: { id: 'pours', sentence: 'It pours.' }, behaviourFits: true }
              : {}),
          };
        },
      };
    },
  };
  let withReader: SearchEngine;
  beforeAll(() => {
    withReader = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY], answers: reader });
    withReader.setLayer('static', [...HOUSE, ...filler(400)]);
  });

  it('counts absorbed words as matched and carries the answers', () => {
    const plain = hitOf(index.query({ text: 'teal teapot', mode: 'easy' }), 'flow:teapot');
    const read = withReader.query({ text: 'teal teapot', mode: 'easy' });
    expect(hitOf(read, 'flow:teapot')?.answers).toEqual({ colour: '#008080' });
    expect(hitOf(read, 'flow:teapot')?.why).toContain('answers');
    expect(hitOf(read, 'flow:teapot')?.score ?? 0).toBeGreaterThanOrEqual(plain?.score ?? 0);
    expect(read.understood.chips).toContainEqual({ text: 'teal', kind: 'colour' });
  });

  it('puts a flow that makes the thing above the thing under the make lean', () => {
    const easy = withReader.query({ text: 'red kettle', mode: 'easy' });
    expect(first(easy)).toBe('vanilla:red_kettle');
    const veryEasy = withReader.query({ text: 'red kettle', mode: 'very-easy' });
    expect(hitOf(veryEasy, 'flow:teapot')?.why).toContain('makes this');
  });

  it('leaves a clause out of the text score and adds the entries a behaviour names', () => {
    const answer = withReader.query({ text: 'teapot that opens', mode: 'easy', limit: 10 });
    expect(answer.understood.chips.some((c) => c.struck === true)).toBe(false);
    expect(hitOf(answer, 'flow:teapot')?.behaviour).toEqual({ id: 'pours', sentence: 'It pours.' });
    expect(ids(answer)).toContain('flow:umbrella');
  });

  it('survives a reader that throws', () => {
    const broken = createSearchIndex({
      answers: {
        read: () => ({
          answer: () => {
            throw new Error('no');
          },
        }),
      },
    });
    broken.setLayer('static', HOUSE);
    expect(ids(broken.query({ text: 'teapot', mode: 'easy' }))).toContain('flow:teapot');
    expect(broken.stats().failures).toBeGreaterThan(0);
  });
});

describe('query: the index', () => {
  it('gives the same answer twice, and whatever order the layers were built in', () => {
    const request: SearchRequest = { text: 'house kettle teapot', mode: 'easy', limit: 50 };
    expect(ask(request.text, request)).toEqual(ask(request.text, request));
    const other = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY] });
    other.setLayer('project', HOUSE.slice(8));
    other.setLayer('static', [...HOUSE.slice(0, 8), ...filler(400)]);
    const split = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY] });
    split.setLayer('static', [...HOUSE.slice(0, 8), ...filler(400)]);
    split.setLayer('project', HOUSE.slice(8));
    const strip = (a: SearchAnswer) => JSON.stringify(a);
    expect(strip(other.query(request))).toBe(strip(split.query(request)));
  });

  it('breaks ties by source, title and id', () => {
    const tie = createSearchIndex();
    tie.setLayer('static', [
      entry('b', 'guide', 'Widget'),
      entry('c', 'flow', 'Widget'),
      entry('a', 'flow', 'Widget'),
      ...filler(100),
    ]);
    const hits = tie.query({ text: 'widget', mode: 'advanced', limit: 10 });
    const order = [...hits.best, ...hits.sections.flatMap((s) => s.hits)].map((h) => h.entry.id);
    expect(order.slice(0, 2)).toEqual(['a', 'c']);
  });

  it('follows a patch of the project layer', () => {
    const live = createSearchIndex();
    live.setLayer('static', filler(200));
    live.setLayer('project', [entry('p:1', 'project', 'Ruby teapot')]);
    expect(ids(live.query({ text: 'ruby', mode: 'easy' }))).toEqual(['p:1']);
    live.patchLayer('project', [entry('p:2', 'project', 'Ruby kettle')], ['p:1']);
    expect(ids(live.query({ text: 'ruby', mode: 'easy' }))).toEqual(['p:2']);
    expect(live.entry('p:2')?.title).toBe('Ruby kettle');
    expect(live.entry('p:1')).toBeUndefined();
    expect(live.stats().layers).toEqual({ project: 1, static: 200 });
  });

  it('follows a vocabulary change without rebuilding a layer', () => {
    const local = createSearchIndex();
    local.setLayer('static', [entry('flow:umbrella', 'flow', 'Umbrella'), ...filler(100)]);
    expect(ids(local.query({ text: 'brolly', mode: 'easy' }))).toEqual([]);
    local.setVocabulary([HOUSE_VOCABULARY]);
    expect(ids(local.query({ text: 'brolly', mode: 'easy' }))).toContain('flow:umbrella');
  });

  it('crosses the worker as slim hits', () => {
    const hit = ask('teapot').best[0];
    expect(hit && toSlim(hit)).toEqual({ id: 'flow:teapot', score: hit?.score, why: hit?.why });
  });

  it('never throws on odd requests', () => {
    for (const request of [
      null,
      7,
      {},
      { text: 42 },
      { text: 'x', mode: 'nope', limit: -3, scope: 'odd' },
    ]) {
      expect(() => index.query(request as never)).not.toThrow();
    }
    expect(index.stats().failures).toBe(0);
  });
});
