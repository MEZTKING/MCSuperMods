// B650 spike: build and query timings (SQ1, SQ2), shared by Node, a Node worker and an Electron
// Web Worker (bundled by esbuild). Input is plain data, so it crosses `postMessage`.
import { buildIndex, DEFAULT_OPTIONS, type Entry, type Index, type Vocabulary } from './engine.ts';
import type { Behaviour, Colour, WordGroup } from './vocab.ts';

export interface BenchInput {
  corpus: Entry[];
  vanilla: Entry[];
  mod500: Entry[];
  mod5000: Entry[];
  protect: string[];
  vocab: { groups: WordGroup[]; colours: Colour[]; behaviours: Behaviour[]; mobWords: string[] };
  queries: string[];
  reps: number;
}

const stats = (xs: number[]): { median: number; p95: number; max: number; n: number } => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number): number => +(s[Math.min(s.length - 1, Math.floor(p * s.length))] as number).toFixed(3);
  return { median: at(0.5), p95: at(0.95), max: +(s[s.length - 1] as number).toFixed(3), n: s.length };
};

const now = (): number => performance.now();

export function runBench(input: BenchInput, heap?: () => number): Record<string, unknown> {
  const vocab: Vocabulary = { ...input.vocab, mobWords: new Set(input.vocab.mobWords) };
  const protect = new Set(input.protect);
  const opts = { ...DEFAULT_OPTIONS, v1: true, typo: 'trigram' as const };
  const out: Record<string, unknown> = {};
  const build = (entries: Entry[]): { index: Index; ms: number; heapMB?: number } => {
    const h0 = heap?.();
    const t0 = now();
    const index = buildIndex(entries, vocab, protect, opts);
    const ms = +(now() - t0).toFixed(1);
    const h1 = heap?.();
    return { index, ms, ...(h0 !== undefined && h1 !== undefined ? { heapMB: +((h1 - h0) / 1e6).toFixed(1) } : {}) };
  };
  // warm the JIT once on the static layer (a worker built at first paint is cold: both reported)
  const cold = build(input.corpus);
  const warm = build(input.corpus);
  out.build = {
    staticCold: cold.ms,
    static: warm.ms,
    staticPlusVanilla: build([...input.corpus, ...input.vanilla]).ms,
    vanillaAlone: build(input.vanilla).ms,
    mod500Alone: build(input.mod500).ms,
    mod5000Alone: build(input.mod5000).ms,
  };
  const configs: [string, Entry[]][] = [
    ['static', input.corpus],
    ['static+vanilla', [...input.corpus, ...input.vanilla]],
    ['static+vanilla+mod500', [...input.corpus, ...input.vanilla, ...input.mod500]],
    ['static+vanilla+mod5000', [...input.corpus, ...input.vanilla, ...input.mod5000]],
  ];
  const memory: Record<string, unknown> = {};
  const latency: Record<string, unknown> = {};
  for (const [name, entries] of configs) {
    const b = build(entries);
    memory[name] = { entries: b.index.stats().entries, terms: b.index.stats().terms, postings: b.index.stats().postings, buildMs: b.ms, ...(b.heapMB !== undefined ? { heapMB: b.heapMB } : {}) };
    const byWords: Record<string, number[]> = {};
    const all: number[] = [];
    for (let r = 0; r < input.reps; r++) {
      for (const q of input.queries) {
        const t0 = now();
        b.index.search(q, 'easy', 20);
        const ms = now() - t0;
        const n = Math.min(6, q.split(/\s+/).filter((w) => w !== '').length);
        (byWords[String(n)] ??= []).push(ms);
        all.push(ms);
        // typing: each prefix of the query, as a user types it (last word a prefix)
      }
    }
    latency[name] = { all: stats(all), ...Object.fromEntries(Object.entries(byWords).map(([k, v]) => [`${k} words`, stats(v)])) };
  }
  out.memory = memory;
  out.latency = latency;
  return out;
}
