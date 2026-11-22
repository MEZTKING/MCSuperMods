// B600 spike (throwaway), 2S11: the enchanting table's choices for the fixture enchantment msm_b600:spike on a
// diamond sword (enchantability 10) and the table's slot costs, against a model written from the cost fields.
import { readFileSync } from 'node:fs';
import { Evaluator, rng } from './loot-eval.mjs';
const obs = JSON.parse(readFileSync(process.argv[2], 'utf8')).enchanting;
const spike = { max_level: 5, weight: 10, min_cost: { base: 5, per_level_above_first: 8 }, max_cost: { base: 25, per_level_above_first: 8 } };
const ev = new Evaluator({ enchantments: { 'msm_b600:spike': spike }, enchantmentTags: {}, itemTags: {}, predicates: {}, tables: {} });
const N = 100000;
let worstSelect = 0, worstSelectAt = '';
for (let L = 1; L <= 40; L++) {
  const r = rng(L);
  const hist = {};
  for (let i = 0; i < N; i++) {
    const s = ev.enchantWithLevels({ id: 'minecraft:diamond_sword', count: 1 }, { levels: L }, { r, enchantability: { 'minecraft:diamond_sword': 10 }, supports: () => true });
    const k = s.ench.length ? s.ench.map((e) => e[1]).join('+') : 'none';
    hist[k] = (hist[k] ?? 0) + 1;
  }
  const o = obs[`select.L${String(L).padStart(2, '0')}`];
  for (const k of new Set([...Object.keys(o), ...Object.keys(hist)])) {
    const d = Math.abs((o[k] ?? 0) / 10000 - (hist[k] ?? 0) / N) * 100;
    if (d > worstSelect) { worstSelect = d; worstSelectAt = `L${L} ${k}`; }
  }
}
let worstCost = 0, worstCostAt = '';
for (const shelves of [0, 4, 8, 15, 30]) {
  for (let slot = 0; slot < 3; slot++) {
    const r = rng(100 + shelves * 3 + slot);
    const hist = {};
    for (let i = 0; i < N; i++) {
      const b = Math.min(shelves, 15);
      const base = r.int(8) + 1 + (b >> 1) + r.int(b + 1);
      const cost = slot === 0 ? Math.max(Math.floor(base / 3), 1) : slot === 1 ? Math.floor((base * 2) / 3) + 1 : Math.max(base, b * 2);
      hist[cost] = (hist[cost] ?? 0) + 1;
    }
    const o = obs[`cost.shelves${shelves}.slot${slot}`];
    for (const k of new Set([...Object.keys(o), ...Object.keys(hist)])) {
      const d = Math.abs((o[k] ?? 0) / 10000 - (hist[k] ?? 0) / N) * 100;
      if (d > worstCost) { worstCost = d; worstCostAt = `shelves ${shelves} slot ${slot} cost ${k}`; }
    }
  }
}
console.log(JSON.stringify({ selectWorstPp: +worstSelect.toFixed(2), selectWorstAt: worstSelectAt, costWorstPp: +worstCost.toFixed(2), costWorstAt: worstCostAt, available: Object.fromEntries(Object.entries(obs).filter(([k]) => k.startsWith('available'))) }, null, 1));
