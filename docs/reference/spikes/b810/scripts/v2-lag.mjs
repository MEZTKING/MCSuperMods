// B810 V2: lag of Fabric API and GeckoLib (Modrinth) behind Mojang's release time, per version.
// Usage: node v2-lag.mjs <work folder of v2-upstream.sh>  (prints TSV)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const m = read('manifest.json');
const rt = Object.fromEntries(m.versions.map((v) => [v.id, v.releaseTime]));
const fa = read('modrinth-fabric-api.json');
const gl = read('modrinth-geckolib.json');
const first = (list, w) =>
  list.filter((v) => v.game_versions.includes(w)).sort((a, b) => a.date_published.localeCompare(b.date_published))[0];
const hours = (a, b) => ((Date.parse(b) - Date.parse(a)) / 3.6e6).toFixed(1);
const ids = m.versions.filter((v) => /^26\./.test(v.id) && !/-(rc|pre)-\d+$/.test(v.id) || v.id === '26.4-pre-1').map((v) => v.id).reverse();
console.log(['version', 'mojang', 'fabric-api first', 'hours after', 'geckolib first', 'days after'].join('\t'));
for (const w of ids) {
  const f = first(fa, w);
  const g = first(gl, w);
  console.log([w, rt[w], f?.version_number ?? '-', f ? hours(rt[w], f.date_published) : '-', g?.version_number ?? '-', g ? (hours(rt[w], g.date_published) / 24).toFixed(1) : '-'].join('\t'));
}
