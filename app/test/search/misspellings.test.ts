/**
 * Every flow title with one seeded wrong letter still finds its flow in the top three (ADR 0124
 * D16; B650 SQ3; B666), on both targets, in Very easy (Home's bar) and in Easy (the toolbar). The
 * edit goes into the title's longest word of four letters or more (B650: three-letter words are
 * never corrected, SL13), never its first letter; a seeded generator picks a swap of neighbours,
 * a dropped letter, a doubled letter or a neighbouring key, so the set is the same on every run. A
 * hit counts when it opens the flow: the flow itself, or a door, tile or card with its action.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { TARGET_IDS } from './fixtures';
import { buildSearch, type GoldenSearch, loadShared, ranked } from './golden-runner';

// Two builds of the search and about 300 queries each: a few seconds, more on a busy runner.
const HEAVY = 120_000;

/** Neighbouring keys on a QWERTY keyboard (lower case letters only). */
const NEIGHBOURS: Readonly<Record<string, string>> = {
  a: 'qwsz',
  b: 'vghn',
  c: 'xdfv',
  d: 'serfcx',
  e: 'wsdr',
  f: 'drtgvc',
  g: 'ftyhbv',
  h: 'gyujnb',
  i: 'ujko',
  j: 'huikmn',
  k: 'jiolm',
  l: 'kop',
  m: 'njk',
  n: 'bhjm',
  o: 'iklp',
  p: 'ol',
  q: 'wa',
  r: 'edft',
  s: 'awedxz',
  t: 'rfgy',
  u: 'yhji',
  v: 'cfgb',
  w: 'qase',
  x: 'zsdc',
  y: 'tghu',
  z: 'asx',
};

/** A small seeded generator (mulberry32), so every run makes the same misspellings. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the title's letters. */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** The title with one seeded wrong letter in its longest word of four letters or more. */
function misspell(title: string): string | undefined {
  const words = title.split(/(\s+)/);
  let at = -1;
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (/^[A-Za-z]{4,}$/.test(word) && (at < 0 || word.length > (words[at] as string).length)) {
      at = i;
    }
  }
  if (at < 0) return undefined;
  const word = (words[at] as string).toLowerCase();
  const random = seeded(seedOf(title));
  const kind = Math.floor(random() * 4);
  // Never the first letter: people rarely get it wrong, and the typo index leans on it (B650).
  const i = 1 + Math.floor(random() * (word.length - 1));
  const char = word[i] as string;
  let wrong: string;
  switch (kind) {
    case 0: {
      const j = i === word.length - 1 ? i - 1 : i;
      wrong = word.slice(0, j) + (word[j + 1] as string) + (word[j] as string) + word.slice(j + 2);
      if (wrong === word) wrong = word.slice(0, i) + word.slice(i + 1);
      break;
    }
    case 1:
      wrong = word.slice(0, i) + word.slice(i + 1);
      break;
    case 2:
      wrong = word.slice(0, i) + char + word.slice(i);
      break;
    default: {
      const keys = NEIGHBOURS[char] ?? 'e';
      wrong = word.slice(0, i) + keys[Math.floor(random() * keys.length)] + word.slice(i + 1);
    }
  }
  words[at] = wrong;
  return words.join('');
}

interface Case {
  readonly flow: string;
  readonly title: string;
  readonly q: string;
}

let searches: Map<string, GoldenSearch>;

beforeAll(async () => {
  const shared = await loadShared();
  searches = new Map(
    TARGET_IDS.map((target) => [
      target,
      buildSearch(shared, { target, names: false, project: 'empty' }),
    ]),
  );
}, HEAVY);

/** Every available flow of a target with its misspelt title. */
function casesOf(search: GoldenSearch): { cases: Case[]; skipped: string[] } {
  const cases: Case[] = [];
  const skipped: string[] = [];
  for (const entry of search.spec.entries) {
    if (!entry.id.startsWith('flow:') || entry.available === false) continue;
    const q = misspell(entry.title);
    if (q === undefined) skipped.push(entry.title);
    else cases.push({ flow: entry.id.slice('flow:'.length), title: entry.title, q });
  }
  return { cases, skipped };
}

/** Whether a hit opens the flow (the flow, or a door, tile or card with its action). */
function opens(search: GoldenSearch, id: string, flow: string): boolean {
  const action = search.entries.get(id)?.action as { type?: string; starter?: string } | undefined;
  return id === `flow:${flow}` || (action?.type === 'flow' && action.starter === flow);
}

describe('flow titles with one wrong letter', () => {
  it('makes a real misspelling of each title, the same on every run', () => {
    expect(misspell('Weapon')).toBe(misspell('Weapon'));
    expect(misspell('Tank')).not.toBe('tank');
    expect(misspell('Car')).toBeUndefined();
    for (const title of ['Weapon', 'Custom ore', 'Empty sky with a start island', 'Glider']) {
      const wrong = misspell(title) as string;
      expect(wrong.toLowerCase()).not.toBe(title.toLowerCase());
      expect(wrong[0]?.toLowerCase()).toBe(title[0]?.toLowerCase());
    }
  });

  /*
   * B666's two misses were engine findings, fixed after the close (2026-11-23): `tnak` shared no
   * trigram with `tank`, and a swap of neighbours is now looked up directly (still one edit, so
   * SL13's limits by length hold); `soin` ties `skin`, `spin` and `soil`, and every tied word is
   * now offered, the first result deciding (Mob skin). Every flow title is found; none is known
   * to miss.
   */

  for (const mode of ['very-easy', 'easy'] as const) {
    it(`finds every flow in the top three in ${mode}, on every target`, () => {
      const missed: string[] = [];
      for (const [target, search] of searches) {
        const { cases, skipped } = casesOf(search);
        expect(cases.length, target).toBeGreaterThan(60);
        // Titles with no word of four letters (Car) are left out (B650, SL13).
        expect(skipped.length, `${target}: ${skipped.join(', ')}`).toBeLessThanOrEqual(3);
        for (const { flow, title, q } of cases) {
          const top = ranked(search.ask(q, mode)).slice(0, 3);
          if (!top.some((hit) => opens(search, hit.id, flow))) {
            missed.push(`${target} ${title} as "${q}": ${top.map((hit) => hit.id).join(', ')}`);
          }
        }
      }
      expect(missed).toEqual([]);
    });
  }
});
