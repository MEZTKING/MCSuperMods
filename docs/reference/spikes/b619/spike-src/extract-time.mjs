// B619 spike (throwaway), 3S4: extraction time of the batch 3 folders from the client jar with fflate's filter
// (as packages/interop's extractPreviewAssets does), on top of today's patterns. Nothing is written.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [fflateDir, jarPath, listFile, version] = process.argv.slice(2);
const { unzipSync } = require(fflateDir);
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'))[version];
const today = [/^assets\/minecraft\/(?:models|blockstates|items)\/.+\.json$/, /^assets\/minecraft\/textures\/(?:block|item)\/.+\.png(\.mcmeta)?$/, /^assets\/minecraft\/lang\/en_us\.json$/];
const added = [
  ...Object.keys(list.textures).map((t) => new RegExp(`^assets/minecraft/textures/${t.replace(/[/]/g, '\\/')}.*\\.png(\\.mcmeta)?$`)),
  ...Object.keys(list.assetFiles).map((t) => new RegExp(`^assets/minecraft/${t}/.+\\.(json|vsh|fsh|glsl)$`)),
  ...Object.keys(list.data).map((t) => new RegExp(`^data/minecraft/${t}/.+\\.json$`)),
];
const jar = fs.readFileSync(jarPath);
const run = (patterns) => {
  const t = performance.now();
  const files = unzipSync(jar, { filter: (f) => patterns.some((p) => p.test(f.name)) });
  return { ms: performance.now() - t, files: Object.keys(files).length, bytes: Object.values(files).reduce((a, b) => a + b.length, 0) };
};
const med = (f) => { const r = [f(), f(), f(), f(), f()]; r.sort((a, b) => a.ms - b.ms); return r[2]; };
const a = med(() => run(today));
const b = med(() => run([...today, ...added]));
console.log(JSON.stringify({ today: { ...a, ms: +a.ms.toFixed(0) }, withBatch3: { ...b, ms: +b.ms.toFixed(0) } }));
