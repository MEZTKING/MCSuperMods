import { loadDataDir, V } from './files.mjs';
const strip = (s) => String(s).replace(/^minecraft:/, '');
const out = {};
for (const v of ['26.3', '26.4-snapshot-7']) {
  const f = loadDataDir(`${V}/${v}`);
  const placed = f['worldgen/placed_feature'], conf = f['worldgen/feature'];
  const featType = {}, nestedType = {}, modType = {}, stepCount = [];
  const usedPlaced = new Map(); // id -> biomes count
  const resolveConf = (c) => (typeof c === 'string' ? conf[c] : c);
  const resolvePlaced = (p) => (typeof p === 'string' ? placed[p] : p);
  function nested(c, seen) {
    const FK = new Set(['feature', 'default', 'features', 'feature_true', 'feature_false', 'vegetation_feature', 'placed_feature']);
    const visitConf = (cf) => { if (!cf || typeof cf !== 'object' || seen.has(cf)) return; seen.add(cf); const t = strip(cf.type); nestedType[t] = (nestedType[t] ?? 0) + 1; walk(cf, false); };
    const visitPlaced = (pf) => { if (!pf) return; for (const m of pf.placement ?? []) modType[strip(m.type)] = (modType[strip(m.type)] ?? 0) + 1; visitConf(resolveConf(pf.feature)); };
    const ref = (o) => { if (typeof o === 'string') { if (placed[o]) visitPlaced(placed[o]); else if (conf[o]) visitConf(conf[o]); } else if (o && typeof o === 'object') { if (Array.isArray(o)) o.forEach(ref); else if (Array.isArray(o.placement) && 'feature' in o) visitPlaced(o); else if (o.type) visitConf(o); else walk(o, true); } };
    const walk = (o) => { for (const [k, x] of Object.entries(o)) { if (k === 'type') continue; if (FK.has(k)) ref(x); else if (x && typeof x === 'object') { if (Array.isArray(x)) x.forEach((y) => y && typeof y === 'object' && walk(y)); else walk(x); } } };
    walk(c);
  }
  const biomeFeat = {};
  for (const [bid, b] of Object.entries(f['worldgen/biome'])) {
    (b.features ?? []).forEach((step, i) => { stepCount[i] = (stepCount[i] ?? 0) + step.length; for (const p of step) {
      const key = typeof p === 'string' ? p : 'inline'; usedPlaced.set(key, (usedPlaced.get(key) ?? 0) + 1);
      const pf = resolvePlaced(p); if (!pf) continue; const cf = resolveConf(pf.feature); if (!cf) continue;
      const t = strip(cf.type); (biomeFeat[t] ??= new Set()).add(bid);
      for (const m of pf.placement ?? []) modType[strip(m.type)] = (modType[strip(m.type)] ?? 0) + 1;
      nested(cf, new Set());
    } });
  }
  const byBiomes = Object.fromEntries(Object.entries(biomeFeat).map(([t, s]) => [t, s.size]).sort((a, b) => b[1] - a[1]));
  for (const [id, pf] of Object.entries(placed)) { const cf = resolveConf(pf.feature); if (cf) { const t = strip(cf.type); featType[t] = (featType[t] ?? 0) + 1; } }
  out[v] = { biomes: Object.keys(f['worldgen/biome']).length, placedFiles: Object.keys(placed).length, configuredFiles: Object.keys(conf).length, placedUsedByBiomes: usedPlaced.size, stepEntries: stepCount, topLevelTypeByBiomeCount: byBiomes, topLevelTypeByPlacedFiles: Object.fromEntries(Object.entries(featType).sort((a, b) => b[1] - a[1])), nestedTypes: Object.fromEntries(Object.entries(nestedType).sort((a, b) => b[1] - a[1])), modifierTypes: Object.fromEntries(Object.entries(modType).sort((a, b) => b[1] - a[1])) };
}
console.log(JSON.stringify(out, null, 1));
