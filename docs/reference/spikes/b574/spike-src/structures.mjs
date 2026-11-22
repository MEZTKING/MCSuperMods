// WS16: deepslate's structure placement against the start chunks a real world references.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { vanillaFiles, ds } from './engine.mjs';
const [version, dumpPath, seedArg] = process.argv.slice(2);
const seed = BigInt(seedArg);
const files = vanillaFiles(version);
const { StructureSet } = ds;
for (const id of StructureSet.REGISTRY.keys()) StructureSet.REGISTRY.delete(id);
const sets = {};
for (const [id, j] of Object.entries(files['worldgen/structure_set'])) { StructureSet.REGISTRY.register(ds.Identifier.parse(id), () => StructureSet.fromJson(j)); }
const setOf = {};
for (const [id, j] of Object.entries(files['worldgen/structure_set'])) {
  const entries = j.structures ?? (j.structure ? [{ structure: j.structure }] : []);
  for (const e of entries) setOf[e.structure] = id;
  sets[id] = { json: j, set: StructureSet.REGISTRY.get(ds.Identifier.parse(id)) };
}
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(dumpPath)));
const out = { version, seed: seedArg, checked: 0, potential: 0, chosen: 0, byType: {}, misses: [] };
const seen = new Set();
for (const [k, starts] of Object.entries(dump)) {
  if (!k.startsWith('starts:')) continue;
  for (const [x, z, sid] of starts) {
    const key = `${k} ${x} ${z} ${sid}`; if (seen.has(key)) continue; seen.add(key);
    const setId = setOf[sid]; if (!setId) { out.misses.push({ sid, why: 'no set' }); continue; }
    const { json, set } = sets[setId];
    const type = String(json.placement.type).replace('minecraft:', '');
    const bt = (out.byType[type] ??= { n: 0, potential: 0, isStructureChunk: 0 }); bt.n++; out.checked++;
    if (type === 'random_spread') {
      const pot = set.placement.getPotentialStructureChunks(seed, x, z, x, z);
      const hit = pot.some((p) => p[0] === x && p[1] === z);
      if (hit) { bt.potential++; out.potential++; }
      let isc = false; try { isc = set.placement.isStructureChunk(seed, x, z); } catch (e) { isc = 'error ' + e.message; }
      if (isc === true) { bt.isStructureChunk++; out.chosen++; }
      if (!hit || isc !== true) out.misses.push({ sid, set: setId, x, z, hit, isc });
    }
  }
}
console.log(JSON.stringify(out));
