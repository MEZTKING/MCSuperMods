// WS11: the worldgen-related jar entries, their size, and the time to extract them with fflate (as the app does).
import fs from 'node:fs';
import { unzipSync } from '/home/user/MCSuperMods/node_modules/.pnpm/node_modules/fflate/esm/index.mjs';
const RE = /^data\/minecraft\/(worldgen\/[^/]+|dimension|dimension_type|tags\/worldgen\/[^/]+)\/.+\.json$/;
const out = {};
for (const v of ['26.3', '26.4-snapshot-7']) {
  const jar = fs.readFileSync(`/root/.gradle/caches/fabric-loom/${v}/minecraft-client.jar`);
  const times = [];
  let files;
  for (let i = 0; i < 5; i++) { const t = performance.now(); files = unzipSync(jar, { filter: (f) => RE.test(f.name) }); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  const byFolder = {};
  let bytes = 0, max = 0;
  for (const [name, data] of Object.entries(files)) {
    const folder = name.match(RE)[1];
    const f = (byFolder[folder] ??= { files: 0, bytes: 0 }); f.files++; f.bytes += data.length; bytes += data.length; max = Math.max(max, data.length);
  }
  const terrainOnly = ['worldgen/noise', 'worldgen/density_function', 'worldgen/noise_settings', 'worldgen/material_rule', 'worldgen/material_condition', 'worldgen/biome', 'worldgen/world_preset', 'worldgen/multi_noise_biome_source_parameter_list', 'worldgen/flat_level_generator_preset', 'dimension_type'];
  const t = terrainOnly.reduce((a, k) => ({ files: a.files + (byFolder[k]?.files ?? 0), bytes: a.bytes + (byFolder[k]?.bytes ?? 0) }), { files: 0, bytes: 0 });
  out[v] = { files: Object.keys(files).length, bytes, largest: max, extractMs: { median: +times[2].toFixed(0), worst: +times[4].toFixed(0) }, terrainSubset: t, byFolder: Object.fromEntries(Object.entries(byFolder).sort()) };
}
console.log(JSON.stringify(out, null, 1));
