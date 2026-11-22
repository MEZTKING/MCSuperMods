// B650 spike: Node runs of the build and query timings, the worker round trip (worker_threads),
// and the input file for the Electron run. `node --expose-gc bench.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { type BenchInput, runBench } from './bench-core.ts';
import { buildIndex, DEFAULT_OPTIONS, type Entry } from './engine.ts';
import { jarNames, madeUpMod, registries, vanillaEntries, vanillaWords } from './layers.ts';
import { BEHAVIOURS, COLOURS, FLOW_KEYWORDS, WORD_GROUPS } from './vocab.ts';

const REPO = process.env.REPO as string;
const OUT = process.env.B650_OUT as string;
const target = (process.env.TARGET ?? 'mc-26.3') as 'mc-26.3' | 'mc-26.4';
const jar = process.env.JAR;

const regs = registries(REPO, target);
const names = jar ? jarNames(jar) : undefined;
const corpus = (JSON.parse(readFileSync(`${OUT}/corpus-${target}.json`, 'utf8')) as Entry[]).map((e) =>
  FLOW_KEYWORDS[e.id] !== undefined ? { ...e, words: [...(e.words ?? []), ...(FLOW_KEYWORDS[e.id] as string[])] } : e,
);
const tv0 = performance.now();
const vanilla = vanillaEntries(regs, names?.names);
const vanillaCollectMs = +(performance.now() - tv0).toFixed(1);
const golden = (JSON.parse(readFileSync(`${REPO}/docs/reference/spikes/b650/queries-draft.json`, 'utf8')) as { queries: { q: string }[] }).queries.map((q) => q.q);
const extra = ['make a red pickaxe that mines faster', 'how do I make my own world with islands', 'a friendly flying cat that glows', 'iron sword with more damage and durability', 'turn off the clips on the showcase page', 'where is the setting for the minecraft folder'];
const input: BenchInput = {
  corpus,
  vanilla,
  mod500: madeUpMod(500),
  mod5000: madeUpMod(5000),
  protect: [...vanillaWords(regs)],
  vocab: { groups: WORD_GROUPS, colours: COLOURS, behaviours: BEHAVIOURS, mobWords: (regs.entity_type ?? []).filter((p) => !p.includes('_')) },
  queries: [...golden, ...extra],
  reps: Number(process.env.REPS ?? 10),
};
writeFileSync(`${OUT}/bench-input-${target}.json`, JSON.stringify({ ...input, vanilla: vanillaEntries(regs) }));

const gc = (globalThis as { gc?: () => void }).gc;
const heap = gc ? (): number => { gc(); gc(); return process.memoryUsage().heapUsed; } : undefined;
const main = runBench(input, heap);

// Worker round trip: the same index in a worker_threads worker against the same call here.
const all = [...input.corpus, ...input.vanilla, ...input.mod5000];
const vocab = { ...input.vocab, mobWords: new Set(input.vocab.mobWords) };
const local = buildIndex(all, vocab, new Set(input.protect), { ...DEFAULT_OPTIONS, v1: true, typo: 'trigram' as const });
const worker = new Worker(new URL('./bench-worker.ts', import.meta.url));
const ask = (msg: unknown): Promise<{ hits: unknown[]; ms: number; built?: number }> => new Promise((ok) => { worker.once('message', ok); worker.postMessage(msg); });
const tPost = performance.now();
const ready = await ask({ type: 'build', entries: all, protect: input.protect, vocab: input.vocab });
const buildRoundTrip = +(performance.now() - tPost).toFixed(1);
const rt: number[] = [];
const direct: number[] = [];
let resultBytes = 0;
for (let r = 0; r < 5; r++) {
  for (const q of input.queries) {
    let t0 = performance.now();
    const a = local.search(q, 'easy', 20);
    direct.push(performance.now() - t0);
    if (r === 0) resultBytes += JSON.stringify(a).length;
    t0 = performance.now();
    await ask({ type: 'search', text: q });
    rt.push(performance.now() - t0);
  }
}
await worker.terminate();
const s = (xs: number[]): { median: number; p95: number } => {
  const v = [...xs].sort((a, b) => a - b);
  return { median: +(v[Math.floor(v.length / 2)] as number).toFixed(3), p95: +(v[Math.floor(v.length * 0.95)] as number).toFixed(3) };
};
console.log(JSON.stringify({
  target, node: process.version, jar: names ? { enUsBytes: names.bytes, readMs: +names.ms.toFixed(1), keys: Object.keys(names.names).length } : null,
  vanillaCollectMs, vanillaEntries: vanilla.length, staticEntries: corpus.length,
  ...main,
  worker: { buildRoundTripMs: buildRoundTrip, workerBuildMs: ready.built, direct: s(direct), roundTrip: s(rt), meanResultBytes: Math.round(resultBytes / input.queries.length) },
}, null, 1));
