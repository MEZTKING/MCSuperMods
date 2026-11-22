// WS2-WS4, WS14 speeds in Node (median and worst of five).
import { vanillaFiles, fillRegistries, makeWorld, buildChunk, ds } from './engine.mjs';
import { loadDataDir } from './files.mjs';
const version = process.argv[2] ?? '26.3';
const B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574';
const files = vanillaFiles(version); fillRegistries(files);
const pack = loadDataDir(`${B}/pack/${version}`);
const runs = (n, f) => { const t = []; let r; for (let i = 0; i < n; i++) { const a = performance.now(); r = f(i); t.push(performance.now() - a); } t.sort((a, b) => a - b); return { median: +t[Math.floor(n / 2)].toFixed(1), worst: +t[n - 1].toFixed(1) }; };
const out = { version };
const mk = (src, seed = 0n) => makeWorld(files, { generator: { type: 'minecraft:noise', settings: 'minecraft:overworld', biome_source: src } }, seed);
// a big list of MSM's own points (stand-in for a full overworld list)
function bigList(n) { let s = 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1; const P = ['temperature', 'humidity', 'continentalness', 'erosion', 'depth', 'weirdness']; return { type: 'minecraft:multi_noise', biomes: Array.from({ length: n }, (_, i) => ({ biome: `minecraft:b${i % 50}`, parameters: Object.fromEntries([...P.map((p) => { const a = r(), b = r(); return [p, [Math.min(a, b), Math.max(a, b)]]; }), ['offset', 0]]) })) }; }
const sources = {
  fixed: { type: 'minecraft:fixed', biome: 'minecraft:plains' },
  mix24: pack['dimension']['b574:clim_mix'].generator.biome_source,
  list2000: bigList(2000),
  list8000: bigList(8000),
};
out.biomeMap = {};
for (const [name, src] of Object.entries(sources)) {
  const w = mk(src);
  const map = (n, step) => runs(5, (i) => { const o = 1000 * (i + 1); for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) w.gen.computeBiome(w.rs, ((o + x * step) >> 2), 16, ((o + z * step) >> 2)); });
  out.biomeMap[name] = { coarse64: map(64, 16), full256: map(256, 4) };
  console.error('biome', name, JSON.stringify(out.biomeMap[name]));
}
{
  const w = mk(sources.fixed);
  const hm = (n, step) => runs(5, (i) => { const o = 3000 * (i + 1); for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) w.gen.getBaseHeight(o + x * step, o + z * step, 'OCEAN_FLOOR_WG', w.rs); });
  const prelim = (n, step) => runs(5, (i) => { const o = 3000 * (i + 1); for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) w.rs.router.chunkSurfaceLevel.compute(ds.DensityFunction.context(o + x * step, 0, o + z * step)); });
  out.heights = { baseHeight16: hm(16, 16), baseHeight64: hm(64, 16), prelim64: prelim(64, 16), prelim256: prelim(256, 4) };
  // error of the preliminary surface against the true base height
  const errs = []; for (let i = 0; i < 400; i++) { const x = 5000 + (i % 20) * 37, z = 5000 + Math.floor(i / 20) * 41; const h = w.gen.getBaseHeight(x, z, 'OCEAN_FLOOR_WG', w.rs); const p = w.rs.router.chunkSurfaceLevel.compute(ds.DensityFunction.context(x, 0, z)); errs.push(Math.abs(Math.floor(p) - h)); }
  errs.sort((a, b) => a - b); out.heights.prelimErr = { median: errs[200], p90: errs[360], max: errs[399] };
  // side cut 256 wide, full height: final density + aquifer per block
  out.sideCut256 = runs(5, (i) => { const o = 7000 + i * 300; for (let x = 0; x < 256; x++) { const fill = new Array(384); w.gen.iterateNoiseColumn(w.rs, o + x, 0, fill, undefined); } });
  out.sideCut256coarse = runs(5, (i) => { const o = 7000 + i * 300; for (let x = 0; x < 256; x += 4) { const fill = new Array(384); w.gen.iterateNoiseColumn(w.rs, o + x, 0, fill, undefined); } });
  console.error('heights', JSON.stringify(out.heights), 'side', JSON.stringify(out.sideCut256), JSON.stringify(out.sideCut256coarse));
}
{
  const w = mk(sources.mix24);
  const biomeAt = (x, y, z) => w.gen.computeBiome(w.rs, x >> 2, y >> 2, z >> 2);
  const area = (n, surface) => runs(5, (i) => { for (let a = 0; a < n; a++) buildChunk(w, 200 + i * 10 + (a % Math.sqrt(n)), 200 + Math.floor(a / Math.sqrt(n)), biomeAt, { surface }); });
  const m0 = process.memoryUsage().heapUsed;
  out.terrain = { chunks9_fill: area(9, false), chunks9: area(9, true), chunks16: area(16, true) };
  out.terrain.heapMB = +((process.memoryUsage().heapUsed - m0) / 1e6).toFixed(0);
  console.error('terrain', JSON.stringify(out.terrain));
}
{
  // WS14: an edit to a noise settings field -> new coarse map
  const t = {};
  t.parse = runs(5, () => { const j = JSON.parse(JSON.stringify(files['worldgen/noise_settings']['minecraft:overworld'])); j.sea_level = 50; return ds.NoiseGeneratorSettings.fromJson(j); });
  const settings = ds.NoiseGeneratorSettings.fromJson(files['worldgen/noise_settings']['minecraft:overworld']);
  t.randomState = runs(5, (i) => new ds.RandomState(settings, BigInt(i)));
  t.refill = runs(5, () => fillRegistries(files));
  const w = mk(sources.mix24);
  t.coarseBiome64 = runs(5, (i) => { for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.gen.computeBiome(w.rs, (x * 4 + i * 999), 16, z * 4); });
  t.coarseHeightPrelim64 = runs(5, (i) => { for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.rs.router.chunkSurfaceLevel.compute(ds.DensityFunction.context(x * 16 + i * 999, 0, z * 16)); });
  out.edit = t; console.error('edit', JSON.stringify(t));
}
console.log(JSON.stringify(out));
