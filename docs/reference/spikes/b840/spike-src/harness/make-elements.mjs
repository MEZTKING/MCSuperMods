// B840 S5: a 5,000-element project made by repeating examples/all-kinds (ids made unique).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2];
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.json')) files.push(p); } };
walk(join(root, 'content'));
const base = files.map((f) => ({ path: f.slice(root.length + 1), data: JSON.parse(readFileSync(f, 'utf8')) }));
const out = [];
for (let i = 0; out.length < 5000; i++) {
  const b = base[i % base.length];
  out.push({ id: `${b.path.replace(/\.json$/, '')}_${Math.floor(i / base.length)}`, element: b.data });
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(base.length, 'base elements;', out.length, 'elements;', JSON.stringify(out).length, 'bytes');
