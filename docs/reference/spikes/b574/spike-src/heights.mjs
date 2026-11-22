import { vanillaFiles, fillRegistries, makeWorld, ds } from './engine.mjs';
await import('./fastinterp.mjs');
const files = vanillaFiles(process.argv[2] ?? '26.3'); fillRegistries(files);
const w = makeWorld(files, { generator: { type: 'minecraft:noise', settings: 'minecraft:overworld', biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' } } }, 0n);
const fd = w.rs.router.finalDensity;
// top solid by density only (no aquifer), scanning down from the top in steps of the cell height, then refining
const top = (x, z) => { for (let y = 319; y >= -64; y -= 8) { if (fd.compute({ x, y, z }) > 0) { for (let yy = Math.min(319, y + 7); yy >= y; yy--) if (fd.compute({ x, y: yy, z }) > 0) return yy; } } return -64; };
const runs = (n, f) => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); f(i); t.push(performance.now() - a); } t.sort((a, b) => a - b); return { median: +t[Math.floor(n / 2)].toFixed(0), worst: +t[n - 1].toFixed(0) }; };
const r = {
  coarse64_step16: runs(5, (i) => { for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) top(i * 5000 + x * 16, z * 16); }),
  coarse64_step4: runs(3, (i) => { for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) top(i * 5000 + 40000 + x * 4, z * 4); }),
};
// check against the full column (aquifers ignored: solid only)
let same = 0; for (let i = 0; i < 200; i++) { const x = 9000 + i * 13, z = 300 + i * 7; const h = w.gen.getBaseHeight(x, z, 'OCEAN_FLOOR_WG', w.rs) - 1; if (h === top(x, z)) same++; }
r.agreesWithFullColumnPct = same / 2;
console.log(JSON.stringify(r));
