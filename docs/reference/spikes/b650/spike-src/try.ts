// B650 spike: print the top hits of queries given on the command line (or stdin lines).
import { readFileSync } from 'node:fs';
import { buildIndex, type Entry } from './engine.ts';
import { registries, vanillaEntries, vanillaWords } from './layers.ts';
import { BEHAVIOURS, COLOURS, WORD_GROUPS } from './vocab.ts';

const REPO = process.env.REPO as string;
const OUT = process.env.B650_OUT as string;
const target = (process.env.TARGET ?? 'mc-26.3') as 'mc-26.3' | 'mc-26.4';
const regs = registries(REPO, target);
const corpus = JSON.parse(readFileSync(`${OUT}/corpus-${target}.json`, 'utf8')) as Entry[];
const project = process.env.PROJECT ? (JSON.parse(readFileSync(`${OUT}/project-sample-mod.json`, 'utf8')) as Entry[]) : [];
const index = buildIndex([...corpus, ...vanillaEntries(regs), ...project], { groups: WORD_GROUPS, colours: COLOURS, behaviours: BEHAVIOURS }, vanillaWords(regs));
const queries = process.argv.slice(2);
for (const q of queries) {
  const a = index.search(q, 'easy', 5);
  console.log(`\n> ${q}   ${JSON.stringify(a.understood)}`);
  for (const h of a.hits) console.log(`  ${h.score.toFixed(2)} ${h.entry.id} "${h.entry.title}" ${h.answers ? JSON.stringify(h.answers) : ''} ${h.behaviour ? `[${h.behaviour.id}]` : ''}`);
}
