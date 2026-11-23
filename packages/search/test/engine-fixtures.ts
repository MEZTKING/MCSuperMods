// Made-up entries and words for the engine's tests (B658). No game word: the nouns are household
// things and invented words, so the tests say nothing about any game's content.
import type { SearchVocabulary } from '@msm/plugin-api';
import type { SearchEntry, SearchSource } from '../src';

/** An entry with the fields a test names; its action opens it by id unless the test says. */
export function entry(
  id: string,
  source: SearchSource,
  title: string,
  extra: Partial<SearchEntry> = {},
): SearchEntry {
  return {
    id,
    source,
    title,
    available: true,
    action: { type: 'open', id },
    preview: { type: 'none' },
    ...extra,
  };
}

/** A seeded random number generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = [
  'ba',
  'ko',
  'ri',
  'zu',
  'mel',
  'tor',
  'vin',
  'qua',
  'sel',
  'dra',
  'fen',
  'lo',
  'pim',
  'gru',
  'sha',
  'nek',
  'wo',
  'tes',
  'yar',
  'bri',
  'cal',
  'dun',
  'eph',
  'fiz',
  'gol',
  'hep',
  'jin',
  'kav',
];

/** Made-up words, distinct, from syllables. */
export function madeUpWords(count: number, seed = 1): string[] {
  const next = random(seed);
  const out = new Set<string>();
  while (out.size < count) {
    const n = 2 + Math.floor(next() * 2);
    let word = '';
    for (let i = 0; i < n; i++) word += SYLLABLES[Math.floor(next() * SYLLABLES.length)];
    out.add(word);
  }
  return [...out];
}

/** Filler entries of made-up words, so that the scores of a small test sit on a realistic scale. */
export function filler(count: number, seed = 7): SearchEntry[] {
  const words = madeUpWords(400, seed);
  const next = random(seed + 1);
  const pick = (): string => words[Math.floor(next() * words.length)] as string;
  const sources: SearchSource[] = ['template', 'example', 'kind', 'guide', 'problem', 'vanilla'];
  return Array.from({ length: count }, (_, i) =>
    entry(`filler:${i}`, sources[i % sources.length] as SearchSource, `${pick()} ${pick()}`, {
      sentence: `${pick()} ${pick()} ${pick()} ${pick()}.`,
    }),
  );
}

/** A small vocabulary of household things. */
export const HOUSE_VOCABULARY: SearchVocabulary = {
  words: [
    {
      idea: 'teapot',
      same: ['kettle', 'tea kettle'],
      slang: ['pot'],
      near: ['jug'],
      misspellings: ['teepott'],
    },
    { idea: 'umbrella', same: ['brolly', 'parasol'], vanillaIds: ['base:rain_cover'] },
    { idea: 'quiet time', same: ['nap time', 'rest'] },
  ],
  colours: [
    { names: ['teal'], colour: '#008080' },
    { names: ['sky blue', 'light blue'], colour: '#87ceeb' },
  ],
};

/** A made-up corpus the size of the real one (B650 SQ1), for the perf test. */
export interface MadeUpCorpus {
  readonly vocabulary: SearchVocabulary;
  readonly static: SearchEntry[];
  readonly vanilla: SearchEntry[];
  readonly project: SearchEntry[];
  readonly queries: string[];
}

const title = (words: string[]): string =>
  words.map((w) => (w[0] as string).toUpperCase() + w.slice(1)).join(' ');

/** One edit of a word (a letter dropped, doubled, swapped or changed). */
function misspell(word: string, next: () => number): string {
  const at = 1 + Math.floor(next() * (word.length - 2));
  switch (Math.floor(next() * 4)) {
    case 0:
      return word.slice(0, at) + word.slice(at + 1);
    case 1:
      return word.slice(0, at) + (word[at] as string) + word.slice(at);
    case 2:
      return (
        word.slice(0, at - 1) + (word[at] as string) + (word[at - 1] as string) + word.slice(at + 1)
      );
    default:
      return `${word.slice(0, at)}x${word.slice(at + 1)}`;
  }
}

/**
 * 1,400 static entries (as SQ1's mix: flows with questions, starters, templates, examples, kinds,
 * commands, rules, problems, settings, guide sections with bodies), 5,400 vanilla ids and 5,000
 * things of a mod, all of made-up words, and about 120 queries over them.
 */
