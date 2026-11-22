import { vanillaFiles, fillRegistries, makeWorld, column, ds, fixes } from './engine.mjs';
const out = {};
for (const v of ['26.3', '26.4-snapshot-7']) {
  const files = vanillaFiles(v); fillRegistries(files); out[v] = {};
  for (const id of Object.keys(files['worldgen/noise_settings'])) {
    const t = performance.now();
    try {
      const w = makeWorld(files, { generator: { type: 'minecraft:noise', settings: id, biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' } } }, 1n);
      const kinds = {};
      for (let i = 0; i < 8; i++) for (const s of column(w, i * 211, i * 97, () => ds.Identifier.parse('minecraft:plains'))) kinds[s.replace('minecraft:', '')] = (kinds[s.replace('minecraft:', '')] ?? 0) + 1;
      out[v][id] = { ok: true, ms: Math.round(performance.now() - t), blocks: Object.keys(kinds).length };
    } catch (e) { out[v][id] = { ok: false, error: e.message }; }
  }
  // every density function, noise, rule and condition file parses on its own
  let n = 0, bad = [];
  for (const [reg, parse] of [['worldgen/density_function', (j) => ds.DensityFunction.fromJson(j)], ['worldgen/noise', (j) => ds.NormalNoise.fromJson(j)], ['worldgen/material_rule', (j) => ds.MaterialRule.fromJson(j)], ['worldgen/material_condition', (j) => ds.MaterialCondition.fromJson(j)]])
    for (const [id, j] of Object.entries(files[reg])) { n++; try { parse(j); } catch (e) { bad.push(id + ': ' + e.message); } }
  out[v].filesParsed = n; out[v].parseErrors = bad;
}
out.fixes = fixes;
console.log(JSON.stringify(out, null, 1));
