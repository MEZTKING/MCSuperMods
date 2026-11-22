// B600 spike (throwaway), 2S6: speeds in a worker thread (Node 24 worker_threads; the app would use a Web Worker).
// usage: node speed.mjs <vanilla data dir (scratch only)> <out json>
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Evaluator, rng } from './loot-eval.mjs';
import { layout } from './tree-layout.mjs';

function walk(dir, base = '', out = {}) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, `${base}${n}/`, out);
    else if (n.endsWith('.json')) out[`minecraft:${base}${n.slice(0, -5)}`] = { text: readFileSync(p, 'utf8'), bytes: statSync(p).size };
  }
  return out;
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

if (isMainThread) {
  const [van, outFile] = process.argv.slice(2);
  const d = (f) => walk(join(van, 'data/minecraft', f));
  const files = { tables: d('loot_table'), predicates: d('predicate'), itemTags: d('tags/item'), blockTags: d('tags/block'), enchantments: d('enchantment'), enchantmentTags: d('tags/enchantment'), advancements: d('advancement') };
  const w = new Worker(new URL(import.meta.url), { workerData: files });
  w.on('message', (m) => { writeFileSync(outFile, JSON.stringify(m, null, 1)); console.log(JSON.stringify(m, null, 1)); });
} else {
  const f = workerData;
  const t0 = performance.now();
  const parse = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, JSON.parse(v.text)]));
  const data = { tables: parse(f.tables), predicates: parse(f.predicates), itemTags: parse(f.itemTags), enchantments: parse(f.enchantments), enchantmentTags: parse(f.enchantmentTags) };
  const blockTags = parse(f.blockTags);
  const advs = parse(f.advancements);
  const res = { parseAllMs: Math.round(performance.now() - t0) };
  // Loot: the five largest vanilla tables by bytes, 1,000 rolls each (median of 5 runs), with a player and Fortune III.
  const bySize = Object.entries(f.tables).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5).map(([k, v]) => [k, v.bytes]);
  const withEnchants = Object.keys(data.tables).filter((k) => f.tables[k].text.includes('enchant_with_levels')).slice(0, 3);
  res.loot = {};
  for (const [id] of [...bySize, ...withEnchants.map((k) => [k])]) {
    const ev = new Evaluator(data);
    const runs = [];
    for (let rep = 0; rep < 5; rep++) {
      const r = rng(rep + 1);
      const t = performance.now();
      for (let i = 0; i < 1000; i++) ev.roll(data.tables[id], { r, tool: { enchantments: { 'minecraft:fortune': 3 } }, killerIsPlayer: true, attacker: { enchantments: { 'minecraft:looting': 3 } }, enchantability: { 'minecraft:book': 1 }, supports: () => true });
      runs.push(performance.now() - t);
    }
    res.loot[id.replace('minecraft:', '')] = { bytes: f.tables[id].bytes, medianMs: +median(runs).toFixed(1), worstMs: +Math.max(...runs).toFixed(1), unknown: Object.fromEntries(ev.unknown) };
  }
  // Tags: resolve every item and block tag; report the largest and the time for all.
  const ev = new Evaluator(data);
  for (const [label, tags] of [['item', data.itemTags], ['block', blockTags]]) {
    const t = performance.now();
    let largest = ['', 0];
    for (const id of Object.keys(tags)) { const n = new Set(ev.resolveTag(tags, id.slice(10))).size; if (n > largest[1]) largest = [id, n]; }
    const all = performance.now() - t;
    const t2 = performance.now();
    for (let i = 0; i < 100; i++) ev.resolveTag(tags, largest[0].slice(10));
    res[`tags.${label}`] = { count: Object.keys(tags).length, allMs: +all.toFixed(1), largest: largest[0].replace('minecraft:', ''), members: largest[1], largestMs: +((performance.now() - t2) / 100).toFixed(3) };
  }
  // Advancements: the largest tab's tree (by node count) laid out, in MSM's id order.
  const kids = new Map();
  for (const [id, a] of Object.entries(advs)) if (a.parent) { if (!kids.has(a.parent)) kids.set(a.parent, []); kids.get(a.parent).push(id); }
  const shown = (id) => !!advs[id]?.display;
  const shownKids = (id) => (kids.get(id) ?? []).flatMap((k) => (shown(k) ? [k] : shownKids(k))).sort();
  let best = ['', 0, 0];
  for (const root of Object.keys(advs).filter((id) => !advs[id].parent && shown(id))) {
    const runs = [];
    let n = 0;
    for (let rep = 0; rep < 5; rep++) { const t = performance.now(); n = layout(root, shownKids).size; runs.push(performance.now() - t); }
    if (n > best[1]) best = [root, n, median(runs)];
  }
  res.advancementTree = { tab: best[0].replace('minecraft:', ''), nodes: best[1], layoutMs: +best[2].toFixed(2), filesInFolder: Object.keys(advs).length };
  parentPort.postMessage(res);
}
