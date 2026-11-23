/**
 * A request never throws, on any string (ADR 0124; packages/search/CLAUDE.md): 10,000 seeded
 * random strings (any code point, ids, prefixes, numbers, long runs, words of the index with
 * slips), in every mode and scope, and every answer well formed. Failures caught inside the
 * engine are counted, so the count must stay zero: nothing is hidden by the engine's own guard.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSearchIndex,
  type SearchAnswer,
  type SearchEngine,
  type SearchRequest,
} from '../src';
import { entry, filler, HOUSE_VOCABULARY, madeUpWords, random } from './engine-fixtures';

const MODES: SearchRequest['mode'][] = ['very-easy', 'easy', 'advanced'];
const SCOPES: SearchRequest['scope'][] = [
  undefined,
  'make',
  'mine',
  'minecraft',
  'help',
  'commands',
];
const PIECES = [
  ' ',
  '  ',
  ':',
  '_',
  '/',
  '#',
  '>',
  '@',
  '?',
  '"',
  "'",
  '-',
  '.',
  ',',
  '%',
  '1',
  '20',
  '1.5',
  '3-5',
  '1,000',
];

let index: SearchEngine;
let words: string[];

beforeAll(() => {
  words = madeUpWords(300, 5);
  index = createSearchIndex({ vocabulary: [HOUSE_VOCABULARY], protect: words.slice(0, 50) });
  index.setLayer('static', [
    ...filler(600),
    ...words.map((w, i) =>
      entry(`w:${i}`, i % 2 === 0 ? 'flow' : 'vanilla', `${w} ${words[(i * 7) % 300]}`, {
        ids: [`base:${w}_${i}`],
        questions: [
          {
            id: 'q',
            label: w,
            type: 'choice',
            choices: [{ value: 'a', label: words[i + 1] ?? 'a' }],
          },
        ],
      }),
    ),
  ]);
  index.setLayer(
    'project',
    words.slice(0, 100).map((w, i) => entry(`p:${i}`, 'project', `My ${w}`)),
  );
});

function randomString(next: () => number): string {
  const kind = Math.floor(next() * 5);
  const length = kind === 4 ? 200 + Math.floor(next() * 2000) : Math.floor(next() * 40);
  let out = '';
  while (out.length < length) {
    const r = next();
    if (r < 0.3) out += words[Math.floor(next() * words.length)];
    else if (r < 0.5) out += PIECES[Math.floor(next() * PIECES.length)];
    else if (r < 0.6 && out.length > 0) out = out.slice(0, -1);
    else if (r < 0.8) out += String.fromCharCode(32 + Math.floor(next() * 95));
    else out += String.fromCodePoint(Math.floor(next() * 0x10ffff) & ~0x800);
  }
  return kind === 3 ? `base:${out}` : out;
}

function wellFormed(answer: SearchAnswer, rows: number): void {
  expect(answer.best.length).toBeLessThanOrEqual(3);
  if (!answer.confident) expect(answer.best).toEqual([]);
  for (const section of answer.sections) {
    expect(section.hits.length).toBeGreaterThan(0);
    expect(section.hits.length).toBeLessThanOrEqual(rows);
    expect(section.more).toBeGreaterThanOrEqual(0);
  }
  for (const hit of [...answer.best, ...answer.sections.flatMap((s) => s.hits)]) {
    expect(Number.isFinite(hit.score)).toBe(true);
    expect(Array.isArray(hit.why)).toBe(true);
  }
}

describe('fuzz', () => {
  // A heavy test: 10,000 queries over an index of about 1,000 entries.
  it('never throws on 10,000 random strings', { timeout: 120_000 }, () => {
    const next = random(2026);
    for (let n = 0; n < 10_000; n++) {
      const text = randomString(next);
      const limit = next() < 0.2 ? Math.floor(next() * 80) - 10 : undefined;
      const request = {
        text,
        mode: MODES[n % 3] as SearchRequest['mode'],
        ...(SCOPES[n % 6] !== undefined ? { scope: SCOPES[n % 6] } : {}),
        ...(limit !== undefined ? { limit } : {}),
      } as SearchRequest;
      const answer = index.query(request);
      wellFormed(answer, limit === undefined ? 3 : Math.max(1, Math.min(50, limit)));
    }
    expect(index.stats().failures).toBe(0);
  });
});
