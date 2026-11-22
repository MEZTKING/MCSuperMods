// WS5-WS8: deepslate against a real world's dump. Usage: node parity.mjs <version> <dump.json.gz> <seed> [maxChunks]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { vanillaFiles, fillRegistries, makeWorld, column, biomeOf, ds } from './engine.mjs';
import { loadDataDir } from './files.mjs';
if (process.env.FAST) await import('./fastinterp.mjs');
const [version, dumpPath, seedArg, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg ?? 24);
const seed = BigInt(seedArg);
const B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574';
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(dumpPath)));
const files = vanillaFiles(version);
const pack = loadDataDir(`${B}/pack/${version}`);
fillRegistries(files);
const presets = files['worldgen/world_preset']['minecraft:normal'].dimensions;
const FEATURE = /log|_wood|leaves|sapling|short_grass|tall_grass|fern|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|rose|peony|lilac|sunflower|mushroom|vine|bush|berr|cactus|sugar_cane|bamboo|pumpkin|melon|kelp|seagrass|sea_pickle|coral|carpet|leaf_litter|^snow$|firefly|wildflower|cocoa|bee_nest|lichen|dripstone|amethyst|roots|spore|azalea|dripleaf|cave_vines|sculk|moss|cobweb|torch|spawner|chest|cobblestone|mossy|clay|eyeblossom|cactus_flower|grass$/;
const cls = (n) => {
  n = n.replace('minecraft:', '');
  if (n === 'air' || n === 'cave_air' || n === 'void_air') return 'A';
  if (n === 'water' || n.endsWith('~w') || n === 'bubble_column' || n === 'kelp' || n === 'kelp_plant' || n === 'seagrass' || n === 'tall_seagrass' || n === 'ice') return 'W';
  if (n === 'lava' || n === 'magma_block' && false) return 'L';
  return 'S';
};
const isFeature = (n) => FEATURE.test(n.replace('minecraft:', '').replace('~w', '')) && n !== 'grass_block' && !/^(minecraft:)?(dirt|coarse_dirt|rooted_dirt|podzol|mycelium|mud|moss_block)$/.test(n);
const out = { version, seed: seedArg, dims: {} };
for (const [dim, chunks] of Object.entries(dump)) {
  if (dim.startsWith('starts:')) continue;
  let dimJson, biomesKnown = true;
  if (dim.startsWith('b574:')) dimJson = pack['dimension'][dim];
  else dimJson = presets[dim];
  dimJson = JSON.parse(JSON.stringify(dimJson));
  if (dimJson.generator.biome_source.preset) { dimJson.generator.biome_source = { type: 'minecraft:fixed', biome: 'minecraft:plains' }; biomesKnown = false; }
  const t0 = performance.now();
  const world = makeWorld({ ...files, 'worldgen/noise_settings': files['worldgen/noise_settings'] }, dimJson, seed);
  const r = { biomesKnown, buildMs: Math.round(performance.now() - t0) };
  // observed biome map
  const obsBiome = new Map();
  for (const c of chunks) for (const [sy, cells] of Object.entries(c.biomes)) for (let i = 0; i < 64; i++) {
    const qx = c.cx * 4 + (i & 3), qz = c.cz * 4 + ((i >> 2) & 3), qy = Number(sy) * 4 + (i >> 4);
    obsBiome.set(`${qx},${qy},${qz}`, cells[i]);
  }
  if (biomesKnown) {
    let n = 0, ok = 0; const confusion = {}; const t1 = performance.now();
    const keys = [...obsBiome.keys()];
    const step = Math.max(1, Math.floor(keys.length / 6000));
    for (let k = 0; k < keys.length; k += step) {
      const [qx, qy, qz] = keys[k].split(',').map(Number);
      const want = obsBiome.get(keys[k]); const got = biomeOf(world, qx, qy, qz);
      n++; if (want === got) ok++; else { const key = `${want}->${got}`; confusion[key] = (confusion[key] ?? 0) + 1; }
    }
    r.biome = { cells: n, match: ok, rate: +(ok / n).toFixed(4), msPerCell: +((performance.now() - t1) / n).toFixed(3), topMismatches: Object.entries(confusion).sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }
  for (const status of ['minecraft:terrain', 'minecraft:full']) {
    const cs = chunks.filter((c) => c.status === status && c.cols);
    const pick = cs.filter((_, i) => i % Math.max(1, Math.floor(cs.length / MAX)) === 0).slice(0, MAX);
    const st = { columns: 0, exactProfile: 0, exactNoCarve: 0, k: { solidOnlyInGame: 0, solidOnlyInPreview: 0, fluidDiffers: 0 }, cells: 0, cellMatch: 0, heightErr: {}, top4: 0, top4n: 0, under: { obsAir_dsSolid: 0, obsSolid_dsAir: 0, water: 0, lava: 0, cells: 0 }, msPerColumn: 0, samples: [] };
    const t2 = performance.now();
    for (const c of pick) {
      const ymin = c.cols.ymin;
      for (const idx of [2, 6, 10, 14].flatMap((x) => [2, 6, 10, 14].map((z) => x + z * 16))) {
        const runs = c.cols.runs[idx]; if (!runs || !runs.length) continue;
        const obs = []; for (const [lab, n] of runs) for (let i = 0; i < n; i++) obs.push(lab);
        const bx = c.cx * 16 + (idx & 15), bz = c.cz * 16 + (idx >> 4);
        const biomeAt = biomesKnown ? (x, y, z) => world.gen.computeBiome(world.rs, x >> 2, y >> 2, z >> 2) : (x, y, z) => ds.Identifier.parse(obsBiome.get(`${x >> 2},${y >> 2},${z >> 2}`) ?? 'minecraft:plains');
        const dsCol = column(world, bx, bz, biomeAt);
        const minY = world.settings.noise.minY;
        st.columns++;
        let mism = 0, mismNC = 0; let topO = null, topD = null;
        for (let y = minY + dsCol.length - 1; y >= minY; y--) {
          const o = obs[y - ymin] ?? 'air'; const d = dsCol[y - minY];
          const oc = isFeature(o) ? (o.endsWith('~w') ? 'W' : (status === 'minecraft:full' && cls(o) === 'S' ? 'F' : cls(o))) : cls(o);
          const dc = cls(d);
          if (oc === 'F') continue; // a feature block: not counted
          st.cells++; if (oc === dc) st.cellMatch++; else { mism++; if (oc === 'S') { st.k.solidOnlyInGame++; mismNC++; } else if (dc === 'S') st.k.solidOnlyInPreview++; else { st.k.fluidDiffers++; mismNC++; } }
          if (topO === null && oc === 'S') topO = y;
          if (topD === null && dc === 'S') topD = y;
        }
        if (mism === 0) st.exactProfile++;
        if (mismNC === 0) st.exactNoCarve++;
        if (topO !== null && topD !== null) {
          const e = topD - topO; const b = Math.abs(e) >= 8 ? (e > 0 ? '>=8' : '<=-8') : String(e);
          st.heightErr[b] = (st.heightErr[b] ?? 0) + 1;
          if (e === 0) {
            const o4 = [], d4 = [];
            for (let y = topO; y > topO - 4; y--) { o4.push((obs[y - ymin] ?? 'air').replace('minecraft:', '').replace('~w', '')); d4.push(dsCol[y - minY].replace('minecraft:', '')); }
            st.top4n++; if (o4.join() === d4.join()) st.top4++; else if (st.samples.length < 6) st.samples.push({ x: bx, z: bz, obs: o4.join(' '), ds: d4.join(' '), biome: obsBiome.get(`${bx >> 2},${topO >> 2},${bz >> 2}`) });
          }
          // underground: 8 below the lower of both tops
          const lim = Math.min(topO, topD) - 8;
          for (let y = minY + 5; y < lim; y++) {
            const o = obs[y - ymin] ?? 'air'; const d = dsCol[y - minY];
            if (isFeature(o)) continue;
            const oc = cls(o), dc = cls(d); st.under.cells++;
            if (oc === 'A' && dc === 'S') st.under.obsAir_dsSolid++;
            else if (oc === 'S' && dc === 'A') st.under.obsSolid_dsAir++;
            else if ((oc === 'W') !== (dc === 'W')) st.under.water++;
            else if ((oc === 'L') !== (dc === 'L')) st.under.lava++;
          }
        }
      }
    }
    st.msPerColumn = +((performance.now() - t2) / Math.max(1, st.columns)).toFixed(1);
    st.cellRate = +(st.cellMatch / Math.max(1, st.cells)).toFixed(4);
    st.exactRate = +(st.exactProfile / Math.max(1, st.columns)).toFixed(4);
    st.exactNoCarveRate = +(st.exactNoCarve / Math.max(1, st.columns)).toFixed(4);
    st.top4Rate = +(st.top4 / Math.max(1, st.top4n)).toFixed(4);
    r[status.replace('minecraft:', '')] = st;
  }
  out.dims[dim] = r;
  console.error(dim, JSON.stringify({ b: r.biome?.rate, t: r.terrain?.exactRate, tnc: r.terrain?.exactNoCarveRate, k: r.terrain?.k, tc: r.terrain?.cellRate, f: r.full?.exactRate, fc: r.full?.cellRate, h: r.terrain?.heightErr, top4: r.terrain?.top4Rate, ms: r.terrain?.msPerColumn }));
}
out.fixes = (await import('./engine.mjs')).fixes;
console.log(JSON.stringify(out));
