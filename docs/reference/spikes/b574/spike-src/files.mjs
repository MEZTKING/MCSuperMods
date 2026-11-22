// Load a data folder (data/<ns>/worldgen/<reg>/<path>.json etc.) into { regKey: { id: json } }.
import fs from 'node:fs';
import path from 'node:path';
export function loadDataDir(root) {
  const out = {};
  const dataDir = path.join(root, 'data');
  for (const ns of fs.readdirSync(dataDir)) {
    const nsDir = path.join(dataDir, ns);
    walk(nsDir, '', (rel, file) => {
      // rel like worldgen/noise/foo.json or dimension_type/x.json or tags/worldgen/biome/x.json
      const parts = rel.split('/');
      let regLen = 1;
      if (parts[0] === 'worldgen') regLen = 2;
      else if (parts[0] === 'tags') regLen = parts[1] === 'worldgen' ? 3 : 2;
      const reg = parts.slice(0, regLen).join('/');
      const id = `${ns}:${parts.slice(regLen).join('/').replace(/\.json$/, '')}`;
      (out[reg] ??= {})[id] = JSON.parse(fs.readFileSync(file, 'utf8'));
    });
  }
  return out;
}
function walk(dir, rel, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, r, fn);
    else if (e.name.endsWith('.json')) fn(r, p);
  }
}
export const V = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574/vanilla';
export const DS = '/home/user/MCSuperMods/node_modules/.pnpm/deepslate@0.27.2/node_modules/deepslate/lib/index.js';
