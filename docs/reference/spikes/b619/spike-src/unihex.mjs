// B619 spike (throwaway), 3S7: what drawing unihex fonts costs. unifont.zip is read from the asset store at run time
// (it is not in the client jar), inflated with fflate (the app's own zip library) and every glyph line parsed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [fflateDir, store, indexName] = process.argv.slice(2);
const { unzipSync } = require(fflateDir);
const idx = JSON.parse(fs.readFileSync(path.join(store, 'indexes', indexName), 'utf8')).objects;
const out = {};
for (const key of ['minecraft/font/unifont.zip', 'minecraft/font/unifont_jp.zip', 'minecraft/font/unifont_pua.zip']) {
  const o = idx[key];
  let t = performance.now();
  const zip = fs.readFileSync(path.join(store, 'objects', o.hash.slice(0, 2), o.hash));
  const files = unzipSync(zip);
  const inflateMs = performance.now() - t;
  t = performance.now();
  let glyphs = 0, wide = 0, bytes = 0;
  const widths = {};
  const map = new Map();
  for (const [name, data] of Object.entries(files)) {
    bytes += data.length;
    if (!name.endsWith('.hex')) continue;
    const text = new TextDecoder().decode(data);
    for (const line of text.split('\n')) {
      const c = line.indexOf(':');
      if (c < 0) continue;
      const cp = parseInt(line.slice(0, c), 16);
      const hex = line.slice(c + 1).trim();
      const w = (hex.length * 4) / 16; // 16 rows; width 8, 16, 24 or 32
      widths[w] = (widths[w] ?? 0) + 1;
      glyphs++;
      if (w > 8) wide++;
      map.set(cp, hex);
    }
  }
  const parseMs = performance.now() - t;
  out[key.split('/').pop()] = { zipBytes: zip.length, inflatedBytes: bytes, entries: Object.keys(files).length, glyphs, wide,
    widths, inflateMs: +inflateMs.toFixed(0), parseMs: +parseMs.toFixed(0), mapEntries: map.size };
}
console.log(JSON.stringify(out, null, 1));
