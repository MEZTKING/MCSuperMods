/**
 * The time and memory budgets of ADR 0124 D3, as B650 measured them, on a made-up corpus the size
 * of the real one (1,400 static entries, 5,400 vanilla ids, 5,000 things of a mod). Three times
 * the budget is allowed on CI (shared runners); locally the budget itself. Each layer's time
 * includes the dictionary and the typo index it makes the next query need (`warm`), and is the
 * median of three builds (the first one has a cold JIT, and the machine may be shared).
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSearchIndex, type SearchEngine } from '../src';
import { type MadeUpCorpus, madeUpCorpus } from './engine-fixtures';

const SLACK = process.env.CI ? 3 : 1;
const BUDGET = {
  staticMs: 150,
  projectMs: 150,
  vanillaMs: 250,
  queryP95Ms: 30,
  queryP95WithVanillaMs: 60,
  memoryMb: 12,
};

let corpus: MadeUpCorpus;

beforeAll(() => {
  corpus = madeUpCorpus();
});

/**
 * Milliseconds a run took: the smaller of the wall time and this process's CPU time (Vitest runs
 * each file in its own process). On a quiet machine they agree; when other jobs share the cores,
 * the wall time also counts the time the process waited, which is not the engine's cost.
 */
function time(run: () => void): number {
  const cpu = process.cpuUsage();
  const start = performance.now();
  run();
  const wall = performance.now() - start;
  const used = process.cpuUsage(cpu);
  return Math.min(wall, (used.user + used.system) / 1000);
}

/** The median time of three runs. */
function median3(run: (round: number) => void): number {
  const times = [0, 1, 2].map((round) => time(() => run(round)));
  return times.sort((a, b) => a - b)[1] as number;
}

function p95(
  index: SearchEngine,
  queries: readonly string[],
): { p50: number; p95: number; worst: number } {
  for (const text of queries) index.query({ text, mode: 'easy' }); // warm the JIT
  const times: number[] = [];
  for (let round = 0; round < 3; round++) {
    for (const text of queries) {
      const mode = round === 1 ? 'very-easy' : 'easy';
      times.push(time(() => index.query({ text, mode })));
    }
  }
  times.sort((a, b) => a - b);
  const at = (q: number) =>
    times[Math.min(times.length - 1, Math.floor(q * times.length))] as number;
  return { p50: at(0.5), p95: at(0.95), worst: times.at(-1) as number };
}

/** The garbage collector, reached without a command-line flag. */
function collector(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}

describe('perf', () => {
  // A heavy test: it builds the whole made-up corpus several times and runs about 1,500 queries.
  it('meets the build, query and memory budgets', { timeout: 120_000 }, () => {
    const report: Record<string, number> = {};
    const index = createSearchIndex({ vocabulary: [corpus.vocabulary] });
    report.staticMs = median3(() => {
      index.setLayer('static', corpus.static);
      index.warm();
    });
    const staticOnly = p95(index, corpus.queries);
    report.staticP50 = staticOnly.p50;
    report.staticP95 = staticOnly.p95;
    report.vanillaMs = median3(() => {
      index.setLayer('vanilla', corpus.vanilla);
      index.warm();
    });
    const withVanilla = p95(index, corpus.queries);
    report.vanillaP95 = withVanilla.p95;
    report.projectMs = median3(() => {
      index.setLayer('project', corpus.project);
      index.warm();
    });
    const all = p95(index, corpus.queries);
    report.allP50 = all.p50;
    report.allP95 = all.p95;
    report.allWorst = all.worst;
    report.patchMs = median3((round) => {
      const delta = corpus.project
        .slice(round * 10, round * 10 + 10)
        .map((e) => ({ ...e, title: `${e.title} renamed` }));
      index.patchLayer('project', delta, [`project:${100 + round}`]);
      index.warm();
    });
    report.firstQueryAfterPatchMs = time(() =>
      index.query({ text: corpus.queries[0] as string, mode: 'easy' }),
    );

    const gc = collector();
    gc();
    const before = process.memoryUsage().heapUsed;
    let held: SearchEngine | undefined = (() => {
      const fresh = madeUpCorpus();
      const built = createSearchIndex({ vocabulary: [fresh.vocabulary] });
      built.setLayer('static', fresh.static);
      built.setLayer('vanilla', fresh.vanilla);
      built.setLayer('project', fresh.project);
      built.warm();
      built.query({ text: 'warm up', mode: 'easy' });
      return built;
    })();
    gc();
    report.memoryMb = (process.memoryUsage().heapUsed - before) / 2 ** 20;
    report.typedArrayMb = held.stats().bytes / 2 ** 20;
    held = undefined;

    console.log(
      'B658 perf',
      JSON.stringify(
        Object.fromEntries(Object.entries(report).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      ),
      JSON.stringify(index.stats()),
    );
    expect(report.staticMs).toBeLessThanOrEqual(BUDGET.staticMs * SLACK);
    expect(report.vanillaMs).toBeLessThanOrEqual(BUDGET.vanillaMs * SLACK);
    expect(report.projectMs).toBeLessThanOrEqual(BUDGET.projectMs * SLACK);
    expect(report.patchMs).toBeLessThanOrEqual(BUDGET.projectMs * SLACK);
    expect(report.staticP95).toBeLessThanOrEqual(BUDGET.queryP95Ms * SLACK);
    expect(report.vanillaP95).toBeLessThanOrEqual(BUDGET.queryP95WithVanillaMs * SLACK);
    expect(report.allP95).toBeLessThanOrEqual(BUDGET.queryP95WithVanillaMs * SLACK);
    expect(report.memoryMb).toBeLessThanOrEqual(BUDGET.memoryMb * SLACK);
    expect(index.stats().failures).toBe(0);
  });
});
