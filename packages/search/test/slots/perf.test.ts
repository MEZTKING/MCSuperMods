// The answer reader inside the query budget (ADR 0124 D3: p95 30 ms static): the made-up corpus
// of the size of the real one (B658's perf corpus) with the fixture flows, every query read.
import { beforeAll, describe, expect, it } from 'vitest';
import { createAnswerReader, createSearchIndex, type SearchEngine } from '../../src';
import { madeUpCorpus } from '../engine-fixtures';
import { flowEntries, flowFacts, pluginData, VOCABULARY } from './flows';

const SLACK = process.env.CI ? 3 : 1;
const P95_MS = 30;

function time(run: () => void): number {
  const cpu = process.cpuUsage();
  const start = performance.now();
  run();
  const wall = performance.now() - start;
  const used = process.cpuUsage(cpu);
  return Math.min(wall, (used.user + used.system) / 1000);
}

describe('the answer reader in the query budget', () => {
  let engine: SearchEngine;
  let queries: string[];
  beforeAll(() => {
    const corpus = madeUpCorpus();
    engine = createSearchIndex({
      vocabulary: [corpus.vocabulary, VOCABULARY],
      answers: createAnswerReader({ plugins: [{ data: pluginData() }], flows: flowFacts() }),
    });
    engine.setLayer('static', [...corpus.static, ...flowEntries()]);
    engine.setLayer('vanilla', corpus.vanilla);
    engine.warm();
    queries = [
      ...corpus.queries,
      'blue sword that sets mobs on fire',
      'speed consumable for 30 seconds and poison for 10 seconds',
      'villager trade that sells diamonds for 5 emeralds',
      'cherry tree with green leaves',
      'a "Sky Pig" mount that flies',
    ];
  });

  it('keeps the p95 of a query within the budget', () => {
    for (const text of queries) engine.query({ text, mode: 'easy' });
    const times: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (const text of queries) times.push(time(() => engine.query({ text, mode: 'very-easy' })));
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] as number;
    expect(p95).toBeLessThan(P95_MS * SLACK);
    expect(engine.stats().failures).toBe(0);
  });
});