export function madeUpCorpus(seed = 11): MadeUpCorpus {
  const next = random(seed);
  const words = madeUpWords(3000, seed);
  // Zipf-like: common words are picked far more often than rare ones.
  const pick = (): string => words[Math.floor(words.length * next() ** 2)] as string;
  const some = (n: number): string[] => Array.from({ length: n }, pick);
  const sentence = (n: number): string => `${title([pick()])} ${some(n - 1).join(' ')}.`;

  const groups = Array.from({ length: 300 }, (_, i) => {
    const idea = words[i] as string;
    return {
      idea,
      same: [
        words[300 + i] as string,
        words[600 + i] as string,
        `${words[900 + i]} ${words[1200 + i]}`,
      ],
      slang: [words[1500 + i] as string],
      near: [words[1800 + i] as string],
      misspellings: [`${idea}zq`],
      vanillaIds: i % 5 === 0 ? [`base:${idea}_${words[2100 + i]}`] : [],
    };
  });
  const colours = Array.from({ length: 60 }, (_, i) => ({
    names: [words[2400 + i] as string],
    colour: `#${(i * 4099).toString(16).padStart(6, '0').slice(-6)}`,
  }));
  const vocabulary: SearchVocabulary = { words: groups, colours };

  const statics: SearchEntry[] = [];
  const add = (
    source: SearchSource,
    n: number,
    make: (i: number) => Partial<SearchEntry>,
  ): void => {
    for (let i = 0; i < n; i++) {
      const name = some(1 + Math.floor(next() * 3));
      statics.push(
        entry(`${source}:${i}`, source, title(name), { sentence: sentence(8), ...make(i) }),
      );
    }
  };
  add('flow', 62, () => ({
    words: some(4),
    questions: Array.from({ length: 6 }, (_, q) => ({
      id: `q${q}`,
      label: title(some(2)),
      type: q % 3 === 0 ? ('choice' as const) : ('number' as const),
      ...(q % 3 === 0 ? { choices: some(5).map((w) => ({ value: w, label: title([w]) })) } : {}),
    })),
  }));
  add('starter', 12, () => ({ words: some(3) }));
  add('template', 300, () => ({ words: some(3), technical: next() < 0.3 }));
  add('example', 200, () => ({ words: some(5) }));
  add('kind', 118, (i) => ({ ids: [`msm:${words[i]}`], technical: true }));
  add('command', 51, () => ({}));
  add('rule', 144, () => ({ words: some(2) }));
  add('problem', 250, () => ({}));
  add('setting', 12, () => ({}));
  add('guide', 251, () => ({ body: Array.from({ length: 12 }, () => sentence(8)).join(' ') }));

  const vanilla: SearchEntry[] = [];
  const taken = new Set<string>();
  while (vanilla.length < 5400) {
    const pair = [pick(), pick()];
    const id = `base:${pair.join('_')}`;
    if (taken.has(id)) continue;
    taken.add(id);
    vanilla.push(entry(`vanilla:${id}`, 'vanilla', title(pair), { ids: [id] }));
  }
  const project = Array.from({ length: 5000 }, (_, i) => {
    const name = some(2);
    return entry(`project:${i}`, 'project', `${title(name)} ${i % 7 === 0 ? i : ''}`.trim(), {
      ids: [`mod:${name.join('_')}_${i}`],
      sentence: sentence(5),
    });
  });

  const queries: string[] = [];
  for (let i = 0; i < 30; i++) queries.push(pick());
  for (let i = 0; i < 20; i++) queries.push(some(2).join(' '));
  for (let i = 0; i < 10; i++) queries.push(some(4).join(' '));
  for (let i = 0; i < 5; i++) queries.push(some(10).join(' '));
  for (let i = 0; i < 20; i++) queries.push(misspell(pick(), next));
  for (let i = 0; i < 10; i++) queries.push(pick().slice(0, 3 + (i % 2)));
  for (let i = 0; i < 5; i++) queries.push(`how do i ${some(2).join(' ')}`);
  for (let i = 0; i < 5; i++) queries.push(`make a ${some(2).join(' ')}`);
  for (let i = 0; i < 5; i++) queries.push((vanilla[i * 97]?.ids?.[0] as string) ?? 'base:x');
  for (let i = 0; i < 5; i++) queries.push(`${groups[i * 7]?.same[2]} ${pick()}`);
  queries.push('asdfgh', 'qwerty uiop', 'zzzz', 'lorem ipsum dolor', 'blorptastic');
  return { vocabulary, static: statics, vanilla, project, queries };
}
