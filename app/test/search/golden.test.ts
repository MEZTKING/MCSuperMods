/**
 * The fixed query set (ADR 0124 D16; B666) over the search as the app builds it: the built-in
 * plugins and the app's lists, the guide, the vanilla layer of each target with and without the
 * made-up names file, an empty mod and `fixtures/sample-mod` (`golden-runner.ts`). B650's bars:
 * 85 % first and 95 % in the top three overall, at least 75 % and 85 % in each class, 100 % for
 * ids, commands and nonsense, per target, names setting and mod; nonsense finds no Best match;
 * the same query gives the same order on a fresh build; an entry unavailable on a target is never
 * first there while an available one scores within a fifth of it. Queries with `needs` wait on
 * later work: run and reported, not counted. `golden-queries.json` is never regenerated: a change
 * needs a `reason`. `GOLDEN_REPORT=<file>` writes the tables of
 * `docs/reference/search-golden-report.md`.
 */

import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { TARGET_IDS } from './fixtures';
import {
  BARS,
  buildSearch,
  byClass,
  CLASSES,
  type ConfigResults,
  configName,
  counted,
  type GoldenQuery,
  type GoldenSearch,
  loadShared,
  missedBars,
  type RunConfig,
  ranked,
  readGoldenSet,
  reportMarkdown,
  runQueries,
  type Shared,
  tally,
} from './golden-runner';

// Building the search eight times (two targets, names file or not, empty or sample mod) and
// asking 240 queries in each takes about 15 s on a quiet machine and three times that on a busy
// shared runner; a generous timeout rather than a retry.
const HEAVY = 240_000;

const CONFIGS: readonly RunConfig[] = TARGET_IDS.flatMap((target) =>
  [false, true].flatMap((names) =>
    (['empty', 'sample-mod'] as const).map((project) => ({ target, names, project })),
  ),
);

let shared: Shared;
let queries: readonly GoldenQuery[];
const runs: ConfigResults[] = [];
/** Per target, the queries' shown ids and their order on the first build (determinism). */
const orders = new Map<string, string[][]>();
/** Per target, the search with no names file and an empty mod (kept for the later tests). */
const plain = new Map<string, GoldenSearch>();

beforeAll(async () => {
  shared = await loadShared();
  queries = (await readGoldenSet()).queries;
  for (const config of CONFIGS) {
    const search = buildSearch(shared, config);
    const results = runQueries(search, queries);
    runs.push({ config, results });
    if (!config.names && config.project === 'empty') {
      orders.set(
        config.target,
        queries.map((query) => ranked(search.ask(query.q, query.mode)).map((hit) => hit.id)),
      );
      plain.set(config.target, search);
    }
  }
  if (process.env.GOLDEN_REPORT !== undefined) {
    writeFileSync(process.env.GOLDEN_REPORT, reportMarkdown(runs));
  }
}, HEAVY);

