// 26.4: are biome mismatches a border jitter? Compare each observed cell with deepslate's biomes in a neighbourhood.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { vanillaFiles, fillRegistries, makeWorld } from './engine.mjs';
import { loadDataDir } from './files.mjs';
const [version, dumpPath, seedArg, dim] = process.argv.slice(2);
const B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574';
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(dumpPath)));
const files = vanillaFiles(version); fillRegistries(files);
const w = makeWorld(files, loadDataDir(`${B}/pack/${version}`).dimension[dim], BigInt(seedArg));
const memo = new Map(); const bio = (x, y, z) => { const k = `${x},${y},${z}`; let b = memo.get(k); if (!b) { b = w.gen.computeBiome(w.rs, x, y, z).toString(); memo.set(k, b); } return b; };
let n = 0, ok = 0, r1 = 0, r1h = 0, r2 = 0, dy = {};
for (const c of dump[dim]) for (const [sy, cells] of Object.entries(c.biomes)) for (let i = 0; i < 64; i += 3) {
  const qx = c.cx * 4 + (i & 3), qz = c.cz * 4 + ((i >> 2) & 3), qy = Number(sy) * 4 + (i >> 4);
  if (qy < 8 || qy > 30) continue;
  n++; const want = cells[i];
  if (bio(qx, qy, qz) === want) { ok++; continue; }
  let f1 = false, f1h = false, f2 = false;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let d = -2; d <= 2; d++) {
    if (bio(qx + a, qy + d, qz + b) !== want) continue;
    const m = Math.max(Math.abs(a), Math.abs(b), Math.abs(d));
    if (m <= 1) f1 = true; if (m <= 1 && d === 0) f1h = true; f2 = true;
  }
  if (f1) r1++; if (f1h) r1h++; if (f2) r2++;
}
console.log(dim, JSON.stringify({ cells: n, exact: +(ok / n).toFixed(3), within1: +((ok + r1) / n).toFixed(3), within1horizontal: +((ok + r1h) / n).toFixed(3), within2: +((ok + r2) / n).toFixed(3) }));
