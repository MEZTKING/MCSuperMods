// B650 spike: runs the draft query set against the spike matcher on one target, with or without
// the jar's names, and prints first / top-three rates per class (SQ5). Output: JSON on stdout.
import { readFileSync } from 'node:fs';
import { buildIndex, DEFAULT_OPTIONS, type Entry, type Options } from './engine.ts';
import { jarNames, registries, vanillaEntries, vanillaWords } from './layers.ts';
import { BEHAVIOURS, COLOURS, FLOW_KEYWORDS, WORD_GROUPS } from './vocab.ts';

const REPO = process.env.REPO as string;
const OUT = process.env.B650_OUT as string;
const target = (process.env.TARGET ?? 'mc-26.3') as 'mc-26.3' | 'mc-26.4';
const jar = process.env.JAR; // the Loom cache's client jar, read in memory only
const keywords = process.env.KEYWORDS !== '0';
const options: Options = { ...DEFAULT_OPTIONS, v1: process.env.V1 === '1', soundAlike: process.env.SOUND === '1', ...(process.env.TYPO ? { typo: process.env.TYPO as Options['typo'] } : {}) };

interface Query { q: string; class: string; mode: 'very-easy' | 'easy' | 'advanced'; project?: string; expect: string | null; top3?: string[]; answers?: Record<string, unknown>; behaviour?: string }

const regs = registries(REPO, target);
const names = jar ? jarNames(jar).names : undefined;
const corpus = (JSON.parse(readFileSync(`${OUT}/corpus-${target}.json`, 'utf8')) as Entry[]).map((e) =>
  keywords && FLOW_KEYWORDS[e.id] !== undefined ? { ...e, words: [...(e.words ?? []), ...(FLOW_KEYWORDS[e.id] as string[])] } : e,
);
const project = JSON.parse(readFileSync(`${OUT}/project-sample-mod.json`, 'utf8')) as Entry[];
const vanilla = vanillaEntries(regs, names);
const vocab = { groups: WORD_GROUPS, colours: COLOURS, behaviours: BEHAVIOURS, mobWords: new Set((regs.entity_type ?? []).filter((p) => !p.includes('_'))) };
const protect = vanillaWords(regs);
const empty = buildIndex([...corpus, ...vanilla], vocab, protect, options);
const withMod = buildIndex([...corpus, ...vanilla, ...project], vocab, protect, options);
const queries = (JSON.parse(readFileSync(`${REPO}/docs/reference/spikes/b650/queries-draft.json`, 'utf8')) as { queries: Query[] }).queries;

const byClass: Record<string, { n: number; first: number; top3: number; answers: number; answersN: number }> = {};
const misses: unknown[] = [];
for (const query of queries) {
  const index = query.project === 'sample-mod' ? withMod : empty;
  const a = index.search(query.q, query.mode, 10);
  const c = (byClass[query.class] ??= { n: 0, first: 0, top3: 0, answers: 0, answersN: 0 });
  c.n++;
  const ids = a.hits.map((h) => h.entry.id);
  let first: boolean;
  let top3: boolean;
  if (query.expect === null) {
    first = top3 = !a.confident;
  } else {
    first = ids[0] === query.expect;
    top3 = ids.slice(0, 3).includes(query.expect);
  }
  if (first) c.first++;
  if (top3) c.top3++;
  const hit = a.hits.find((h) => h.entry.id === query.expect);
  let answersOk: boolean | undefined;
  if (query.answers !== undefined) {
    c.answersN++;
    answersOk = Object.entries(query.answers).every(([k, v]) => JSON.stringify(hit?.answers?.[k]) === JSON.stringify(v));
    if (query.behaviour !== undefined) answersOk = answersOk && hit?.behaviour?.id === query.behaviour;
    if (answersOk) c.answers++;
  } else if (query.behaviour !== undefined) {
    c.answersN++;
    answersOk = hit?.behaviour?.id === query.behaviour;
    if (answersOk) c.answers++;
  }
  if (!first || answersOk === false) misses.push({ q: query.q, expect: query.expect, got: ids.slice(0, 3), answers: hit?.answers, behaviour: hit?.behaviour?.id, understood: a.understood, confident: a.confident });
}
const total = Object.values(byClass).reduce((t, c) => ({ n: t.n + c.n, first: t.first + c.first, top3: t.top3 + c.top3, answers: t.answers + c.answers, answersN: t.answersN + c.answersN }), { n: 0, first: 0, top3: 0, answers: 0, answersN: 0 });
console.log(JSON.stringify({ target, jar: jar !== undefined, keywords, typo: options.typo, v1: options.v1, soundAlike: options.soundAlike, total, byClass, misses }, null, 1));