describe('the fixed query set', () => {
  it('holds at least 200 queries in the eleven classes, each written right', () => {
    expect(queries.length).toBeGreaterThanOrEqual(200);
    const seen = new Set<string>();
    for (const query of queries) {
      expect(CLASSES, query.q).toContain(query.class);
      expect(['very-easy', 'easy', 'advanced'], query.q).toContain(query.mode);
      expect(seen.has(`${query.mode} ${query.q}`), `twice: ${query.q}`).toBe(false);
      seen.add(`${query.mode} ${query.q}`);
      expect(query.class === 'nonsense', query.q).toBe(query.expect === null);
    }
    for (const cls of CLASSES) {
      expect(
        queries.filter((query) => query.class === cls && query.needs === undefined).length,
        cls,
      ).toBeGreaterThanOrEqual(15);
    }
  });

  it('names only results the search has, on every target', () => {
    const missing: string[] = [];
    for (const target of TARGET_IDS) {
      const search = plain.get(target);
      const withMod = buildSearch(shared, { target, names: false, project: 'sample-mod' });
      for (const query of queries) {
        const has = query.project === 'sample-mod' ? withMod : search;
        for (const id of [query.expect, ...(query.same ?? []), ...(query.top3 ?? [])]) {
          if (id !== null && has?.entries.has(id) !== true)
            missing.push(`${target} ${query.q}: ${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  for (const config of CONFIGS) {
    it(`meets the bars: ${configName(config)}`, () => {
      const results = runs.find((run) => run.config === config)?.results ?? [];
      expect(results.length).toBeGreaterThan(0);
      const missed = [
        ...missedBars('overall', tally(counted(results))),
        ...[...byClass(results)].flatMap(([cls, group]) => missedBars(cls, tally(group))),
      ];
      const misses = counted(results)
        .filter((result) => !result.first)
        .map((result) => `${result.query.q}: ${result.got.slice(0, 3).join(', ')}`);
      expect(missed, misses.join('\n')).toEqual([]);
      const overall = tally(counted(results));
      expect(overall.first / overall.n).toBeGreaterThanOrEqual(BARS.overall.first);
      expect(overall.top3 / overall.n).toBeGreaterThanOrEqual(BARS.overall.top3);
    });
  }

  it('finds no Best match for nonsense anywhere', () => {
    for (const { config, results } of runs) {
      for (const result of results) {
        if (result.query.class !== 'nonsense') continue;
        expect(result.first, `${configName(config)}: ${result.query.q}`).toBe(true);
      }
    }
  });

  it('reads the expected answers and behaviours for most queries that have them', () => {
    // Two known misses (the wand queries) wait on the Scripted behaviour flow having a sort; the
    // report lists them.
    for (const { config, results } of runs) {
      const t = tally(counted(results));
      expect(t.answers / t.answersN, configName(config)).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe('order and availability', () => {
  it('gives the same order for the same query on a fresh build', () => {
    for (const target of TARGET_IDS) {
      const again = buildSearch(shared, { target, names: false, project: 'empty' });
      const first = orders.get(target) ?? [];
      const second = queries.map((query) =>
        ranked(again.ask(query.q, query.mode)).map((hit) => hit.id),
      );
      expect(second, target).toEqual(first);
    }
  });

  it(
    'never puts an unavailable entry first while an available one scores within a fifth',
    () => {
      const broken: string[] = [];
      for (const target of TARGET_IDS) {
        // Every third flow (and the doors and tiles that open it) as a target that lacks it.
        const flows = (plain.get(target)?.spec.entries ?? [])
          .filter((entry) => entry.source === 'flow' && entry.id.startsWith('flow:'))
          .map((entry) => entry.id.slice('flow:'.length))
          .sort()
          .filter((_, i) => i % 3 === 0);
        expect(flows.length, target).toBeGreaterThan(10);
        const search = buildSearch(shared, {
          target,
          names: false,
          project: 'empty',
          unavailableFlows: flows,
        });
        const asked = [
          ...queries.map((query) => ({ q: query.q, mode: query.mode })),
          ...search.spec.entries
            .filter((entry) => entry.available === false)
            .map((entry) => ({ q: entry.title, mode: 'very-easy' as const })),
        ];
        for (const { q, mode } of asked) {
          const answer = search.ask(q, mode);
          for (const hit of answer.best) {
            if (search.entries.get(hit.id)?.available === false)
              broken.push(`${target} ${q}: ${hit.id} is a Best match`);
          }
          const hits = ranked(answer);
          const top = hits[0];
          if (top === undefined || search.entries.get(top.id)?.available !== false) continue;
          const rival = hits.find(
            (hit) =>
              search.entries.get(hit.id)?.available !== false && hit.score >= top.score * 0.8,
          );
          if (rival !== undefined) broken.push(`${target} ${q}: ${top.id} above ${rival.id}`);
        }
      }
      expect(broken).toEqual([]);
    },
    HEAVY,
  );
});
