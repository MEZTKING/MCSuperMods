// B600 spike (throwaway): MSM's spike evaluator against the game's 10,000 rolls per fixture case (server-<mc>.json).
// usage: node compare.mjs <gametest resources dir> <vanilla data dir of the jar, scratch only> <server json> <out json>
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Evaluator, key, rng } from './loot-eval.mjs';

const [res, van, obsFile, outFile] = process.argv.slice(2);
const obs = JSON.parse(readFileSync(obsFile, 'utf8'));
function walk(dir, base, out = {}) {
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, `${base}${n}/`, out);
    else if (n.endsWith('.json')) out[base + n.slice(0, -5)] = JSON.parse(readFileSync(p, 'utf8'));
  }
  return out;
}
const ids = (ns, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${ns}:${k}`, v]));
const data = {
  tables: { ...ids('msm_b600', walk(join(res, 'data/msm_b600/loot_table'), '')), ...ids('minecraft', walk(join(res, 'data/minecraft/loot_table'), '')) },
  predicates: { ...ids('minecraft', walk(join(van, 'data/minecraft/predicate'), '')), ...ids('msm_b600', walk(join(res, 'data/msm_b600/predicate'), '')) },
  itemTags: { ...ids('minecraft', walk(join(van, 'data/minecraft/tags/item'), '')), ...ids('msm_b600', walk(join(res, 'data/msm_b600/tags/item'), '')) },
  enchantments: { ...ids('minecraft', walk(join(van, 'data/minecraft/enchantment'), '')), ...ids('msm_b600', walk(join(res, 'data/msm_b600/enchantment'), '')) },
  enchantmentTags: ids('minecraft', walk(join(van, 'data/minecraft/tags/enchantment'), '')),
};
// project tag files merged over vanilla's (replace false)
for (const [k, v] of Object.entries(ids('minecraft', walk(join(res, 'data/minecraft/tags/enchantment'), '')))) data.enchantmentTags[k] = { values: [...(data.enchantmentTags[k]?.values ?? []), ...v.values] };
const ev = new Evaluator(data);
const MAX_DAMAGE = { 'minecraft:diamond_sword': 1561 };
const supports = (eid, item) => {
  const e = data.enchantments[eid];
  const p = e.primary_items ?? e.supported_items;
  const l = (Array.isArray(p) ? p : [p]).flatMap((x) => (x.startsWith('#') ? ev.resolveTag(data.itemTags, x.slice(1)) : [x]));
  return l.includes(item);
};

function simulate(table, ctxBase, n, seed) {
  const r = rng(seed);
  const hist = {};
  for (let i = 0; i < n; i++) {
    const ctx = { ...ctxBase, r, enchantability: { 'minecraft:book': 1, 'minecraft:diamond_sword': 10 }, supports };
    const got = {};
    for (const s of ev.roll(table, ctx)) { const k = key(s, MAX_DAMAGE[s.id]); got[k] = (got[k] ?? 0) + s.count; }
    for (const [k, c] of Object.entries(got)) { hist[k] ??= {}; hist[k][c] = (hist[k][c] ?? 0) + 1; }
  }
  for (const h of Object.values(hist)) { const some = Object.values(h).reduce((a, b) => a + b, 0); if (some < n) h[0] = (h[0] ?? 0) + n - some; }
  return { n, hist };
}
function compare(o, m) {
  let maxCell = 0, maxAny = 0, worst = '';
  const keys = new Set([...Object.keys(o.hist), ...Object.keys(m.hist)]);
  for (const k of keys) {
    const ho = o.hist[k] ?? { 0: o.n }, hm = m.hist[k] ?? { 0: m.n };
    for (const c of new Set([...Object.keys(ho), ...Object.keys(hm)])) {
      const d = Math.abs((ho[c] ?? 0) / o.n - (hm[c] ?? 0) / m.n) * 100;
      if (d > maxCell) { maxCell = d; worst = `${k} x${c}`; }
    }
    const anyO = 1 - (ho[0] ?? 0) / o.n, anyM = 1 - (hm[0] ?? 0) / m.n;
    maxAny = Math.max(maxAny, Math.abs(anyO - anyM) * 100);
  }
  // Marginals per part of a key (an enchantment with its level, or the item): what a view of the odds would list.
  const marg = (h, n) => { const out = {}; for (const [k, hh] of Object.entries(h)) { const some = n - (hh[0] ?? 0); for (const part of k.split('|').flatMap((p) => p.split(','))) out[part] = (out[part] ?? 0) + some / n; } return out; };
  const mo = marg(o.hist, o.n), mm = marg(m.hist, m.n);
  let maxMarg = 0, worstMarg = '';
  for (const p of new Set([...Object.keys(mo), ...Object.keys(mm)])) { const d = Math.abs((mo[p] ?? 0) - (mm[p] ?? 0)) * 100; if (d > maxMarg) { maxMarg = d; worstMarg = p; } }
  return { keys: keys.size, maxCellPp: +maxCell.toFixed(2), maxAnyPp: +maxAny.toFixed(2), maxMarginalPp: +maxMarg.toFixed(2), worst, worstMarg };
}

const cases = [];
for (const k of Object.keys(obs)) {
  let m;
  if ((m = /^loot\.(.+?)(\.preparsed|\.player2|\.console)?$/.exec(k))) cases.push([k, `msm_b600:${m[1]}`, {}]);
  else if ((m = /^mine\.(.+)\.(hand|pick|fortune(\d)|silk)$/.exec(k))) {
    const ench = m[3] ? { 'minecraft:fortune': +m[3] } : m[2] === 'silk' ? { 'minecraft:silk_touch': 1 } : {};
    cases.push([k, `minecraft:blocks/${m[1]}`, { tool: { enchantments: ench } }]);
  } else if ((m = /^kill\.(.+)\.(player\.looting(\d)|console)$/.exec(k))) {
    cases.push([k, `msm_b600:${m[1]}`, m[3] !== undefined ? { killerIsPlayer: true, attacker: { enchantments: { 'minecraft:looting': +m[3] } } } : {}]);
  } else if ((m = /^explode\.(.+)\.(block|tnt)\.(\d)$/.exec(k))) {
    cases.push([k, `minecraft:blocks/${m[1]}`, m[2] === 'block' ? { explosionRadius: +m[3] } : {}, true]);
  }
}
const out = {};
let seed = 1;
for (const [k, tid, ctx, applesOnly] of cases) {
  const t0 = performance.now();
  const sim = simulate(data.tables[tid], ctx, 100_000, seed++);
  let o = obs[k];
  if (applesOnly) o = { n: o.n, hist: { 'minecraft:apple': o.hist } };
  out[k] = { ...compare(o, sim), simMs: Math.round(performance.now() - t0) };
}
out.unknownTypes = Object.fromEntries(ev.unknown);
writeFileSync(outFile, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(42), JSON.stringify(v));
